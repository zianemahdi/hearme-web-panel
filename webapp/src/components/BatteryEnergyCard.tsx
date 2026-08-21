import React from 'react';
import { Battery, Zap } from 'lucide-react';

interface BatteryEnergyCardProps {
  batteryLevel: number;
  isCharging?: boolean;
  theme?: 'dark' | 'light';
}

export const BatteryEnergyCard: React.FC<BatteryEnergyCardProps> = ({
  batteryLevel,
  isCharging = false,
  theme = 'dark'
}) => {
  const isDark = theme === 'dark';

  // Anneau circulaire (valeur réelle)
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (batteryLevel / 100) * circumference;

  const getStatus = () => {
    if (batteryLevel > 50) return { label: 'Bon', text: 'text-emerald-400', stroke: '#10b981' };
    if (batteryLevel > 20) return { label: 'Faible', text: 'text-amber-400', stroke: '#f59e0b' };
    return { label: 'Critique', text: 'text-rose-400', stroke: '#f43f5e' };
  };
  const status = getStatus();

  return (
    <div
      id="bento-battery-card"
      className="hm-card-interactive rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between"
    >
      <div className={`hm-bento-glow w-32 h-32 ${batteryLevel > 20 ? 'bg-emerald-500' : 'bg-rose-500'} top-0 right-0 -mr-8 -mt-8`} />

      <div>
        {/* En-tête */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
              {isCharging ? <Zap className="w-4 h-4" /> : <Battery className="w-4 h-4" />}
            </div>
            <div>
              <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                Batterie
              </h2>
              <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Niveau du téléphone
              </span>
            </div>
          </div>

          {isCharging && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400 animate-bounce" />
              En charge
            </span>
          )}
        </div>

        {/* Anneau + état honnête */}
        <div className="flex items-center justify-center gap-5 my-2">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} className={isDark ? 'text-white/[0.08]' : 'text-slate-200'} strokeWidth="8" stroke="currentColor" fill="transparent" />
              <circle cx="50" cy="50" r={radius} stroke={status.stroke} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" fill="transparent" style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-mono font-extrabold tracking-tight">{batteryLevel}%</span>
              <span className="text-[9px] uppercase font-bold text-slate-400">{isCharging ? 'Charge' : 'Restant'}</span>
            </div>
          </div>

          <div className="space-y-1.5 flex-1">
            <div className={`p-2 rounded-xl border ${isDark ? 'bg-black/30 border-white/[0.06]' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[10px] uppercase font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Niveau</span>
              <span className={`text-xs font-bold ${status.text}`}>{status.label}</span>
            </div>
            <div className={`p-2 rounded-xl border ${isDark ? 'bg-black/30 border-white/[0.06]' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[10px] uppercase font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Alimentation</span>
              <span className={`text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{isCharging ? 'Sur secteur' : 'Sur batterie'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
