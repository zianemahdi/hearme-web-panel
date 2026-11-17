// =========================================================================
// HearMe — mise en page des e-mails (alertes et rapport de la semaine)
// -------------------------------------------------------------------------
// HTML « à l'ancienne » (tableaux + styles en ligne) : c'est ce que Gmail,
// Outlook et Apple Mail affichent tous pareil. Pas de SVG ni de police web
// (Gmail les ignore) : logo en PNG hébergé sur gethearme.me, Arial.
// Une seule colonne de 560 px max, qui se réduit seule sur téléphone.
// Pur TypeScript, sans import : prévisualisable hors Supabase (preview.ts).
// =========================================================================

export type Lang = "fr" | "en" | "es" | "ar";
export type Tone = "danger" | "warning" | "neutral" | "success" | "brand";

export const SITE = "https://gethearme.me/";
const LOGO = "https://gethearme.me/icon-192.png";
const SOCIAL = [
  { name: "TikTok", url: "https://www.tiktok.com/@gethearme" },
  { name: "Instagram", url: "https://www.instagram.com/gethearme" },
  { name: "YouTube", url: "https://www.youtube.com/@gethearme" },
];

// Couleurs de la marque (site et app).
const C = {
  page: "#f4f2fb",
  card: "#ffffff",
  ink: "#161228",
  ink2: "#5f5878",
  rule: "#ebe7f6",
  head: "#0d0b17",
  violet: "#6a4cf0",
  violetSoft: "#f1edff",
};

const TONES: Record<Tone, { bg: string; fg: string }> = {
  danger: { bg: "#fdecea", fg: "#b42318" },
  warning: { bg: "#fff4e5", fg: "#a1530a" },
  neutral: { bg: "#eef0f4", fg: "#3d4454" },
  success: { bg: "#e8f7ee", fg: "#17703f" },
  brand: { bg: "#f1edff", fg: "#5338d8" },
};

const FOOT: Record<Lang, { follow: string; site: string }> = {
  fr: { follow: "Suis-nous : @gethearme", site: "Site" },
  en: { follow: "Follow us: @gethearme", site: "Website" },
  es: { follow: "Síguenos: @gethearme", site: "Web" },
  ar: { follow: "تابعنا: ‎@gethearme", site: "الموقع" },
};

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface Row { label: string; value: string; html?: boolean; ltr?: boolean }
export interface Stat { value: string; label: string }

export interface Mail {
  lang: Lang;
  tone: Tone;
  kicker: string;        // petit libellé coloré (ex. « ALERTE VOL »)
  title: string;         // grand titre
  intro: string;         // phrase d'explication
  stats?: Stat[];        // grandes cases chiffrées (rapport de la semaine)
  rows?: Row[];          // tableau libellé / valeur
  note?: { tone: Tone; text: string };
  cta: { label: string; url: string };
  reason: string;        // pourquoi on reçoit cet e-mail / comment l'arrêter
  preheader?: string;    // aperçu affiché par Gmail sous l'objet
}

