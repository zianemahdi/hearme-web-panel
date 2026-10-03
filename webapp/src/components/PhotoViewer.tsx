import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ChevronLeft, ChevronRight, Download, ImageOff, Loader2, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useI18n } from '../i18n';

// Visionneuse plein écran des photos du porteur : glisser (ou flèches) pour changer de
// photo, pincer / double-tap / molette pour zoomer, déplacer la photo zoomée,
// enregistrer sur l'appareil, supprimer.
// Rendue dans <body> (portail) : une carte parente avec « transform » au survol
// casserait le « position: fixed » du plein écran.

export interface ViewerPhoto {
  id: string;
  url: string | null;
  created_at: string;
  label: string;
}

interface PhotoViewerProps {
  photos: ViewerPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Supprime côté serveur ; lève une erreur en cas d'échec. */
  onDelete: (id: string) => Promise<void>;
}

interface View { s: number; x: number; y: number }
interface Point { x: number; y: number }

const IDENTITY: View = { s: 1, x: 0, y: 0 };
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const SWIPE_PX = 60;          // distance pour passer à la photo voisine
const TAP_MOVE_PX = 10;
const DOUBLE_TAP_MS = 300;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function fileName(createdAt: string) {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `hearme-photo-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.jpg`;
}

/** Miniature ; une icône remplace l'image si elle ne se charge pas. */
export const Thumb: React.FC<{ url: string | null; className?: string }> = ({ url, className = '' }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  if (!url || broken) {
    return (
      <span className={`flex w-full h-full items-center justify-center bg-white/[0.04] text-slate-500 ${className}`}>
        <ImageOff className="w-5 h-5" />
      </span>
    );
  }
  return <img src={url} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} className={`w-full h-full object-cover ${className}`} />;
};

