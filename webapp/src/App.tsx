import React, { useState, useEffect, useCallback } from 'react';
import { Device, LocationPoint, CommandType, AuthMode, AuthSession } from './types';
import { INITIAL_DEMO_DEVICE, INITIAL_DEMO_LOCATIONS } from './utils/mockData';
import { getSupabase, callRpc } from './utils/supabaseClient';
import { X } from 'lucide-react';

// Components
import { Navbar } from './components/Navbar';
import { LiveMap } from './components/LiveMap';
import { EmergencyControls } from './components/EmergencyControls';
import { SecretKeyCard } from './components/SecretKeyCard';
import { PrivacyModal } from './components/PrivacyModal';
import { SiteFooter } from './components/SiteFooter';
import { WelcomeAuthPortal } from './components/WelcomeAuthPortal';
import { PhotoGallery } from './components/PhotoGallery';
import { useI18n } from './i18n';
import type { I18nKey } from './i18n/fr';

// Bento Grid Modules (fonctionnels uniquement)
import { QuickProtectionBar } from './components/QuickProtectionBar';
import { BatteryEnergyCard } from './components/BatteryEnergyCard';
import { NetworkMatrixCard } from './components/NetworkMatrixCard';

// Une session ouverte par lien d'urgence expire au bout de 6 h : le lien dure
// 15 min et ne sert qu'une fois, mais sans cela le navigateur du proche gardait
// un accès permanent au téléphone (photo, GPS) longtemps après la crise.
const CRISIS_SESSION_MS = 6 * 60 * 60 * 1000;

