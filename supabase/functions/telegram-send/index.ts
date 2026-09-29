// =========================================================================
// HearMe — Edge Function "telegram-send" (Deno / Supabase)
// -------------------------------------------------------------------------
// Seule porte de sortie de l'app vers Telegram : le token du bot reste ici.
// Le téléphone s'authentifie par sa clé secrète (en-tête x-device-secret) ;
// tg_authorize_send() (11_telegram_relay.sql) vérifie la clé, n'autorise que
// les chats liés à CE téléphone (ou en session clé) et applique un quota.
//
// Requêtes (POST) :
//   JSON      { to: "all" | "<chat_id>", text, parse_mode?: "HTML" } → { ok, sent }
//   multipart champs to, caption, photo (JPEG/PNG ≤ 10 Mo)          → { ok, sent }
//
// Secret requis : TELEGRAM_BOT_TOKEN (Supabase → Edge Functions → Secrets).
// Déploiement : supabase functions deploy telegram-send
//   (JWT vérifié : l'app envoie déjà la clé anon en Authorization.)
// =========================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // limite Telegram pour sendPhoto

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Même ordre de confiance que panel_client_ip() (09_hardening.sql) : en-têtes
// posés par le proxy d'abord, et le DERNIER élément de x-forwarded-for.
function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return parts.at(-1) ?? "";
}

const AUTH_STATUS: Record<string, number> = {
  invalid_secret: 401,
  chat_not_linked: 403,
  bad_recipient: 400,
  rate_limited: 429,
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!TOKEN) return json({ error: "bot_not_configured" }, 503);

  const secret = (req.headers.get("x-device-secret") ?? "").trim();
  if (!secret) return json({ error: "missing_secret" }, 401);

  let to = "";
  let text = "";
  let caption = "";
  let parseMode: string | undefined;
  let photo: File | null = null;

  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    // On refuse avant de charger le corps en mémoire.
    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > MAX_PHOTO_BYTES + 64 * 1024) return json({ error: "too_large" }, 413);
    let form: FormData;
    try { form = await req.formData(); } catch { return json({ error: "bad_form" }, 400); }
    to = String(form.get("to") ?? "");
    caption = String(form.get("caption") ?? "").slice(0, 1024);
    const f = form.get("photo");
    if (!(f instanceof File) || f.size === 0) return json({ error: "missing_photo" }, 400);
    if (f.size > MAX_PHOTO_BYTES) return json({ error: "too_large" }, 413);
    if (f.type !== "image/jpeg" && f.type !== "image/png") return json({ error: "bad_type" }, 415);
    photo = f;
  } else {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    to = String(body.to ?? "");
    text = String(body.text ?? "");
    if (!text || text.length > 4096) return json({ error: "bad_text" }, 400);
    if (body.parse_mode === "HTML") parseMode = "HTML"; // seul mode accepté
  }

  const { data: auth, error } = await admin.rpc("tg_authorize_send", {
    p_secret: secret, p_to: to, p_ip: clientIp(req),
  });
  if (error) {
    console.error("tg_authorize_send:", error.message);
    return json({ error: "server_error" }, 500);
  }
  if (!auth?.ok) return json({ error: auth?.error ?? "denied" }, AUTH_STATUS[auth?.error] ?? 403);

  const chats: string[] = auth.chat_ids ?? [];
  let sent = 0;

  if (photo) {
    // Envoyée une fois, puis réutilisée par son file_id pour les autres chats.
    let fileId: string | null = null;
    for (const chat of chats) {
      let res: any;
      try {
        if (fileId) {
          res = await fetch(`${API}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chat, photo: fileId, caption }),
          }).then((r) => r.json());
        } else {
          const fd = new FormData();
          fd.append("chat_id", chat);
          fd.append("caption", caption);
          fd.append("photo", photo, photo.type === "image/png" ? "photo.png" : "photo.jpg");
          res = await fetch(`${API}/sendPhoto`, { method: "POST", body: fd }).then((r) => r.json());
          const sizes = res?.result?.photo;
          fileId = Array.isArray(sizes) && sizes.length ? sizes[sizes.length - 1].file_id : null;
        }
      } catch {
        res = { ok: false };
      }
      if (res?.ok) sent++;
    }
  } else {
    for (const chat of chats) {
      try {
        const res = await fetch(`${API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chat, text, parse_mode: parseMode, disable_web_page_preview: true,
          }),
        }).then((r) => r.json());
        if (res?.ok) sent++;
      } catch { /* chat suivant */ }
    }
  }

  return json({ ok: true, sent });
});
