import React from 'react';

interface HearMeLogoProps {
  variant?: 'monogram' | 'full' | 'horizontal';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  theme?: 'white' | 'dark' | 'gradient' | 'mono';
  className?: string;
  showSubtitle?: boolean;
  animatedLight?: boolean;
}

export const HearMeLogo: React.FC<HearMeLogoProps> = ({
  variant = 'horizontal',
  size = 'md',
  theme = 'white',
  className = '',
  showSubtitle = false,
  animatedLight = true,
}) => {
  // Dimensions mapping
  const sizeMap = {
    xs: { icon: 22, font: 'text-xs', height: 22 },
    sm: { icon: 30, font: 'text-sm', height: 30 },
    md: { icon: 42, font: 'text-lg', height: 42 },
    lg: { icon: 64, font: 'text-2xl', height: 64 },
    xl: { icon: 104, font: 'text-4xl', height: 104 },
  };

  const currentSize = sizeMap[size];

  // SVG Monogram Path representation matching official HearMe identity
  const renderMonogram = (w: number, h: number) => {
    let fillColor = '#ffffff';
    if (theme === 'dark' || theme === 'mono') fillColor = '#0f172a';
    if (theme === 'gradient') fillColor = 'url(#hm-light-gradient)';

    return (
      <div className="relative group/logo inline-flex items-center justify-center shrink-0">
        {/* Animated ambient light glow behind the monogram */}
        {animatedLight && (
          <div
            className={`absolute -inset-2 rounded-2xl opacity-60 blur-lg transition-opacity duration-700 pointer-events-none ${
              theme === 'dark'
                ? 'bg-purple-500/20 group-hover/logo:opacity-90'
                : 'bg-gradient-to-r from-purple-500/40 via-pink-500/30 to-cyan-400/40 animate-pulse group-hover/logo:opacity-100 group-hover/logo:blur-xl'
            }`}
          />
        )}

        <svg
          viewBox="0 0 920 660"
          width={w}
          height={h}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`relative z-10 shrink-0 transition-transform duration-300 group-hover/logo:scale-105 ${
            animatedLight ? 'hm-logo-shine' : ''
          }`}
          aria-label="HearMe Monogram"
        >
          <defs>
            {/* Animated Laser Light Linear Gradient */}
            <linearGradient id="hm-light-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="45%" stopColor="#f472b6" />
              <stop offset="70%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>

            {/* Shimmer Light Beam Gradient */}
            <linearGradient id="hm-shimmer" x1="-100%" y1="0%" x2="200%" y2="0%">
              <stop offset="0%" stopColor="white" stopOpacity="0" />
              <stop offset="50%" stopColor="white" stopOpacity="0.8" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
              <animate
                attributeName="x1"
                from="-100%"
                to="150%"
                dur="3s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="x2"
                from="0%"
                to="250%"
                dur="3s"
                repeatCount="indefinite"
              />
            </linearGradient>

            <filter id="hm-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Pillar 1: Far left full-height capsule */}
          <rect
            x="24"
            y="24"
            width="64"
            height="612"
            rx="32"
            fill={fillColor}
            className="transition-colors duration-300"
          />

          {/* Pillar 2: Middle stacked capsules */}
          <rect
            x="152"
            y="24"
            width="104"
            height="268"
            rx="42"
            fill={fillColor}
            className="transition-colors duration-300"
          />
          <rect
            x="152"
            y="368"
            width="104"
            height="268"
            rx="42"
            fill={fillColor}
            className="transition-colors duration-300"
          />

          {/* Pillar 3: Massive bold 'M' geometry */}
          <path
            d="M 308 24 
               H 484 
               L 612 372 
               L 740 24 
               H 916 
               V 636 
               H 744 
               V 268 
               L 612 516 
               L 480 268 
               V 636 
               H 308 
               Z"
            fill={fillColor}
            className="transition-colors duration-300"
          />

          {/* Light Sweep Shimmer Layer on top */}
          {animatedLight && (
            <g opacity="0.35" style={{ mixBlendMode: 'overlay' }}>
              <rect x="24" y="24" width="64" height="612" rx="32" fill="url(#hm-shimmer)" />
              <rect x="152" y="24" width="104" height="268" rx="42" fill="url(#hm-shimmer)" />
              <rect x="152" y="368" width="104" height="268" rx="42" fill="url(#hm-shimmer)" />
              <path
                d="M 308 24 H 484 L 612 372 L 740 24 H 916 V 636 H 744 V 268 L 612 516 L 480 268 V 636 H 308 Z"
                fill="url(#hm-shimmer)"
              />
            </g>
          )}
        </svg>
      </div>
    );
  };

  if (variant === 'monogram') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        {renderMonogram(currentSize.icon, (currentSize.icon * 660) / 920)}
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center text-center group ${className}`}>
        <div className="flex items-center justify-center relative">
          {renderMonogram(currentSize.icon * 1.4, (currentSize.icon * 1.4 * 660) / 920)}
        </div>
        <div className="mt-3.5 font-black tracking-tight flex flex-col items-center">
          <div className="relative inline-flex items-center gap-1.5">
            <span
              className={`font-['Poppins',sans-serif] font-black ${
                theme === 'white'
                  ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]'
                  : theme === 'dark'
                  ? 'text-slate-900 drop-shadow-sm'
                  : theme === 'gradient'
                  ? 'hm-gradient-text drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]'
                  : 'text-slate-100'
              } ${currentSize.font} tracking-tight leading-none transition-all duration-300`}
            >
              HearMe
            </span>

            {/* Audio frequency wave micro-indicator */}
            {animatedLight && (
              <span className="flex items-end gap-0.5 h-3 ml-1 mb-0.5">
                <span className="w-0.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s] h-2"></span>
                <span className="w-0.5 bg-pink-400 rounded-full animate-bounce [animation-delay:-0.15s] h-3.5"></span>
                <span className="w-0.5 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.45s] h-1.5"></span>
              </span>
            )}
          </div>

          {showSubtitle && (
            <span
              className={`text-[10px] tracking-widest uppercase font-bold mt-1.5 transition-colors ${
                theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              Antivol & Géolocalisation Live
            </span>
          )}
        </div>
      </div>
    );
  }

  // Horizontal variant (default)
  return (
    <div className={`inline-flex items-center gap-3 group ${className}`}>
      {renderMonogram(currentSize.icon, (currentSize.icon * 660) / 920)}
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-['Poppins',sans-serif] font-black ${
              theme === 'white'
                ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                : theme === 'dark'
                ? 'text-slate-900'
                : theme === 'gradient'
                ? 'hm-gradient-text'
                : 'text-slate-100'
            } ${currentSize.font} tracking-tight transition-colors duration-200`}
          >
            HearMe
          </span>
          {animatedLight && (
            <span className="hidden sm:flex items-end gap-0.5 h-2.5 opacity-70">
              <span className="w-0.5 bg-purple-400 rounded-full animate-pulse h-2"></span>
              <span className="w-0.5 bg-pink-400 rounded-full animate-pulse [animation-delay:0.2s] h-3"></span>
              <span className="w-0.5 bg-cyan-400 rounded-full animate-pulse [animation-delay:0.4s] h-1.5"></span>
            </span>
          )}
        </div>
        {showSubtitle && (
          <span
            className={`text-[9px] tracking-widest uppercase font-bold mt-0.5 transition-colors ${
              theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            Panneau d'urgence
          </span>
        )}
      </div>
    </div>
  );
};
