import React, { useEffect, useState } from 'react';
import { Lock, Bell, BellOff, MapPin, Camera, CheckCircle2, Loader2, Volume2, ShieldAlert, Search, AlertCircle } from 'lucide-react';
import { CommandType } from '../types';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n/fr';

interface EmergencyControlsProps {
  isAlarmActive: boolean;
  onSendCommand: (command: CommandType, params?: Record<string, unknown>) => Promise<boolean>;
  isSending: boolean;
  theme?: 'dark' | 'light';
  /** Appelé quand une photo vient d'être demandée (la galerie se met à guetter). */
  onPhotoRequested?: () => void;
  /** Mode recherche tel que le téléphone le signale (null = version de l'app qui ne le dit pas). */
  phoneSearch?: boolean | null;
}

const DONE: Partial<Record<CommandType, I18nKey>> = {
  lock: 'ec.doneLock',
  alarm: 'ec.doneAlarm',
  stopalarm: 'ec.doneStopAlarm',
  locate: 'ec.doneLocate',
  photo: 'ec.donePhoto',
};

export const EmergencyControls: React.FC<EmergencyControlsProps> = ({
  isAlarmActive,
  onSendCommand,
  isSending,
  theme = 'dark',
  onPhotoRequested,
  phoneSearch = null
}) => {
  const isDark = theme === 'dark';
  const { t } = useI18n();
  const [showLockModal, setShowLockModal] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  // Mode recherche : l'état signalé par le téléphone fait foi. Juste après un clic, on
  // affiche la demande « en attente » jusqu'à ce que le téléphone la confirme (3 min au
  // plus : téléphone éteint ou hors réseau → la commande attend, l'état réel revient).
  // Ancienne version de l'app (pas d'état signalé) : on garde ce que ce panneau a envoyé.
  const [localSearch, setLocalSearch] = useState(false);
  const [pendingSearch, setPendingSearch] = useState<{ value: boolean; until: number } | null>(null);
  useEffect(() => {
    if (!pendingSearch) return;
    if (phoneSearch === pendingSearch.value) { setPendingSearch(null); return; }
    const timer = setTimeout(() => setPendingSearch(null), Math.max(0, pendingSearch.until - Date.now()));
    return () => clearTimeout(timer);
  }, [phoneSearch, pendingSearch]);
  const searchActive = pendingSearch ? pendingSearch.value : (phoneSearch ?? localSearch);
  const searchWaiting = pendingSearch !== null && phoneSearch != null && phoneSearch !== pendingSearch.value;

  const flash = (ok: boolean, text: string) => {
    setStatus({ ok, text });
    setTimeout(() => setStatus(null), 4500);
  };

  // Mode recherche / perdu : débloque photo + localisation sur le téléphone.
  const toggleSearch = async () => {
    const next = !searchActive;
    const ok = await onSendCommand(next ? 'activate_search' : 'stop_search');
    if (!ok) { flash(false, t('ec.failed')); return; }
    setLocalSearch(next);
    if (phoneSearch != null) setPendingSearch({ value: next, until: Date.now() + 3 * 60_000 });
    flash(true, t(next ? 'ec.searchStarted' : 'ec.searchStopped'));
  };

  const handleAction = async (command: CommandType) => {
    // Pas de son côté navigateur : on envoie juste la commande au téléphone.
    const ok = await onSendCommand(command);
    if (!ok) { flash(false, t('ec.failed')); return; }
    if (command === 'photo') onPhotoRequested?.();
    flash(true, t(DONE[command] ?? 'ec.doneDefault'));
  };

  const confirmLock = async () => {
    setShowLockModal(false);
    await handleAction('lock');
  };

  const neutral = isDark
    ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-slate-200'
    : 'border-slate-200 bg-slate-100/80 hover:bg-slate-200 text-slate-800';

  return (
    <div
      id="bento-emergency-controls-panel"
      className={`hm-card-interactive rounded-2xl p-5 space-y-4 relative overflow-hidden transition-all ${
        isAlarmActive ? 'siren-active border-rose-500/80 shadow-[0_0_40px_rgba(244,63,94,0.4)]' : ''
      }`}
    >
      <div className={`hm-bento-glow w-40 h-40 ${isAlarmActive ? 'bg-rose-500' : 'bg-purple-500'} top-0 right-0 -mr-10 -mt-10`} />

      {/* En-tête */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400">
            <ShieldAlert className={`w-4 h-4 ${isAlarmActive ? 'animate-bounce text-rose-400' : ''}`} />
          </div>
          <div>
            <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {t('ec.title')}
            </h2>
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {t('ec.subtitle')}
            </span>
          </div>
        </div>

        {isAlarmActive && (
          <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-extrabold border border-rose-500/40 animate-pulse flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-rose-400" />
            <span>{t('ec.alarmActive')}</span>
          </span>
        )}
      </div>

      {/* Mode recherche / perdu — débloque photo + GPS (confidentialité par défaut) */}
      <button
        onClick={toggleSearch}
        disabled={isSending}
        aria-pressed={searchActive}
        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition active:scale-[0.99] disabled:opacity-50 ${
          searchActive
            ? 'border-violet-400/60 bg-violet-500/20 text-violet-100'
            : 'border-violet-500/30 bg-violet-500/[0.08] hover:bg-violet-500/15 text-violet-200'
        }`}
      >
        <div className="p-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-300 shrink-0">
          <Search className="w-4 h-4" />
        </div>
        <div className="text-start flex-1 min-w-0">
          <div className="text-sm font-bold">{searchActive ? t('ec.searchOn') : t('ec.searchOff')}</div>
          <div className="text-[11px] opacity-70">{t(searchWaiting ? 'ec.searchPending' : 'ec.searchHint')}</div>
        </div>
        <div className={`w-9 h-5 rounded-full relative transition shrink-0 ${searchActive ? 'bg-violet-400' : 'bg-white/20'}`} dir="ltr">
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${searchActive ? 'left-[18px]' : 'left-0.5'}`} />
        </div>
      </button>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          id="btn-action-lock"
          onClick={() => setShowLockModal(true)}
          disabled={isSending}
          className="group relative flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs sm:text-sm transition-all duration-200 shadow-lg shadow-emerald-950/20 active:scale-[0.98] disabled:opacity-50"
        >
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 group-hover:scale-110 transition-transform">
            <Lock className="w-5 h-5" />
          </div>
          <span className="tracking-tight">{t('ec.lock')}</span>
        </button>

        <button
          id="btn-action-alarm"
          onClick={() => handleAction(isAlarmActive ? 'stopalarm' : 'alarm')}
          disabled={isSending}
          className={`group relative flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border font-semibold text-xs sm:text-sm transition-all duration-200 shadow-lg active:scale-[0.98] disabled:opacity-50 ${
            isAlarmActive
              ? 'border-amber-500/50 bg-amber-500/20 text-amber-200 animate-pulse shadow-amber-900/30'
              : 'border-rose-500/35 bg-rose-500/[0.08] hover:bg-rose-500/20 text-rose-200 shadow-rose-950/20'
          }`}
        >
          <div className={`p-2 rounded-xl border group-hover:scale-110 transition-transform ${
            isAlarmActive
              ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/15 border-rose-500/25 text-rose-400'
          }`}>
            {isAlarmActive ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          </div>
          <span className="tracking-tight">{isAlarmActive ? t('ec.stopAlarm') : t('ec.alarm')}</span>
        </button>

        <button
          id="btn-action-locate"
          onClick={() => handleAction('locate')}
          disabled={isSending}
          className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs sm:text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 ${neutral}`}
        >
          <MapPin className="w-4 h-4 text-purple-400 shrink-0" />
          <span>{t('ec.locate')}</span>
        </button>

        <button
          id="btn-action-photo"
          onClick={() => handleAction('photo')}
          disabled={isSending}
          className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs sm:text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 ${neutral}`}
        >
          <Camera className="w-4 h-4 text-pink-400 shrink-0" />
          <span>{t('ec.photo')}</span>
        </button>
      </div>

      {/* Retour d'action */}
      {status && (
        <div
          role="status"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs shadow-lg animate-fade-in ${
            status.ok
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          {status.ok
            ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            : <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
          <span className="font-semibold">{status.text}</span>
        </div>
      )}

      {isSending && (
        <div className="flex items-center justify-center gap-2 text-xs text-purple-300 py-1.5 bg-purple-500/10 rounded-xl border border-purple-500/20 font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
          <span>{t('ec.sending')}</span>
        </div>
      )}

      {/* Confirmation du verrouillage : l'app verrouille l'écran, rien de plus. */}
      {showLockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="lock-modal-title"
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'bg-[#11111f] border-white/15 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3 pb-2 border-b border-white/[0.08]">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Lock className="w-5 h-5" />
              </div>
              <h3 id="lock-modal-title" className="text-base font-bold">{t('ec.lockTitle')}</h3>
            </div>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{t('ec.lockText')}</p>
            <div className="pt-3 flex items-center justify-end gap-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowLockModal(false)}
                className={`px-4 py-2 rounded-xl border text-xs transition ${
                  isDark ? 'border-white/[0.08] text-slate-300 hover:bg-white/[0.06]' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmLock}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition active:scale-95"
              >
                <Lock className="w-3.5 h-3.5" />
                {t('ec.lockConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
