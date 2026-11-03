import React from 'react';
import { useI18n } from '../i18n';

export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.gethearme.app';

/** Badge « Disponible sur Google Play » : fond noir, logo Play aux couleurs officielles. */
export const PlayBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useI18n();
  return (
    <a
      href={PLAY_URL}
      target="_blank"
      rel="noopener noreferrer"
      dir="ltr"
      aria-label={t('wa.getApp')}
      className={`inline-flex items-center gap-3 rounded-xl bg-black border border-white/40 pl-3.5 pr-5 py-2 text-white
                  hover:border-white/80 hover:bg-[#111] transition active:scale-95 ${className}`}
    >
      <svg viewBox="0 0 512 512" className="w-7 h-7 shrink-0" aria-hidden="true">
        <path fill="#00A0FF" d="M48 37c-6 7-9 17-9 30v378c0 13 3 23 9 30l2 2 212-212v-5L50 35z" />
        <path fill="#FFD500" d="M332 335l-70-70v-5l70-71 2 1 84 48c24 14 24 36 0 50l-84 48z" />
        <path fill="#FF3A44" d="M334 334l-72-72L48 475c8 8 21 9 36 1l250-142" />
        <path fill="#00F076" d="M334 190L84 48c-15-8-28-7-36 1l214 213z" />
      </svg>
      <span className="flex flex-col items-start leading-none">
        <span className="text-[10px] font-medium uppercase tracking-wide text-white/85">{t('wa.playOn')}</span>
        <span className="text-[19px] font-semibold tracking-tight mt-0.5">Google Play</span>
      </span>
    </a>
  );
};