export default function App() {
  // Thème : le site est volontairement 100 % sombre (panneau d'urgence + fond
  // animé conçu pour le sombre). Plus de bascule clair/sombre. L'app Android
  // garde son propre thème, ceci ne la concerne pas.
  const theme = 'dark' as const;

  // Session
  const [session, setSession] = useState<AuthSession | null>(() => {
    const saved = localStorage.getItem('hearme_session');
    if (!saved) return null;
    try {
      const s: AuthSession = JSON.parse(saved);
      if (s.crisisSince && Date.now() - s.crisisSince > CRISIS_SESSION_MS) {
        localStorage.removeItem('hearme_session');
        return null;
      }
      return s;
    } catch {
      return null;
    }
  });

  const [device, setDevice] = useState<Device>(INITIAL_DEMO_DEVICE);
  const [locations, setLocations] = useState<LocationPoint[]>(INITIAL_DEMO_LOCATIONS);

  const { t } = useI18n();
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  // Message d'accès (lien d'urgence, clé changée) : des clés de texte, traduites à
  // l'affichage pour suivre un changement de langue.
  const [accessMsg, setAccessMsg] = useState<I18nKey[] | null>(null);
  // Incrémenté à chaque photo demandée : la galerie guette son arrivée.
  const [photoSignal, setPhotoSignal] = useState(0);

  // Force le sombre sur <html>, et nettoie une éventuelle préférence claire
  // laissée par une ancienne version.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.classList.remove('light');
    try { localStorage.removeItem('hearme_theme'); } catch { /* ignore */ }
  }, []);

  // Session → localStorage
  useEffect(() => {
    if (session) localStorage.setItem('hearme_session', JSON.stringify(session));
    else localStorage.removeItem('hearme_session');
  }, [session]);

  // En ligne : vu par le serveur il y a moins de 3 minutes.
  const updateRelativeTime = useCallback(() => {
    if (!device.last_seen_at) { setIsOnline(false); return; }
    const diffSec = Math.floor((Date.now() - new Date(device.last_seen_at).getTime()) / 1000);
    setIsOnline(diffSec < 180);
  }, [device.last_seen_at]);

  useEffect(() => {
    updateRelativeTime();
    const interval = setInterval(updateRelativeTime, 5000);
    return () => clearInterval(interval);
  }, [updateRelativeTime]);

  // Synchro live avec Supabase (modes 'secret' et 'account')
  useEffect(() => {
    if (!session || session.mode === 'demo') return;
    let isMounted = true;
    let stopped = false;
    let pausedUntil = 0;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const fetchRealDeviceData = async () => {
      if (stopped || Date.now() < pausedUntil) return;
      try {
        const supabase = getSupabase();
        if (!supabase) return;
        if (session.secretKey && session.mode !== 'demo') {
          // panel_get_device renvoie un TABLEAU de lignes
          const { data: devData, error: devErr } = await supabase.rpc('panel_get_device', { p_secret: session.secretKey });
          if (devErr) {
            // IP momentanément bloquée (trop d'échecs de clé) : on se tait 10 min
            // au lieu d'insister. Autre erreur (réseau) : on réessaie au prochain tour.
            if (/tentatives/i.test(devErr.message)) pausedUntil = Date.now() + 10 * 60 * 1000;
            return;
          }
          const d: Record<string, unknown> | undefined = Array.isArray(devData) ? devData[0] : devData;
          if (!d) {
            // Clé refusée : elle a changé (régénérée depuis le téléphone ou ce panneau).
            // On arrête TOUT DE SUITE : chaque nouvel essai compterait comme un échec
            // de clé et finirait par bloquer l'IP — y compris le téléphone s'il est
            // sur le même Wi-Fi.
            stopped = true;
            if (pollTimer) clearInterval(pollTimer);
            if (isMounted) {
              setSession(null);
              setAccessMsg(['app.keyChanged']);
            }
            return;
          }
          if (isMounted) {
            const netMap: Record<string, string> = { wifi: 'wifi', mobile: '4g', offline: 'offline' };
            setDevice(prev => ({
              ...prev,
              name: (d.name as string) || prev.name,
              battery_level: d.battery_level != null ? Number(d.battery_level) : prev.battery_level,
              network_type: (netMap[String(d.network_status)] as Device['network_type']) ?? prev.network_type,
              is_locked: d.is_locked != null ? Boolean(d.is_locked) : prev.is_locked,
              // null : version de l'app qui ne signale pas encore son mode.
              is_lost: d.is_lost == null ? null : Boolean(d.is_lost),
              is_stolen: d.is_stolen == null ? null : Boolean(d.is_stolen),
              last_seen_at: (d.last_seen as string) || new Date().toISOString()
            }));
          }

          // Positions (lat, lon, accuracy_m, battery_level, recorded_at)
          const { data: locData } = await supabase.rpc('panel_get_locations', { p_secret: session.secretKey, p_limit: 30 });
          if (locData && Array.isArray(locData) && locData.length > 0 && isMounted) {
            setLocations(locData.map((l: Record<string, unknown>, idx: number) => ({
              // Pas d'identifiant côté serveur : date + coordonnées (le suivi de la carte
              // repère ainsi chaque nouvelle position).
              id: String(l.id || `${l.recorded_at ?? idx}|${l.lat ?? l.latitude}|${l.lon ?? l.longitude}`),
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
    pollTimer = setInterval(fetchRealDeviceData, 8000);
    return () => { isMounted = false; stopped = true; clearInterval(pollTimer); };
  }, [session, device.id]);

  // Envoi de commande
  const handleSendCommand = async (command: CommandType): Promise<boolean> => {
    setIsSendingCommand(true);
    try {
      if (session && session.secretKey && session.mode !== 'demo') {
        const supabase = getSupabase();
        if (supabase) {
          // Clé invalide → le serveur renvoie null (sans erreur, pour que
          // l'anti-force-brute compte l'échec) : ce n'est pas un succès.
          const { data, error } = await supabase.rpc('panel_send_command', {
            p_secret: session.secretKey, p_command: command,
          });
          if (error) throw error;
          if (!data) throw new Error('Clé secrète invalide ou expirée.');
        }
      }

      // Commande acceptée seulement : en cas d'échec, l'écran ne doit pas afficher
      // « Verrouillé » ou « alarme active » alors que rien n'est parti.
      if (command === 'alarm') setDevice(prev => ({ ...prev, is_alarm_active: true }));
      else if (command === 'stopalarm') setDevice(prev => ({ ...prev, is_alarm_active: false }));
      else if (command === 'lock') setDevice(prev => ({ ...prev, is_locked: true }));

      // Démo : simule une nouvelle position pour « localiser »
      if (session?.mode === 'demo' && command === 'locate') {
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
      return true;
    } catch (err) {
      console.error('Command dispatch error:', err);
      return false;
    } finally {
      setIsSendingCommand(false);
    }
  };

  // Régénération de la clé secrète.
  // C'est le TÉLÉPHONE qui détient la clé : le panneau lui demande d'en changer
  // (panel_request_regenerate), il la fait tourner à sa prochaine synchronisation
  // et l'affiche dans l'app. Changer la clé d'ici (rotate_secret) coupait le
  // téléphone de son propre compte ; et le serveur n'accepte plus que des clés
  // fortes générées par l'app (12_bruteforce_guard.sql).
  const handleRegenerateKey = async (): Promise<boolean> => {
    if (!session?.secretKey) return false;
    if (session.mode === 'demo') {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let demoKey = '';
      for (let i = 0; i < 12; i++) demoKey += chars.charAt(Math.floor(Math.random() * chars.length));
      setDevice(prev => ({ ...prev, secret_key: demoKey }));
      setSession({ ...session, secretKey: demoKey });
      return true;
    }
    const { data, error } = await callRpc<boolean>('panel_request_regenerate', { p_secret: session.secretKey });
    return !error && data !== false;
  };

  const handleLogout = () => { setSession(null); };

  // Pas de session ouverte (déconnexion, clé changée, accès d'urgence expiré, ou jeton
  // oublié par une version précédente) : on ferme aussi la connexion Supabase de CE
  // navigateur — jeton effacé et révoqué. Sur un ordinateur emprunté, aucun jeton ne
  // doit rester. « local » : l'app du téléphone, sur le même compte, reste connectée.
  useEffect(() => {
    if (session) return;
    getSupabase().auth.signOut({ scope: 'local' }).catch(() => { /* hors ligne : jeton effacé quand même */ });
  }, [session]);

  const handleAuthSuccess = (
    mode: AuthMode,
    deviceSecretKey?: string,
    userEmail?: string,
    isCrisis = false
  ) => {
    setAccessMsg(null);
    const newSession: AuthSession = {
      mode,
      userEmail,
      secretKey: deviceSecretKey || (mode === 'demo' ? INITIAL_DEMO_DEVICE.secret_key : undefined),
      ...(isCrisis ? { crisisSince: Date.now() } : {})
    };
    setSession(newSession);
    if (deviceSecretKey) setDevice(prev => ({ ...prev, secret_key: deviceSecretKey }));
    window.scrollTo(0, 0);
  };

  // Une session de crise s'éteint aussi pendant que l'onglet reste ouvert.
  useEffect(() => {
    if (!session?.crisisSince) return;
    const remaining = session.crisisSince + CRISIS_SESSION_MS - Date.now();
    if (remaining <= 0) {
      setSession(null);
      setAccessMsg(['app.crisisExpired']);
      return;
    }
    const t = window.setTimeout(() => {
      setSession(null);
      setAccessMsg(['app.crisisExpired']);
    }, remaining);
    return () => window.clearTimeout(t);
  }, [session]);

  // Accès d'urgence par magic link : ?access=TOKEN (usage unique, expiration serveur).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get('access');
    if (!tok) return;
    (async () => {
      const { data, error } = await callRpc<{ ok: boolean; secret?: string; error?: string }>(
        'consume_access_token', { p_token: tok }
      );
      // Nettoie l'URL : le jeton est à usage unique, on ne le laisse pas dans la barre d'adresse.
      params.delete('access');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
      if (error || !data || !data.ok || !data.secret) {
        const reason: I18nKey =
          data?.error === 'expired' ? 'app.linkExpired' :
          data?.error === 'used' ? 'app.linkUsed' :
          'app.linkInvalid';
        setAccessMsg([reason, 'app.linkAskNew']);
        return;
      }
      setAccessMsg(null);
      // Session de crise : bornée dans le temps (voir CRISIS_SESSION_MS).
      handleAuthSuccess('secret', data.secret, undefined, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentLocation = locations.length > 0 ? locations[0] : null;

  return (
    <div
      className={`min-h-screen relative overflow-x-clip font-['Poppins',sans-serif] transition-colors duration-300 ${
        theme === 'dark' ? 'hm-mesh text-slate-100' : 'hm-mesh-light text-slate-900'
      }`}
    >
      {/* Dans le flux de la page (et non par-dessus) : il ne cache plus le logo ni le
          choix de langue sur téléphone. */}
      {accessMsg && (
        <div role="alert" className="relative z-20 flex items-start justify-center gap-3 bg-amber-500 text-slate-900 text-sm font-medium px-4 py-2.5 shadow-lg">
          <span className="text-center">{accessMsg.map((k) => t(k)).join(' ')}</span>
          <button
            type="button"
            onClick={() => setAccessMsg(null)}
            className="shrink-0 p-1 -m-1 rounded-lg hover:bg-black/10"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {!session ? (
        <WelcomeAuthPortal
          onSuccess={handleAuthSuccess}
          theme={theme}
          onOpenPrivacy={() => setIsPrivacyOpen(true)}
        />
      ) : (
        <div className="relative z-10 flex flex-col min-h-screen">
          <Navbar
            device={device}
            authMode={session.mode}
            isOnline={isOnline}
            theme={theme}
            onOpenPrivacy={() => setIsPrivacyOpen(true)}
            onLogout={handleLogout}
          />

          <main className="max-w-7xl mx-auto p-4 sm:p-6 w-full flex-1 space-y-5">
            <QuickProtectionBar device={device} isOnline={isOnline} theme={theme} />

            {/* Grille bento (modules fonctionnels) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
              {/* Carte GPS live */}
              <div className="col-span-1 md:col-span-2 lg:col-span-8 flex flex-col">
                <LiveMap
                  locations={locations}
                  currentLocation={currentLocation}
                  deviceName={device.name}
                  theme={theme}
                />
              </div>

              {/* Commandes d'urgence */}
              <div className="col-span-1 md:col-span-2 lg:col-span-4 flex flex-col">
                <EmergencyControls
                  isAlarmActive={device.is_alarm_active}
                  phoneSearch={device.is_lost}
                  onSendCommand={handleSendCommand}
                  isSending={isSendingCommand}
                  theme={theme}
                  onPhotoRequested={() => setPhotoSignal((n) => n + 1)}
                />
              </div>

              {/* Photos du porteur (espace privé, 30 jours) */}
              {session.mode !== 'demo' && session.secretKey && (
                <div className="col-span-1 md:col-span-2 lg:col-span-12 flex flex-col">
                  <PhotoGallery secretKey={session.secretKey} requestSignal={photoSignal} />
                </div>
              )}

              {/* Batterie */}
              <div className="col-span-1 md:col-span-1 lg:col-span-6 flex flex-col">
                <BatteryEnergyCard
                  batteryLevel={device.battery_level}
                  isCharging={device.battery_charging}
                  theme={theme}
                />
              </div>

              {/* Réseau */}
              <div className="col-span-1 md:col-span-1 lg:col-span-6 flex flex-col">
                <NetworkMatrixCard
                  networkType={device.network_type}
                  isOnline={isOnline}
                  theme={theme}
                />
              </div>

              {/* Clé secrète */}
              <div className="col-span-1 md:col-span-2 lg:col-span-12 flex flex-col">
                <SecretKeyCard
                  secretKey={device.secret_key || 'HMDEMO7K2QXP'}
                  onRegenerateKey={handleRegenerateKey}
                  theme={theme}
                />
              </div>
            </div>
          </main>

          <SiteFooter onOpenPrivacy={() => setIsPrivacyOpen(true)} theme={theme} />
        </div>
      )}

      <PrivacyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
    </div>
  );
}
