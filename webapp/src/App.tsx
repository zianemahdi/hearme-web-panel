import React, { useState, useEffect, useCallback } from 'react';
import { Device, LocationPoint, SecurityPhoto, CommandType, AuthMode, AuthSession } from './types';
import {
  INITIAL_DEMO_DEVICE,
  INITIAL_DEMO_LOCATIONS,
  INITIAL_DEMO_PHOTOS
} from './utils/mockData';
import { getSupabase, callRpc } from './utils/supabaseClient';
import { siren } from './utils/audio';

// Components
import { Navbar } from './components/Navbar';
import { LiveMap } from './components/LiveMap';
import { EmergencyControls } from './components/EmergencyControls';
import { SecretKeyCard } from './components/SecretKeyCard';
import { SecurityGallery } from './components/SecurityGallery';
import { DeviceSimulatorDrawer } from './components/DeviceSimulatorDrawer';
import { PrivacyModal } from './components/PrivacyModal';
import { SettingsModal } from './components/SettingsModal';
import { SiteFooter } from './components/SiteFooter';
import { Background3D } from './components/Background3D';
import { WelcomeAuthPortal } from './components/WelcomeAuthPortal';

// Bento Grid Modules
import { QuickProtectionBar } from './components/QuickProtectionBar';
import { AcousticVoiceCard } from './components/AcousticVoiceCard';
import { BatteryEnergyCard } from './components/BatteryEnergyCard';
import { NetworkMatrixCard } from './components/NetworkMatrixCard';
import { Phone3DVisualizer } from './components/Phone3DVisualizer';

