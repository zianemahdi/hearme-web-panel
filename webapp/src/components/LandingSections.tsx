import React from 'react';
import {
  Volume2,
  MessageCircleWarning,
  Siren,
  Camera,
  MapPin,
  LockKeyhole,
  Send,
  Mail,
  MonitorSmartphone,
  Plus,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n/fr';
import { PlayBadge } from './PlayBadge';
import { AppShowcase } from './AppShowcase';
import { ShaderBackground } from './ShaderBackground';
import { FEATURE_PAGES, GUIDES_PAGE } from './featurePages';
import { HowVideo } from './HowVideo';

/**
 * Présentation sous l'écran de connexion : comment ça marche, ce que fait l'app,
 * questions fréquentes. Sert aussi au référencement : Google lit ces textes (la
 * page d'accueil n'avait qu'un titre et un formulaire).
 */

const Kicker: React.FC<{ children: React.ReactNode; dark: boolean }> = ({ children, dark }) => (
  <div
    className={`inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.28em] ${
      dark ? 'text-purple-300/80' : 'text-purple-700'
    }`}
  >
    <span className={`h-px w-7 ${dark ? 'bg-purple-300/40' : 'bg-purple-300'}`} aria-hidden="true" />
    {children}
  </div>
);

const STEPS: { t: I18nKey; d: I18nKey }[] = [
  { t: 'ls.s1t', d: 'ls.s1d' },
  { t: 'ls.s2t', d: 'ls.s2d' },
  { t: 'ls.s3t', d: 'ls.s3d' },
];

const FEATURES: { icon: React.ElementType; t: I18nKey; d: I18nKey }[] = [
  { icon: Volume2, t: 'ls.f1t', d: 'ls.f1d' },
  { icon: MessageCircleWarning, t: 'ls.f2t', d: 'ls.f2d' },
  { icon: Siren, t: 'ls.f3t', d: 'ls.f3d' },
  { icon: Camera, t: 'ls.f4t', d: 'ls.f4d' },
  { icon: MapPin, t: 'ls.f5t', d: 'ls.f5d' },
  { icon: LockKeyhole, t: 'ls.f6t', d: 'ls.f6d' },
  { icon: Send, t: 'ls.f7t', d: 'ls.f7d' },
  { icon: Mail, t: 'ls.f8t', d: 'ls.f8d' },
  { icon: MonitorSmartphone, t: 'ls.f9t', d: 'ls.f9d' },
];

const FAQ: { q: I18nKey; a: I18nKey }[] = [
  { q: 'ls.q1', a: 'ls.a1' },
  { q: 'ls.q2', a: 'ls.a2' },
  { q: 'ls.q3', a: 'ls.a3' },
  { q: 'ls.q4', a: 'ls.a4' },
  { q: 'ls.q5', a: 'ls.a5' },
  { q: 'ls.q6', a: 'ls.a6' },
];

export const LandingSections: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => {
  const { t, lang } = useI18n();
  const dark = theme === 'dark';
  const title = `font-semibold tracking-[-0.035em] leading-[1.05] text-balance text-3xl sm:text-4xl ${
    dark ? 'text-white' : 'text-slate-950'
  }`;
  const body = dark ? 'text-white/85' : 'text-slate-700';
  const line = dark ? 'border-white/[0.08]' : 'border-slate-200';

  return (
    <div className="max-w-6xl w-full mx-auto">
      <div id="ls-showcase" className="scroll-mt-8">
        <AppShowcase theme={theme} />
      </div>
      {/* Comment ça marche */}
      <section id="comment" aria-labelledby="ls-how" className={`scroll-mt-8 py-16 sm:py-24 border-t ${line}`}>
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12">
          <div className="lg:col-span-4 space-y-4">
            <Kicker dark={dark}>{t('ls.howKicker')}</Kicker>
            <h2 id="ls-how" className={title}>{t('ls.howTitle')}</h2>
            <p className={`text-sm sm:text-base leading-relaxed ${body}`}>{t('ls.howLead')}</p>
            <div className="pt-4 flex justify-center lg:justify-start">
              <HowVideo alt={t('ls.shotAlt1')} />
            </div>
          </div>
          <ol className="lg:col-span-8 lg:self-start grid sm:grid-cols-3 gap-px rounded-3xl overflow-hidden border border-white/[0.08] bg-white/[0.08]">
            {STEPS.map((s, i) => (
              <li key={s.t} className={`p-6 sm:p-7 space-y-3 ${dark ? 'bg-[#0b0b14]/90' : 'bg-white'}`}>
                <span className="block font-['JetBrains_Mono',monospace] text-xs tracking-[0.2em] text-purple-400">
                  0{i + 1}
                </span>
                <h3 className={`text-base font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t(s.t)}</h3>
                <p className={`text-sm leading-relaxed ${body}`}>{t(s.d)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Fonctions */}
      <section aria-labelledby="ls-feat" className={`py-16 sm:py-24 border-t ${line}`}>
        <div className="max-w-2xl space-y-4 mb-10 sm:mb-12">
          <Kicker dark={dark}>{t('ls.featKicker')}</Kicker>
          <h2 id="ls-feat" className={title}>{t('ls.featTitle')}</h2>
          <p className={`text-sm sm:text-base leading-relaxed ${body}`}>{t('ls.featLead')}</p>
        </div>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, t: ft, d }) => (
            <li
              key={ft}
              className={`group rounded-3xl border p-6 transition-colors ${
                dark
                  ? 'bg-white/[0.025] border-white/[0.08] hover:border-purple-400/30 hover:bg-white/[0.04]'
                  : 'bg-white border-slate-200 hover:border-purple-300 shadow-sm'
              }`}
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7C5CFF]/25 to-[#C24DF0]/20 text-purple-300 flex items-center justify-center mb-5 ring-1 ring-inset ring-white/10">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className={`text-base font-semibold mb-2 ${dark ? 'text-white' : 'text-slate-900'}`}>{t(ft)}</h3>
              <p className={`text-sm leading-relaxed ${body}`}>{t(d)}</p>
            </li>
          ))}
        </ul>
        {/* Liens vers les pages détaillées (aussi utiles à Google). */}
        <nav aria-label={t('ls.learnMore')} className="mt-8 flex flex-wrap items-center gap-2">
          <span className={`text-sm me-2 ${dark ? 'text-white/85' : 'text-slate-700'}`}>{t('ls.learnMore')}</span>
          {FEATURE_PAGES[lang].map((p) => (
            <a
              key={p.href}
              href={p.href}
              className={`text-sm font-medium px-3.5 py-1.5 rounded-full border transition-colors ${
                dark
                  ? 'border-white/[0.12] text-purple-200 hover:border-purple-400/50 hover:text-white'
                  : 'border-slate-300 text-purple-700 hover:border-purple-400'
              }`}
            >
              {p.label}
            </a>
          ))}
          <a
            href={GUIDES_PAGE[lang].href}
            className="text-sm font-semibold px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#7C5CFF] to-fuchsia-500 text-white hover:brightness-110 transition"
          >
            {GUIDES_PAGE[lang].label} {lang === 'ar' ? '←' : '→'}
          </a>
        </nav>
      </section>

      {/* Questions fréquentes */}
      <section aria-labelledby="ls-faq" className={`py-16 sm:py-24 border-t ${line}`}>
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12">
          <div className="lg:col-span-4 space-y-4">
            <Kicker dark={dark}>{t('ls.faqKicker')}</Kicker>
            <h2 id="ls-faq" className={title}>{t('ls.faqTitle')}</h2>
          </div>
          <div className={`lg:col-span-8 divide-y border-y ${dark ? 'divide-white/[0.08] border-white/[0.08]' : 'divide-slate-200 border-slate-200'}`}>
            {FAQ.map((f) => (
              <details key={f.q} className="group py-1">
                <summary
                  className={`flex items-center justify-between gap-6 py-4 cursor-pointer list-none text-start text-sm sm:text-base font-medium [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded-lg ${
                    dark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {t(f.q)}
                  <Plus className="w-4 h-4 shrink-0 text-purple-400 transition-transform duration-200 group-open:rotate-45" aria-hidden="true" />
                </summary>
                <p className={`pb-5 pe-10 text-sm leading-relaxed ${body}`}>{t(f.a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Appel final */}
      <section
        aria-labelledby="ls-cta"
        className="relative overflow-hidden rounded-[2rem] border border-white/10 px-6 py-12 sm:px-12 sm:py-16 mb-12 text-center"
        style={{ background: '#07070d' }}
      >
        {dark && (
          <ShaderBackground contained className="absolute inset-0 w-full h-full" tint={[0.6, 0.42, 1.0]} brightness={0.45} speed={0.5} lineWidth={0.0018} />
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(55% 75% at 50% 50%, rgba(7,7,13,0.78), rgba(7,7,13,0.35) 70%, transparent), linear-gradient(135deg, rgba(124,92,255,0.30), rgba(194,77,240,0.18) 60%, rgba(10,10,18,0.55))' }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          {[1, 2, 3].map((r) => (
            <span
              key={r}
              className="absolute rounded-full border border-white/[0.07]"
              style={{ width: `${r * 18}rem`, height: `${r * 18}rem` }}
            />
          ))}
        </div>
        <div className="relative space-y-5 max-w-xl mx-auto">
          <h2 id="ls-cta" className="font-semibold tracking-[-0.035em] leading-[1.05] text-balance text-3xl sm:text-4xl text-white">
            {t('ls.ctaTitle')}
          </h2>
          <p className="text-sm sm:text-base leading-relaxed text-white/90">{t('ls.ctaLead')}</p>
          <div className="flex justify-center pt-1">
            <PlayBadge />
          </div>
        </div>
      </section>
    </div>
  );
};
