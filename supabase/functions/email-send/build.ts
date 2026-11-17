// =========================================================================
// HearMe — textes des e-mails (4 langues) et composition de chaque e-mail.
// Pur TypeScript, sans import réseau : utilisé par index.ts et preview.ts.
// =========================================================================
import { esc, render, SITE, type Lang, type Row, type Tone } from "./template.ts";

export type { Lang };
export type Kind = "theft" | "unlock_failed" | "battery_low" | "shutdown" | "test" | "weekly";
export const KINDS: Kind[] = ["theft", "unlock_failed", "battery_low", "shutdown", "test", "weekly"];

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
      weekly: "📊 HearMe : ta semaine sur « {d} »",
    },
    intro: {
      theft: "Ton téléphone « {d} » a été arraché puis emporté alors que l'antivol était armé. Ouvre ton panneau web pour le suivre en direct, le faire sonner ou le verrouiller.",
      unlock_failed: "Quelqu'un a saisi un code faux sur « {d} » alors que l'antivol était armé. Une photo de la personne est dans ton panneau web.",
      battery_low: "La batterie de « {d} » est faible alors que l'antivol est armé. Voici sa dernière position connue.",
      shutdown: "« {d} » est en train de s'éteindre alors que l'antivol est armé. Voici sa dernière position connue.",
      test: "Les alertes de ton téléphone « {d} » arriveront bien à cette adresse.",
      weekly: "Voici ta semaine avec HearMe sur « {d} », du {from} au {to}.",
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
      weekly: "📊 HearMe: your week on “{d}”",
    },
    intro: {
      theft: "Your phone “{d}” was snatched and carried away while anti-theft was armed. Open your web panel to follow it live, make it ring or lock it.",
      unlock_failed: "Someone entered a wrong code on “{d}” while anti-theft was armed. A photo of that person is in your web panel.",
      battery_low: "The battery of “{d}” is low while anti-theft is armed. Here is its last known location.",
      shutdown: "“{d}” is shutting down while anti-theft is armed. Here is its last known location.",
      test: "Alerts from your phone “{d}” will arrive at this address.",
      weekly: "Here is your week with HearMe on “{d}”, from {from} to {to}.",
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
      weekly: "📊 HearMe: tu semana en «{d}»",
    },
    intro: {
      theft: "Tu teléfono «{d}» fue arrebatado y se lo llevaron con el antirrobo activado. Abre tu panel web para seguirlo en directo, hacerlo sonar o bloquearlo.",
      unlock_failed: "Alguien introdujo un código incorrecto en «{d}» con el antirrobo activado. Tienes una foto de esa persona en tu panel web.",
      battery_low: "La batería de «{d}» está baja con el antirrobo activado. Esta es su última ubicación conocida.",
      shutdown: "«{d}» se está apagando con el antirrobo activado. Esta es su última ubicación conocida.",
      test: "Las alertas de tu teléfono «{d}» llegarán a esta dirección.",
      weekly: "Esta es tu semana con HearMe en «{d}», del {from} al {to}.",
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
      weekly: "📊 HearMe: أسبوعك على «{d}»",
    },
    intro: {
      theft: "تم انتزاع هاتفك «{d}» وأخذه بينما كانت مكافحة السرقة مفعّلة. افتح لوحة التحكم على الويب لتتبعه مباشرة أو جعله يرن أو قفله.",
      unlock_failed: "أدخل شخص ما رمزًا خاطئًا على «{d}» بينما كانت مكافحة السرقة مفعّلة. صورة هذا الشخص موجودة في لوحة التحكم على الويب.",
      battery_low: "بطارية «{d}» منخفضة بينما مكافحة السرقة مفعّلة. هذا آخر موقع معروف له.",
      shutdown: "يتم إيقاف تشغيل «{d}» بينما مكافحة السرقة مفعّلة. هذا آخر موقع معروف له.",
      test: "ستصل تنبيهات هاتفك «{d}» إلى هذا العنوان.",
      weekly: "إليك أسبوعك مع HearMe على «{d}»، من {from} إلى {to}.",
    },
    location: "الموقع", map: "عرض على الخريطة", noLocation: "الموقع غير متاح",
    battery: "البطارية", time: "الوقت", panel: "فتح لوحة التحكم على الويب",
    footer: "تتلقى هذه الرسالة لأن تنبيهات البريد الإلكتروني مفعّلة في HearMe (الملف الشخصي). يمكنك إيقافها في أي وقت.",
  },
};


