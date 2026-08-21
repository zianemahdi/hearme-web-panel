import React from 'react';
import { Wifi, Signal, Radio, Globe } from 'lucide-react';

interface NetworkMatrixCardProps {
  networkType: string;
  isOnline: boolean;
  theme?: 'dark' | 'light';
}

export const NetworkMatrixCard: React.FC<NetworkMatrixCardProps> = ({
  networkType,
  isOnline,
  theme = 'dark'
}) => {
  const isDark = theme === 'dark';

  const getNetInfo = () => {
    switch (networkType) {
      case 'wifi':
        return { title: 'Wi-Fi', icon: <Wifi className="w-4 h-4 text-sky-400" />, color: 'text-sky-400', badgeColor: 'bg-sky-500/15 text-sky-300 border-sky-500/25' };
      case '5g':
        return { title: '5G', icon: <Signal className="w-4 h-4 text-purple-400" />, color: 'text-purple-400', badgeColor: 'bg-purple-500/15 text-purple-300 border-purple-500/25' };
      case '4g':
        return { title: '4G', icon: <Radio className="w-4 h-4 text-blue-400" />, color: 'text-blue-400', badgeColor: 'bg-blue-500/15 text-blue-300 border-blue-500/25' };
      case '3g':
        return { title: '3G', icon: <Radio className="w-4 h-4 text-blue-400" />, color: 'text-blue-400', badgeColor: 'bg-blue-500/15 text-blue-300 border-blue-500/25' };
      case 'offline':
        return { title: 'Hors ligne', icon: <Radio className="w-4 h-4 text-slate-400" />, color: 'text-slate-400', badgeColor: 'bg-slate-500/15 text-slate-300 border-slate-500/25' };
      default:
        return { title: 'Réseau mobile', icon: <Radio className="w-4 h-4 text-slate-400" />, color: 'text-slate-400', badgeColor: 'bg-slate-500/15 text-slate-300 border-slate-500/25' };
    }
  };
  const net = getNetInfo();

  return (
    <div
      id="bento-network-card"
      className="hm-card-interactive rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between"
    >
      <div className="hm-bento-glow w-32 h-32 bg-sky-500 top-0 right-0 -mr-8 -mt-8" />

      <div>
        {/* En-tête */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                Réseau
              </h2>
              <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Connexion du téléphone
              </span>
            </div>
          </div>

          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border flex items-center gap-1.5 ${net.badgeColor}`}>
            {net.icon}
            <span>{isOnline ? 'Connecté' : 'Hors-ligne'}</span>
          </span>
        </div>

        {/* Type de connexion (réel) */}
        <div className={`p-3.5 rounded-xl border flex items-center justify-between ${isDark ? 'bg-black/40 border-white/[0.07]' : 'bg-slate-100/80 border-slate-200'}`}>
          <div>
            <span className={`text-[10px] uppercase font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Type de connexion
            </span>
            <span className={`font-bold text-sm ${net.color}`}>{net.title}</span>
          </div>
          <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            {net.icon}
          </div>
        </div>
      </div>
    </div>
  );
};
