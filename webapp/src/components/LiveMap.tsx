import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocationPoint } from '../types';
import { Layers, Crosshair, ExternalLink, Maximize2, Minimize2, Navigation, Activity } from 'lucide-react';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n/fr';

interface LiveMapProps {
  locations: LocationPoint[];
  currentLocation: LocationPoint | null;
  deviceName: string;
  theme?: 'dark' | 'light';
}

type MapLayerType = 'dark' | 'satellite' | 'streets' | 'tactical';

const LAYERS: Record<MapLayerType, { url: string; attribution: string; maxZoom: number; label: I18nKey }> = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO, &copy; OpenStreetMap',
    maxZoom: 20,
    label: 'map.layerDark',
  },
  tactical: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO, &copy; OpenStreetMap',
    maxZoom: 19,
    label: 'map.layerTactical',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar',
    maxZoom: 19,
    label: 'map.layerSatellite',
  },
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
    label: 'map.layerStreets',
  },
};
const LAYER_ORDER: MapLayerType[] = ['satellite', 'streets', 'dark', 'tactical'];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export const LiveMap: React.FC<LiveMapProps> = ({ locations, currentLocation, deviceName, theme = 'dark' }) => {
  const isDark = theme === 'dark';
  const { t, locale, formatAge } = useI18n();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Par défaut : satellite (Esri), comme la carte de l'app Android
  // (les tuiles « plan » ont des trous en Algérie).
  const [activeLayer, setActiveLayer] = useState<MapLayerType>('satellite');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  // Suivi : la carte accompagne le téléphone à chaque nouvelle position, jusqu'à ce que
  // l'utilisateur la déplace lui-même ; le bouton « recentrer » réactive le suivi.
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  const lastPannedIdRef = useRef<string | null>(null);
  useEffect(() => { followRef.current = follow; }, [follow]);
  const currentLocationRef = useRef(currentLocation);
  currentLocationRef.current = currentLocation;

  // Menu des fonds de carte : se ferme au clic ailleurs ou avec Échap.
  const layerMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showLayerMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!layerMenuRef.current?.contains(e.target as Node)) setShowLayerMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setShowLayerMenu(false); } };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [showLayerMenu]);

  // Plein écran : Échap pour sortir, et la page derrière ne défile plus.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isFullscreen]);

  // Écran tactile : dans la page, un doigt fait défiler la PAGE (la carte occupait
  // presque tout l'écran et retenait le doigt) ; deux doigts zooment. En plein écran,
  // la carte se déplace librement.
  const touchUi = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !touchUi) return;
    if (isFullscreen) map.dragging.enable(); else map.dragging.disable();
  }, [isFullscreen, touchUi]);

  // Âge de la position, rafraîchi toutes les 5 s : « en direct » seulement si elle est
  // vraiment récente (l'app n'envoie que des relevés GPS frais, datés à la réception).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const ageSec = currentLocation
    ? Math.max(0, Math.round((now - Date.parse(currentLocation.recorded_at)) / 1000))
    : null;
  const freshness: 'none' | 'live' | 'recent' | 'old' =
    ageSec == null || Number.isNaN(ageSec) ? 'none' : ageSec <= 60 ? 'live' : ageSec <= 600 ? 'recent' : 'old';
  const ageLabel = formatAge(ageSec);

  // Carte Leaflet (une seule fois).
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [currentLocation?.latitude || 36.7769, currentLocation?.longitude || 3.0538],
      zoom: 16,
      zoomControl: false,
      dragging: !touchUi, // voir plus haut : la page défile sous le doigt
    });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapInstanceRef.current = map;
    // L'utilisateur déplace la carte : on arrête de la recentrer sous ses doigts.
    map.on('dragstart', () => setFollow(false));
    // La carte suit la taille de son cadre (plein écran, rotation, fenêtre) : sans ça,
    // Leaflet garde l'ancienne taille et laisse des zones grises.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
        const loc = currentLocationRef.current;
        if (followRef.current && loc) map.setView([loc.latitude, loc.longitude], map.getZoom(), { animate: false });
      });
    });
    observer.observe(mapContainerRef.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      accuracyCircleRef.current = null;
      polylineRef.current = null;
      tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fond de carte.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const cfg = LAYERS[activeLayer];
    tileLayerRef.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom }).addTo(map);
  }, [activeLayer]);

  // Marqueur, cercle de précision et trajet.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!currentLocation) {
      markerRef.current?.remove(); markerRef.current = null;
      accuracyCircleRef.current?.remove(); accuracyCircleRef.current = null;
      polylineRef.current?.remove(); polylineRef.current = null;
      return;
    }

    const { latitude, longitude, accuracy } = currentLocation;
    const latLng: [number, number] = [latitude, longitude];
    const radius = Math.max(accuracy || 10, 8);

    const popup = `
      <div style="font-family: inherit; font-size: 13px; color: #1e1b4b; min-width: 180px; padding: 4px;">
        <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px; color: #7c3aed;">${escapeHtml(deviceName)}</div>
        <div style="font-size: 12px; margin-bottom: 2px;" dir="ltr"><strong>GPS</strong> ${latitude.toFixed(5)}, ${longitude.toFixed(5)}</div>
        <div style="font-size: 12px; margin-bottom: 2px;"><strong>${escapeHtml(t('map.accuracy'))}</strong> ±${Math.round(accuracy || 5)} m</div>
        <div style="font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-top: 4px;">
          ${escapeHtml(new Date(currentLocation.recorded_at).toLocaleTimeString(locale))}
        </div>
      </div>`;

    if (!markerRef.current) {
      const icon = L.divIcon({
        className: 'hm-custom-marker',
        html: '<div class="hm-pin"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -14],
      });
      markerRef.current = L.marker(latLng, { icon, title: deviceName }).addTo(map).bindPopup(popup);
    } else {
      markerRef.current.setLatLng(latLng).setPopupContent(popup);
    }

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle(latLng, {
        radius, color: '#c24df0', weight: 1.5, fillColor: '#7c5cff', fillOpacity: 0.12,
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(latLng).setRadius(radius);
    }

    if (locations.length > 1) {
      const path: [number, number][] = locations.map((l) => [l.latitude, l.longitude]);
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(path, {
          color: '#c24df0', weight: 3.5, opacity: 0.75, dashArray: '6, 8', lineCap: 'round',
        }).addTo(map);
      } else {
        polylineRef.current.setLatLngs(path);
      }
    }

    // Nouvelle position et suivi actif : la carte accompagne le téléphone.
    if (followRef.current && lastPannedIdRef.current !== currentLocation.id) {
      lastPannedIdRef.current = currentLocation.id;
      map.panTo(latLng, { animate: true, duration: 0.8 });
    }
  }, [currentLocation, locations, deviceName, t, locale]);

  const handleRecenter = () => {
    setFollow(true);
    followRef.current = true;
    if (!mapInstanceRef.current || !currentLocation) return;
    lastPannedIdRef.current = currentLocation.id;
    mapInstanceRef.current.flyTo([currentLocation.latitude, currentLocation.longitude], 16, { duration: 1.2 });
  };

  const handleOpenGoogleMaps = () => {
    if (!currentLocation) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${currentLocation.latitude},${currentLocation.longitude}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const overlayBtn = 'p-2 rounded-xl bg-[#0d0d1a]/85 backdrop-blur-md border border-white/15 text-slate-200 hover:text-white hover:bg-black/90 transition shadow-xl hover:scale-105 active:scale-95';

  return (
    <div
      id="hearme-live-map-card"
      className={`isolate flex flex-col ${
        isFullscreen
          ? `fixed inset-0 sm:inset-4 z-[1500] p-2 sm:p-4 sm:rounded-2xl border shadow-[0_0_0_100vmax_rgba(0,0,0,0.8)] ${
              isDark ? 'bg-[#090912] border-purple-500/40' : 'bg-white border-purple-300'
            }`
          : 'hm-card-interactive relative rounded-2xl p-3 sm:p-3.5 h-[520px] sm:h-[560px]'
      }`}
    >
      {/* La carte reste de gauche à droite, même en arabe (contrôles Leaflet). */}
      <div className="relative w-full flex-1 rounded-xl overflow-hidden border border-white/[0.1] shadow-2xl" dir="ltr">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Âge réel de la position (vert = en direct) */}
        {/* Sur téléphone, les boutons sont en colonne à droite : le badge s'arrête avant. */}
        <div className="absolute top-3 left-3 right-16 sm:right-auto z-[400] flex flex-wrap items-center gap-2">
          <div
            id="map-freshness"
            role="status"
            className="px-3 py-1.5 rounded-xl bg-[#0d0d1a]/85 backdrop-blur-md border border-white/15 text-xs font-bold text-slate-200 flex flex-wrap items-center gap-x-2 gap-y-0.5 shadow-xl min-w-0"
          >
            <span className="relative flex h-2.5 w-2.5">
              {freshness === 'live' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                freshness === 'live' ? 'bg-emerald-500' : freshness === 'recent' ? 'bg-amber-400' : 'bg-slate-500'
              }`}></span>
            </span>
            {freshness === 'live' && (
              <span className="tracking-wider uppercase text-[11px] font-extrabold text-emerald-400">{t('map.live')}</span>
            )}
            {freshness === 'old' && (
              <span className="tracking-wider uppercase text-[11px] font-extrabold text-slate-400">{t('map.last')}</span>
            )}
            <span
              dir="auto"
              className={`text-[11px] font-semibold ${
                freshness === 'live' ? 'text-emerald-200' : freshness === 'recent' ? 'text-amber-300' : 'text-slate-300'
              }`}
            >
              {freshness === 'none' ? t('map.waiting') : ageLabel}
            </span>
          </div>
        </div>

        {/* Contrôles */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col sm:flex-row items-end sm:items-center gap-2">
          <div className="relative" ref={layerMenuRef}>
            <button
              id="btn-map-layer"
              onClick={() => setShowLayerMenu(!showLayerMenu)}
              aria-expanded={showLayerMenu}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-[#0d0d1a]/85 backdrop-blur-md border border-white/15 text-slate-200 hover:text-white hover:bg-black/90 transition shadow-xl flex items-center gap-1.5 text-xs font-semibold"
              title={t('map.layers')}
              aria-label={t('map.layers')}
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="hidden sm:inline">{t(LAYERS[activeLayer].label)}</span>
            </button>

            {showLayerMenu && (
              <div className="absolute top-0 right-full me-2 sm:me-0 sm:top-full sm:right-0 mt-0 sm:mt-2 w-44 rounded-2xl bg-[#111122] border border-white/15 p-2 shadow-2xl z-50 text-xs space-y-1 backdrop-blur-xl">
                {LAYER_ORDER.map((id) => (
                  <button
                    key={id}
                    onClick={() => { setActiveLayer(id); setShowLayerMenu(false); }}
                    aria-pressed={activeLayer === id}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition ${
                      activeLayer === id
                        ? 'bg-purple-600/25 text-purple-300 font-bold border border-purple-500/30'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span dir="auto">{t(LAYERS[id].label)}</span>
                    {activeLayer === id && <span className="text-purple-400 font-bold" aria-hidden="true">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            id="btn-map-recenter"
            onClick={handleRecenter}
            aria-pressed={follow}
            className={`p-2 rounded-xl backdrop-blur-md border transition shadow-xl hover:scale-105 active:scale-95 ${
              follow
                ? 'bg-purple-600/80 border-purple-300/60 text-white'
                : 'bg-[#0d0d1a]/85 border-white/15 text-slate-200 hover:text-white hover:bg-black/90'
            }`}
            title={follow ? t('map.following') : t('map.follow')}
            aria-label={follow ? t('map.following') : t('map.follow')}
          >
            <Crosshair className={`w-4 h-4 ${follow ? 'text-white' : 'text-purple-400'}`} />
          </button>

          <button id="btn-open-google-maps" onClick={handleOpenGoogleMaps} className={overlayBtn}
            title={t('map.google')} aria-label={t('map.google')}>
            <ExternalLink className="w-4 h-4 text-slate-300" />
          </button>

          <button
            id="btn-map-fullscreen"
            onClick={() => { setShowLayerMenu(false); setIsFullscreen(!isFullscreen); }}
            className={overlayBtn}
            title={isFullscreen ? t('map.exitFullscreen') : t('map.fullscreen')}
            aria-label={isFullscreen ? t('map.exitFullscreen') : t('map.fullscreen')}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-slate-300" /> : <Maximize2 className="w-4 h-4 text-slate-300" />}
          </button>
        </div>
      </div>

      {/* Coordonnées et précision */}
      <div className="pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-purple-400 shrink-0" />
            <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{t('map.gps')}</span>
            {currentLocation ? (
              <span dir="ltr" className={`font-mono font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
              </span>
            ) : (
              <span className="text-slate-500 italic">{t('map.waitingShort')}</span>
            )}
          </div>

          {currentLocation && currentLocation.accuracy != null && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                {t('map.accuracy')} <strong dir="ltr">±{Math.round(currentLocation.accuracy)} m</strong>
              </span>
            </div>
          )}
        </div>

        {currentLocation && (
          <span className={`px-2 py-1 rounded-xl border text-[11px] font-mono ${
            isDark ? 'bg-black/40 border-white/[0.08] text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
          }`}>
            {new Date(currentLocation.recorded_at).toLocaleTimeString(locale)}
          </span>
        )}
      </div>
    </div>
  );
};
