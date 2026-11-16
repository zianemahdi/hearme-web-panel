import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

/**
 * Petite vidéo muette en boucle (écran « Écoute » de l'app) dans un cadre de téléphone.
 * - Vidéo enregistrée en français : les autres langues voient l'image fixe du même écran
 *   dans leur langue.
 * - Chargée et lancée seulement quand elle arrive à l'écran ; immobile si l'utilisateur
 *   a demandé moins d'animations.
 */
export const HowVideo: React.FC<{ alt: string }> = ({ alt }) => {
  const { lang } = useI18n();
  const ref = useRef<HTMLVideoElement>(null);
  const [reduce] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  const useVideo = lang === 'fr' && !reduce;

  useEffect(() => {
    const v = ref.current;
    if (!v || !useVideo || !('IntersectionObserver' in window)) return;
    // React ne pose pas l'attribut « muted » : sans lui, le navigateur refuse la lecture automatique.
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.25 });
    io.observe(v);
    return () => io.disconnect();
  }, [useVideo]);

  const poster = `./shots/ecoute_${lang}.webp`;
  return (
    <div className="relative w-[11.5rem] sm:w-[13rem] aspect-[1080/2290] rounded-[2rem] p-[6px] bg-gradient-to-b from-white/25 via-white/10 to-white/5 shadow-[0_30px_80px_-20px_rgba(124,92,255,0.55)]">
      <div className="relative h-full w-full overflow-hidden rounded-[1.65rem] bg-[#0b0b14] ring-1 ring-black/60">
        {useVideo ? (
          <video
            ref={ref}
            className="h-full w-full object-cover"
            poster={poster}
            muted
            loop
            playsInline
            preload="none"
            aria-label={alt}
          >
            <source src="./media/ecoute-boucle.webm" type="video/webm" />
            <source src="./media/ecoute-boucle.mp4" type="video/mp4" />
          </video>
        ) : (
          <img src={poster} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        )}
      </div>
    </div>
  );
};
