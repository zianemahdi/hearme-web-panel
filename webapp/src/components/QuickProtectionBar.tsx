import React from 'react';
import { Device } from '../types';
import { ShieldCheck, Smartphone, Lock, Mic, Zap, Cpu, BellRing, Eye } from 'lucide-react';

interface QuickProtectionBarProps {
  device: Device;
  isOnline: boolean;
  theme?: 'dark' | 'light';
  onOpenSimulator: () => void;
}

export const QuickProtectionBar: React.FC<QuickProtectionBarProps> = ({
  device,
  isOnline,
  theme = 'dark',
  onOpenSimulator
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      id="bento-quick-protection-bar"
      className="hm-card-pro rounded-2xl p-4 sm:p-5 relative overflow-hidden"
    >
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/4 w-96 h-24 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Left: Device overview & Shield badge */}
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
            <div className="flex items-center gap-2">
              <h1 className={`text-base sm:text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {device.name}
              </h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30 font-bold">
                {device.model || 'Android Pro'}
              </span>
            </div>
            <p className={`text-xs flex items-center gap-1.5 mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Bouclier Antivol HearMe : <strong className="text-emerald-400">Armé à 100%</strong></span>
            </p>
          </div>
        </div>

        {/* Middle: Active Security Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
            isDark ? 'bg-black/40 border-white/[0.08] text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <Mic className="w-3.5 h-3.5 text-purple-400" />
            <span>Mot-Clé : <strong className="text-purple-400">Actif</strong></span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
            isDark ? 'bg-black/40 border-white/[0.08] text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <Lock className={`w-3.5 h-3.5 ${device.is_locked ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>Écran : <strong className={device.is_locked ? 'text-emerald-400' : 'text-amber-400'}>{device.is_locked ? 'Verrouillé' : 'Sécurisé'}</strong></span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
            isDark ? 'bg-black/40 border-white/[0.08] text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <Eye className="w-3.5 h-3.5 text-pink-400" />
            <span>Piège Caméra : <strong className="text-pink-400">Automatique</strong></span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
            isDark ? 'bg-black/40 border-white/[0.08] text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>Anti-Extinction : <strong className="text-sky-400">Forcé</strong></span>
          </div>
        </div>

        {/* Right: Quick Companion Simulator Link */}
        <button
          onClick={onOpenSimulator}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition shadow-sm active:scale-95 ${
            isDark
              ? 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-500/30 text-purple-200'
              : 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700'
          }`}
        >
          <Smartphone className="w-4 h-4 text-purple-400" />
          <span>Simulateur Mobile</span>
        </button>
      </div>
    </div>
  );
};