// Rapport de la semaine : intitulés, unités, messages. {n} = nombre.
const WEEK: Record<Lang, {
  listen: string; armed: string; rings: string; thefts: string; wrong: string; sos: string;
  hours: string; times: string; never: string;
  off: string; quiet: string; footer: string;
}> = {
  fr: {
    listen: "Écoute du mot-clé", armed: "Antivol armé", rings: "Téléphone retrouvé à la voix",
    thefts: "Alertes de vol", wrong: "Codes faux tapés", sos: "SOS silencieux",
    hours: "{n} h", times: "{n} fois", never: "aucune",
    off: "Ta protection est restée coupée toute la semaine. Ouvre HearMe et active l'écoute ou l'antivol : un geste suffit.",
    quiet: "Aucune alerte cette semaine. Tout est calme.",
    footer: "Tu reçois ce rapport chaque lundi. Pour l'arrêter : HearMe › Profil › Rapport de la semaine.",
  },
  en: {
    listen: "Keyword listening", armed: "Anti-theft armed", rings: "Phone found by voice",
    thefts: "Theft alerts", wrong: "Wrong codes entered", sos: "Silent SOS",
    hours: "{n} h", times: "{n}×", never: "none",
    off: "Your protection was off all week. Open HearMe and turn on listening or anti-theft: it takes one tap.",
    quiet: "No alerts this week. All quiet.",
    footer: "You get this report every Monday. To stop it: HearMe › Profile › Weekly report.",
  },
  es: {
    listen: "Escucha de la palabra clave", armed: "Antirrobo activado", rings: "Teléfono encontrado por voz",
    thefts: "Alertas de robo", wrong: "Códigos incorrectos", sos: "SOS silencioso",
    hours: "{n} h", times: "{n} veces", never: "ninguna",
    off: "Tu protección estuvo desactivada toda la semana. Abre HearMe y activa la escucha o el antirrobo: basta un toque.",
    quiet: "Ninguna alerta esta semana. Todo tranquilo.",
    footer: "Recibes este informe cada lunes. Para detenerlo: HearMe › Perfil › Informe semanal.",
  },
  ar: {
    listen: "الاستماع للكلمة المفتاحية", armed: "مكافحة السرقة مفعّلة", rings: "العثور على الهاتف بالصوت",
    thefts: "تنبيهات السرقة", wrong: "رموز خاطئة", sos: "استغاثة صامتة",
    hours: "{n} ساعة", times: "{n} مرة", never: "لا شيء",
    off: "بقيت حمايتك متوقفة طوال الأسبوع. افتح HearMe وفعّل الاستماع أو مكافحة السرقة: لمسة واحدة تكفي.",
    quiet: "لا توجد تنبيهات هذا الأسبوع. كل شيء هادئ.",
    footer: "تتلقى هذا التقرير كل يوم اثنين. لإيقافه: HearMe › الملف الشخصي › التقرير الأسبوعي.",
  },
};

