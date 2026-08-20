import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { LocationPoint, GeofenceZone } from '../types';
import {
  Layers,
  Crosshair,
  ExternalLink,
  Maximize2,
  Minimize2,
  Navigation,
  Compass,
  MapPin,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Radio,
  Sliders,
  Plus,
  Trash2,
  Check,
  Activity,
  AlertTriangle,
  Move,
  Scan,
  RefreshCw,
  LocateFixed
} from 'lucide-react';

interface LiveMapProps {
  locations: LocationPoint[];
  currentLocation: LocationPoint | null;
  deviceName: string;
  theme?: 'dark' | 'light';
  onLocationSimulate?: (offsetLat: number, offsetLng: number) => void;
  onGeofenceBreachAlert?: (zoneName: string) => void;
}

type MapLayerType = 'dark' | 'satellite' | 'streets' | 'tactical';

// Default initial Geofence Zones
const INITIAL_GEOFENCES: GeofenceZone[] = [
  {
    id: 'geo-home',
    name: 'Périmètre Domicile / Sécurisé',
    latitude: 36.7769,
    longitude: 3.0538,
    radius: 350,
    enabled: true,
    type: 'home',
    color: '#10b981',
    created_at: new Date().toISOString()
  },
  {
    id: 'geo-work',
    name: 'Zone Bureau / Campus',
    latitude: 36.7820,
    longitude: 3.0610,
    radius: 450,
    enabled: false,
    type: 'work',
    color: '#06b6d4',
    created_at: new Date().toISOString()
  }
];

