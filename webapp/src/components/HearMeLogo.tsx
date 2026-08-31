import React from 'react';

interface HearMeLogoProps {
  variant?: 'monogram' | 'full' | 'horizontal';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  theme?: 'white' | 'dark' | 'gradient' | 'mono';
  className?: string;
  showSubtitle?: boolean;
  animatedLight?: boolean;
  /** Intro jouée une fois au chargement : la tuile monte, le monogramme apparaît en cascade. */
  intro?: boolean;
}

/**
 * Logo HearMe — repris À L'IDENTIQUE de l'app Android : le monogramme « HM »
 * blanc (barre gauche fine + barre droite fendue en deux capsules = les « yeux »,
 * puis un grand M) posé sur la tuile arrondie en dégradé violet #7C5CFF → #C24DF0
 * (les mêmes couleurs que l'icône Android, hero_gradient_start/end).
 *
 * La géométrie du monogramme vient telle quelle de ../hearme-brand/monogram.svg
 * (viewBox 700×400) : elle est donc rigoureusement la même que l'icône du store.
 */
export const HearMeLogo: React.FC<HearMeLogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  theme = 'white',
  className = '',
  showSubtitle = false,
  animatedLight = true,
  intro = false,
}) => {
  const sizeMap = {
    xs: { icon: 24, font: 'text-xs', height: 24 },
    sm: { icon: 32, font: 'text-sm', height: 32 },
    md: { icon: 44, font: 'text-lg', height: 44 },
    lg: { icon: 66, font: 'text-2xl', height: 66 },
    xl: { icon: 108, font: 'text-4xl', height: 108 },
  };
  const currentSize = sizeMap[size];

  // Les identifiants de dégradé doivent être uniques : plusieurs logos coexistent
  // sur la page (navbar, portail, pied de page) et des IDs partagés se
  // télescoperaient.
  const uid = React.useId().replace(/:/g, '');

  // Tuile arrondie (dégradé violet de l'app) + monogramme officiel blanc, centré.
  // Le monogramme officiel fait 700×400 ; on le place dans une tuile carrée de
  // 100×100 avec marge : échelle 0.10286, décalé de (14 ; 29,4) pour le centrer.
  // Classe de pièce du monogramme : en intro, chaque élément apparaît en cascade
  // (délai croissant). Sans intro, aucune classe (rendu statique immédiat).
  const piece = (delay: number) =>
    intro ? { className: 'hm-piece', style: { animationDelay: `${delay}s` } } : {};

  const renderMonogram = (px: number) => (
    <div
      className={`relative group/logo inline-flex items-center justify-center shrink-0 ${intro ? 'hm-logo-intro-wrap' : ''}`}
      style={{ width: px, height: px }}
    >
      {animatedLight && (
        <div
          className="absolute -inset-1.5 rounded-[26%] bg-gradient-to-br from-[#7C5CFF]/45 via-fuchsia-500/30 to-[#C24DF0]/45 blur-lg opacity-60 group-hover/logo:opacity-90 transition-opacity duration-700 pointer-events-none"
          aria-hidden="true"
        />
      )}
      <svg
        viewBox="0 0 100 100"
        width={px}
        height={px}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="HearMe"
        className={`relative z-10 shrink-0 transition-transform duration-300 group-hover/logo:scale-105 ${intro ? 'hm-logo-intro' : ''}`}
      >
        <defs>
          <linearGradient id={`tile-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C5CFF" />
            <stop offset="1" stopColor="#C24DF0" />
          </linearGradient>
          <linearGradient id={`shine-${uid}`} x1="-100%" y1="0" x2="200%" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            {animatedLight && (
              <>
                <animate attributeName="x1" from="-100%" to="150%" dur="3.4s" repeatCount="indefinite" />
                <animate attributeName="x2" from="0%" to="250%" dur="3.4s" repeatCount="indefinite" />
              </>
            )}
          </linearGradient>
        </defs>

        {/* Tuile */}
        <rect width="100" height="100" rx="24" fill={`url(#tile-${uid})`} />

        {/* Monogramme officiel « HM » (blanc), centré. En intro, les 4 pièces
            (barre gauche → œil haut → œil bas → M) apparaissent en cascade. */}
        <g transform="translate(14, 29.4) scale(0.10286)" fill="#ffffff">
          <rect x="20" y="10" width="34" height="380" rx="17" {...piece(0)} />
          <rect x="105" y="10" width="80" height="175" rx="18" {...piece(0.09)} />
          <rect x="105" y="215" width="80" height="175" rx="18" {...piece(0.18)} />
          <path
            d="M235,390 V10 H360 L457,250 L555,10 H680 V390 H555 V175 L457,320 L360,175 V390 Z"
            stroke="#ffffff"
            strokeWidth="16"
            strokeLinejoin="round"
            strokeLinecap="round"
            {...piece(0.27)}
          />
        </g>

        {/* Reflet de lumière qui balaie la tuile */}
        {animatedLight && (
          <rect
            width="100"
            height="100"
            rx="24"
            fill={`url(#shine-${uid})`}
            opacity="0.5"
            style={{ mixBlendMode: 'overlay' }}
          />
        )}
      </svg>
    </div>
  );

  // Couleur du mot « HearMe » selon le contexte.
  const wordClass =
    theme === 'white'
      ? "text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.25)]"
      : theme === 'dark'
      ? 'text-slate-900'
      : theme === 'gradient'
      ? 'hm-gradient-text'
      : 'text-slate-100';

  const audioBars = animatedLight && (
    <span className="hidden sm:flex items-end gap-0.5 h-2.5 opacity-70" aria-hidden="true">
      <span className="w-0.5 bg-purple-400 rounded-full animate-pulse h-2"></span>
      <span className="w-0.5 bg-fuchsia-400 rounded-full animate-pulse [animation-delay:0.2s] h-3"></span>
      <span className="w-0.5 bg-cyan-400 rounded-full animate-pulse [animation-delay:0.4s] h-1.5"></span>
    </span>
  );

  if (variant === 'monogram') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {renderMonogram(currentSize.icon)}
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center text-center group ${className}`}>
        {renderMonogram(currentSize.icon * 1.4)}
        <div className="mt-3.5 flex flex-col items-center leading-none">
          <div className="relative inline-flex items-center gap-1.5">
            <span className={`font-['Poppins',sans-serif] font-black ${wordClass} ${currentSize.font} tracking-tight transition-colors duration-300`}>
              HearMe
            </span>
            {audioBars}
          </div>
          {showSubtitle && (
            <span className="text-[10px] tracking-widest uppercase font-bold mt-1.5 text-slate-400">
              Antivol &amp; Géolocalisation Live
            </span>
          )}
        </div>
      </div>
    );
  }

  // Variante horizontale (par défaut) : tuile + mot + sous-titre.
  return (
    <div className={`inline-flex items-center gap-3 group ${className}`}>
      {renderMonogram(currentSize.icon)}
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span className={`font-['Poppins',sans-serif] font-black ${wordClass} ${currentSize.font} tracking-tight transition-colors duration-200`}>
            HearMe
          </span>
          {audioBars}
        </div>
        {showSubtitle && (
          <span className="text-[9px] tracking-widest uppercase font-bold mt-0.5 text-slate-400">
            Panneau d'urgence
          </span>
        )}
      </div>
    </div>
  );
};
