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

const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");
const PANEL_URL = "https://gethearme.me/";

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

type Lang = "fr" | "en" | "es" | "ar";
type Kind = "theft" | "unlock_failed" | "battery_low" | "shutdown" | "test";
const KINDS: Kind[] = ["theft", "unlock_failed", "battery_low", "shutdown", "test"];

// {d} = nom du téléphone.
const TEXT: Record<Lang, {
  subject: Record<Kind, string>;
  intro: Record<Kind, string>;
  location: string; map: string; noLocation: string; battery: string; time: string;
  panel: string; footer: string;
}> = {
  fr: {
    subject: {
      theft: "🚨 HearMe : vol détecté sur « {d} »",
      unlock_failed: "🔐 HearMe : code faux sur « {d} »",
      battery_low: "🪫 HearMe : batterie faible sur « {d} »",
      shutdown: "📴 HearMe : « {d} » s'éteint",
      test: "✅ HearMe : e-mail d'essai",
    },
    intro: {
      theft: "Ton téléphone « {d} » a été arraché puis emporté alors que l'antivol était armé. Ouvre ton panneau web pour le suivre en direct, le faire sonner ou le verrouiller.",
      unlock_failed: "Quelqu'un a saisi un code faux sur « {d} » alors que l'antivol était armé. Une photo de la personne est dans ton panneau web.",
      battery_low: "La batterie de « {d} » est faible alors que l'antivol est armé. Voici sa dernière position connue.",
      shutdown: "« {d} » est en train de s'éteindre alors que l'antivol est armé. Voici sa dernière position connue.",
      test: "Les alertes de ton téléphone « {d} » arriveront bien à cette adresse.",
    },
    location: "Position", map: "Voir sur la carte", noLocation: "Position indisponible",
    battery: "Batterie", time: "Heure", panel: "Ouvrir mon panneau web",
    footer: "Tu reçois cet e-mail parce que les alertes par e-mail sont activées dans HearMe (Profil). Tu peux les couper à tout moment.",
  },
  en: {
    subject: {
      theft: "🚨 HearMe: theft detected on “{d}”",
      unlock_failed: "🔐 HearMe: wrong code on “{d}”",
      battery_low: "🪫 HearMe: low battery on “{d}”",
      shutdown: "📴 HearMe: “{d}” is shutting down",
      test: "✅ HearMe: test email",
    },
    intro: {
      theft: "Your phone “{d}” was snatched and carried away while anti-theft was armed. Open your web panel to follow it live, make it ring or lock it.",
      unlock_failed: "Someone entered a wrong code on “{d}” while anti-theft was armed. A photo of that person is in your web panel.",
      battery_low: "The battery of “{d}” is low while anti-theft is armed. Here is its last known location.",
      shutdown: "“{d}” is shutting down while anti-theft is armed. Here is its last known location.",
      test: "Alerts from your phone “{d}” will arrive at this address.",
    },
    location: "Location", map: "View on the map", noLocation: "Location unavailable",
    battery: "Battery", time: "Time", panel: "Open my web panel",
    footer: "You're getting this email because email alerts are on in HearMe (Profile). You can turn them off at any time.",
  },
  es: {
    subject: {
      theft: "🚨 HearMe: robo detectado en «{d}»",
      unlock_failed: "🔐 HearMe: código incorrecto en «{d}»",
      battery_low: "🪫 HearMe: batería baja en «{d}»",
      shutdown: "📴 HearMe: «{d}» se está apagando",
      test: "✅ HearMe: correo de prueba",
    },
    intro: {
      theft: "Tu teléfono «{d}» fue arrebatado y se lo llevaron con el antirrobo activado. Abre tu panel web para seguirlo en directo, hacerlo sonar o bloquearlo.",
      unlock_failed: "Alguien introdujo un código incorrecto en «{d}» con el antirrobo activado. Tienes una foto de esa persona en tu panel web.",
      battery_low: "La batería de «{d}» está baja con el antirrobo activado. Esta es su última ubicación conocida.",
      shutdown: "«{d}» se está apagando con el antirrobo activado. Esta es su última ubicación conocida.",
      test: "Las alertas de tu teléfono «{d}» llegarán a esta dirección.",
    },
    location: "Ubicación", map: "Ver en el mapa", noLocation: "Ubicación no disponible",
    battery: "Batería", time: "Hora", panel: "Abrir mi panel web",
    footer: "Recibes este correo porque las alertas por correo están activadas en HearMe (Perfil). Puedes desactivarlas cuando quieras.",
  },
  ar: {
    subject: {
      theft: "🚨 HearMe: تم رصد سرقة على «{d}»",
      unlock_failed: "🔐 HearMe: رمز خاطئ على «{d}»",
      battery_low: "🪫 HearMe: البطارية منخفضة على «{d}»",
      shutdown: "📴 HearMe: «{d}» يتم إيقاف تشغيله",
      test: "✅ HearMe: رسالة تجريبية",
    },
    intro: {
      theft: "تم انتزاع هاتفك «{d}» وأخذه بينما كانت مكافحة السرقة مفعّلة. افتح لوحة التحكم على الويب لتتبعه مباشرة أو جعله يرن أو قفله.",
      unlock_failed: "أدخل شخص ما رمزًا خاطئًا على «{d}» بينما كانت مكافحة السرقة مفعّلة. صورة هذا الشخص موجودة في لوحة التحكم على الويب.",
      battery_low: "بطارية «{d}» منخفضة بينما مكافحة السرقة مفعّلة. هذا آخر موقع معروف له.",
      shutdown: "يتم إيقاف تشغيل «{d}» بينما مكافحة السرقة مفعّلة. هذا آخر موقع معروف له.",
      test: "ستصل تنبيهات هاتفك «{d}» إلى هذا العنوان.",
    },
    location: "الموقع", map: "عرض على الخريطة", noLocation: "الموقع غير متاح",
    battery: "البطارية", time: "الوقت", panel: "فتح لوحة التحكم على الويب",
    footer: "تتلقى هذه الرسالة لأن تنبيهات البريد الإلكتروني مفعّلة في HearMe (الملف الشخصي). يمكنك إيقافها في أي وقت.",
  },
};

