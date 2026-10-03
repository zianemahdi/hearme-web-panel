import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fr, type I18nKey } from './fr';
import { en } from './en';
import { es } from './es';
import { ar } from './ar';

// Les 4 langues de l'app HearMe. Le choix est gardé dans le navigateur ; sinon on
// prend la langue du navigateur, et le français par défaut.
export type Lang = 'fr' | 'en' | 'es' | 'ar';

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'ar', label: 'العربية', short: 'ع' },
];

const DICTS = { fr, en, es, ar } as const;
const LOCALES: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', ar: 'ar' };
const STORAGE_KEY = 'hearme_lang';

function isLang(v: unknown): v is Lang {
  return v === 'fr' || v === 'en' || v === 'es' || v === 'ar';
}

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch { /* stockage indisponible : on détecte */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = (l || '').slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return 'fr';
}

type Vars = Record<string, string | number>;

interface I18nValue {
  lang: Lang;
  locale: string;
  setLang: (l: Lang) => void;
  t: (key: I18nKey, vars?: Vars) => string;
  /** « à l'instant », « il y a 12 s », « il y a 4 min »… dans la langue choisie. */
  formatAge: (sec: number | null) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key: I18nKey, vars?: Vars) => {
    let s: string = DICTS[lang][key] ?? fr[key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }, [lang]);

  const locale = LOCALES[lang];

  const formatAge = useCallback((sec: number | null) => {
    if (sec == null || Number.isNaN(sec)) return '';
    if (sec < 10) return t('time.justNow');
    if (sec < 60) return t('time.secondsAgo', { n: sec });
    if (sec < 3600) return t('time.minutesAgo', { n: Math.floor(sec / 60) });
    if (sec < 86400) return t('time.hoursAgo', { n: Math.floor(sec / 3600) });
    const date = new Date(Date.now() - sec * 1000)
      .toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
    return t('time.onDate', { date });
  }, [t, locale]);

  // Langue et sens de lecture de la page (l'arabe s'écrit de droite à gauche).
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = DICTS[lang]['meta.title'];
  }, [lang]);

  const value = useMemo(() => ({ lang, locale, setLang, t, formatAge }), [lang, locale, setLang, t, formatAge]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n hors de I18nProvider');
  return v;
}

/** Variante menu déroulant, pour les écrans étroits. */
export function LanguageSelect({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      aria-label={t('common.language')}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className={`rounded-xl border border-white/[0.1] bg-[#0d0d1a] text-slate-200 text-xs font-bold px-2 py-1.5 cursor-pointer focus:outline-none focus:border-purple-500 ${className}`}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code} lang={l.code}>{l.short} · {l.label}</option>
      ))}
    </select>
  );
}

/** Sélecteur de langue compact (FR · EN · ES · ع). */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('common.language')}
      dir="ltr"
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-xl border border-white/[0.1] bg-white/[0.04] ${className}`}
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          title={l.label}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          className={`min-w-[2rem] px-2 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
            lang === l.code ? 'bg-white text-black' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
