import React from 'react';
import { BadgeCheck, Globe2, WifiOff, Smartphone, ShieldCheck } from 'lucide-react';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n/fr';

/**
 * Vitrine de l'application : deux vraies captures dans des cadres de téléphone,
 * puis une bande de faits vérifiables (gratuit, 4 langues, hors ligne…).
 * Aucune note, aucun nombre d'utilisateurs inventé.
 */

const FACTS: { icon: React.ElementType; k: I18nKey }[] = [
  { icon: BadgeCheck, k: 'ls.fact1' },
  { icon: Globe2, k: 'ls.fact2' },
  { icon: WifiOff, k: 'ls.fact3' },
  { icon: Smartphone, k: 'ls.fact4' },
  { icon: ShieldCheck, k: 'ls.fact5' },
];

const Phone: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className = '' }) => (
  <div
    className={`relative w-[44%] max-w-[15.5rem] aspect-[1080/2290] rounded-[2.2rem] p-[7px] bg-gradient-to-b from-white/25 via-white/10 to-white/5 shadow-[0_30px_80px_-20px_rgba(124,92,255,0.55)] ${className}`}
  >
    <div className="relative h-full w-full overflow-hidden rounded-[1.8rem] bg-[#0b0b14] ring-1 ring-black/60">
      <img src={src} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      <span
        className="absolute top-2 left-1/2 -translate-x-1/2 h-[14px] w-[14px] rounded-full bg-black/90 ring-1 ring-white/10"
        aria-hidden="true"
      />
    </div>
  </div>
);

export const AppShowcase: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => {
  const { t, lang } = useI18n();
  const dark = theme === 'dark';
  const line = dark ? 'border-white/[0.08]' : 'border-slate-200';

  return (
    <div className="max-w-6xl w-full mx-auto">
      {/* Bande de faits */}
      <ul
        className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4 py-6 border-t ${line}`}
        aria-label={t('ls.factsLabel')}
      >
        {FACTS.map(({ icon: Icon, k }) => (
          <li key={k} className={`flex items-center gap-2.5 text-sm ${dark ? 'text-white/75' : 'text-slate-700'}`}>
            <Icon className="w-4 h-4 shrink-0 text-purple-400" aria-hidden="true" />
            <span>{t(k)}</span>
          </li>
        ))}
      </ul>

      {/* L'application en vrai */}
      <section aria-labelledby="ls-app" className={`py-16 sm:py-24 border-t ${line}`}>
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 space-y-4">
            <div
              className={`inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.28em] ${
                dark ? 'text-purple-300/80' : 'text-purple-700'
              }`}
            >
              <span className={`h-px w-7 ${dark ? 'bg-purple-300/40' : 'bg-purple-300'}`} aria-hidden="true" />
              {t('ls.appKicker')}
            </div>
            <h2
              id="ls-app"
              className={`font-semibold tracking-[-0.035em] leading-[1.05] text-balance text-3xl sm:text-4xl ${
                dark ? 'text-white' : 'text-slate-950'
              }`}
            >
              {t('ls.appTitle')}
            </h2>
            <p className={`text-sm sm:text-base leading-relaxed ${dark ? 'text-white/85' : 'text-slate-700'}`}>
              {t('ls.appLead')}
            </p>
          </div>

          <div className="lg:col-span-7 relative flex justify-center items-start gap-4 sm:gap-6 py-6">
            {/* Halo + ondes derrière les téléphones */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <div className="absolute w-[70%] aspect-square rounded-full bg-[#7C5CFF]/20 blur-3xl" />
              {[1, 2, 3].map((r) => (
                <span
                  key={r}
                  className="absolute rounded-full border border-purple-300/[0.08]"
                  style={{ width: `${r * 34}%`, aspectRatio: '1' }}
                />
              ))}
            </div>
            <Phone src={`./shots/ecoute_${lang}.webp`} alt={t('ls.shotAlt1')} className="mt-10 -rotate-[4deg]" />
            <Phone src={`./shots/antivol_${lang}.webp`} alt={t('ls.shotAlt2')} className="rotate-[4deg]" />
          </div>
        </div>
      </section>
    </div>
  );
};
