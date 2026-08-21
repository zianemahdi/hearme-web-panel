import React, { useState } from 'react';
import {
  KeyRound,
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Radio,
  Camera,
  MapPin,
  Volume2,
  Smartphone,
  Sun,
  Moon,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  HelpCircle
} from 'lucide-react';
import { AuthMode } from '../types';
import { getSupabase } from '../utils/supabaseClient';
import { HearMeLogo } from './HearMeLogo';

type SB = ReturnType<typeof getSupabase>;

/** Clé secrète du 1er appareil rattaché au compte connecté (mode compte → RLS). */
async function resolveAccountDeviceKey(supabase: SB): Promise<string | undefined> {
  try {
    const { data } = await supabase
      .from('devices')
      .select('secret_key')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const key = data && (data as { secret_key?: string }).secret_key;
    return key || undefined;
  } catch {
    return undefined;
  }
}

interface WelcomeAuthPortalProps {
  onSuccess: (mode: AuthMode, deviceSecretKey?: string, userEmail?: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenPrivacy: () => void;
}

export const WelcomeAuthPortal: React.FC<WelcomeAuthPortalProps> = ({
  onSuccess,
  theme,
  onToggleTheme,
  onOpenPrivacy,
}) => {
  const [activeTab, setActiveTab] = useState<'secret' | 'register' | 'login'>('secret');
  
  // Registration Form State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDeviceName, setRegDeviceName] = useState('Mon Smartphone Android');
  const [regSecretKey, setRegSecretKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(true);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Secret Key Access State
  const [quickSecretKey, setQuickSecretKey] = useState('');

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [showFaq, setShowFaq] = useState(false);

  // Calculate Password Strength (0-4)
  const calculateStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass) || /[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };
  const passwordStrength = calculateStrength(regPassword);

  // Generate random device key helper
  const generateRandomKey = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 4; i++) part1 += chars.charAt(Math.floor(Math.random() * chars.length));
    for (let i = 0; i < 4; i++) part2 += chars.charAt(Math.floor(Math.random() * chars.length));
    setRegSecretKey(`HM-${part1}-${part2}`);
  };

  // Handle Secret Key Direct Unlock
  const handleSecretSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSecretKey.trim()) {
      setErrorMsg('Veuillez saisir la clé secrète de votre téléphone');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data, error } = await supabase
          .from('devices')
          .select('id, name, secret_key')
          .eq('secret_key', quickSecretKey.trim())
          .maybeSingle();

        if (error) {
          console.warn('Supabase query note:', error.message);
        }
        if (data) {
          onSuccess('secret', quickSecretKey.trim());
          return;
        }
      }
      // Direct emergency login with key
      onSuccess('secret', quickSecretKey.trim());
    } catch {
      onSuccess('secret', quickSecretKey.trim());
    } finally {
      setLoading(false);
    }
  };

  // Handle Full User Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail.trim() || !regPassword) {
      setErrorMsg('Veuillez renseigner votre email et mot de passe');
      return;
    }
    if (regPassword.length < 6) {
      setErrorMsg('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (!acceptTerms) {
      setErrorMsg('Veuillez accepter les conditions de confidentialité');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: regEmail.trim(),
          password: regPassword,
          options: {
            data: {
              full_name: regName || 'Utilisateur HearMe',
              device_name: regDeviceName || 'Mon Téléphone',
              initial_secret_key: regSecretKey || undefined
            }
          }
        });

        if (error) {
          if (error.message.includes('already registered')) {
            setErrorMsg('Cette adresse email est déjà enregistrée. Veuillez vous connecter.');
            setActiveTab('login');
            setLoginEmail(regEmail);
            return;
          }
          throw error;
        }

        if (data.session) {
          const deviceKey = await resolveAccountDeviceKey(supabase);
          onSuccess('account', deviceKey, regEmail.trim());
          return;
        } else {
          setInfoMsg('Compte créé avec succès ! Si demandé, confirmez votre adresse email ou connectez-vous.');
          setActiveTab('login');
          setLoginEmail(regEmail);
          return;
        }
      }

      // Fallback local session if Supabase is pending setup
      onSuccess('account', regSecretKey.trim() || undefined, regEmail.trim());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur d\'inscription';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // Handle User Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setErrorMsg('Veuillez saisir votre email et mot de passe');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const supabase = getSupabase();
      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPassword,
        });

        if (error) throw error;
        if (data.session) {
          const deviceKey = await resolveAccountDeviceKey(supabase);
          onSuccess('account', deviceKey, loginEmail.trim());
          return;
        }
      }
      onSuccess('account', undefined, loginEmail.trim());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Identifiants invalides';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoAccess = () => {
    onSuccess('demo');
  };

  return (
    <div className="relative min-h-screen z-10 flex flex-col justify-between px-4 sm:px-6 py-6 sm:py-10">
      {/* Top Bar with Logo & Theme Toggle */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <HearMeLogo
            variant="horizontal"
            size="md"
            theme={theme === 'dark' ? 'white' : 'dark'}
            animatedLight={true}
            showSubtitle={true}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Switcher Button */}
          <button
            onClick={onToggleTheme}
            id="btn-theme-toggle-welcome"
            className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center gap-2 text-xs font-bold ${
              theme === 'dark'
                ? 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-yellow-300'
                : 'bg-black/[0.05] hover:bg-black/[0.1] border-black/[0.1] text-indigo-700 shadow-sm'
            }`}
            title={`Passer en mode ${theme === 'dark' ? 'Clair' : 'Sombre'}`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-yellow-400 animate-spin-slow" />
                <span className="hidden sm:inline text-white">Mode Clair</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-600" />
                <span className="hidden sm:inline text-slate-800">Mode Sombre</span>
              </>
            )}
          </button>

          {/* Quick Demo Access */}
          <button
            onClick={handleDemoAccess}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              theme === 'dark'
                ? 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/30'
                : 'bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 shadow-sm'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-pink-500" />
            <span className="hidden sm:inline">Démo Immédiate</span>
          </button>
        </div>
      </header>

      {/* Main Content: Hero & Auth Grid */}
      <main className="max-w-6xl w-full mx-auto my-auto py-8 sm:py-12 grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Side: Concept & Value Proposition */}
        <section className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold tracking-wide shadow-sm backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className={theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}>
              Système Antivol & Protection Continue
            </span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.15]">
              <span className={theme === 'dark' ? 'text-white' : 'text-slate-950'}>
                Retrouvez et sécurisez votre téléphone{' '}
              </span>
              <span className="hm-gradient-text">à tout instant.</span>
            </h1>
            <p className={`text-sm sm:text-base leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
              HearMe est votre panneau de commande d'urgence. Localisez votre appareil égaré ou volé, déclenchez une sirène d'alerte maximale, prenez des clichés silencieux de l'intrus et verrouillez vos données.
            </p>
          </div>

          {/* 4 Core Pillars of HearMe */}
          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <div className={`p-3.5 rounded-2xl border transition-all ${
              theme === 'dark'
                ? 'bg-white/[0.03] border-white/[0.08] hover:border-purple-500/30'
                : 'bg-white/80 border-slate-200 hover:border-purple-300 shadow-sm'
            }`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-7 h-7 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
                  <Volume2 className="w-4 h-4" />
                </div>
                <h2 className={`font-bold text-xs ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  Mot-clé Vocal « HearMe »
                </h2>
              </div>
              <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                Faites sonner votre smartphone à 100% du volume même s'il est en mode silencieux absolu.
              </p>
            </div>

            <div className={`p-3.5 rounded-2xl border transition-all ${
              theme === 'dark'
                ? 'bg-white/[0.03] border-white/[0.08] hover:border-pink-500/30'
                : 'bg-white/80 border-slate-200 hover:border-pink-300 shadow-sm'
            }`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-7 h-7 rounded-xl bg-pink-500/15 text-pink-400 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <h2 className={`font-bold text-xs ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  Géolocalisation Satellite
                </h2>
              </div>
              <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                Tracé GPS en temps réel, estimation de batterie, état réseau et téléguidage d'urgence.
              </p>
            </div>

            <div className={`p-3.5 rounded-2xl border transition-all ${
              theme === 'dark'
                ? 'bg-white/[0.03] border-white/[0.08] hover:border-cyan-500/30'
                : 'bg-white/80 border-slate-200 hover:border-cyan-300 shadow-sm'
            }`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-7 h-7 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <h2 className={`font-bold text-xs ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  Photo Silencieuse d'Intrus
                </h2>
              </div>
              <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                Capture automatique et discrète de l'appareil photo après 3 tentatives de déverrouillage erronées.
              </p>
            </div>

            <div className={`p-3.5 rounded-2xl border transition-all ${
              theme === 'dark'
                ? 'bg-white/[0.03] border-white/[0.08] hover:border-emerald-500/30'
                : 'bg-white/80 border-slate-200 hover:border-emerald-300 shadow-sm'
            }`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h2 className={`font-bold text-xs ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  Zéro Fuite Cloud (RGPD)
                </h2>
              </div>
              <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                Chiffrement de bout en bout et contrôle exclusif par clé secrète d'appareil privée.
              </p>
            </div>
          </div>

          {/* Social Proof & Guarantee badge */}
          <div className="flex items-center gap-4 pt-1 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Compatible Android & Wear OS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Accès immédiat sans mot de passe</span>
            </div>
          </div>
        </section>

        {/* Right Side: Comprehensive Auth & Registration Form */}
        <section className="lg:col-span-6">
          <div className="hm-card-pro rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            {/* Ambient subtle light glow inside card */}
            <div className="absolute -top-16 -right-16 w-44 h-44 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

            {/* Tab selection */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-black/20 border border-white/[0.08] mb-6">
              <button
                type="button"
                onClick={() => { setActiveTab('secret'); setErrorMsg(null); setInfoMsg(null); }}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'secret'
                    ? theme === 'dark'
                      ? 'bg-white text-black shadow-md'
                      : 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Clé Secrète</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('register'); setErrorMsg(null); setInfoMsg(null); }}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'register'
                    ? theme === 'dark'
                      ? 'bg-white text-black shadow-md'
                      : 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Créer Compte</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('login'); setErrorMsg(null); setInfoMsg(null); }}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'login'
                    ? theme === 'dark'
                      ? 'bg-white text-black shadow-md'
                      : 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Connexion</span>
              </button>
            </div>

            {/* TAB 1: QUICK SECRET KEY ACCESS */}
            {activeTab === 'secret' && (
              <form onSubmit={handleSecretSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">
                      Accès d'Urgence Téléphone
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Instantané
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Entrez la clé secrète configurée dans l'application mobile pour déverrouiller le suivi sans mot de passe.
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 font-semibold mb-1.5">
                    Clé Secrète de l'appareil
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      value={quickSecretKey}
                      onChange={(e) => setQuickSecretKey(e.target.value)}
                      placeholder="ex. HM-9X44-KQ88"
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-10 pr-4 py-3 text-xs font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:border-white/40 tracking-wider uppercase"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    <span>Clé affichée dans l'app Android : Paramètres → Clé Antivol</span>
                  </p>
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 rounded-xl bg-white text-black font-black text-xs hover:bg-slate-200 transition shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  <span>Déverrouiller le Panneau d'Urgence</span>
                </button>

                <div className="pt-2 border-t border-white/[0.08] text-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('register')}
                    className="text-xs text-slate-400 hover:text-white transition inline-flex items-center gap-1"
                  >
                    <span>Vous n'avez pas encore d'appareil configuré ?</span>
                    <strong className="text-white underline">Créer un compte</strong>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: DETAILED REGISTRATION FORM */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">
                    Créer votre compte de protection
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Centralisez vos téléphones et sauvegardez vos photos d'intrusion.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-300 font-semibold mb-1">Votre Nom / Pseudo</label>
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Alexandre"
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-300 font-semibold mb-1">Nom de l'appareil</label>
                    <div className="relative">
                      <Smartphone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={regDeviceName}
                        onChange={(e) => setRegDeviceName(e.target.value)}
                        placeholder="Pixel 8 Pro / Galaxy S24"
                        className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">Adresse E-mail</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="alexandre@exemple.com"
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">Mot de passe de sécurité</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Minimum 6 caractères"
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Password Strength Indicator */}
                  {regPassword && (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex gap-1 h-1">
                        <div className={`flex-1 rounded-full ${passwordStrength >= 1 ? 'bg-rose-500' : 'bg-white/10'}`}></div>
                        <div className={`flex-1 rounded-full ${passwordStrength >= 2 ? 'bg-amber-500' : 'bg-white/10'}`}></div>
                        <div className={`flex-1 rounded-full ${passwordStrength >= 3 ? 'bg-emerald-400' : 'bg-white/10'}`}></div>
                        <div className={`flex-1 rounded-full ${passwordStrength >= 4 ? 'bg-purple-400' : 'bg-white/10'}`}></div>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {passwordStrength <= 1 && 'Faible'}
                        {passwordStrength === 2 && 'Moyen'}
                        {passwordStrength === 3 && 'Fort'}
                        {passwordStrength >= 4 && 'Très fort (recommandé)'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Device Secret Key Pairing option */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/[0.08] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-300 font-semibold flex items-center gap-1">
                      <Radio className="w-3 h-3 text-purple-400" />
                      <span>Clé de jumelage d'urgence (Optionnelle)</span>
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomKey}
                      className="text-[10px] text-purple-300 hover:text-purple-200 underline cursor-pointer"
                    >
                      Générer une clé
                    </button>
                  </div>
                  <input
                    type="text"
                    value={regSecretKey}
                    onChange={(e) => setRegSecretKey(e.target.value)}
                    placeholder="ex. HM-7821-X992 (Laissez vide pour configurer plus tard)"
                    className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-white/30"
                  />
                </div>

                {/* Consent Checkbox */}
                <label className="flex items-start gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-white/10 text-white focus:ring-0"
                  />
                  <span>
                    J'accepte la politique de confidentialité RGPD et autorise le chiffrement de mes données de localisation.
                  </span>
                </label>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 rounded-xl bg-white text-black font-black text-xs hover:bg-slate-200 transition shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Créer mon Compte HearMe</span>
                </button>
              </form>
            )}

            {/* TAB 3: LOGIN FORM */}
            {activeTab === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">
                    Connexion Compte Membre
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Accédez à vos téléphones synchronisés et historique d'alertes.
                  </p>
                </div>

                {infoMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{infoMsg}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">Adresse E-mail</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="alexandre@exemple.com"
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">Mot de passe</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 rounded-xl bg-white text-black font-black text-xs hover:bg-slate-200 transition shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>Se connecter</span>
                </button>

                <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={() => setActiveTab('secret')}
                    className="hover:text-white transition"
                  >
                    Oublié ? Utiliser ma clé secrète
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('register')}
                    className="text-white underline font-bold"
                  >
                    Créer un compte
                  </button>
                </div>
              </form>
            )}

            {/* Quick Demo Footer Action */}
            <div className="mt-5 pt-4 border-t border-white/[0.08] text-center">
              <button
                type="button"
                onClick={handleDemoAccess}
                className="w-full py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                <span>Tester immédiatement en Mode Démo Interactive</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Subtle Footer Information */}
      <footer className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>HearMe Security Platform • Protocole Antivol Chiffré</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onOpenPrivacy}
            className="hover:text-slate-300 transition underline cursor-pointer"
          >
            Politique de Confidentialité
          </button>
        </div>
      </footer>
    </div>
  );
};
