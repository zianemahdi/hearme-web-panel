// =========================================================================
// HearMe — Edge Function "device-photos" (Deno / Supabase)
// -------------------------------------------------------------------------
// Photos du porteur (25_device_photos.sql), bucket PRIVÉ "security-photos".
//
//   App      multipart  champs event_type, photo (JPEG ≤ 5 Mo)  → { ok, id }
//   Panneau  JSON { action: "list", limit? }                   → { ok, photos: [{ id, url, event_type, created_at }] }
//            JSON { action: "delete", id }                     → { ok }
//   pg_cron  JSON { action: "purge" } + en-tête x-purge-token  → { ok, removed }
//
// Appareil identifié par sa clé (en-tête x-device-secret), vérifiée par
// photo_authorize() avec l'IP du client : même anti-force brute que le panneau.
// Les liens renvoyés sont signés et expirent après 10 minutes.
//
// Déploiement sans vérification JWT : chaque action exige la clé du téléphone
// ou le jeton de purge (Vault), vérifiés ici.
// =========================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "security-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const RETENTION_DAYS = 30;
const URL_TTL_S = 600;
const EVENTS = new Set(["remote_photo", "unlock_failed", "theft"]);

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-device-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Même ordre de confiance que panel_client_ip() (09_hardening.sql).
function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return parts.at(-1) ?? "";
}

const AUTH_STATUS: Record<string, number> = { invalid_secret: 401, rate_limited: 429, quota: 429 };

async function authorize(req: Request, upload: boolean): Promise<{ device?: string; error?: Response }> {
  const secret = (req.headers.get("x-device-secret") ?? "").trim();
  if (!secret) return { error: json({ error: "missing_secret" }, 401) };
  const { data, error } = await admin.rpc("photo_authorize", {
    p_secret: secret, p_ip: clientIp(req), p_upload: upload,
  });
  if (error) {
    console.error("photo_authorize:", error.message);
    return { error: json({ error: "server_error" }, 500) };
  }
  if (!data?.ok) return { error: json({ error: data?.error ?? "denied" }, AUTH_STATUS[data?.error] ?? 403) };
  return { device: data.device_id as string };
}

async function upload(req: Request): Promise<Response> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_PHOTO_BYTES + 64 * 1024) return json({ error: "too_large" }, 413);
  const auth = await authorize(req, true);
  if (auth.error) return auth.error;

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "bad_form" }, 400); }
  const f = form.get("photo");
  if (!(f instanceof File) || f.size === 0) return json({ error: "missing_photo" }, 400);
  if (f.size > MAX_PHOTO_BYTES) return json({ error: "too_large" }, 413);
  const bytes = new Uint8Array(await f.arrayBuffer());
  // JPEG uniquement, vérifié sur le contenu (FF D8 FF) et pas seulement sur le type annoncé.
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return json({ error: "bad_type" }, 415);
  }
  const event = String(form.get("event_type") ?? "");
  const path = `${auth.device}/${crypto.randomUUID()}.jpg`;

  // Cache CDN court : une photo supprimée cesse d'être servie en moins d'une minute.
  const up = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "image/jpeg", upsert: false, cacheControl: "60",
  });
  if (up.error) {
    console.error("upload:", up.error.message);
    return json({ error: "upload_failed" }, 500);
  }
  const { data: row, error } = await admin.from("security_photos")
    .insert({ device_id: auth.device, storage_path: path, event_type: EVENTS.has(event) ? event : "remote_photo" })
    .select("id").single();
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    console.error("insert:", error.message);
    return json({ error: "server_error" }, 500);
  }
  return json({ ok: true, id: row.id });
}

async function list(req: Request, body: any): Promise<Response> {
  const auth = await authorize(req, false);
  if (auth.error) return auth.error;
  const limit = Math.min(Math.max(Number(body.limit) || 24, 1), 60);
  const since = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
  const { data: rows, error } = await admin.from("security_photos")
    .select("id, storage_path, event_type, created_at")
    .eq("device_id", auth.device).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) return json({ error: "server_error" }, 500);
  if (!rows?.length) return json({ ok: true, photos: [] });

  const { data: signed } = await admin.storage.from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), URL_TTL_S);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return json({
    ok: true,
    photos: rows.map((r) => ({
      id: r.id, event_type: r.event_type, created_at: r.created_at, url: urls.get(r.storage_path) ?? null,
    })),
  });
}

async function remove(req: Request, body: any): Promise<Response> {
  const auth = await authorize(req, false);
  if (auth.error) return auth.error;
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad_id" }, 400);
  const { data: row } = await admin.from("security_photos")
    .select("id, storage_path").eq("id", id).eq("device_id", auth.device).maybeSingle();
  if (!row) return json({ error: "not_found" }, 404);
  const rm = await admin.storage.from(BUCKET).remove([row.storage_path]);
  if (rm.error) return json({ error: "server_error" }, 500);
  await admin.from("security_photos").delete().eq("id", row.id);
  return json({ ok: true });
}

// Purge nocturne (pg_cron) : fichiers puis lignes des photos de plus de 30 jours.
async function purge(req: Request): Promise<Response> {
  const token = (req.headers.get("x-purge-token") ?? "").trim();
  const { data: allowed } = await admin.rpc("photo_purge_token_ok", { p_token: token });
  if (allowed !== true) return json({ error: "forbidden" }, 403);

  const before = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
  let removed = 0;
  for (let round = 0; round < 20; round++) {
    const { data: rows, error } = await admin.from("security_photos")
      .select("id, storage_path").lt("created_at", before).limit(100);
    if (error) return json({ error: "server_error" }, 500);
    if (!rows?.length) break;
    const rm = await admin.storage.from(BUCKET).remove(rows.map((r) => r.storage_path));
    if (rm.error) return json({ error: "server_error", removed }, 500);
    await admin.from("security_photos").delete().in("id", rows.map((r) => r.id));
    removed += rows.length;
  }
  return json({ ok: true, removed });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) return upload(req);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  switch (body?.action) {
    case "list": return list(req, body);
    case "delete": return remove(req, body);
    case "purge": return purge(req);
    default: return json({ error: "unknown_action" }, 400);
  }
});
