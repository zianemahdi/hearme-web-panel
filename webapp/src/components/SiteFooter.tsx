import React from 'react';
import { Instagram, Youtube, Facebook, ShieldCheck } from 'lucide-react';
import { HearMeLogo } from './HearMeLogo';

interface SiteFooterProps {
  onOpenPrivacy: () => void;
  theme?: 'dark' | 'light';
}

export const SiteFooter: React.FC<SiteFooterProps> = ({ onOpenPrivacy, theme = 'dark' }) => {
  const isDark = theme === 'dark';

  return (
    <footer
      id="hearme-site-footer"
      className={`border-t mt-12 transition-colors duration-300 ${
        isDark
          ? 'border-white/[0.08] bg-[#050508] text-slate-300'
          : 'border-slate-200 bg-slate-50 text-slate-700'
      }`}
    >
      {/* Main Footer links and brand */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo & Brand description */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left gap-2">
            <a
              href="https://paperwhite28.wixsite.com/my-site"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block"
            >
              <HearMeLogo
                variant="horizontal"
                size="md"
                theme={isDark ? 'white' : 'dark'}
                animatedLight={true}
                showSubtitle={true}
              />
            </a>
            <p
              className={`text-xs max-w-sm ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Plateforme antivol et panneau d'urgence intelligent. Sécurisation matérielle, géolocalisation et prise de photo à distance.
            </p>
          </div>

          {/* Legal and navigation links matching the Wix site */}
          <div
            className={`flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            <a
              href="https://paperwhite28.wixsite.com/my-site"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-purple-400 transition"
            >
              Accueil
            </a>
            <button
              onClick={onOpenPrivacy}
              className="hover:text-purple-400 transition cursor-pointer"
            >
              Politique de confidentialité
            </button>
            <button
              onClick={onOpenPrivacy}
              className="hover:text-purple-400 transition cursor-pointer"
            >
              Déclaration d'accessibilité
            </button>
            <button
              onClick={onOpenPrivacy}
              className="hover:text-purple-400 transition cursor-pointer"
            >
              Politique de cookies
            </button>
            <button
              onClick={onOpenPrivacy}
              className="hover:text-purple-400 transition cursor-pointer"
            >
              Mentions légales
            </button>
          </div>

          {/* Social media icons */}
          <div className="flex items-center gap-3">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className={`p-2.5 rounded-xl border transition ${
                isDark
                  ? 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border-white/[0.08]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200'
              }`}
            >
              <Instagram className="w-4 h-4" />
            </a>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube"
              className={`p-2.5 rounded-xl border transition ${
                isDark
                  ? 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border-white/[0.08]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200'
              }`}
            >
              <Youtube className="w-4 h-4" />
            </a>
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className={`p-2.5 rounded-xl border transition ${
                isDark
                  ? 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border-white/[0.08]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200'
              }`}
            >
              <Facebook className="w-4 h-4" />
            </a>
            <a
              href="https://tiktok.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
              className={`p-2.5 rounded-xl border transition ${
                isDark
                  ? 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border-white/[0.08]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.89 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003 15.67 6.34 6.34 0 009.34 22a6.34 6.34 0 006.34-6.33V8.89a8.28 8.28 0 004.81 1.52v-3.5a4.84 4.84 0 01-.9-.22z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Bottom copyright line matching Wix site */}
        <div
          className={`mt-8 pt-6 border-t flex flex-col sm:flex-row items-center justify-between text-[11px] gap-3 ${
            isDark ? 'border-white/[0.06] text-slate-500' : 'border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>© 2026 par HearMe. Propulsé et sécurisé.</span>
          </div>
          <div>
            <span>Conforme RGPD & Directives de sécurité Google Play Android</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
