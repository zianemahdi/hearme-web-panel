import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Copy, Check, RefreshCw, AlertTriangle, Send, HelpCircle } from 'lucide-react';

interface SecretKeyCardProps {
  secretKey: string;
  onRegenerateKey: () => Promise<string | null>;
  theme?: 'dark' | 'light';
}

export const SecretKeyCard: React.FC<SecretKeyCardProps> = ({ secretKey, onRegenerateKey, theme = 'dark' }) => {
  const isDark = theme === 'dark';
  const [isRevealed, setIsRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [showTelegramHelp, setShowTelegramHelp] = useState(false);

  const handleCopy = () => {
    if (!secretKey) return;
    navigator.clipboard.writeText(secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleConfirmRegen = async () => {
    setIsRegenerating(true);
    setShowRegenConfirm(false);
    await onRegenerateKey();
    setIsRegenerating(false);
  };

  const maskedKey = '•'.repeat(Math.max(secretKey?.length || 10, 10));

  return (
    <div
      id="bento-secret-key-panel"
      className="hm-card-interactive rounded-2xl p-5 space-y-4 relative overflow-hidden"
    >
      {/* Ambient background glow */}
      <div className="hm-bento-glow w-36 h-36 bg-purple-500 top-0 right-0 -mr-10 -mt-10" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-400">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h2 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              Clé de Contrôle Sécurisée
            </h2>
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Jeton cryptographique de liaison
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowTelegramHelp(!showTelegramHelp)}
          className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition ${
            isDark
              ? 'text-purple-300 bg-purple-500/10 border-purple-500/25 hover:bg-purple-500/20'
              : 'text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100'
          }`}
          title="Guide Telegram & API"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span className="font-semibold text-[11px]">Bot Telegram</span>
        </button>
      </div>

      {/* Secret Key Display Box */}
      <div className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 shadow-inner ${
        isDark ? 'bg-black/50 border-white/[0.08]' : 'bg-slate-100/90 border-slate-200'
      }`}>
        <div className="font-mono text-base sm:text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 font-bold truncate select-all">
          {isRevealed ? secretKey : maskedKey}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="btn-toggle-secret-visibility"
            onClick={() => setIsRevealed(!isRevealed)}
            className={`p-2 rounded-xl transition active:scale-95 ${
              isDark ? 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white' : 'bg-white hover:bg-slate-200 text-slate-700'
            }`}
            title={isRevealed ? 'Masquer' : 'Afficher la clé'}
          >
            {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            id="btn-copy-secret-key"
            onClick={handleCopy}
            className="p-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 transition active:scale-95 shadow-sm"
            title="Copier la clé"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          id="btn-open-regen-modal"
          onClick={() => setShowRegenConfirm(true)}
          disabled={isRegenerating}
          className={`w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${
            isDark
              ? 'border-amber-500/30 bg-amber-500/[0.08] hover:bg-amber-500/15 text-amber-300'
              : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isRegenerating ? 'animate-spin' : ''}`} />
          <span>Régénérer une nouvelle clé d'accès</span>
        </button>
      </div>

      <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        Cette clé commande votre téléphone à distance en toute sécurité (via ce panneau ou le bot Telegram). Conservez-la en lieu sûr.
      </p>

      {/* Telegram bot commands info tooltip */}
      {showTelegramHelp && (
        <div className={`rounded-xl border p-3.5 text-xs space-y-2.5 shadow-xl ${
          isDark ? 'bg-[#15122b] border-purple-500/30 text-slate-300' : 'bg-purple-50 border-purple-200 text-purple-950'
        }`}>
          <div className="flex items-center gap-2 text-purple-400 font-bold">
            <Send className="w-3.5 h-3.5 text-pink-400" />
            <span>Commandes Telegram d'urgence</span>
          </div>
          <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-purple-800'}`}>
            Envoyez un message direct à votre bot HearMe avec votre clé pour commander votre mobile à distance :
          </p>
          <div className={`space-y-1.5 font-mono text-[11px] p-2.5 rounded-xl border ${
            isDark ? 'bg-black/60 border-white/[0.06] text-purple-200' : 'bg-white border-purple-200 text-purple-900'
          }`}>
            <div><strong className="text-pink-500">/lock &lt;clé&gt;</strong> — Verrouiller l'écran avec alerte</div>
            <div><strong className="text-pink-500">/alarm &lt;clé&gt;</strong> — Déclencher la sirène antivol</div>
            <div><strong className="text-pink-500">/locate &lt;clé&gt;</strong> — Obtenir la position GPS live</div>
            <div><strong className="text-pink-500">/photo &lt;clé&gt;</strong> — Capturer la photo du ravisseur</div>
          </div>
        </div>
      )}

      {/* Regenerate Warning Modal */}
      {showRegenConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl space-y-4 ${
            isDark ? 'bg-[#11111f] border-white/15 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center gap-3 pb-2 border-b border-white/[0.08]">
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Régénérer la clé secrète ?</h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Action immédiate et irréversible</p>
              </div>
            </div>

            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              L'ancienne clé cessera immédiatement de fonctionner. Vous devrez mettre à jour vos raccourcis Telegram ou applications connectées.
            </p>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setShowRegenConfirm(false)}
                className={`px-4 py-2 rounded-xl border text-xs transition ${
                  isDark ? 'border-white/[0.08] text-slate-300 hover:bg-white/[0.06]' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmRegen}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg transition active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Confirmer la régénération
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
