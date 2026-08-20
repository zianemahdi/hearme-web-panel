import React, { useState } from 'react';
import { Smartphone, Zap, MapPin, Battery, Wifi, ShieldAlert, Sparkles, X, Play, RefreshCw, Send, Lock, Unlock } from 'lucide-react';
import { Device, LocationPoint, SecurityPhoto } from '../types';

interface DeviceSimulatorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device;
  currentLocation: LocationPoint | null;
  onSimulateUpdate: (partialDevice: Partial<Device>, newLocation?: LocationPoint, newPhoto?: SecurityPhoto) => void;
}

const PRESET_CITIES = [
  { name: 'Alger (Didouche / Port)', lat: 36.7769, lng: 3.0538 },
  { name: 'Alger (Hydra / El Biar)', lat: 36.7450, lng: 3.0280 },
  { name: 'Oran (Front de Mer)', lat: 35.7050, lng: -0.6400 },
  { name: 'Constantine (Pont Sidi M\'Cid)', lat: 36.3680, lng: 6.6140 },
  { name: 'Paris (Champs-Élysées)', lat: 48.8698, lng: 2.3075 },
  { name: 'Lyon (Place Bellecour)', lat: 45.7578, lng: 4.8320 }
];

export const DeviceSimulatorDrawer: React.FC<DeviceSimulatorDrawerProps> = ({
  isOpen,
  onClose,
  device,
  currentLocation,
  onSimulateUpdate
}) => {
  const [batteryLevel, setBatteryLevel] = useState(device.battery_level);
  const [networkType, setNetworkType] = useState(device.network_type);
  const [isLocked, setIsLocked] = useState(device.is_locked);
  const [isCharging, setIsCharging] = useState(device.battery_charging || false);

  if (!isOpen) return null;

  const handleSimulateMove = (city: typeof PRESET_CITIES[0]) => {
    // Add minor random jitter
    const jitterLat = (Math.random() - 0.5) * 0.004;
    const jitterLng = (Math.random() - 0.5) * 0.004;
    const newLat = city.lat + jitterLat;
    const newLng = city.lng + jitterLng;

    const newLoc: LocationPoint = {
      id: `loc-${Date.now()}`,
      device_id: device.id,
      latitude: newLat,
      longitude: newLng,
      accuracy: Math.floor(Math.random() * 8) + 4,
      battery_level: batteryLevel,
      speed: Math.round(Math.random() * 25 * 10) / 10,
      recorded_at: new Date().toISOString()
    };

    onSimulateUpdate(
      { battery_level: batteryLevel, last_seen_at: new Date().toISOString() },
      newLoc
    );
  };

  const handleSimulateIntruderPhoto = () => {
    const intruderAvatars = [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&auto=format&fit=crop&q=80'
    ];
    const randomUrl = intruderAvatars[Math.floor(Math.random() * intruderAvatars.length)];

    const newPhoto: SecurityPhoto = {
      id: `photo-${Date.now()}`,
      device_id: device.id,
      url: randomUrl,
      event_type: 'failed_pin',
      captured_at: new Date().toISOString(),
      latitude: currentLocation?.latitude || 36.7769,
      longitude: currentLocation?.longitude || 3.0538,
      camera: 'front'
    };

    onSimulateUpdate({}, undefined, newPhoto);
  };

  const handleApplyStateChanges = () => {
    onSimulateUpdate({
      battery_level: batteryLevel,
      battery_charging: isCharging,
      network_type: networkType,
      is_locked: isLocked,
      last_seen_at: new Date().toISOString()
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#090913]/95 backdrop-blur-2xl border-l border-white/[0.1] shadow-2xl p-6 overflow-y-auto flex flex-col justify-between">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Simulateur Android</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold uppercase tracking-wider">
                  Test Companion
                </span>
              </h2>
              <p className="text-xs text-slate-400">Tester en direct le comportement sans mobile physique</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* GPS Movement simulation */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-purple-400" />
            <span>Simuler un déplacement GPS</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_CITIES.map((c) => (
              <button
                key={c.name}
                onClick={() => handleSimulateMove(c)}
                className="p-3 rounded-xl bg-white/[0.04] hover:bg-purple-600/20 border border-white/[0.08] hover:border-purple-500/40 text-left transition group text-xs active:scale-95"
              >
                <div className="font-bold text-slate-200 group-hover:text-purple-300">{c.name}</div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{c.lat.toFixed(2)}, {c.lng.toFixed(2)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Battery & Charging */}
        <div className="space-y-3 bg-black/40 p-4 rounded-2xl border border-white/[0.08] shadow-inner">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <Battery className="w-4 h-4 text-emerald-400" />
              Niveau batterie : <span className="font-mono text-emerald-300">{batteryLevel}%</span>
            </span>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300 bg-white/[0.05] px-2.5 py-1 rounded-lg border border-white/[0.08]">
              <input
                type="checkbox"
                checked={isCharging}
                onChange={(e) => {
                  setIsCharging(e.target.checked);
                  onSimulateUpdate({ battery_charging: e.target.checked });
                }}
                className="rounded border-white/20 text-purple-600 focus:ring-0"
              />
              <span>En charge</span>
            </label>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={batteryLevel}
            onChange={(e) => {
              const val = Number(e.target.value);
              setBatteryLevel(val);
              onSimulateUpdate({ battery_level: val });
            }}
            className="w-full accent-purple-500 cursor-pointer h-2 bg-white/10 rounded-lg"
          />
        </div>

        {/* Network & Lock State */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Wifi className="w-4 h-4 text-sky-400" />
            <span>Type de réseau actif</span>
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {(['wifi', '5g', '4g', 'offline'] as const).map((net) => (
              <button
                key={net}
                onClick={() => {
                  setNetworkType(net);
                  onSimulateUpdate({ network_type: net });
                }}
                className={`py-2.5 rounded-xl text-xs font-bold uppercase border transition ${
                  networkType === net
                    ? 'bg-purple-600/30 border-purple-500/60 text-purple-200 shadow-sm'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:bg-white/[0.08]'
                }`}
              >
                {net}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Intruder Attack Simulation */}
        <div className="space-y-3 bg-rose-950/20 border border-rose-500/25 p-4 rounded-2xl">
          <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Simuler un échec de déverrouillage</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Simule 3 mauvais codes PIN saisis sur le mobile : HearMe prend une photo frontale silencieuse et la télécharge immédiatement sur la galerie.
          </p>
          <button
            onClick={handleSimulateIntruderPhoto}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/40 text-rose-200 text-xs font-bold transition active:scale-95 shadow-md"
          >
            <Sparkles className="w-4 h-4 text-rose-300" />
            <span>Déclencher échec PIN & capture HD</span>
          </button>
        </div>
      </div>

      {/* Footer controls */}
      <div className="pt-6 border-t border-white/[0.08] flex items-center justify-end">
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold text-xs transition active:scale-95"
        >
          Fermer le simulateur
        </button>
      </div>
    </div>
  );
};
