import React from 'react';
import { Wifi, Signal, Radio, ShieldCheck, ArrowUpDown, Globe } from 'lucide-react';

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
        return {
          title: 'Wi-Fi 6 (802.11ax)',
          speed: '340 Mbps',
          ping: '14 ms',
          icon: <Wifi className="w-4 h-4 text-sky-400" />,
          color: 'text-sky-400',
          badgeColor: 'bg-sky-500/15 text-sky-300 border-sky-500/25'
        };
      case '5g':
        return {
          title: '5G NR Ultra Standalone',
          speed: '620 Mbps',
          ping: '19 ms',
          icon: <Signal className="w-4 h-4 text-purple-400" />,
          color: 'text-purple-400',
          badgeColor: 'bg-purple-500/15 text-purple-300 border-purple-500/25'
        };
      case '4g':
        return {
          title: '4G LTE Advanced Pro',
          speed: '95 Mbps',
          ping: '28 ms',
          icon: <Radio className="w-4 h-4 text-blue-400" />,
          color: 'text-blue-400',
          badgeColor: 'bg-blue-500/15 text-blue-300 border-blue-500/25'
        };
      default:
        return {
          title: 'Réseau Mobile Sécurisé',
          speed: '50 Mbps',
          ping: '35 ms',
          icon: <Radio className="w-4 h-4 text-slate-400" />,
          color: 'text-slate-400',
          badgeColor: 'bg-slate-500/15 text-slate-300 border-slate-500/25'
        };
    }
  };

  const net = getNetInfo();

  return (
    <div
      id="bento-network-card"
      className="hm-card-interactive rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between"
    >
      {/* Background ambient glow */}
      <div className="hm-bento-glow w-32 h-32 bg-sky-500 top-0 right-0 -mr-8 -mt-8" />

      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-500/25 text-sky-400">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                Matrice Réseau & Flux
              </h2>
              <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Liaison montante chiffrée
              </span>
            </div>
          </div>

          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border flex items-center gap-1.5 ${net.badgeColor}`}>
            {net.icon}
            <span>{isOnline ? 'Connecté' : 'Hors-ligne'}</span>
          </span>
        </div>

        {/* Network Metrics */}
        <div className="space-y-2.5 mb-3">
          <div className={`p-3 rounded-xl border flex items-center justify-between ${isDark ? 'bg-black/40 border-white/[0.07]' : 'bg-slate-100/80 border-slate-200'}`}>
            <div>
              <span className={`text-[10px] uppercase font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Protocole Actif
              </span>
              <span className={`font-semibold text-xs ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                {net.title}
              </span>
            </div>
            <div className="text-right font-mono">
              <span className={`text-xs font-bold ${net.color}`}>{net.speed}</span>
              <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Latence : {net.ping}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-black/30 border-white/[0.06]' : 'bg-white border-slate-200'}`}>
              <span className={`text-[10px] uppercase font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Chiffrement Télémétrie
              </span>
              <span className="font-mono text-xs font-bold text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                TLS 1.3 / ChaCha20
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-black/30 border-white/[0.06]' : 'bg-white border-slate-200'}`}>
              <span className={`text-[10px] uppercase font-semibold block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Flux de données
              </span>
              <span className="font-mono text-xs font-bold text-sky-400 flex items-center gap-1">
                <ArrowUpDown className="w-3.5 h-3.5 text-sky-400" />
                Synchro 5s
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={`pt-2.5 mt-1 border-t text-[11px] flex items-center justify-between ${isDark ? 'border-white/[0.07] text-slate-400' : 'border-slate-200 text-slate-500'}`}>
        <span className="truncate">IP Relais Sécurisé : <strong className="font-mono">197.204.**.**</strong></span>
        <span className="text-emerald-400 font-bold text-[10px]">100% SÉCURISÉ</span>
      </div>
    </div>
  );
};
