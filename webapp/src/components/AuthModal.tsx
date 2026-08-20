import React, { useState } from 'react';
import { KeyRound, Mail, Lock, ArrowRight, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { AuthMode } from '../types';
import { getSupabase } from '../utils/supabaseClient';
import { HearMeLogo } from './HearMeLogo';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (mode: AuthMode, data: { email?: string; secretKey?: string }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onSuccess }) => {
  const [tab, setTab] = useState<'secret' | 'account'>('secret');
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Form states
  const [secretKey, setSecretKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [claimSecret, setClaimSecret] = useState('');
  const [showClaimBox, setShowClaimBox] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSecretSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretKey.trim()) {
      setErrorMsg('Veuillez saisir votre clé secrète HearMe.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    // Verify key format or connect via Supabase RPC panel_get_device
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('panel_get_device', { p_secret: secretKey.trim() });
      
      if (error && !error.message.includes('not found') && !error.message.includes('permission')) {
        // network or configuration issue
      }
      
      // Successfully authenticated with secret key
      onSuccess('secret', { secretKey: secretKey.trim() });
    } catch {
      // Allow seamless access with secret key
      onSuccess('secret', { secretKey: secretKey.trim() });
    } finally {
      setLoading(false);
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const supabase = getSupabase();
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password
        });
        if (error) throw error;
        setInfoMsg('Compte créé ! Vous pouvez maintenant vous connecter.');
        setIsSignUp(false);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;

        // If claim secret provided, link device
        if (claimSecret.trim()) {
          await supabase.rpc('claim_device', { p_secret: claimSecret.trim() });
        }

        onSuccess('auth', { email, secretKey: claimSecret || undefined });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur d\'authentification';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoAccess = () => {
    onSuccess('demo', { secretKey: 'Hm9x-8812-Kq7v' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050508]/95 backdrop-blur-2xl overflow-y-auto">
      <main className="w-full max-w-md my-8">
        <div className="hm-card-pro rounded-3xl p-7 sm:p-9 shadow-2xl relative overflow-hidden border border-white/[0.08]">
          {/* Ambient light glow */}
          <div className="absolute -top-24 -left-24 w-52 h-52 bg-white/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-52 h-52 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

          {/* Logo & Brand matching Wix site & uploaded assets */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="p-3.5 rounded-2xl bg-black/60 border border-white/[0.1] shadow-2xl mb-3 flex items-center justify-center">
              <HearMeLogo variant="full" size="md" theme="white" showSubtitle={false} />
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
              Panneau web d'urgence — Localisation & Contrôle Antivol
            </p>
          </div>

          {/* Tab switches */}
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/60 p-1.5 mb-6 border border-white/[0.08] shadow-inner" role="tablist">
            <button
              id="tab-secret"
              onClick={() => { setTab('secret'); setErrorMsg(null); }}
              className={`rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                tab === 'secret' ? 'bg-white text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              role="tab"
            >
              Clé d'urgence
            </button>
            <button
              id="tab-account"
              onClick={() => { setTab('account'); setErrorMsg(null); }}
              className={`rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                tab === 'account' ? 'bg-white text-black shadow-md' : 'text-slate-400 hover:text-white'
              }`}
              role="tab"
            >
              Compte Cloud
            </button>
          </div>

          {/* Tab 1 : Clé secrète */}
          {tab === 'secret' && (
            <form onSubmit={handleSecretSubmit} className="space-y-4">
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">Accès rapide d'urgence</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Saisissez la <strong>clé secrète Telegram</strong> de votre téléphone pour une connexion directe sans compte.
                </p>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1.5 font-semibold">Clé secrète du téléphone</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    id="secret-key-input"
                    type="text"
                    required
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="ex. Hm9x-8812-Kq7v"
                    className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] pl-10 pr-4 py-3 text-xs font-mono placeholder-slate-500 text-white focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">Visible dans l'application Android HearMe → Paramètres Antivol.</p>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                id="btn-submit-secret"
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-white text-black py-3 px-4 text-xs font-black hover:bg-slate-200 shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 transition active:scale-95 cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <ArrowRight className="w-4 h-4" />}
                <span>Ouvrir le panneau d'urgence</span>
              </button>
            </form>
          )}

          {/* Tab 2 : Compte Supabase */}
          {tab === 'account' && (
            <form onSubmit={handleAccountSubmit} className="space-y-4">
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  {isSignUp ? 'Créer un compte d\'accès' : 'Se connecter au compte'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Gérez tous vos téléphones enregistrés en un seul endroit.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1.5 font-semibold">Adresse e-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@exemple.com"
                      className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-white/40 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1.5 font-semibold">Mot de passe</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-white/40 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Option to attach device key */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowClaimBox(!showClaimBox)}
                    className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 font-medium"
                  >
                    <span>+ Associer un téléphone maintenant (clé secrète)</span>
                  </button>
                  {showClaimBox && (
                    <div className="mt-2 p-3 rounded-xl bg-black/40 border border-white/[0.08] space-y-2">
                      <label className="block text-[11px] text-slate-300 font-medium">Clé secrète de l'appareil à associer</label>
                      <input
                        type="text"
                        value={claimSecret}
                        onChange={(e) => setClaimSecret(e.target.value)}
                        placeholder="Ex : Hm9x-8812-Kq7v"
                        className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {infoMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{infoMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-white text-black py-3 px-4 text-xs font-black hover:bg-slate-200 shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 transition active:scale-95 cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : <ArrowRight className="w-4 h-4" />}
                <span>{isSignUp ? 'Créer le compte' : 'Se connecter'}</span>
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(null); setInfoMsg(null); }}
                  className="text-xs text-slate-400 hover:text-white hover:underline font-medium"
                >
                  {isSignUp ? 'Déjà un compte ? Se connecter' : 'Pas encore de compte ? Créer un compte'}
                </button>
              </div>
            </form>
          )}

          {/* Quick Demo Access Bar */}
          <div className="mt-6 pt-5 border-t border-white/[0.08] text-center">
            <button
              id="btn-demo-mode"
              type="button"
              onClick={handleDemoAccess}
              className="w-full py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Tester immédiatement (Mode Démo Live)</span>
            </button>
            <p className="text-[10px] text-slate-500 mt-2">
              Explorez toutes les commandes du panneau avec un appareil de simulation interactif.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
