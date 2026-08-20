import React, { useState } from 'react';
import { Lock, Bell, BellOff, MapPin, Camera, Mic, CheckCircle2, Loader2, Volume2, ShieldAlert, Radio, Sparkles } from 'lucide-react';
import { CommandType } from '../types';
import { siren } from '../utils/audio';

interface EmergencyControlsProps {
  isAlarmActive: boolean;
  onSendCommand: (command: CommandType, params?: Record<string, unknown>) => Promise<boolean>;
  isSending: boolean;
  theme?: 'dark' | 'light';
}

export const EmergencyControls: React.FC<EmergencyControlsProps> = ({
  isAlarmActive,
  onSendCommand,
  isSending,
  theme = 'dark'
}) => {
  const isDark = theme === 'dark';
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockMessage, setLockMessage] = useState('Téléphone perdu ou volé. Merci de contacter le propriétaire d\'urgence.');
  const [lockPin, setLockPin] = useState('');
  const [lastActionStatus, setLastActionStatus] = useState<string | null>(null);

  const handleAction = async (command: CommandType, params?: Record<string, unknown>) => {
    if (command === 'alarm') {
      siren.start();
    } else if (command === 'stopalarm') {
      siren.stop();
    }

    const success = await onSendCommand(command, params);
    if (success) {
      const labels: Record<string, string> = {
        lock: 'Ordre de verrouillage envoyé avec succès',
        alarm: 'Sirène d\'alarme 105 dB déclenchée à distance !',
        stopalarm: 'Ordre d\'arrêt de l\'alarme transmis',
        locate: 'Demande de géolocalisation GPS haute précision émise',
        photo: 'Ordre de capture photo frontale envoyé',
        audio: 'Enregistrement audio ambiant démarré'
      };
      setLastActionStatus(labels[command] || 'Commande transmise');
      setTimeout(() => setLastActionStatus(null), 4000);
    }
  };

  const submitLock = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowLockModal(false);
    await handleAction('lock', { message: lockMessage, pin: lockPin || '1234' });
  };

  return (
    <div
      id="bento-emergency-controls-panel"
      className={`hm-card-interactive rounded-2xl p-5 space-y-4 relative overflow-hidden transition-all ${
        isAlarmActive ? 'siren-active border-rose-500/80 shadow-[0_0_40px_rgba(244,63,94,0.4)]' : ''
      }`}
    >
      {/* Background ambient glow */}
      <div className={`hm-bento-glow w-40 h-40 ${isAlarmActive ? 'bg-rose-500' : 'bg-purple-500'} top-0 right-0 -mr-10 -mt-10`} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400">
            <ShieldAlert className={`w-4 h-4 ${isAlarmActive ? 'animate-bounce text-rose-400' : ''}`} />
          </div>
          <div>
            <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              Centre d'Actions d'Urgence
            </h2>
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Commandes prioritaires instantanées
            </span>
          </div>
        </div>

        {isAlarmActive && (
          <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-extrabold border border-rose-500/40 animate-pulse flex items-center gap-1.5 shadow-[0_0_15px_rgba(244,63,94,0.4)]">
            <Volume2 className="w-3.5 h-3.5 text-rose-400 animate-spin" />
            <span>SIRÈNE 105 dB ACTIVE</span>
          </span>
        )}
      </div>

      {/* Main Action Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Lock Button */}
        <button
          id="btn-action-lock"
          onClick={() => setShowLockModal(true)}
          disabled={isSending}
          className="group relative flex flex-col items-center justify-center gap-2 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs sm:text-sm transition-all duration-200 shadow-lg shadow-emerald-950/20 active:scale-[0.98] disabled:opacity-50"
        >
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 group-hover:scale-110 transition-transform">
            <Lock className="w-5 h-5" />
          </div>
          <span className="tracking-tight">Verrouiller</span>
        </button>

        {/* Alarm Button */}
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
          <span className="tracking-tight">{isAlarmActive ? 'Stopper l\'alarme' : 'Déclencher sirène'}</span>
        </button>

        {/* Force Location */}
        <button
          id="btn-action-locate"
          onClick={() => handleAction('locate')}
          disabled={isSending}
          className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs sm:text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 ${
            isDark
              ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-slate-200'
              : 'border-slate-200 bg-slate-100/80 hover:bg-slate-200 text-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4 text-purple-400 shrink-0" />
          <span>Localiser GPS</span>
        </button>

        {/* Security Photo */}
        <button
          id="btn-action-photo"
          onClick={() => handleAction('photo')}
          disabled={isSending}
          className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs sm:text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 ${
            isDark
              ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-slate-200'
              : 'border-slate-200 bg-slate-100/80 hover:bg-slate-200 text-slate-800'
          }`}
        >
          <Camera className="w-4 h-4 text-pink-400 shrink-0" />
          <span>Prendre photo</span>
        </button>

        {/* Ambient Audio Capture */}
        <button
          id="btn-action-audio"
          onClick={() => handleAction('audio')}
          disabled={isSending}
          className={`col-span-2 flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition active:scale-[0.98] disabled:opacity-50 ${
            isDark
              ? 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-slate-300'
              : 'border-slate-200 bg-slate-100/80 hover:bg-slate-200 text-slate-800'
          }`}
        >
          <Mic className="w-4 h-4 text-sky-400 shrink-0" />
          <span>Écoute audio ambiante (30s)</span>
        </button>
      </div>

      {/* Feedback status message */}
      {lastActionStatus && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs shadow-lg animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="font-semibold">{lastActionStatus}</span>
        </div>
      )}

      {isSending && (
        <div className="flex items-center justify-center gap-2 text-xs text-purple-300 py-1.5 bg-purple-500/10 rounded-xl border border-purple-500/20 font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
          <span>Transmission cryptée de l'ordre au terminal...</span>
        </div>
      )}

      {/* Lock Confirmation Modal */}
      {showLockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-4 ${
            isDark ? 'bg-[#11111f] border-white/15 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center gap-3 pb-2 border-b border-white/[0.08]">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Verrouillage d'urgence</h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Bloquer l'appareil et afficher un message d'alerte</p>
              </div>
            </div>

            <form onSubmit={submitLock} className="space-y-3.5">
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Message affiché à l'écran du ravisseur / passant
                </label>
                <textarea
                  value={lockMessage}
                  onChange={(e) => setLockMessage(e.target.value)}
                  rows={3}
                  required
                  className={`w-full rounded-xl border px-3 py-2 text-xs focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 ${
                    isDark ? 'bg-white/[0.04] border-white/[0.08] text-slate-100 placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                  placeholder="Ex : Ce téléphone est sous surveillance antivol HearMe..."
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Code PIN temporaire de déverrouillage
                </label>
                <input
                  type="text"
                  value={lockPin}
                  onChange={(e) => setLockPin(e.target.value)}
                  maxLength={6}
                  className={`w-full rounded-xl border px-3 py-2 text-xs font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 ${
                    isDark ? 'bg-white/[0.04] border-white/[0.08] text-slate-100 placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                  placeholder="Optionnel (ex : 4892)"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowLockModal(false)}
                  className={`px-4 py-2 rounded-xl border text-xs transition ${
                    isDark ? 'border-white/[0.08] text-slate-300 hover:bg-white/[0.06]' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 transition active:scale-95"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Verrouiller immédiatement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
