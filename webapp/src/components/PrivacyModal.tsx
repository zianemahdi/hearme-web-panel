import React, { useEffect, useRef } from 'react';
import { X, Shield } from 'lucide-react';
import { useI18n } from '../i18n';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  const { t, lang } = useI18n();

  // Échap ferme la fenêtre, et la page derrière ne défile plus.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Politique complète : ancre de la version dans la langue choisie (#fr, #en, #es, #ar).
  const fullPolicy = `privacy.html#${lang}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05050a]/90 backdrop-blur-xl overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-modal-title"
        className="relative w-full max-w-3xl my-8 rounded-3xl hm-card-pro p-7 sm:p-9 shadow-2xl space-y-6 text-slate-300"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 id="privacy-modal-title" className="text-lg font-bold text-white">
                <span className="hm-gradient-text">HearMe</span> — {t('pm.title')}
              </h2>
              <p className="text-xs text-slate-400">{t('pm.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenu */}
        <div className="max-h-[65vh] overflow-y-auto pe-2 space-y-5 text-xs sm:text-sm leading-relaxed">
          <div className="p-4 rounded-2xl bg-purple-950/25 border border-purple-500/30 text-purple-200">
            <strong className="text-white block mb-1">{t('pm.summaryTitle')}</strong>
            {t('pm.summary')}
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <span className="text-purple-400">1.</span> {t('pm.s1')}
            </h3>
            <ul className="list-disc ps-5 space-y-1.5 text-slate-400">
              <li><strong>{t('pm.mic')}</strong> {t('pm.micText')}</li>
              <li><strong>{t('pm.gps')}</strong> {t('pm.gpsText')}</li>
              <li><strong>{t('pm.cam')}</strong> {t('pm.camText')}</li>
              <li><strong>{t('pm.community')}</strong> {t('pm.communityText')}</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <span className="text-purple-400">2.</span> {t('pm.s2')}
            </h3>
            <p className="text-slate-400">{t('pm.access')}</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <span className="text-purple-400">3.</span> {t('pm.s3')}
            </h3>
            <p className="text-slate-400">
              {t('pm.rights')} <a href={fullPolicy} target="_blank" rel="noopener" className="text-purple-300 underline">{t('pm.fullPolicy')}</a>.
            </p>
          </section>
        </div>

        {/* Pied */}
        <div className="pt-4 border-t border-white/[0.08] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110 text-white font-bold text-xs transition shadow-lg shadow-purple-950/40 active:scale-95"
          >
            {t('pm.ok')}
          </button>
        </div>
      </div>
    </div>
  );
};
