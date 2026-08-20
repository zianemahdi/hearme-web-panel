import React from 'react';
import { Device } from '../types';
import { Battery, BatteryCharging, BatteryWarning, Wifi, Radio, Lock, Unlock, ShieldCheck, Smartphone, Clock, Signal, Zap } from 'lucide-react';

interface DeviceStatusCardProps {
  device: Device;
  lastUpdateText: string;
  isOnline: boolean;
}

export const DeviceStatusCard: React.FC<DeviceStatusCardProps> = ({ device, lastUpdateText, isOnline }) => {
  const getBatteryGradient = (level: number) => {
    if (level > 50) return 'from-emerald-500 via-teal-400 to-emerald-300';
    if (level > 20) return 'from-amber-500 via-amber-400 to-yellow-300';
    return 'from-rose-600 via-rose-500 to-red-400';
  };

  const getNetworkBadge = (net: string) => {
    switch (net) {
      case 'wifi':
        return { label: 'Wi-Fi 6', icon: <Wifi className="w-3.5 h-3.5 text-sky-400" />, color: 'bg-sky-500/10 text-sky-300 border-sky-500/25' };
      case '5g':
        return { label: 'Réseau 5G NR', icon: <Signal className="w-3.5 h-3.5 text-purple-400" />, color: 'bg-purple-500/10 text-purple-300 border-purple-500/25' };
      case '4g':
        return { label: '4G LTE Pro', icon: <Radio className="w-3.5 h-3.5 text-blue-400" />, color: 'bg-blue-500/10 text-blue-300 border-blue-500/25' };
      default:
        return { label: 'Inconnu', icon: <Radio className="w-3.5 h-3.5 text-slate-500" />, color: 'bg-slate-500/10 text-slate-400 border-slate-500/25' };
    }
  };

  const netBadge = getNetworkBadge(device.network_type);

  return (
    <div id="device-status-panel" className="hm-card-pro rounded-2xl p-5 space-y-4 relative overflow-hidden">
      {/* Ambient background light */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/10 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10"></div>

      {/* Header with status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-500/15 border border-purple-500/20 text-purple-400">
            <Smartphone className="w-4 h-4" />
          </div>
          <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Télémétrie Appareil</h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono bg-black/30 px-2.5 py-1 rounded-lg border border-white/[0.06]">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>{lastUpdateText}</span>
        </div>
      </div>

      {/* Battery Section */}
      <div className="bg-black/40 rounded-xl p-3.5 border border-white/[0.07] space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5 font-medium">
            {device.battery_charging ? (
              <Zap className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
            ) : device.battery_level <= 20 ? (
              <BatteryWarning className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Battery className="w-3.5 h-3.5 text-slate-400" />
            )}
            Niveau Batterie
          </span>
          <span className="font-mono font-bold text-sm text-slate-100 flex items-center gap-1.5">
            {device.battery_level}%
            {device.battery_charging && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Charge
              </span>
            )}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-white/[0.08] overflow-hidden p-0.5 shadow-inner">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${getBatteryGradient(device.battery_level)} transition-all duration-700 shadow-sm`}
            style={{ width: `${Math.min(Math.max(device.battery_level, 4), 100)}%` }}
          />
        </div>
      </div>

      {/* Grid status rows */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Network status */}
        <div className="bg-black/40 rounded-xl p-3 border border-white/[0.07] flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 block mb-1.5">Réseau actif</span>
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-semibold ${netBadge.color}`}>
            {netBadge.icon}
            <span className="truncate">{netBadge.label}</span>
          </div>
        </div>

        {/* Lock status */}
        <div className="bg-black/40 rounded-xl p-3 border border-white/[0.07] flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 block mb-1.5">État Écran</span>
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-semibold ${
            device.is_locked
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
          }`}>
            {device.is_locked ? <Lock className="w-3.5 h-3.5 text-emerald-400" /> : <Unlock className="w-3.5 h-3.5 text-amber-400" />}
            <span>{device.is_locked ? 'Verrouillé' : 'Déverrouillé'}</span>
          </div>
        </div>
      </div>

      {/* Model & Protection info footer */}
      <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-white/[0.07]">
        <div className="flex items-center gap-1.5 text-slate-400 truncate">
          <span className="text-slate-400 text-[11px]">Modèle :</span>
          <span className="text-slate-200 font-semibold font-mono text-[11px] truncate">{device.model || 'Android Phone'}</span>
        </div>
        <div className="flex items-center gap-1 text-purple-300 font-medium text-[11px] shrink-0 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
          <span>Blindage HearMe</span>
        </div>
      </div>
    </div>
  );
};