export function render(m: Mail): string {
  const rtl = m.lang === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const start = rtl ? "right" : "left";
  const end = rtl ? "left" : "right";
  const tone = TONES[m.tone];
  const font = "Arial,Helvetica,sans-serif";
  const f = FOOT[m.lang];

  const stats = m.stats?.length
    ? `<tr><td style="padding:4px 28px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${m.stats.map((s, i) => `<td width="${Math.floor(100 / m.stats!.length)}%" valign="top" style="padding:0;${i > 0 ? `padding-${start}:10px;` : ""}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${C.violetSoft};border-radius:12px;padding:16px 16px 14px;text-align:${start}">
<div style="font-family:${font};font-size:28px;font-weight:700;line-height:1.1;color:${C.violet}">${esc(s.value)}</div>
<div style="font-family:${font};font-size:13px;font-weight:400;line-height:1.35;color:${C.ink2};padding-top:6px">${esc(s.label)}</div>
</td></tr></table></td>`).join("\n")}
</tr></table></td></tr>`
    : "";

  const rows = m.rows?.length
    ? `<tr><td style="padding:8px 28px 4px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${m.rows.map((r, i) => `<tr>
<td style="padding:11px 0;${i < m.rows!.length - 1 ? `border-bottom:1px solid ${C.rule};` : ""}font-family:${font};font-size:14px;font-weight:400;line-height:1.4;color:${C.ink2};text-align:${start}">${esc(r.label)}</td>
<td style="padding:11px 0;${i < m.rows!.length - 1 ? `border-bottom:1px solid ${C.rule};` : ""}font-family:${font};font-size:14px;font-weight:700;line-height:1.4;color:${C.ink};text-align:${end}">${r.ltr ? `<span dir="ltr">` : ""}${r.html ? r.value : esc(r.value)}${r.ltr ? "</span>" : ""}</td>
</tr>`).join("\n")}
</table></td></tr>`
    : "";

  const note = m.note
    ? `<tr><td style="padding:12px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="background:${TONES[m.note.tone].bg};border-radius:12px;padding:14px 16px;font-family:${font};font-size:14px;font-weight:400;line-height:1.5;color:${TONES[m.note.tone].fg};text-align:${start}">${esc(m.note.text)}</td>
</tr></table></td></tr>`
    : "";

  const social = SOCIAL.map((s) =>
    `<a href="${s.url}" style="color:${C.violet};text-decoration:none;font-weight:700">${s.name}</a>`).join(" &nbsp;·&nbsp; ");

  return `<!doctype html>
<html lang="${m.lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(m.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(m.preheader ?? m.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}" dir="${dir}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">

<tr><td style="background:${C.head};border-radius:16px 16px 0 0;padding:18px 28px;text-align:${start}">
<a href="${SITE}" style="text-decoration:none">
<img src="${LOGO}" width="36" height="36" alt="HearMe" style="display:inline-block;vertical-align:middle;border:0;border-radius:9px">
<span style="display:inline-block;vertical-align:middle;padding-${start}:10px;font-family:${font};font-size:20px;font-weight:700;line-height:1;color:#ffffff;letter-spacing:.2px">HearMe</span>
</a>
</td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:#7c5cff;background-image:linear-gradient(90deg,#7c5cff,#c24df0)">&nbsp;</td></tr>

<tr><td style="background:${C.card};padding:0 0 28px;border-radius:0 0 16px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:26px 28px 0;text-align:${start}">
<span style="display:inline-block;background:${tone.bg};color:${tone.fg};border-radius:999px;padding:5px 12px;font-family:${font};font-size:12px;font-weight:700;line-height:1.2;letter-spacing:.6px">${esc(m.kicker)}</span>
</td></tr>
<tr><td style="padding:14px 28px 0;text-align:${start};font-family:${font};font-size:24px;font-weight:700;line-height:1.25;color:${C.ink}">${esc(m.title)}</td></tr>
<tr><td style="padding:10px 28px 14px;text-align:${start};font-family:${font};font-size:16px;font-weight:400;line-height:1.55;color:${C.ink2}">${esc(m.intro)}</td></tr>
${stats}
${rows}
${note}
<tr><td style="padding:24px 28px 0;text-align:${start}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table"><tr>
<td style="background:${C.violet};border-radius:12px">
<a href="${m.cta.url}" style="display:inline-block;padding:14px 24px;font-family:${font};font-size:15px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none">${esc(m.cta.label)}</a>
</td></tr></table>
</td></tr>
</table>
</td></tr>

<tr><td style="padding:22px 28px 0;text-align:center;font-family:${font};font-size:13px;font-weight:400;line-height:1.6;color:${C.ink2}">
<a href="${SITE}" style="color:${C.ink};text-decoration:none;font-weight:700">gethearme.me</a><br>
${esc(f.follow)}<br>${social}
</td></tr>
<tr><td style="padding:14px 28px 0;text-align:center;font-family:${font};font-size:12px;font-weight:400;line-height:1.55;color:#8a84a3">${esc(m.reason)}</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