// Helper: Haversine distance in meters
function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  locations,
  currentLocation,
  deviceName,
  theme = 'dark',
  onLocationSimulate,
  onGeofenceBreachAlert
}) => {
  const isDark = theme === 'dark';
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const geofenceLayersRef = useRef<Record<string, L.Circle>>({});
  const radarRingsLayerRef = useRef<L.LayerGroup | null>(null);

  // States
  const [activeLayer, setActiveLayer] = useState<MapLayerType>(isDark ? 'dark' : 'streets');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [isTacticalRadarActive, setIsTacticalRadarActive] = useState(true);
  const [showGeofenceDrawer, setShowGeofenceDrawer] = useState(false);
  
  // Geofences State
  const [geofences, setGeofences] = useState<GeofenceZone[]>(() => {
    // If current location exists, anchor default home to current location
    if (currentLocation) {
      return INITIAL_GEOFENCES.map((g, idx) =>
        idx === 0
          ? { ...g, latitude: currentLocation.latitude, longitude: currentLocation.longitude }
          : g
      );
    }
    return INITIAL_GEOFENCES;
  });

  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState<number>(300);

  // Compute Geofence Breach Status
  const geofenceStatus = useMemo(() => {
    if (!currentLocation) return { isSafe: true, nearestZone: null, distance: 0 };

    const activeZones = geofences.filter(g => g.enabled);
    if (activeZones.length === 0) return { isSafe: true, nearestZone: null, distance: 0 };

    let insideAny = false;
    let minDistance = Infinity;
    let closestZone: GeofenceZone | null = null;

    for (const zone of activeZones) {
      const dist = getDistanceInMeters(
        currentLocation.latitude,
        currentLocation.longitude,
        zone.latitude,
        zone.longitude
      );

      if (dist < minDistance) {
        minDistance = dist;
        closestZone = zone;
      }

      if (dist <= zone.radius) {
        insideAny = true;
      }
    }

    return {
      isSafe: insideAny,
      nearestZone: closestZone,
      distance: Math.round(minDistance)
    };
  }, [currentLocation, geofences]);

  // Trigger breach alert callback if outside
  useEffect(() => {
    if (!geofenceStatus.isSafe && geofenceStatus.nearestZone) {
      onGeofenceBreachAlert?.(geofenceStatus.nearestZone.name);
    }
  }, [geofenceStatus.isSafe, geofenceStatus.nearestZone, onGeofenceBreachAlert]);

  // Tile layer configurations
  const tileLayersConfig: Record<MapLayerType, { url: string; attribution: string; maxZoom: number }> = {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; CARTO, &copy; OpenStreetMap',
      maxZoom: 20
    },
    tactical: {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
      attribution: '&copy; CARTO & Military Tactical Grid',
      maxZoom: 19
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '&copy; Esri, Maxar',
      maxZoom: 19
    },
    streets: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const initialLat = currentLocation?.latitude || 36.7769;
    const initialLng = currentLocation?.longitude || 3.0538;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 16,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const initialConfig = tileLayersConfig[activeLayer];
    const tile = L.tileLayer(initialConfig.url, {
      attribution: initialConfig.attribution,
      maxZoom: initialConfig.maxZoom
    }).addTo(map);

    tileLayerRef.current = tile;
    radarRingsLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Tile Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const config = tileLayersConfig[activeLayer];
    const newTile = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom
    }).addTo(map);

    tileLayerRef.current = newTile;
  }, [activeLayer]);

  // Update Marker, Accuracy & Tactical Radar Rings
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!currentLocation) {
      if (markerRef.current) markerRef.current.remove();
      if (accuracyCircleRef.current) accuracyCircleRef.current.remove();
      if (polylineRef.current) polylineRef.current.remove();
      return;
    }

    const { latitude, longitude, accuracy } = currentLocation;
    const latLng: [number, number] = [latitude, longitude];

    // Tactical Marker with Pulsing Icon
    const customPinIcon = L.divIcon({
      className: 'hm-custom-marker',
      html: `
        <div class="hm-pin" title="${deviceName}">
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14]
    });

    const popupContent = `
      <div style="font-family: inherit; font-size: 13px; color: #1e1b4b; min-width: 180px; padding: 4px;">
        <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px; color: #7c3aed; display: flex; align-items: center; gap: 6px;">
          <span>🎯</span>
          <span>${deviceName}</span>
        </div>
        <div style="font-size: 12px; margin-bottom: 2px;"><strong>GPS :</strong> ${latitude.toFixed(5)}, ${longitude.toFixed(5)}</div>
        <div style="font-size: 12px; margin-bottom: 2px;"><strong>Précision :</strong> ±${Math.round(accuracy || 5)}m</div>
        <div style="font-size: 12px; margin-bottom: 4px;"><strong>Périmètre :</strong> ${
          geofenceStatus.isSafe ? '<span style="color:#059669;font-weight:bold;">Sécurisé</span>' : '<span style="color:#dc2626;font-weight:bold;">HORS ZONE</span>'
        }</div>
        <div style="font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-top: 4px;">
          ${new Date(currentLocation.recorded_at).toLocaleTimeString('fr-FR')}
        </div>
      </div>
    `;

    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, { icon: customPinIcon }).addTo(map);
      markerRef.current.bindPopup(popupContent);
    } else {
      markerRef.current.setLatLng(latLng);
      markerRef.current.setPopupContent(popupContent);
    }

    // Accuracy Circle
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle(latLng, {
        radius: Math.max(accuracy || 10, 8),
        color: '#c24df0',
        weight: 1.5,
        fillColor: '#7c5cff',
        fillOpacity: 0.12
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setRadius(Math.max(accuracy || 10, 8));
    }

    // Breadcrumb path
    if (locations && locations.length > 1) {
      const pathCoordinates: [number, number][] = locations.map(l => [l.latitude, l.longitude]);
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(pathCoordinates, {
          color: isTacticalRadarActive ? '#06b6d4' : '#c24df0',
          weight: 3.5,
          opacity: 0.75,
          dashArray: '6, 8',
          lineCap: 'round'
        }).addTo(map);
      } else {
        polylineRef.current.setLatLngs(pathCoordinates);
        polylineRef.current.setStyle({ color: isTacticalRadarActive ? '#06b6d4' : '#c24df0' });
      }
    }

    // Tactical Concentric Distance Rings (100m, 250m, 500m, 1000m)
    if (radarRingsLayerRef.current) {
      radarRingsLayerRef.current.clearLayers();
      if (isTacticalRadarActive) {
        const ringRadii = [100, 250, 500, 1000];
        ringRadii.forEach((r, idx) => {
          const ring = L.circle(latLng, {
            radius: r,
            color: '#06b6d4',
            weight: 1,
            opacity: 0.35 - idx * 0.06,
            dashArray: '4, 6',
            fill: false,
            interactive: false
          });
          radarRingsLayerRef.current?.addLayer(ring);
        });
      }
    }
  }, [currentLocation, locations, deviceName, isTacticalRadarActive, geofenceStatus.isSafe]);

  // Update Geofence Circles on Leaflet Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear old geofence circles
    Object.values(geofenceLayersRef.current).forEach((circle: L.Circle) => {
      circle.remove();
    });
    geofenceLayersRef.current = {};

    // Render active geofences
    geofences.forEach(zone => {
      if (!zone.enabled) return;

      const isBreached = !geofenceStatus.isSafe && geofenceStatus.nearestZone?.id === zone.id;
      const zoneColor = isBreached ? '#f43f5e' : (zone.color || '#10b981');

      const circle = L.circle([zone.latitude, zone.longitude], {
        radius: zone.radius,
        color: zoneColor,
        weight: 2.5,
        opacity: 0.8,
        dashArray: isBreached ? '4, 4' : '8, 8',
        fillColor: zoneColor,
        fillOpacity: isBreached ? 0.2 : 0.1
      }).addTo(map);

      circle.bindTooltip(`<strong>${zone.name}</strong><br/>Rayon sécurisé : ${zone.radius}m`, {
        permanent: false,
        direction: 'top'
      });

      geofenceLayersRef.current[zone.id] = circle;
    });
  }, [geofences, geofenceStatus]);

  // Recenter Map
  const handleRecenter = () => {
    if (!mapInstanceRef.current || !currentLocation) return;
    mapInstanceRef.current.flyTo([currentLocation.latitude, currentLocation.longitude], 16, {
      duration: 1.2
    });
  };

  const handleOpenGoogleMaps = () => {
    if (!currentLocation) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${currentLocation.latitude},${currentLocation.longitude}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Geofence management actions
  const toggleZone = (id: string) => {
    setGeofences(prev =>
      prev.map(z => (z.id === id ? { ...z, enabled: !z.enabled } : z))
    );
  };

  const updateZoneRadius = (id: string, radius: number) => {
    setGeofences(prev =>
      prev.map(z => (z.id === id ? { ...z, radius } : z))
    );
  };

  const deleteZone = (id: string) => {
    setGeofences(prev => prev.filter(z => z.id !== id));
  };

  const handleAddCurrentZone = () => {
    if (!currentLocation) return;
    const name = newZoneName.trim() || `Zone Sécurisée #${geofences.length + 1}`;
    const newZone: GeofenceZone = {
      id: `geo-${Date.now()}`,
      name,
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      radius: newZoneRadius,
      enabled: true,
      type: 'custom',
      color: '#a855f7',
      created_at: new Date().toISOString()
    };
    setGeofences(prev => [...prev, newZone]);
    setNewZoneName('');
  };

  const handleSimulateBreach = () => {
    if (!currentLocation) return;
    // Offset by approx 700 meters to breach the safe zone
    onLocationSimulate?.(0.007, 0.007);
  };

  const handleSimulateReturn = () => {
    if (!currentLocation || geofences.length === 0) return;
    const primary = geofences[0];
    onLocationSimulate?.(primary.latitude - currentLocation.latitude, primary.longitude - currentLocation.longitude);
  };

  return (
    <div
      id="hearme-live-map-card"
      className={`hm-card-interactive rounded-2xl p-3 sm:p-3.5 relative flex flex-col transition-all duration-300 ${
        isFullscreen
          ? `fixed inset-3 sm:inset-6 z-50 p-4 shadow-2xl backdrop-blur-2xl ${
              isDark ? 'bg-[#090912]/98 border-purple-500/40' : 'bg-white/98 border-purple-300'
            }`
          : 'h-[520px] sm:h-[560px]'
      } ${!geofenceStatus.isSafe ? 'border-rose-500/70 shadow-[0_0_35px_rgba(244,63,94,0.35)]' : ''}`}
    >
      {/* Map Container & Canvas Stage */}
      <div className="relative w-full flex-1 rounded-xl overflow-hidden border border-white/[0.1] shadow-2xl">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Tactical Animated Radar Sweep Overlay */}
        {isTacticalRadarActive && (
          <div className="absolute inset-0 pointer-events-none z-[350] flex items-center justify-center overflow-hidden">
            <div className="relative w-[340px] h-[340px] sm:w-[480px] sm:h-[480px] rounded-full border border-cyan-500/20 hm-tactical-sweep">
              <div className="w-1/2 h-1/2 absolute top-0 right-0 bg-gradient-to-br from-cyan-500/25 via-cyan-400/10 to-transparent rounded-tr-full" />
            </div>
            {/* Center HUD Reticle */}
            <div className="absolute w-12 h-12 border border-cyan-400/30 rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
            </div>
          </div>
        )}

        {/* Top Left Floating Tactical Badges */}
        <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2">
          {/* Radar Status Badge */}
          <div className="px-3 py-1.5 rounded-xl bg-[#0d0d1a]/85 backdrop-blur-md border border-white/15 text-xs font-bold text-slate-200 flex items-center gap-2 shadow-xl">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            <span className="tracking-wider uppercase text-[11px] font-extrabold text-cyan-400">
              RADAR GPS TACTIQUE
            </span>
          </div>

          {/* Geofence Status Badge */}
          <div
            className={`px-3 py-1.5 rounded-xl backdrop-blur-md border text-xs font-bold flex items-center gap-1.5 shadow-xl transition-all ${
              geofenceStatus.isSafe
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/90 border-rose-500/60 text-rose-200 animate-pulse shadow-rose-950/60'
            }`}
          >
            {geofenceStatus.isSafe ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>PÉRIMÈTRE SÉCURISÉ</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
                <span>HORS ZONE SÉCURISÉE !</span>
              </>
            )}
          </div>
        </div>

        {/* Top Right Floating Controls */}
        <div className="absolute top-3 right-3 z-[400] flex items-center gap-2">
          {/* Geofence Manager Drawer Toggle */}
          <button
            id="btn-toggle-geofence-drawer"
            onClick={() => setShowGeofenceDrawer(!showGeofenceDrawer)}
            className={`px-3 py-1.5 rounded-xl backdrop-blur-md border text-xs font-bold transition shadow-xl flex items-center gap-1.5 active:scale-95 ${
              showGeofenceDrawer
                ? 'bg-purple-600 border-purple-400 text-white shadow-purple-900/50'
                : 'bg-[#0d0d1a]/85 border-white/15 text-slate-200 hover:text-white hover:bg-black/90'
            }`}
            title="Gérer les zones de sécurité virtuelles (Geofencing)"
          >
            <Shield className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Zones de Sécurité</span>
            <span className="px-1.5 py-0.2 rounded-full bg-purple-500/30 text-[10px]">
              {geofences.filter(g => g.enabled).length}
            </span>
          </button>

          {/* Tactical Sweep Toggle */}
          <button
            id="btn-toggle-tactical-radar"
            onClick={() => setIsTacticalRadarActive(!isTacticalRadarActive)}
            className={`p-2 rounded-xl backdrop-blur-md border text-xs transition shadow-xl flex items-center gap-1.5 active:scale-95 ${
              isTacticalRadarActive
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                : 'bg-[#0d0d1a]/85 border-white/15 text-slate-400 hover:text-white'
            }`}
            title="Activer/Désactiver le balayage radar tactique"
          >
            <Radio className={`w-4 h-4 ${isTacticalRadarActive ? 'text-cyan-400 animate-pulse' : ''}`} />
          </button>

          {/* Layer Selector */}
          <div className="relative">
            <button
              id="btn-map-layer"
              onClick={() => setShowLayerMenu(!showLayerMenu)}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-[#0d0d1a]/85 backdrop-blur-md border border-white/15 text-slate-200 hover:text-white hover:bg-black/90 transition shadow-xl flex items-center gap-1.5 text-xs font-semibold"
              title="Changer de calque"
            >
              <Layers className="w-4 h-4 text-purple-400" />
              <span className="hidden sm:inline capitalize">{activeLayer}</span>
            </button>

            {showLayerMenu && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-[#111122] border border-white/15 p-2 shadow-2xl z-50 text-xs space-y-1 backdrop-blur-xl">
                <button
                  onClick={() => { setActiveLayer('dark'); setShowLayerMenu(false); }}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition ${
                    activeLayer === 'dark' ? 'bg-purple-600/25 text-purple-300 font-bold border border-purple-500/30' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span>Sombre HearMe</span>
                  {activeLayer === 'dark' && <span className="text-purple-400 font-bold">✓</span>}
                </button>
                <button
                  onClick={() => { setActiveLayer('tactical'); setShowLayerMenu(false); }}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition ${
                    activeLayer === 'tactical' ? 'bg-cyan-600/25 text-cyan-300 font-bold border border-cyan-500/30' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span>Tactique Radar</span>
                  {activeLayer === 'tactical' && <span className="text-cyan-400 font-bold">✓</span>}
                </button>
                <button
                  onClick={() => { setActiveLayer('satellite'); setShowLayerMenu(false); }}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition ${
                    activeLayer === 'satellite' ? 'bg-purple-600/25 text-purple-300 font-bold border border-purple-500/30' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span>Satellite HD</span>
                  {activeLayer === 'satellite' && <span className="text-purple-400 font-bold">✓</span>}
                </button>
                <button
                  onClick={() => { setActiveLayer('streets'); setShowLayerMenu(false); }}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition ${
                    activeLayer === 'streets' ? 'bg-purple-600/25 text-purple-300 font-bold border border-purple-500/30' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span>Rues & Adresses</span>
                  {activeLayer === 'streets' && <span className="text-purple-400 font-bold">✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* Recenter Button */}
          <button
            id="btn-map-recenter"
            onClick={handleRecenter}
            className="p-2 rounded-xl bg-[#0d0d1a]/85 backdrop-blur-md border border-white/15 text-slate-200 hover:text-white hover:bg-black/90 transition shadow-xl hover:scale-105 active:scale-95"
            title="Recentrer sur le smartphone"
          >
            <Crosshair className="w-4 h-4 text-purple-400" />
          </button>

          {/* External Google Maps link */}
          <button
            id="btn-open-google-maps"
            onClick={handleOpenGoogleMaps}
            className="p-2 rounded-xl bg-[#0d0d1a]/85 backdrop-blur-md border border-white/15 text-slate-200 hover:text-white hover:bg-black/90 transition shadow-xl hover:scale-105 active:scale-95"
            title="Ouvrir dans Google Maps"
          >
            <ExternalLink className="w-4 h-4 text-slate-300" />
          </button>

          {/* Fullscreen toggle */}
          <button
            id="btn-map-fullscreen"
            onClick={() => {
              setIsFullscreen(!isFullscreen);
              setTimeout(() => mapInstanceRef.current?.invalidateSize(), 300);
            }}
            className="p-2 rounded-xl bg-[#0d0d1a]/85 backdrop-blur-md border border-white/15 text-slate-200 hover:text-white hover:bg-black/90 transition shadow-xl hover:scale-105 active:scale-95"
            title={isFullscreen ? 'Quitter le plein écran' : 'Agrandir la carte'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-slate-300" /> : <Maximize2 className="w-4 h-4 text-slate-300" />}
          </button>
        </div>

        {/* Geofence Management Overlay Drawer */}
        {showGeofenceDrawer && (
          <div className="absolute top-14 right-3 w-80 sm:w-96 max-h-[80%] rounded-2xl bg-[#0c0c17]/95 border border-purple-500/30 p-4 shadow-2xl z-[450] backdrop-blur-xl flex flex-col space-y-3.5 overflow-y-auto text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-400" />
                <h4 className="font-bold text-slate-100 uppercase tracking-wider text-[11px]">
                  Périmètres Virtuels (Geofencing)
                </h4>
              </div>
              <button
                onClick={() => setShowGeofenceDrawer(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* List of active geofence zones */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {geofences.map(zone => (
                <div
                  key={zone.id}
                  className={`p-2.5 rounded-xl border transition ${
                    zone.enabled
                      ? 'bg-white/[0.04] border-purple-500/30'
                      : 'bg-black/30 border-white/[0.05] opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={zone.enabled}
                        onChange={() => toggleZone(zone.id)}
                        className="rounded accent-purple-500 cursor-pointer"
                      />
                      <span className="font-bold text-slate-200">{zone.name}</span>
                    </div>
                    <button
                      onClick={() => deleteZone(zone.id)}
                      className="text-slate-400 hover:text-rose-400 p-1 transition"
                      title="Supprimer la zone"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Rayon : {zone.radius} mètres</span>
                    <div className="flex items-center gap-1">
                      {[150, 300, 500, 1000].map(r => (
                        <button
                          key={r}
                          onClick={() => updateZoneRadius(zone.id, r)}
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            zone.radius === r
                              ? 'bg-purple-600 text-white font-bold'
                              : 'bg-white/5 hover:bg-white/10 text-slate-300'
                          }`}
                        >
                          {r >= 1000 ? `${r / 1000}k` : r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Zone */}
            <div className="pt-2 border-t border-white/[0.08] space-y-2">
              <span className="font-semibold text-slate-300 text-[11px] block">
                Ajouter une nouvelle zone autour du mobile :
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ex : Salle de sport, Hôtel..."
                  value={newZoneName}
                  onChange={e => setNewZoneName(e.target.value)}
                  className="flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleAddCurrentZone}
                  disabled={!currentLocation}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-1 transition shadow active:scale-95 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Créer</span>
                </button>
              </div>
            </div>

            {/* Simulation controls */}
            <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
              <span className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider block">
                Test de Déclenchement d'Alerte :
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSimulateBreach}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Simuler Sortie</span>
                </button>
                <button
                  onClick={handleSimulateReturn}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Recentrer Zone</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tactical HUD Telemetry Bar */}
      <div className="pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left Telemetry Widgets */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-purple-400 shrink-0" />
            <span className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>GPS :</span>
            {currentLocation ? (
              <span className={`font-mono font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
              </span>
            ) : (
              <span className="text-slate-500 italic">En attente...</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              Cap : <strong>042° NE</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              Vitesse : <strong>{geofenceStatus.isSafe ? '0.0 km/h (Fixe)' : '18.4 km/h (Mouvement)'}</strong>
            </span>
          </div>
        </div>

        {/* Right Status Pill */}
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-xl border text-[11px] font-mono flex items-center gap-1.5 ${
            isDark ? 'bg-black/40 border-white/[0.08] text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-800'
          }`}>
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>18 SATS (GNSS Multi-Bande L1/L5)</span>
          </div>

          {currentLocation && (
            <span className={`px-2 py-1 rounded-xl border text-[11px] font-mono ${
              isDark ? 'bg-black/40 border-white/[0.08] text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
            }`}>
              {new Date(currentLocation.recorded_at).toLocaleTimeString('fr-FR')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
