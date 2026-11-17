// =========================================================================
// HearMe — Edge Function "email-send" (Deno / Supabase)
// -------------------------------------------------------------------------
// Alertes par e-mail au PROPRIÉTAIRE du téléphone (en plus de Telegram).
// Le téléphone s'authentifie par sa clé secrète (en-tête x-device-secret) ;
// email_authorize() (31_email_alerts.sql) vérifie la clé et donne le seul
// destinataire possible : l'e-mail confirmé du compte. L'app n'envoie qu'un
// TYPE d'alerte et des valeurs (position, batterie) : les textes sont écrits
// ici, dans la langue du téléphone. Le relais ne peut donc pas servir à spammer.
//
// Requête (POST JSON) :
//   { kind: "theft" | "unlock_failed" | "battery_low" | "shutdown" | "test",
//     lat?, lng?, battery?, tz? }                              → { ok }
//   { kind: "weekly", week_start: "AAAA-MM-JJ", listen_h, armed_h, rings,
//     thefts, wrong_codes, sos }  (rapport du lundi, chiffres comptés par l'app)
//
// Secrets (Supabase → Edge Functions → Secrets) :
//   SMTP_USER  adresse d'envoi (ex. hearme.app.contact@gmail.com)
//   SMTP_PASS  mot de passe d'application Gmail (jamais dans l'app)
//   SMTP_HOST / SMTP_PORT  facultatifs (défaut smtp.gmail.com:465, SSL)
// Déploiement : supabase functions deploy email-send
//   (JWT vérifié : l'app envoie déjà la clé anon en Authorization.)
// =========================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { composeAlert, composeWeekly, isLang, KINDS, num, type Kind, type Lang } from "./build.ts";

const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");

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

// Même ordre de confiance que telegram-send / panel_client_ip().
function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return parts.at(-1) ?? "";
}

/** Heure lisible dans la langue et le fuseau du téléphone (fuseau invalide → UTC). */
function formatTime(lang: Lang, tz: unknown): string {
  const zone = typeof tz === "string" && /^[A-Za-z_]+(\/[A-Za-z0-9_+\-]+){0,2}$/.test(tz) ? tz : "UTC";
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date()) + " UTC";
  }
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function mailer() {
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transport;
}

const AUTH_STATUS: Record<string, number> = {
  invalid_secret: 401,
  no_account: 409,
  no_email: 409,
  rate_limited: 429,
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SMTP_USER || !SMTP_PASS) return json({ error: "email_not_configured" }, 503);

  const secret = (req.headers.get("x-device-secret") ?? "").trim();
  if (!secret) return json({ error: "missing_secret" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const kind = body?.kind as Kind;
  if (!KINDS.includes(kind)) return json({ error: "bad_kind" }, 400);

  const { data: auth, error } = await admin.rpc("email_authorize", { p_secret: secret, p_ip: clientIp(req) });
  if (error) {
    console.error("email_authorize:", error.message);
    return json({ error: "server_error" }, 500);
  }
  if (!auth?.ok) {
    const code = String(auth?.error ?? "unauthorized");
    return json({ error: code }, AUTH_STATUS[code] ?? 403);
  }

  const lang: Lang = isLang(auth.lang) ? auth.lang : "fr";
  const device = String(auth.device_name ?? "HearMe").replace(/[\r\n]+/g, " ").slice(0, 64) || "HearMe";

  if (kind === "weekly") {
    const ws = typeof body?.week_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.week_start)
      ? new Date(body.week_start + "T12:00:00Z") : null;
    if (!ws || Number.isNaN(ws.getTime())) return json({ error: "bad_week" }, 400);
    const m = composeWeekly(lang, {
      device, weekStart: ws,
      listen: num(body?.listen_h, 168), armed: num(body?.armed_h, 168),
      rings: num(body?.rings, 999), thefts: num(body?.thefts, 999),
      wrong: num(body?.wrong_codes, 999), sos: num(body?.sos, 999),
    });
    return await deliver(String(auth.to), m.subject, m.text, m.html);
  }

  const lat = Number(body?.lat), lng = Number(body?.lng);
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    body?.lat !== null && body?.lng !== null && body?.lat !== undefined && body?.lng !== undefined;
  const mapUrl = hasLoc ? `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}` : null;
  const battery = Number.isInteger(body?.battery) && body.battery >= 0 && body.battery <= 100 ? body.battery as number : null;
  const m = composeAlert(lang, kind, { device, time: formatTime(lang, body?.tz), mapUrl, battery });
  return await deliver(String(auth.to), m.subject, m.text, m.html);
});

async function deliver(to: string, subject: string, text: string, html: string): Promise<Response> {
  try {
    await mailer().sendMail({ from: { name: "HearMe", address: SMTP_USER }, to, subject, text, html });
  } catch (e) {
    console.error("smtp:", e instanceof Error ? e.message : String(e));
    return json({ error: "send_failed" }, 502);
  }
  return json({ ok: true });
}
