import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { getSupabase } from '../utils/supabaseClient';
import { useI18n } from '../i18n';
import type { I18nKey } from '../i18n/fr';
import { PhotoViewer, Thumb } from './PhotoViewer';

// Photos du porteur rangées par l'app dans l'espace PRIVÉ du panneau (Edge Function
// « device-photos », 30 jours). Liens signés valables 10 min : la liste est relue
// régulièrement, et plus souvent juste après une demande de photo.

interface Photo {
  id: string;
  url: string | null;
  event_type: string | null;
  created_at: string;
}

interface PhotoGalleryProps {
  secretKey?: string;
  /** Change à chaque photo demandée depuis ce panneau : on guette son arrivée. */
  requestSignal?: number;
}

const EVENT_LABEL: Record<string, I18nKey> = {
  remote_photo: 'ph.eventRemote',
  unlock_failed: 'ph.eventUnlock',
  theft: 'ph.eventTheft',
};

const REFRESH_MS = 60_000;     // relecture normale (liens valables 10 min)
const WATCH_MS = 4_000;        // après une demande : toutes les 4 s…
const WATCH_FOR_MS = 75_000;   // … pendant 75 s au plus

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({ secretKey, requestSignal = 0 }) => {
  const { t, formatAge } = useI18n();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // Photo agrandie, retenue par son identifiant : les liens signés changent à chaque relecture.
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const latestIdRef = useRef<string | null>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const supabase = getSupabase();
    if (!supabase || !secretKey) throw new Error('unavailable');
    const { data, error: err } = await supabase.functions.invoke('device-photos', {
      body,
      headers: { 'x-device-secret': secretKey },
    });
    if (err || !data?.ok) throw err ?? new Error(data?.error ?? 'failed');
    return data;
  }, [secretKey]);

  const load = useCallback(async (quiet = false) => {
    if (!secretKey) return;
    if (!quiet) setLoading(true);
    try {
      const data = await call({ action: 'list', limit: 24 });
      const list: Photo[] = data.photos ?? [];
      setPhotos(list);
      setError(false);
      // La photo demandée est arrivée : on arrête de guetter.
      if (list[0] && list[0].id !== latestIdRef.current) {
        if (latestIdRef.current !== null) setWaiting(false);
        latestIdRef.current = list[0].id;
      } else if (!list.length) {
        latestIdRef.current = '';
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, [call, secretKey]);

  // Lecture régulière.
  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Après « Prendre une photo » : relecture rapprochée le temps qu'elle arrive.
  useEffect(() => {
    if (!requestSignal) return;
    setWaiting(true);
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > WATCH_FOR_MS) { setWaiting(false); clearInterval(timer); return; }
      load(true);
    }, WATCH_MS);
    return () => clearInterval(timer);
  }, [requestSignal, load]);

  // Âges (« il y a 2 min ») à jour.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const openIndex = openId ? photos.findIndex((p) => p.id === openId) : -1;

  // Photo agrandie disparue de la liste (supprimée ailleurs, ou trop ancienne) : on ferme.
  useEffect(() => {
    if (openId && openIndex < 0) setOpenId(null);
  }, [openId, openIndex]);

  /** Suppression depuis la visionneuse : on passe à la photo voisine, ou on ferme. */
  const remove = useCallback(async (id: string) => {
    await call({ action: 'delete', id });
    setPhotos((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const next = prev.filter((p) => p.id !== id);
      setOpenId(next.length ? next[Math.min(Math.max(i, 0), next.length - 1)].id : null);
      return next;
    });
  }, [call]);

  const ageOf = (p: Photo) => formatAge(Math.max(0, Math.round((now - Date.parse(p.created_at)) / 1000)));
  const labelOf = (p: Photo) => t(EVENT_LABEL[p.event_type ?? ''] ?? 'ph.eventRemote');

  return (
    <div id="bento-photo-gallery" className="hm-card-interactive rounded-2xl p-5 space-y-4 relative overflow-hidden">
      <div className="hm-bento-glow w-36 h-36 bg-pink-500 top-0 right-0 -mr-10 -mt-10" />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-pink-500/15 border border-pink-500/25 text-pink-400">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">{t('ph.title')}</h2>
            <span className="text-[11px] text-slate-400">{t('ph.subtitle')}</span>
          </div>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 transition active:scale-95 disabled:opacity-50"
          title={t('ph.refresh')}
          aria-label={t('ph.refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {waiting && (
        <div role="status" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-pink-500/10 border border-pink-500/25 text-pink-200 text-xs">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{t('ph.waiting')}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{t('ph.error')}</span>
        </div>
      )}

      {!error && photos.length === 0 && !loading && (
        <p className="text-xs text-slate-400 leading-relaxed">{t('ph.empty')}</p>
      )}

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {photos.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setOpenId(p.id)}
                className="group relative block w-full aspect-square rounded-xl overflow-hidden border border-white/[0.1] bg-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                aria-label={`${labelOf(p)} — ${ageOf(p)}`}
              >
                <Thumb url={p.url} className="transition group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/85 to-transparent text-[10px] leading-tight text-white text-start">
                  <span className="block font-semibold truncate">{labelOf(p)}</span>
                  <span className="block opacity-75 truncate">{ageOf(p)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Visionneuse plein écran */}
      {openIndex >= 0 && (
        <PhotoViewer
          photos={photos.map((p) => ({ id: p.id, url: p.url, created_at: p.created_at, label: labelOf(p) }))}
          index={openIndex}
          onIndexChange={(i) => setOpenId(photos[i]?.id ?? null)}
          onClose={() => setOpenId(null)}
          onDelete={remove}
        />
      )}
    </div>
  );
};