export default function App() {
  // Theme State: 'dark' or 'light'
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const savedTheme = localStorage.getItem('hearme_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return 'dark';
  });

  // Session State
  const [session, setSession] = useState<AuthSession | null>(() => {
    const saved = localStorage.getItem('hearme_session');
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });

  const [device, setDevice] = useState<Device>(INITIAL_DEMO_DEVICE);
  const [locations, setLocations] = useState<LocationPoint[]>(INITIAL_DEMO_LOCATIONS);
  const [photos, setPhotos] = useState<SecurityPhoto[]>(INITIAL_DEMO_PHOTOS);
  
  // UI Modals & Drawers
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [lastUpdateText, setLastUpdateText] = useState('il y a quelques secondes');
  const [isOnline, setIsOnline] = useState(true);

  // Sync theme changes to <html> classList and localStorage
  useEffect(() => {
    localStorage.setItem('hearme_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Sync session to localStorage
  useEffect(() => {
    if (session) {
      localStorage.setItem('hearme_session', JSON.stringify(session));
    } else {
      localStorage.removeItem('hearme_session');
    }
  }, [session]);

  // Compute Relative Time string
  const updateRelativeTime = useCallback(() => {
    if (!device.last_seen_at) {
      setLastUpdateText('Inconnu');
      setIsOnline(false);
      return;
    }
    const diffMs = Date.now() - new Date(device.last_seen_at).getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 25) {
      setLastUpdateText('à l\'instant');
      setIsOnline(true);
    } else if (diffSec < 60) {
      setLastUpdateText(`il y a ${diffSec}s`);
      setIsOnline(true);
    } else if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      setLastUpdateText(`il y a ${mins} min`);
      setIsOnline(diffSec < 180);
    } else {
      const hours = Math.floor(diffSec / 3600);
      setLastUpdateText(`il y a ${hours}h`);
      setIsOnline(false);
    }
  }, [device.last_seen_at]);

  useEffect(() => {
    updateRelativeTime();
    const interval = setInterval(updateRelativeTime, 5000);
    return () => clearInterval(interval);
  }, [updateRelativeTime]);

  // Polling / Realtime sync with Supabase
  useEffect(() => {
    if (!session || session.mode === 'demo') return;

    let isMounted = true;

    const fetchRealDeviceData = async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) return;

        if (session.secretKey && session.mode !== 'demo') {
          // RPC panel_get_device (renvoie un TABLEAU de lignes)
          const { data: devData } = await supabase.rpc('panel_get_device', { p_secret: session.secretKey });
          const d: Record<string, unknown> | undefined = Array.isArray(devData) ? devData[0] : devData;
          if (d && isMounted) {
            const netMap: Record<string, string> = { wifi: 'wifi', mobile: '4g', offline: 'offline' };
            setDevice(prev => ({
              ...prev,
              name: (d.name as string) || prev.name,
              battery_level: d.battery_level != null ? Number(d.battery_level) : prev.battery_level,
              network_type: (netMap[String(d.network_status)] as Device['network_type']) ?? prev.network_type,
              is_locked: d.is_locked != null ? Boolean(d.is_locked) : prev.is_locked,
              last_seen_at: (d.last_seen as string) || new Date().toISOString()
            }));
          }

          // Positions (panel_get_locations : lat, lon, accuracy_m, battery_level, recorded_at)
          const { data: locData } = await supabase.rpc('panel_get_locations', { p_secret: session.secretKey, p_limit: 30 });
          if (locData && Array.isArray(locData) && locData.length > 0 && isMounted) {
            setLocations(locData.map((l: Record<string, unknown>, idx: number) => ({
              id: String(l.id || `loc-${idx}`),
              device_id: String(l.device_id || device.id),
              latitude: Number(l.lat ?? l.latitude),
              longitude: Number(l.lon ?? l.longitude),
              accuracy: Number(l.accuracy_m ?? l.accuracy ?? 10),
              battery_level: l.battery_level != null ? Number(l.battery_level) : undefined,
              recorded_at: String(l.recorded_at || l.created_at || new Date().toISOString())
            })));
          }
        }
      } catch (e) {
        console.warn('Realtime fetch note:', e);
      }
    };

    fetchRealDeviceData();
    const pollTimer = setInterval(fetchRealDeviceData, 8000);

    return () => {
      isMounted = false;
      clearInterval(pollTimer);
    };
  }, [session, device.id]);

  // Handle Command Dispatch
  const handleSendCommand = async (command: CommandType, params?: Record<string, unknown>): Promise<boolean> => {
    setIsSendingCommand(true);

    try {
      if (command === 'alarm') {
        setDevice(prev => ({ ...prev, is_alarm_active: true }));
      } else if (command === 'stopalarm') {
        setDevice(prev => ({ ...prev, is_alarm_active: false }));
      } else if (command === 'lock') {
        setDevice(prev => ({ ...prev, is_locked: true }));
      }

      // If connected to live Supabase, push command via RPC
      if (session && session.secretKey && session.mode !== 'demo') {
        const supabase = getSupabase();
        if (supabase) {
          await supabase.rpc('panel_send_command', {
            p_secret: session.secretKey,
            p_command: command
          });
        }
      }

      // If in demo mode, perform realistic simulated feedback
      if (session?.mode === 'demo') {
        if (command === 'photo') {
          setTimeout(() => {
            handleSimulateNewTestPhoto();
          }, 1500);
        } else if (command === 'locate') {
          setTimeout(() => {
            const curLat = locations[0]?.latitude || 36.7769;
            const curLng = locations[0]?.longitude || 3.0538;
            const updatedLoc: LocationPoint = {
              id: `loc-${Date.now()}`,
              device_id: device.id,
              latitude: curLat + (Math.random() - 0.5) * 0.001,
              longitude: curLng + (Math.random() - 0.5) * 0.001,
              accuracy: 4,
              battery_level: device.battery_level,
              recorded_at: new Date().toISOString()
            };
            setLocations(prev => [updatedLoc, ...prev.slice(0, 30)]);
          }, 1200);
        }
      }

      return true;
    } catch (err) {
      console.error('Command dispatch error:', err);
      return false;
    } finally {
      setIsSendingCommand(false);
    }
  };

  // Regenerate Secret Key
  const handleRegenerateKey = async (): Promise<string | null> => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let newKey = 'Hm';
    for (let i = 0; i < 10; i++) {
      if (i === 2 || i === 6) newKey += '-';
      newKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    setDevice(prev => ({ ...prev, secret_key: newKey }));
    if (session) {
      setSession({ ...session, secretKey: newKey });
    }

    if (session?.secretKey && session.mode !== 'demo') {
      try {
        await callRpc('rotate_secret', {
          p_old: session.secretKey,
          p_new: newKey
        });
      } catch {
        // local update preserved
      }
    }

    return newKey;
  };

  // Geofence alert state
  const [geofenceBreachAlert, setGeofenceBreachAlert] = useState<string | null>(null);

  // Simulation handler from companion drawer
  const handleSimulateUpdate = (
    partialDevice: Partial<Device>,
    newLocation?: LocationPoint,
    newPhoto?: SecurityPhoto
  ) => {
    setDevice(prev => ({ ...prev, ...partialDevice }));
    if (newLocation) {
      setLocations(prev => [newLocation, ...prev.slice(0, 30)]);
    }
    if (newPhoto) {
      setPhotos(prev => [newPhoto, ...prev]);
    }
  };

  // Location offset simulation for Geofence testing
  const handleLocationSimulate = (offsetLat: number, offsetLng: number) => {
    if (locations.length === 0) return;
    const current = locations[0];
    const newLoc: LocationPoint = {
      id: `loc-${Date.now()}`,
      device_id: device.id,
      latitude: current.latitude + offsetLat,
      longitude: current.longitude + offsetLng,
      accuracy: 6,
      battery_level: device.battery_level,
      recorded_at: new Date().toISOString()
    };
    setLocations(prev => [newLoc, ...prev.slice(0, 30)]);
  };

  const handleGeofenceBreach = (zoneName: string) => {
    setGeofenceBreachAlert(zoneName);
  };

  // Test photo capture simulation
  const handleSimulateNewTestPhoto = () => {
    const demoFaces = [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&auto=format&fit=crop&q=80'
    ];
    const randomImg = demoFaces[Math.floor(Math.random() * demoFaces.length)];

    const testPhoto: SecurityPhoto = {
      id: `photo-${Date.now()}`,
      device_id: device.id,
      url: randomImg,
      event_type: 'remote_cmd',
      captured_at: new Date().toISOString(),
      latitude: locations[0]?.latitude || 36.7769,
      longitude: locations[0]?.longitude || 3.0538,
      camera: 'front'
    };

    setPhotos(prev => [testPhoto, ...prev]);
  };

  const handleLogout = () => {
    siren.stop();
    setSession(null);
  };

  const handleAuthSuccess = (mode: AuthMode, deviceSecretKey?: string, userEmail?: string) => {
    const newSession: AuthSession = {
      mode,
      userEmail,
      secretKey: deviceSecretKey || (mode === 'demo' ? INITIAL_DEMO_DEVICE.secret_key : undefined)
    };
    setSession(newSession);
    if (deviceSecretKey) {
      setDevice(prev => ({ ...prev, secret_key: deviceSecretKey }));
    }
  };

  const currentLocation = locations.length > 0 ? locations[0] : null;

  return (
    <div
      className={`min-h-screen relative overflow-x-hidden font-['Poppins',sans-serif] transition-colors duration-300 ${
        theme === 'dark' ? 'hm-mesh text-slate-100' : 'hm-mesh-light text-slate-900'
      }`}
    >
      {/* Interactive 3D Holographic Background defining HearMe's Acoustic + Geolocation Concept */}
      <Background3D theme={theme} intensity={theme === 'dark' ? 0.95 : 0.65} />

      {/* If not authenticated, display the comprehensive Welcome / Registration Portal */}
      {!session ? (
        <WelcomeAuthPortal
          onSuccess={handleAuthSuccess}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenPrivacy={() => setIsPrivacyOpen(true)}
        />
      ) : (
        <div className="relative z-10 flex flex-col min-h-screen">
          {/* Top Navigation */}
          <Navbar
            device={device}
            authMode={session.mode}
            isOnline={isOnline}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenPrivacy={() => setIsPrivacyOpen(true)}
            onLogout={handleLogout}
          />

          {/* Main Bento Grid Dashboard Layout */}
          <main className="max-w-7xl mx-auto p-4 sm:p-6 w-full flex-1 space-y-5">
            {/* Geofence Breach Alert Notification Banner */}
            {geofenceBreachAlert && (
              <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/80 backdrop-blur-xl flex items-center justify-between shadow-[0_0_30px_rgba(244,63,94,0.35)] animate-pulse text-xs sm:text-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 font-bold">
                    🚨
                  </div>
                  <div>
                    <div className="font-bold text-rose-200 uppercase tracking-wide">
                      Alerte Périmètre de Sécurité Dépassé !
                    </div>
                    <div className="text-rose-300 text-xs">
                      Le smartphone <strong>{device.name}</strong> a franchi la zone sécurisée « {geofenceBreachAlert} ».
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSendCommand('alarm')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition active:scale-95 shadow"
                  >
                    Activer Sirène
                  </button>
                  <button
                    onClick={() => setGeofenceBreachAlert(null)}
                    className="px-2 py-1 rounded-lg text-rose-400 hover:text-white hover:bg-white/10 text-xs transition"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}

            {/* Top Bento Banner: Quick Protection Status Bar */}
            <QuickProtectionBar
              device={device}
              isOnline={isOnline}
              theme={theme}
              onOpenSimulator={() => setIsSimulatorOpen(true)}
            />

            {/* Bento Grid: 12-Column Responsive Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
              {/* Bento Card 1 (Large Hub, 8 cols): Live Radar GPS Map with Geofencing & Tactical HUD */}
              <div className="col-span-1 md:col-span-2 lg:col-span-8 flex flex-col">
                <LiveMap
                  locations={locations}
                  currentLocation={currentLocation}
                  deviceName={device.name}
                  theme={theme}
                  onLocationSimulate={handleLocationSimulate}
                  onGeofenceBreachAlert={handleGeofenceBreach}
                />
              </div>

              {/* Bento Card 2 (Tactical Box, 4 cols): Emergency Action Command Center */}
              <div className="col-span-1 md:col-span-2 lg:col-span-4 flex flex-col">
                <EmergencyControls
                  isAlarmActive={device.is_alarm_active}
                  onSendCommand={handleSendCommand}
                  isSending={isSendingCommand}
                  theme={theme}
                />
              </div>

              {/* Bento Card 3 (6 cols): 3D Interactive Smartphone Digital Twin */}
              <div className="col-span-1 md:col-span-2 lg:col-span-6 flex flex-col">
                <Phone3DVisualizer
                  device={device}
                  theme={theme}
                  onToggleAlarm={() => handleSendCommand('alarm')}
                  onToggleLock={() => handleSendCommand('lock')}
                  onTriggerPhoto={handleSimulateNewTestPhoto}
                />
              </div>

              {/* Bento Card 4 (6 cols): Biometric Intruder Photo Gallery with Laser Scanner */}
              <div className="col-span-1 md:col-span-2 lg:col-span-6 flex flex-col">
                <SecurityGallery
                  photos={photos}
                  onTakeTestPhoto={handleSimulateNewTestPhoto}
                  theme={theme}
                />
              </div>

              {/* Bento Card 5 (4 cols): Acoustic Voice-Trigger & Spectrogram Waveform */}
              <div className="col-span-1 md:col-span-1 lg:col-span-4 flex flex-col">
                <AcousticVoiceCard
                  theme={theme}
                  onKeywordTriggered={() => {
                    handleSendCommand('alarm');
                  }}
                />
              </div>

              {/* Bento Card 6 (4 cols): High-Tech Liquid Battery Energy Gauge */}
              <div className="col-span-1 md:col-span-1 lg:col-span-4 flex flex-col">
                <BatteryEnergyCard
                  batteryLevel={device.battery_level}
                  isCharging={device.battery_charging}
                  theme={theme}
                />
              </div>

              {/* Bento Card 7 (4 cols): Network Matrix & Telemetry Cipher */}
              <div className="col-span-1 md:col-span-1 lg:col-span-4 flex flex-col">
                <NetworkMatrixCard
                  networkType={device.network_type}
                  isOnline={isOnline}
                  theme={theme}
                />
              </div>

              {/* Bento Card 8 (12 cols): Cryptographic Secret Control Key & Telegram Quick-Help */}
              <div className="col-span-1 md:col-span-2 lg:col-span-12 flex flex-col">
                <SecretKeyCard
                  secretKey={device.secret_key || 'Hm9x-8812-Kq7v'}
                  onRegenerateKey={handleRegenerateKey}
                  theme={theme}
                />
              </div>
            </div>

            {/* Bottom Footer Note */}
            <div className="text-center pt-2 pb-4 space-y-1.5">
              <button
                onClick={() => setIsPrivacyOpen(true)}
                className={`text-xs hover:underline transition cursor-pointer ${
                  theme === 'dark' ? 'text-slate-400 hover:text-purple-300' : 'text-slate-600 hover:text-purple-600'
                }`}
              >
                Politique de confidentialité (Conforme Google Play Protect & RGPD)
              </button>
              <div className={`text-[11px] ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                HearMe Antivol v2.5 &bull; Chiffrement TLS 1.3 / ChaCha20 & Télémétrie 3D
              </div>
            </div>
          </main>

          {/* Official HearMe Site Footer matching https://paperwhite28.wixsite.com/my-site */}
          <SiteFooter onOpenPrivacy={() => setIsPrivacyOpen(true)} theme={theme} />

          {/* Companion Phone Simulator Drawer */}
          <DeviceSimulatorDrawer
            isOpen={isSimulatorOpen}
            onClose={() => setIsSimulatorOpen(false)}
            device={device}
            currentLocation={currentLocation}
            onSimulateUpdate={handleSimulateUpdate}
          />
        </div>
      )}

      {/* Privacy Policy Modal */}
      <PrivacyModal
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />

      {/* Supabase Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConfigSaved={() => {
          // Re-trigger sync
        }}
      />
    </div>
  );
}