const isLang = (l: unknown): l is Lang => typeof l === "string" && l in TEXT;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  const t = TEXT[lang];
  const device = String(auth.device_name ?? "HearMe").replace(/[\r\n]+/g, " ").slice(0, 64) || "HearMe";
  const fill = (s: string) => s.replaceAll("{d}", device);

  const lat = Number(body?.lat), lng = Number(body?.lng);
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    body?.lat !== null && body?.lng !== null && body?.lat !== undefined && body?.lng !== undefined;
  const mapUrl = hasLoc ? `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}` : "";
  const battery = Number.isInteger(body?.battery) && body.battery >= 0 && body.battery <= 100 ? body.battery as number : null;
  const time = formatTime(lang, body?.tz);

  const subject = fill(t.subject[kind]);
  const intro = fill(t.intro[kind]);
  const showLoc = kind !== "test";
  const lines = [intro, ""];
  if (showLoc) lines.push(`${t.location} : ${hasLoc ? mapUrl : t.noLocation}`);
  if (battery !== null) lines.push(`${t.battery} : ${battery} %`);
  lines.push(`${t.time} : ${time}`, "", `${t.panel} : ${PANEL_URL}`, "", t.footer);

  const dir = lang === "ar" ? "rtl" : "ltr";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b6585;width:110px">${esc(label)}</td><td style="padding:6px 0;color:#161228;font-weight:600">${value}</td></tr>`;
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><body style="margin:0;background:#f5f3fa;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#0d0b17;color:#eeeaf8;padding:18px 22px;font-weight:700;letter-spacing:.18em">HEARME</div>
<div style="background:#ffffff;padding:22px;border:1px solid #e3def2;border-top:0">
<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#161228">${esc(intro)}</p>
<table style="border-collapse:collapse;font-size:14px">
${showLoc ? row(t.location, hasLoc ? `<a href="${mapUrl}" style="color:#5140b8">${esc(t.map)}</a>` : esc(t.noLocation)) : ""}
${battery !== null ? row(t.battery, `${battery} %`) : ""}
${row(t.time, esc(time))}
</table>
<p style="margin:22px 0 0"><a href="${PANEL_URL}" style="display:inline-block;background:#6a55d6;color:#ffffff;text-decoration:none;padding:12px 18px;font-weight:700">${esc(t.panel)}</a></p>
</div>
<p style="font-size:12px;line-height:1.5;color:#6b6585;margin:14px 0 0">${esc(t.footer)}</p>
</div></body></html>`;

  try {
    await mailer().sendMail({
      from: { name: "HearMe", address: SMTP_USER },
      to: String(auth.to),
      subject,
      text: lines.join("\n"),
      html,
    });
  } catch (e) {
    console.error("smtp:", e instanceof Error ? e.message : String(e));
    return json({ error: "send_failed" }, 502);
  }
  return json({ ok: true });
});
