// =========================================================================
// HearMe — Edge Function "device-photos" (Deno / Supabase)
// -------------------------------------------------------------------------
// Sert la galerie en mode "clé secrète" (URLs signées) et reçoit les uploads
// de l'app. Valide la clé secrète côté serveur, utilise le service_role pour
// signer/écrire dans le bucket privé 'security-photos' (hors RLS).
//
// Déploiement :
//   supabase functions deploy device-photos --no-verify-jwt
// (le --no-verify-jwt est optionnel : on valide nous-mêmes la clé secrète)
//
// Corps JSON attendu :
//   { secret, action: "list", limit }                      → { photos:[...] }
//   { secret, action: "upload", image_base64, event_type } → { ok, id, path }
// =========================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "security-photos";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const secret = (body.secret || "").trim();
  if (!secret) return json({ error: "missing_secret" }, 400);

  // 1) Valider la clé secrète → appareil.
  const { data: dev, error: devErr } = await admin
    .from("devices").select("id").eq("secret_key", secret).maybeSingle();
  if (devErr) return json({ error: "server_error" }, 500);
  if (!dev) return json({ error: "invalid_secret" }, 401);

  const action = body.action || "list";

  // 2a) Lister avec URLs signées.
  if (action === "list") {
    const limit = Math.min(Math.max(parseInt(body.limit ?? 12, 10) || 12, 1), 60);
    const { data: rows, error } = await admin
      .from("security_photos")
      .select("id, storage_path, event_type, created_at")
      .eq("device_id", dev.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json({ error: "server_error" }, 500);

    const photos = [];
    for (const r of rows ?? []) {
      const { data: signed } = await admin.storage
        .from(BUCKET).createSignedUrl(r.storage_path, 3600);
      photos.push({
        id: r.id, event_type: r.event_type, created_at: r.created_at,
        url: signed?.signedUrl ?? null,
      });
    }
    return json({ photos });
  }

  // 2b) Upload d'une photo (appelé par l'app).
  if (action === "upload") {
    const b64: string = body.image_base64 || "";
    if (!b64) return json({ error: "missing_image" }, 400);
    const bytes = Uint8Array.from(atob(b64.replace(/^data:.*;base64,/, "")), (c) => c.charCodeAt(0));
    const path = `${dev.id}/${crypto.randomUUID()}.jpg`;

    const up = await admin.storage.from(BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (up.error) return json({ error: "upload_failed", detail: up.error.message }, 500);

    const { data: ins, error: insErr } = await admin
      .from("security_photos")
      .insert({ device_id: dev.id, storage_path: path, event_type: body.event_type ?? "remote_photo" })
      .select("id").single();
    if (insErr) return json({ error: "server_error" }, 500);

    return json({ ok: true, id: ins.id, path });
  }

  return json({ error: "unknown_action" }, 400);
});
