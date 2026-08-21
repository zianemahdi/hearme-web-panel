import React from 'react';
import { Smartphone, LogOut, FileText, ExternalLink, Sun, Moon } from 'lucide-react';
import { Device, AuthMode } from '../types';
import { HearMeLogo } from './HearMeLogo';

interface NavbarProps {
  device: Device;
  authMode: AuthMode;
  isOnline: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenPrivacy: () => void;
  onLogout: () => void;
  customLogoUrl?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  device,
  authMode,
  isOnline,
  theme,
  onToggleTheme,
  onOpenPrivacy,
  onLogout,
  customLogoUrl
}) => {
  const isDark = theme === 'dark';

  return (
    <header
      id="hearme-navbar"
      className={`sticky top-0 z-30 border-b backdrop-blur-2xl transition-colors duration-300 ${
        isDark
          ? 'border-white/[0.08] bg-[#050508]/85 text-white'
          : 'border-slate-200/80 bg-white/90 text-slate-900 shadow-xs'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        {/* Left: Brand Logo & Status matching Wix site */}
        <div className="flex items-center gap-4">
          <a
            href="https://paperwhite28.wixsite.com/my-site"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 group transition"
            title="Visiter le site officiel HearMe"
          >
            {customLogoUrl ? (
              <img src={customLogoUrl} alt="HearMe Logo" className="h-8 object-contain" />
            ) : (
              <HearMeLogo
                variant="horizontal"
                size="sm"
                theme={isDark ? 'white' : 'dark'}
                animatedLight={true}
                showSubtitle={false}
              />
            )}
            <span
              className={`hidden sm:inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border transition ${
                isDark
                  ? 'bg-white/[0.06] text-slate-300 border-white/[0.1] group-hover:border-purple-500/40'
                  : 'bg-slate-100 text-slate-700 border-slate-200 group-hover:border-purple-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Control
            </span>
          </a>

          {/* Nav links styled like site */}
          <nav
            className={`hidden lg:flex items-center gap-1 border-l pl-4 text-xs ${
              isDark ? 'border-white/[0.08]' : 'border-slate-200'
            }`}
          >
            <a
              href="https://paperwhite28.wixsite.com/my-site"
              target="_blank"
              rel="noopener noreferrer"
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
                isDark
                  ? 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>Accueil</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
            <button
              onClick={onOpenPrivacy}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                isDark
                  ? 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Confidentialité
            </button>
          </nav>
        </div>

        {/* Center: Device Pill */}
        <div
          className={`flex items-center gap-2.5 px-3 sm:px-4 py-1.5 rounded-xl border shadow-inner transition-colors ${
            isDark
              ? 'bg-black/60 border-white/[0.08]'
              : 'bg-slate-100 border-slate-200/80'
          }`}
        >
          <Smartphone className="w-4 h-4 text-purple-500 shrink-0" />
          <div className="min-w-0 max-w-[110px] sm:max-w-[180px] md:max-w-[240px]">
            <div
              className={`font-bold text-xs truncate ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {device.name}
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
              isOnline
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'}`} />
            <span className="tracking-wide uppercase font-bold text-[9px]">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
          </span>
        </div>

        {/* Right: Quick Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Theme Switcher Toggle */}
          <button
            id="btn-nav-theme-toggle"
            onClick={onToggleTheme}
            className={`p-2 rounded-xl border text-xs transition cursor-pointer flex items-center justify-center ${
              isDark
                ? 'bg-white/[0.06] hover:bg-white/[0.12] text-yellow-300 border-white/[0.08]'
                : 'bg-slate-100 hover:bg-slate-200 text-indigo-600 border-slate-200 shadow-xs'
            }`}
            title={`Passer en mode ${isDark ? 'Clair' : 'Sombre'}`}
          >
            {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          {/* Privacy Policy */}
          <button
            id="btn-nav-privacy"
            onClick={onOpenPrivacy}
            className={`p-2 rounded-xl border text-xs transition cursor-pointer ${
              isDark
                ? 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.08]'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-200'
            }`}
            title="Politique de confidentialité (RGPD & Play Store)"
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* Logout */}
          <button
            id="btn-nav-logout"
            onClick={onLogout}
            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 text-xs transition cursor-pointer"
            title="Quitter la session d'urgence"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