// Libellé coloré, grand titre et couleur de chaque e-mail.
const HEAD: Record<Lang, {
  kicker: Record<Kind, string>;
  title: Record<Exclude<Kind, "weekly">, string>;
  weekCalm: string; weekAlerts: string; weekOff: string;
}> = {
  fr: {
    kicker: { theft: "ALERTE VOL", unlock_failed: "CODE FAUX", battery_low: "BATTERIE FAIBLE",
      shutdown: "TÉLÉPHONE ÉTEINT", test: "E-MAIL D'ESSAI", weekly: "BILAN DE LA SEMAINE" },
    title: { theft: "Vol détecté sur ton téléphone", unlock_failed: "Quelqu'un a tapé un code faux",
      battery_low: "Batterie faible", shutdown: "Ton téléphone s'éteint", test: "Tout fonctionne ✅" },
    weekCalm: "Une semaine calme ✅", weekAlerts: "Ta semaine avec HearMe", weekOff: "Ta protection était coupée",
  },
  en: {
    kicker: { theft: "THEFT ALERT", unlock_failed: "WRONG CODE", battery_low: "LOW BATTERY",
      shutdown: "PHONE SHUTTING DOWN", test: "TEST EMAIL", weekly: "WEEKLY SUMMARY" },
    title: { theft: "Theft detected on your phone", unlock_failed: "Someone entered a wrong code",
      battery_low: "Low battery", shutdown: "Your phone is shutting down", test: "Everything works ✅" },
    weekCalm: "A quiet week ✅", weekAlerts: "Your week with HearMe", weekOff: "Your protection was off",
  },
  es: {
    kicker: { theft: "ALERTA DE ROBO", unlock_failed: "CÓDIGO INCORRECTO", battery_low: "BATERÍA BAJA",
      shutdown: "TELÉFONO APAGÁNDOSE", test: "CORREO DE PRUEBA", weekly: "RESUMEN SEMANAL" },
    title: { theft: "Robo detectado en tu teléfono", unlock_failed: "Alguien introdujo un código incorrecto",
      battery_low: "Batería baja", shutdown: "Tu teléfono se está apagando", test: "Todo funciona ✅" },
    weekCalm: "Una semana tranquila ✅", weekAlerts: "Tu semana con HearMe", weekOff: "Tu protección estaba desactivada",
  },
  ar: {
    kicker: { theft: "تنبيه سرقة", unlock_failed: "رمز خاطئ", battery_low: "بطارية منخفضة",
      shutdown: "الهاتف يُطفأ", test: "رسالة تجريبية", weekly: "ملخص الأسبوع" },
    title: { theft: "تم رصد سرقة على هاتفك", unlock_failed: "أدخل شخص رمزًا خاطئًا",
      battery_low: "البطارية منخفضة", shutdown: "هاتفك يُطفأ", test: "كل شيء يعمل ✅" },
    weekCalm: "أسبوع هادئ ✅", weekAlerts: "أسبوعك مع HearMe", weekOff: "كانت حمايتك متوقفة",
  },
};

const TONE: Record<Exclude<Kind, "weekly">, Tone> = {
  theft: "danger", unlock_failed: "danger", battery_low: "warning", shutdown: "neutral", test: "success",
};

/** Entier 0..max envoyé par l'app, sinon 0. */
export function num(v: unknown, max: number): number {
  return Number.isInteger(v) && (v as number) >= 0 ? Math.min(v as number, max) : 0;
}

export const isLang = (l: unknown): l is Lang => typeof l === "string" && l in TEXT;

export interface Composed { subject: string; text: string; html: string }

/** Nom du téléphone dans un texte ; en français, « » collés au nom (pas de coupure). */
function filler(lang: Lang, device: string) {
  const NB = "\u00a0";
  return (s: string) => {
    const r = s.replaceAll("{d}", device);
    return lang === "fr" ? r.replaceAll("« ", "«" + NB).replaceAll(" »", NB + "»") : r;
  };
}

export interface AlertInput {
  device: string; time: string; mapUrl: string | null; battery: number | null;
}

