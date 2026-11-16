import type { Lang } from '../i18n';

/** Pages par fonction (statiques, dans public/<langue>/), générées avec leur sitemap. */
export const FEATURE_PAGES: Record<Lang, { href: string; label: string }[]> = {
  fr: [
    { href: './fr/faire-sonner-telephone-silencieux.html', label: 'Mot-clé vocal' },
    { href: './fr/alarme-antivol-telephone.html', label: 'Alarme antivol' },
    { href: './fr/retrouver-telephone-perdu-vole.html', label: 'Retrouver son téléphone' },
    { href: './fr/sos-silencieux.html', label: 'SOS silencieux' },
    { href: './fr/telephone-vole-que-faire.html', label: 'Guide : téléphone volé' },
    { href: './fr/retrouver-telephone-en-silencieux.html', label: 'Guide : téléphone en silencieux' },
    { href: './fr/proteger-telephone-cafe-transports.html', label: 'Guide : café et transports' },
  ],
  en: [
    { href: './en/find-phone-on-silent.html', label: 'Voice keyword' },
    { href: './en/phone-anti-theft-alarm.html', label: 'Anti-theft alarm' },
    { href: './en/find-lost-stolen-phone.html', label: 'Find your phone' },
    { href: './en/silent-sos.html', label: 'Silent SOS' },
    { href: './en/phone-stolen-what-to-do.html', label: 'Guide: stolen phone' },
    { href: './en/find-phone-on-silent-mode.html', label: 'Guide: phone on silent' },
    { href: './en/protect-phone-cafe-public-transport.html', label: 'Guide: cafés and transport' },
  ],
  es: [
    { href: './es/hacer-sonar-movil-en-silencio.html', label: 'Palabra clave' },
    { href: './es/alarma-antirrobo-movil.html', label: 'Alarma antirrobo' },
    { href: './es/encontrar-movil-perdido-robado.html', label: 'Encontrar tu móvil' },
    { href: './es/sos-silencioso.html', label: 'SOS silencioso' },
    { href: './es/me-han-robado-el-movil-que-hacer.html', label: 'Guía: móvil robado' },
    { href: './es/encontrar-movil-en-silencio.html', label: 'Guía: móvil en silencio' },
    { href: './es/proteger-movil-cafeteria-transporte.html', label: 'Guía: cafetería y transporte' },
  ],
  ar: [
    { href: './ar/find-phone-on-silent.html', label: 'الكلمة المفتاحية' },
    { href: './ar/phone-anti-theft-alarm.html', label: 'منبّه ضد السرقة' },
    { href: './ar/find-lost-stolen-phone.html', label: 'العثور على هاتفك' },
    { href: './ar/silent-sos.html', label: 'الاستغاثة الصامتة' },
    { href: './ar/phone-stolen-what-to-do.html', label: 'دليل: هاتف مسروق' },
    { href: './ar/find-phone-on-silent-mode.html', label: 'دليل: الهاتف على الوضع الصامت' },
    { href: './ar/protect-phone-cafe-public-transport.html', label: 'دليل: المقهى والمواصلات' },
  ],
};

/** Page « À propos et contact » (statique, public/{lang}/…). */
export const ABOUT_PAGE: Record<Lang, { href: string; label: string }> = {
  fr: { href: './fr/a-propos.html', label: 'À propos et contact' },
  en: { href: './en/about.html', label: 'About and contact' },
  es: { href: './es/sobre-nosotros.html', label: 'Sobre nosotros y contacto' },
  ar: { href: './ar/about.html', label: 'من نحن والتواصل' },
};

/** Page « Tous les guides » (statique, public/{lang}/…). */
export const GUIDES_PAGE: Record<Lang, { href: string; label: string }> = {
  fr: { href: './fr/guides.html', label: 'Tous les guides' },
  en: { href: './en/guides.html', label: 'All guides' },
  es: { href: './es/guias.html', label: 'Todas las guías' },
  ar: { href: './ar/guides.html', label: 'كل الأدلة' },
};
