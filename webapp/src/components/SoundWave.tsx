import React from 'react';

/**
 * Petites barres d'onde sonore animées (« HearMe écoute »). Purement décoratif :
 * masqué aux lecteurs d'écran, immobile si l'utilisateur réduit les animations.
 */
const BARS = [0.45, 0.8, 1, 0.6, 0.9, 0.5, 0.7];

export const SoundWave: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`hm-wave inline-flex items-center gap-[3px] h-4 ${className}`} aria-hidden="true">
    {BARS.map((h, i) => (
      <span
        key={i}
        className="hm-wave-bar block w-[3px] rounded-full bg-gradient-to-t from-purple-500 to-fuchsia-300"
        style={{ height: `${h * 100}%`, animationDelay: `${i * -0.17}s` }}
      />
    ))}
  </span>
);
