import React, { useState } from 'react';
import { SecurityPhoto } from '../types';
import { Image, Eye, Download, Calendar, MapPin, Sparkles, Filter, X, Camera, Scan, ShieldAlert } from 'lucide-react';

interface SecurityGalleryProps {
  photos: SecurityPhoto[];
  onTakeTestPhoto: () => void;
  theme?: 'dark' | 'light';
}

export const SecurityGallery: React.FC<SecurityGalleryProps> = ({
  photos,
  onTakeTestPhoto,
  theme = 'dark'
}) => {
  const isDark = theme === 'dark';
  const [selectedPhoto, setSelectedPhoto] = useState<SecurityPhoto | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [enableLaserScan, setEnableLaserScan] = useState(true);

  const filteredPhotos = photos.filter(p => {
    if (filter === 'all') return true;
    return p.event_type === filter;
  });

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'failed_pin':
        return { label: 'Échec Code PIN', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
      case 'remote_cmd':
        return { label: 'Ordre à distance', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
      case 'motion':
        return { label: 'Mouvement suspect', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
      case 'power_button':
        return { label: 'Bouton Éteindre', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
      default:
        return { label: 'Sécurité Intrus', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' };
    }
  };

  return (
    <div
      id="bento-security-gallery-panel"
      className="hm-card-interactive rounded-2xl p-5 space-y-4 relative overflow-hidden"
    >
      {/* Ambient background glow */}
      <div className="hm-bento-glow w-48 h-48 bg-pink-500 top-0 right-0 -mr-16 -mt-16" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-pink-500/15 border border-pink-500/25 text-pink-400">
              <Scan className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                Galerie Biométrique d'Intrusion
              </h2>
              <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Prise de photo automatique par la caméra frontale
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter options */}
          <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs shadow-inner ${
            isDark ? 'bg-black/50 border-white/[0.08]' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg transition text-xs font-medium ${
                filter === 'all'
                  ? 'bg-purple-600/30 text-purple-200 font-bold border border-purple-500/30 shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tous ({photos.length})
            </button>
            <button
              onClick={() => setFilter('failed_pin')}
              className={`px-2.5 py-1 rounded-lg transition text-xs font-medium ${
                filter === 'failed_pin'
                  ? 'bg-rose-600/30 text-rose-200 font-bold border border-rose-500/30 shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Code PIN
            </button>
            <button
              onClick={() => setFilter('remote_cmd')}
              className={`px-2.5 py-1 rounded-lg transition text-xs font-medium ${
                filter === 'remote_cmd'
                  ? 'bg-purple-600/30 text-purple-200 font-bold border border-purple-500/30 shadow-sm'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              À distance
            </button>
          </div>

          <button
            onClick={onTakeTestPhoto}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition active:scale-95 shadow-sm ${
              isDark
                ? 'border-purple-500/30 bg-purple-500/15 hover:bg-purple-500/25 text-purple-200'
                : 'border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700'
            }`}
            title="Simuler ou capturer un nouveau cliché de sécurité"
          >
            <Camera className="w-3.5 h-3.5 text-pink-400" />
            <span>Simuler capture</span>
          </button>
        </div>
      </div>

      {/* Photo Horizontal / Grid List */}
      {filteredPhotos.length === 0 ? (
        <div className={`py-12 text-center rounded-2xl border border-dashed text-xs space-y-2 ${
          isDark ? 'bg-black/30 border-white/[0.08] text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}>
          <Image className="w-8 h-8 text-slate-400 mx-auto" />
          <p>Aucun cliché capturé dans cette catégorie pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3">
          {filteredPhotos.map((photo) => {
            const badge = getEventBadge(photo.event_type);
            return (
              <div
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className={`group relative rounded-xl overflow-hidden border aspect-square cursor-pointer transition-all duration-300 shadow-md hover:-translate-y-1 ${
                  isDark
                    ? 'bg-black/50 border-white/[0.08] hover:border-purple-500/60 hover:shadow-purple-500/20'
                    : 'bg-white border-slate-200 hover:border-purple-400 hover:shadow-purple-200'
                }`}
              >
                {/* Laser scan line effect on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="hm-scanner-line" />
                </div>

                <img
                  src={photo.url}
                  alt="Cliché de sécurité"
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />

                {/* Event badge overlay */}
                <div className="absolute top-2 left-2 z-10">
                  <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold backdrop-blur-md shadow-lg ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Bottom info bar */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-2.5 pt-6 text-[11px] text-slate-200 flex items-center justify-between opacity-90 group-hover:opacity-100">
                  <span className="font-mono text-[10px] text-slate-300 font-semibold">
                    {new Date(photo.captured_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="p-1 rounded-md bg-white/10 group-hover:bg-purple-500/40 transition">
                    <Eye className="w-3.5 h-3.5 text-purple-300" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox / Modal for selected photo */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className={`relative w-full max-w-2xl rounded-2xl border overflow-hidden shadow-2xl space-y-0 ${
            isDark ? 'bg-[#11111f] border-white/15 text-slate-200' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Modal header */}
            <div className={`flex items-center justify-between p-4 border-b ${
              isDark ? 'border-white/[0.08] bg-black/40' : 'border-slate-100 bg-slate-50'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${getEventBadge(selectedPhoto.event_type).color}`}>
                  {getEventBadge(selectedPhoto.event_type).label}
                </span>
                <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Caméra frontale (Grand Angle HD)
                </span>
              </div>
              <button
                onClick={() => setSelectedPhoto(null)}
                className={`p-1.5 rounded-xl transition ${
                  isDark ? 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Photo Display with Scanner Animation */}
            <div className="relative max-h-[60vh] bg-black flex items-center justify-center overflow-hidden">
              <div className="hm-scanner-line" />
              <img
                src={selectedPhoto.url}
                alt="Cliché de sécurité grand format"
                className="max-h-[58vh] w-auto object-contain"
              />

              {/* Holographic HUD Crosshair */}
              <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/30 text-cyan-400 font-mono text-[11px] flex items-center gap-1.5">
                <Scan className="w-3.5 h-3.5 text-cyan-400" />
                <span>SCAN BIOMÉTRIQUE ACTIF</span>
              </div>
            </div>

            {/* Modal Footer Info */}
            <div className={`p-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs ${
              isDark ? 'bg-black/60 border-white/[0.08]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="space-y-1">
                <div className={`flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>Capturé le : <strong>{new Date(selectedPhoto.captured_at).toLocaleString('fr-FR')}</strong></span>
                </div>
                {selectedPhoto.latitude && selectedPhoto.longitude && (
                  <div className={`flex items-center gap-2 font-mono text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <MapPin className="w-3.5 h-3.5 text-pink-400" />
                    <span>GPS : {selectedPhoto.latitude.toFixed(5)}, {selectedPhoto.longitude.toFixed(5)}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={selectedPhoto.url}
                  download={`hearme-security-snapshot-${selectedPhoto.id}.jpg`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-lg shadow-purple-950/50 active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  Télécharger le cliché
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
