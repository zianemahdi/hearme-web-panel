import type { Lang } from '../i18n';

/** Pages par fonction (statiques, dans public/<langue>/), générées avec leur sitemap. */
export const FEATURE_PAGES: Record<Lang, { href: string; label: string }[]> = {
  fr: [
    { href: './fr/faire-sonner-telephone-silencieux.html', label: 'Mot-clé vocal' },
    { href: './fr/alarme-antivol-telephone.html', label: 'Alarme antivol' },
    { href: './fr/retrouver-telephone-perdu-vole.html', label: 'Retrouver son téléphone' },
    { href: './fr/sos-silencieux.html', label: 'SOS silencieux' },
    { href: './fr/telephone-vole-que-faire.html', label: 'Guide : téléphone volé' },
  ],
  en: [
    { href: './en/find-phone-on-silent.html', label: 'Voice keyword' },
    { href: './en/phone-anti-theft-alarm.html', label: 'Anti-theft alarm' },
    { href: './en/find-lost-stolen-phone.html', label: 'Find your phone' },
    { href: './en/silent-sos.html', label: 'Silent SOS' },
    { href: './en/phone-stolen-what-to-do.html', label: 'Guide: stolen phone' },
  ],
  es: [
    { href: './es/hacer-sonar-movil-en-silencio.html', label: 'Palabra clave' },
    { href: './es/alarma-antirrobo-movil.html', label: 'Alarma antirrobo' },
    { href: './es/encontrar-movil-perdido-robado.html', label: 'Encontrar tu móvil' },
    { href: './es/sos-silencioso.html', label: 'SOS silencioso' },
    { href: './es/me-han-robado-el-movil-que-hacer.html', label: 'Guía: móvil robado' },
  ],
  ar: [
    { href: './ar/find-phone-on-silent.html', label: 'الكلمة المفتاحية' },
    { href: './ar/phone-anti-theft-alarm.html', label: 'منبّه ضد السرقة' },
    { href: './ar/find-lost-stolen-phone.html', label: 'العثور على هاتفك' },
    { href: './ar/silent-sos.html', label: 'الاستغاثة الصامتة' },
    { href: './ar/phone-stolen-what-to-do.html', label: 'دليل: هاتف مسروق' },
  ],
};
