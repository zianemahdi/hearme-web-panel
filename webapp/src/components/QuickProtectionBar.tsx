import React from 'react';
import { ShieldCheck, Smartphone, Lock } from 'lucide-react';
import { Device } from '../types';

interface QuickProtectionBarProps {
  device: Device;
  isOnline: boolean;
  theme?: 'dark' | 'light';
}

export const QuickProtectionBar: React.FC<QuickProtectionBarProps> = ({
  device,
  isOnline,
  theme = 'dark'
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      id="bento-quick-protection-bar"
      className="hm-card-pro rounded-2xl p-4 sm:p-5 relative overflow-hidden"
    >
      <div className="absolute top-0 left-1/4 w-96 h-24 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Appareil */}
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shadow-inner">
              <Smartphone className="w-6 h-6" />
            </div>
            <span
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 ${
                isDark ? 'border-[#0e0e1a]' : 'border-white'
              } ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}
              title={isOnline ? 'En ligne' : 'Hors ligne'}
            />
          </div>

          <div>
            <h1 className={`text-base sm:text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {device.name}
            </h1>
            <p className={`text-xs flex items-center gap-1.5 mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Panneau de contrôle HearMe</span>
            </p>
          </div>
        </div>

        {/* État réel du téléphone */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
            isDark ? 'bg-black/40 border-white/[0.08] text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
            <span>État : <strong className={isOnline ? 'text-emerald-400' : 'text-slate-400'}>{isOnline ? 'En ligne' : 'Hors ligne'}</strong></span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
            isDark ? 'bg-black/40 border-white/[0.08] text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <Lock className={`w-3.5 h-3.5 ${device.is_locked ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>Écran : <strong className={device.is_locked ? 'text-emerald-400' : 'text-amber-400'}>{device.is_locked ? 'Verrouillé' : 'Déverrouillé'}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