/** Alerte (vol, code faux, batterie, extinction, essai). */
export function composeAlert(lang: Lang, kind: Exclude<Kind, "weekly">, a: AlertInput): Composed {
  const t = TEXT[lang], h = HEAD[lang];
  const fill = filler(lang, a.device);
  const intro = fill(t.intro[kind]);
  const showLoc = kind !== "test";
  const rows: Row[] = [];
  if (showLoc) {
    rows.push(a.mapUrl
      ? { label: t.location, value: `<a href="${a.mapUrl}" style="color:#6a4cf0;font-weight:700">${esc(t.map)}</a>`, html: true }
      : { label: t.location, value: t.noLocation });
  }
  if (a.battery !== null) rows.push({ label: t.battery, value: `${a.battery} %`, ltr: true });
  rows.push({ label: t.time, value: a.time });
  const lines = [intro, ""];
  if (showLoc) lines.push(`${t.location} : ${a.mapUrl ?? t.noLocation}`);
  if (a.battery !== null) lines.push(`${t.battery} : ${a.battery} %`);
  lines.push(`${t.time} : ${a.time}`, "", `${t.panel} : ${SITE}`, "", t.footer);
  return {
    subject: fill(t.subject[kind]),
    text: lines.join("\n"),
    html: render({
      lang, tone: TONE[kind], kicker: h.kicker[kind], title: h.title[kind], intro, rows,
      cta: { label: t.panel, url: SITE }, reason: t.footer,
    }),
  };
}

export interface WeekInput {
  device: string; weekStart: Date;
  listen: number; armed: number; rings: number; thefts: number; wrong: number; sos: number;
}

/** Rapport du lundi (chiffres comptés par l'app). */
export function composeWeekly(lang: Lang, w0: WeekInput): Composed {
  const t = TEXT[lang], w = WEEK[lang], hd = HEAD[lang];
  const fill = filler(lang, w0.device);
  const we = new Date(w0.weekStart.getTime() + 6 * 86_400_000);
  const dfmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", timeZone: "UTC" });
  // Français : « 1er novembre », pas « 1 novembre ».
  const day = (d: Date) => lang === "fr" ? dfmt.format(d).replace(/^1 /, "1er ") : dfmt.format(d);
  const h = (n: number) => w.hours.replace("{n}", String(n));
  // Arabe : مرة واحدة · مرتان · 3 à 10 مرات · 11 et plus مرة.
  const x = (n: number) => n === 0 ? w.never
    : lang === "ar" ? (n === 1 ? "مرة واحدة" : n === 2 ? "مرتان" : n <= 10 ? `${n} مرات` : `${n} مرة`)
    : w.times.replace("{n}", String(n));
  const alerts = w0.thefts + w0.wrong + w0.sos;
  const off = w0.listen === 0 && w0.armed === 0;
  const intro = fill(t.intro.weekly).replace("{from}", day(w0.weekStart)).replace("{to}", day(we));
  const rows: Row[] = [
    { label: w.rings, value: x(w0.rings) }, { label: w.thefts, value: x(w0.thefts) },
    { label: w.wrong, value: x(w0.wrong) }, { label: w.sos, value: x(w0.sos) },
  ];
  const note = off ? { tone: "warning" as Tone, text: w.off }
    : alerts === 0 ? { tone: "success" as Tone, text: w.quiet } : undefined;
  const text = [intro, "", `${w.listen} : ${h(w0.listen)}`, `${w.armed} : ${h(w0.armed)}`,
    ...rows.map((r) => `${r.label} : ${r.value}`), "", ...(note ? [note.text, ""] : []),
    `${t.panel} : ${SITE}`, "", w.footer].join("\n");
  return {
    subject: fill(t.subject.weekly),
    text,
    html: render({
      lang, tone: off ? "warning" : "brand", kicker: hd.kicker.weekly,
      title: off ? hd.weekOff : alerts === 0 ? hd.weekCalm : hd.weekAlerts,
      intro,
      stats: [{ value: h(w0.listen), label: w.listen }, { value: h(w0.armed), label: w.armed }],
      rows, note, cta: { label: t.panel, url: SITE }, reason: w.footer,
    }),
  };
}