export const PhotoViewer: React.FC<PhotoViewerProps> = ({ photos, index, onIndexChange, onClose, onDelete }) => {
  const { t, lang, locale } = useI18n();
  const rtl = lang === 'ar';
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const [view, setViewState] = useState<View>(IDENTITY);
  const viewRef = useRef<View>(IDENTITY);
  const setView = useCallback((v: View) => { viewRef.current = v; setViewState(v); }, []);
  const [gesturing, setGesturing] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'none' | 'saving' | 'deleting'>('none');
  const [actionError, setActionError] = useState<'none' | 'save' | 'delete'>('none');

  const stageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const natural = useRef<{ w: number; h: number } | null>(null);

  // Geste en cours (pointeurs actifs, point et vue de départ).
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{
    kind: 'none' | 'pan' | 'swipe' | 'pinch';
    start: Point;
    startView: View;
    startDist: number;
    startMid: Point;
    startTime: number;
    moved: boolean;
  }>({ kind: 'none', start: { x: 0, y: 0 }, startView: IDENTITY, startDist: 1, startMid: { x: 0, y: 0 }, startTime: 0, moved: false });
  const lastTap = useRef<{ time: number; at: Point } | null>(null);
  const lastPointerType = useRef<string>('mouse');
  const [touchUi, setTouchUi] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true);

  // Nouvelle photo : vue remise à zéro.
  useEffect(() => {
    setView(IDENTITY);
    setDragX(0);
    setLoaded(false);
    setFailed(false);
    setConfirming(false);
    setActionError('none');
    natural.current = null;
  }, [photo?.id, setView]);

  // Lien renouvelé (relecture de la liste toutes les minutes) : nouvel essai.
  useEffect(() => { setFailed(false); }, [photo?.url]);

  // Les voisines sont préchargées : le passage de l'une à l'autre est immédiat.
  useEffect(() => {
    for (const i of [index - 1, index + 1]) {
      const url = photos[i]?.url;
      if (url) { const img = new Image(); img.src = url; }
    }
  }, [index, photos]);

  // Pas de défilement de la page derrière ; le focus revient où il était.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  // Miniature active visible dans le bandeau.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);

  /** Garde la photo zoomée dans le cadre (pas de bords vides au-delà de l'image). */
  const clampView = useCallback((v: View): View => {
    const stage = stageRef.current;
    const s = clampScale(v.s);
    if (!stage || s <= 1.001) return IDENTITY;
    const { width: w, height: h } = stage.getBoundingClientRect();
    const ratio = natural.current ? natural.current.w / natural.current.h : w / h;
    const cw = Math.min(w, h * ratio);
    const ch = cw / ratio;
    const mx = Math.max(0, (cw * s - w) / 2);
    const my = Math.max(0, (ch * s - h) / 2);
    return { s, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  }, []);

  /** Position par rapport au centre du cadre. */
  const relative = useCallback((clientX: number, clientY: number): Point => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: clientX - (r.left + r.width / 2), y: clientY - (r.top + r.height / 2) };
  }, []);

  /** Zoom en gardant immobile le point visé (doigts, curseur, ou centre). */
  const zoomAt = useCallback((target: number, at: Point, base: View = viewRef.current) => {
    const s = clampScale(target);
    const k = s / base.s;
    setView(clampView({ s, x: at.x - k * (at.x - base.x), y: at.y - k * (at.y - base.y) }));
  }, [clampView, setView]);

  const goTo = useCallback((i: number) => {
    if (i >= 0 && i < photos.length && i !== index) onIndexChange(i);
  }, [photos.length, index, onIndexChange]);
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  const toggleZoom = useCallback((at: Point) => {
    if (viewRef.current.s > 1.001) setView(IDENTITY);
    else zoomAt(DOUBLE_TAP_SCALE, at, IDENTITY);
  }, [setView, zoomAt]);

  // Clavier : Échap, flèches (sens de lecture respecté en arabe), + / − / 0.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirming) setConfirming(false); else onClose();
        return;
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); if (rtl) goPrev(); else goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (rtl) goNext(); else goPrev(); }
      else if (e.key === '+' || e.key === '=') zoomAt(viewRef.current.s * 1.5, { x: 0, y: 0 });
      else if (e.key === '-') zoomAt(viewRef.current.s / 1.5, { x: 0, y: 0 });
      else if (e.key === '0') setView(IDENTITY);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, onClose, goNext, goPrev, rtl, zoomAt, setView]);

  // Molette : zoom sous le curseur (écouteur non passif pour bloquer le défilement).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(viewRef.current.s * Math.exp(-e.deltaY * 0.0015), relative(e.clientX, e.clientY));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAt, relative]);

  // ---- Gestes tactiles et souris (Pointer Events) ----

  const startSingle = (p: Point) => {
    const g = gesture.current;
    g.kind = viewRef.current.s > 1.001 ? 'pan' : 'swipe';
    g.start = p;
    g.startView = viewRef.current;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lastPointerType.current = e.pointerType;
    if (e.pointerType === 'touch' && !touchUi) setTouchUi(true);
    // Le geste continue même si le doigt sort du cadre (ne doit jamais bloquer le geste).
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      startSingle({ x: e.clientX, y: e.clientY });
      g.startTime = performance.now();
      g.moved = false;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.kind = 'pinch';
      g.startDist = Math.max(1, distance(a, b));
      g.startMid = relative((a.x + b.x) / 2, (a.y + b.y) / 2);
      g.startView = viewRef.current;
      g.moved = true;
      setDragX(0);
    }
    setGesturing(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = relative((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s = clampScale(g.startView.s * (distance(a, b) / g.startDist));
      const k = s / g.startView.s;
      setView(clampView({
        s,
        x: mid.x - k * (g.startMid.x - g.startView.x),
        y: mid.y - k * (g.startMid.y - g.startView.y),
      }));
      return;
    }
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (Math.abs(dx) > TAP_MOVE_PX || Math.abs(dy) > TAP_MOVE_PX) g.moved = true;
    if (g.kind === 'pan') {
      setView(clampView({ s: g.startView.s, x: g.startView.x + dx, y: g.startView.y + dy }));
    } else if (g.kind === 'swipe' && Math.abs(dx) > Math.abs(dy)) {
      // Résistance au bout de la liste.
      const atEdge = (dx > 0) !== rtl ? !hasPrev : !hasNext;
      setDragX(atEdge ? dx / 4 : dx);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const end = { x: e.clientX, y: e.clientY };
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (g.kind === 'pinch') {
      // Un doigt reste posé : il continue en déplacement.
      const rest = [...pointers.current.values()][0];
      if (rest) startSingle(rest);
      else { g.kind = 'none'; setGesturing(false); setView(clampView(viewRef.current)); }
      return;
    }
    if (pointers.current.size > 0) return;

    const dx = end.x - g.start.x;
    const dy = end.y - g.start.y;
    if (g.kind === 'swipe' && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      // Doigt vers la gauche = photo suivante (l'inverse en arabe).
      if ((dx < 0) !== rtl) goNext(); else goPrev();
    } else if (!g.moved && e.pointerType === 'touch' && e.type === 'pointerup') {
      // Double-tap : zoom / dézoom à l'endroit touché.
      const now = performance.now();
      const prev = lastTap.current;
      if (prev && now - prev.time < DOUBLE_TAP_MS && distance(prev.at, end) < 30) {
        lastTap.current = null;
        toggleZoom(relative(end.x, end.y));
      } else {
        lastTap.current = { time: now, at: end };
      }
    }
    g.kind = 'none';
    setDragX(0);
    setGesturing(false);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (lastPointerType.current === 'touch') return; // déjà géré par le double-tap
    toggleZoom(relative(e.clientX, e.clientY));
  };

  // ---- Actions ----

  const save = async () => {
    if (!photo?.url || busy !== 'none') return;
    setBusy('saving');
    setActionError('none');
    const name = fileName(photo.created_at);
    try {
      const res = await fetch(photo.url);
      if (!res.ok) throw new Error(String(res.status));
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      // Repli : le stockage renvoie directement la photo en téléchargement.
      try {
        const url = new URL(photo.url);
        url.searchParams.set('download', name);
        const a = document.createElement('a');
        a.href = url.toString();
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        setActionError('save');
      }
    } finally {
      setBusy('none');
    }
  };

  const remove = async () => {
    if (!photo || busy !== 'none') return;
    setBusy('deleting');
    setActionError('none');
    try {
      await onDelete(photo.id);
      setConfirming(false);
    } catch {
      setActionError('delete');
    } finally {
      setBusy('none');
    }
  };

  if (!photo) return null;

  const zoomed = view.s > 1.001;
  const transform = `translate3d(${view.x + (zoomed ? 0 : dragX)}px, ${view.y}px, 0) scale(${view.s})`;
  const roundBtn = 'p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none';

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={photo.label}
      tabIndex={-1}
      className="fixed inset-0 z-[2000] flex flex-col bg-black/95 backdrop-blur-sm text-white outline-none select-none"
    >
      {/* En-tête : légende, date, position dans la liste, fermer */}
      <div className="flex items-center justify-between gap-3 px-3 sm:px-5 py-2.5 border-b border-white/10 bg-black/40">
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">{photo.label}</div>
          <div className="text-[11px] text-slate-400 truncate">
            {new Date(photo.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'medium' })}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-slate-300 tabular-nums" aria-live="polite">
            {t('ph.counter', { n: index + 1, total: photos.length })}
          </span>
          <button onClick={onClose} className={roundBtn} aria-label={t('common.close')} title={t('common.close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Photo */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={stageRef}
          className={`absolute inset-0 overflow-hidden touch-none ${zoomed ? (gesturing ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          {photo.url && !failed && (
            <img
              src={photo.url}
              alt={photo.label}
              draggable={false}
              onLoad={(e) => {
                natural.current = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
                setLoaded(true);
              }}
              onError={() => setFailed(true)}
              className={`w-full h-full object-contain will-change-transform transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
              style={{
                transform,
                transformOrigin: 'center center',
                transition: gesturing ? 'opacity 150ms' : 'transform 200ms ease-out, opacity 150ms',
              }}
            />
          )}
        </div>

        {!loaded && !failed && photo.url && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        )}
        {(failed || !photo.url) && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-rose-300 pointer-events-none px-6 text-center">
            <AlertCircle className="w-8 h-8" />
            {t('ph.imageError')}
          </div>
        )}

        {/* Précédente / suivante (côté début / fin, inversés en arabe) */}
        {hasPrev && (
          <button onClick={goPrev} aria-label={t('ph.prev')} title={t('ph.prev')}
            className={`absolute start-2 sm:start-4 top-1/2 -translate-y-1/2 ${roundBtn} bg-black/50`}>
            <ChevronLeft className="w-6 h-6 rtl:rotate-180" />
          </button>
        )}
        {hasNext && (
          <button onClick={goNext} aria-label={t('ph.next')} title={t('ph.next')}
            className={`absolute end-2 sm:end-4 top-1/2 -translate-y-1/2 ${roundBtn} bg-black/50`}>
            <ChevronRight className="w-6 h-6 rtl:rotate-180" />
          </button>
        )}
      </div>

      {/* Barre d'actions */}
      <div className="border-t border-white/10 bg-black/40 px-3 sm:px-5 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2.5">
        {confirming ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-rose-200">{t('ph.deleteConfirm')}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirming(false)} disabled={busy !== 'none'}
                className="px-3.5 py-2 rounded-xl border border-white/15 text-slate-200 hover:bg-white/10 text-xs font-semibold">
                {t('common.cancel')}
              </button>
              <button onClick={remove} disabled={busy !== 'none'}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-60">
                {busy === 'deleting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {t('ph.delete')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button onClick={() => zoomAt(viewRef.current.s / 1.5, { x: 0, y: 0 })} disabled={!zoomed}
                className={roundBtn} aria-label={t('ph.zoomOut')} title={t('ph.zoomOut')}>
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="hidden sm:inline-block w-11 text-center text-xs font-semibold tabular-nums text-slate-300" dir="ltr">
                {Math.round(view.s * 100)}%
              </span>
              <button onClick={() => zoomAt(viewRef.current.s * 1.5, { x: 0, y: 0 })} disabled={view.s >= MAX_SCALE}
                className={roundBtn} aria-label={t('ph.zoomIn')} title={t('ph.zoomIn')}>
                <ZoomIn className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2 ms-auto">
              <button onClick={save} disabled={!photo.url || busy !== 'none'}
                className="px-3 py-2 rounded-xl border border-white/15 text-slate-100 hover:bg-white/10 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                {busy === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t('ph.download')}
              </button>
              <button onClick={() => { setConfirming(true); setActionError('none'); }} disabled={busy !== 'none'}
                className="px-3 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                {t('ph.delete')}
              </button>
            </div>
          </div>
        )}

        {actionError !== 'none' && (
          <div role="alert" className="flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {t(actionError === 'save' ? 'ph.saveError' : 'ph.deleteError')}
          </div>
        )}

        {/* Bandeau de miniatures */}
        {photos.length > 1 && (
          <div ref={stripRef} className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {photos.map((p, i) => (
              <button
                key={p.id}
                data-index={i}
                onClick={() => goTo(i)}
                aria-label={`${p.label} — ${t('ph.counter', { n: i + 1, total: photos.length })}`}
                aria-current={i === index}
                className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition ${
                  i === index ? 'border-pink-400 opacity-100' : 'border-transparent opacity-50 hover:opacity-90'
                }`}
              >
                <Thumb url={p.url} />
              </button>
            ))}
          </div>
        )}

        <p className="text-[11px] text-slate-500 text-center">{t(touchUi ? 'ph.hintTouch' : 'ph.hintMouse')}</p>
      </div>
    </div>,
    document.body,
  );
};
