import React, { useState, useRef } from 'react';
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
  Camera,
  MapPin,
  Volume2,
  Smartphone,
  Check,
  Eye,
  EyeOff,
  HelpCircle
} from 'lucide-react';
import { AuthMode } from '../types';
import { getSupabase } from '../utils/supabaseClient';
import { HearMeLogo } from './HearMeLogo';
import { ShaderBackground } from './ShaderBackground';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useI18n, LanguageSwitcher } from '../i18n';

// hCaptcha — clé de TEST par défaut (passe toujours, sans protection réelle).
// ⚠️ REMPLACER par ta vraie Site Key hCaptcha ; mettre la Secret Key dans
// Supabase (Auth → Attack Protection → hCaptcha).
const HCAPTCHA_SITE_KEY = '38540b54-70fe-4a76-80f6-1a964196d69c';

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
  onOpenPrivacy: () => void;
}

export const WelcomeAuthPortal: React.FC<WelcomeAuthPortalProps> = ({
  onSuccess,
  theme,
  onOpenPrivacy,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'secret' | 'register' | 'login'>('secret');
  
  // Registration Form State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDeviceName, setRegDeviceName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [pinCode, setPinCode] = useState('');

  // Secret Key Access State
  const [quickSecretKey, setQuickSecretKey] = useState('');

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // hCaptcha invisible : on exécute juste avant chaque appel d'auth pour obtenir
  // un jeton, transmis à Supabase. Sans jeton, Supabase refuse (quand le CAPTCHA
  // est activé côté serveur).
  const captchaRef = useRef<HCaptcha>(null);
  const getCaptchaToken = async (): Promise<string | undefined> => {
    try {
      const res = await captchaRef.current?.execute({ async: true });
      return res?.response;
    } catch {
      return undefined;
    } finally {
      try { captchaRef.current?.resetCaptcha(); } catch { /* ignore */ }
    }
  };

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

  // Handle Secret Key Direct Unlock
  const handleSecretSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = quickSecretKey.trim();
    if (!key) {
      setErrorMsg(t('wa.errKeyEmpty'));
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = getSupabase();
      // Validation côté serveur : le RPC ne renvoie un appareil QUE si la clé
      // correspond à un appareil réel créé par l'app HearMe. Une clé au hasard
      // est refusée → on n'entre pas dans le tableau de bord.
      const { data, error } = await supabase.rpc('panel_get_device', { p_secret: key });
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) {
        onSuccess('secret', key);
      } else {
        setErrorMsg(t('wa.errKeyInvalid'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setErrorMsg(/tentatives/i.test(msg) ? t('wa.errTooMany') : t('wa.errKeyService'));
    } finally {
      setLoading(false);
    }
  };

  // Handle Full User Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail.trim() || !regPassword) {
      setErrorMsg(t('wa.errFields'));
      return;
    }
    // Mêmes règles que le serveur (Supabase Auth : 10 caractères, lettres ET chiffres).
    if (regPassword.length < 10 || !/[A-Za-z]/.test(regPassword) || !/[0-9]/.test(regPassword)) {
      setErrorMsg(t('wa.errPasswordRules'));
      return;
    }
    if (!acceptTerms) {
      setErrorMsg(t('wa.errConsent'));
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const supabase = getSupabase();
      if (supabase) {
        const captchaToken = await getCaptchaToken();
        const { data, error } = await supabase.auth.signUp({
          email: regEmail.trim(),
          password: regPassword,
          options: {
            captchaToken,
            data: {
              full_name: regName.trim() || 'HearMe',
              device_name: regDeviceName.trim() || 'HearMe'
            }
          }
        });

        if (error) {
          if (error.message.includes('already registered')) {
            setErrorMsg(t('wa.errAlready'));
            setActiveTab('login');
            setLoginEmail(regEmail);
            return;
          }
          if (error.code === 'weak_password') {
            setErrorMsg(t('wa.errWeak'));
            return;
          }
          throw error;
        }

        if (data.session) {
          const deviceKey = await resolveAccountDeviceKey(supabase);
          onSuccess('account', deviceKey, regEmail.trim());
          return;
        } else {
          setInfoMsg(t('wa.regDone'));
          setActiveTab('login');
          setLoginEmail(regEmail);
          return;
        }
      }

      // Fallback local session if Supabase is pending setup
      onSuccess('account', undefined, regEmail.trim());
    } catch (err: unknown) {
      // Messages bruts de Supabase (en anglais) : on affiche un texte dans la langue choisie.
      const message = err instanceof Error ? err.message : '';
      setErrorMsg(/rate limit|too many/i.test(message) ? t('wa.errTooMany') : t('wa.errRegister'));
    } finally {
      setLoading(false);
    }
  };

  // Handle User Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setErrorMsg(t('wa.errFields'));
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const supabase = getSupabase();
      if (supabase) {
        const captchaToken = await getCaptchaToken();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPassword,
          options: { captchaToken },
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
      const message = err instanceof Error ? err.message : '';
      setErrorMsg(
        /not confirmed/i.test(message) ? t('wa.errNotConfirmed')
        : /rate limit|too many/i.test(message) ? t('wa.errTooMany')
        : /invalid/i.test(message) ? t('wa.errLogin')
        : t('wa.errConnect'));
    } finally {
      setLoading(false);
    }
  };

  // Connexion par PIN de secours : e-mail du COMPTE + PIN (15_master_pin_account.sql).
  // Le serveur ouvre le téléphone du compte vu le plus récemment.
  const handlePinLogin = async () => {
    if (!loginEmail.trim() || !pinCode.trim()) {
      setErrorMsg(t('wa.errPinFields'));
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = getSupabase();
      if (!supabase) { setErrorMsg(t('wa.errService')); return; }
      const { data, error } = await supabase.rpc('panel_pin_login', {
        p_email: loginEmail.trim(),
        p_pin: pinCode.trim(),
      });
      const res = data as { ok?: boolean; secret?: string; error?: string } | null;
      if (error || !res || !res.ok || !res.secret) {
        setErrorMsg(
          res?.error === 'locked' ? t('wa.errPinLocked')
          : res?.error === 'no_device' ? t('wa.errNoDevice')
          : t('wa.errPin'));
        return;
      }
      onSuccess('secret', res.secret, loginEmail.trim());
    } catch {
      setErrorMsg(t('wa.errConnect'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/*
        Fond animé « light ripple » — thème sombre uniquement. En thème clair, le
        dégradé existant reprend la main : un canevas noir sous une interface
        claire n'aurait aucun sens.
        Réglages retenus : teinte violette (marque HearMe) · mouvement lent ·
        luminosité basse → un halo ambiant discret et rassurant, pas un show
        lumineux. La lisibilité de la carte de connexion reste prioritaire.
      */}
      {theme === 'dark' && (
        <ShaderBackground
          tint={[0.49, 0.36, 1.0]}
          brightness={0.42}
          speed={0.5}
          lineWidth={0.0018}
        />
      )}
      {/* Voile sombre au-dessus du fond animé : garantit la lisibilité du texte
         clair par-dessus les bandes lumineuses du shader (sinon texte clair sur
         halo clair = illisible). Le contenu (z-10) reste au-dessus du voile. */}
      {theme === 'dark' && (
        <div
          className="fixed inset-0 z-[1] pointer-events-none"
          style={{
            background:
              'radial-gradient(130% 100% at 50% 0%, rgba(5,5,8,0.35), rgba(5,5,8,0.74) 55%, rgba(5,5,8,0.92) 100%)',
          }}
        />
      )}

    <div className="relative min-h-screen z-10 flex flex-col justify-between px-4 sm:px-6 py-6 sm:py-10">
      <HCaptcha ref={captchaRef} sitekey={HCAPTCHA_SITE_KEY} size="invisible" />
      {/* Top Bar with Logo & Theme Toggle */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <HearMeLogo
            variant="horizontal"
            size="md"
            theme={theme === 'dark' ? 'white' : 'dark'}
            animatedLight={true}
            showSubtitle={true}
            intro={true}
          />
        </div>
        <LanguageSwitcher />
      </header>

      {/* Main Content: Hero & Auth Grid */}
      <main className="max-w-6xl w-full mx-auto my-auto py-8 sm:py-12 grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Side: Concept & Value Proposition */}
        <section className="lg:col-span-6 space-y-6">
          {/* Surtitre : filets fins + petites capitales espacées */}
          <div
            className={`inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.28em] ${
              theme === 'dark' ? 'text-white/45' : 'text-slate-500'
            }`}
          >
            <span
              className={`h-px w-7 ${theme === 'dark' ? 'bg-white/20' : 'bg-slate-300'}`}
              aria-hidden="true"
            />
            {t('wa.kicker')}
          </div>

          <div className="space-y-4">
            <h1
              className="font-semibold tracking-[-0.045em] leading-[0.98] text-balance
                         text-4xl sm:text-5xl lg:text-[3.6rem]"
            >
              <span className={theme === 'dark' ? 'text-white' : 'text-slate-950'}>
                {t('wa.h1a')}{' '}
              </span>
              <span className={theme === 'dark' ? 'hm-gradient-text' : 'hm-gradient-text-light'}>
                {t('wa.h1b')}
              </span>
            </h1>
            <p
              className={`text-sm sm:text-base font-light leading-relaxed max-w-xl ${
                theme === 'dark' ? 'text-white/70' : 'text-slate-600'
              }`}
            >
              {t('wa.lead')}
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
                  {t('wa.f1t')}
                </h2>
              </div>
              <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                {t('wa.f1d')}
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
                  {t('wa.f2t')}
                </h2>
              </div>
              <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                {t('wa.f2d')}
              </p>
            </div>

            <div className={`p-3.5 rounded-2xl border transition-all ${
              theme === 'dark'
                ? 'bg-white/[0.03] border-white/[0.08] hover:border-indigo-500/30'
                : 'bg-white/80 border-slate-200 hover:border-indigo-300 shadow-sm'
            }`}>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-7 h-7 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <h2 className={`font-bold text-xs ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  {t('wa.f3t')}
                </h2>
              </div>
              <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                {t('wa.f3d')}
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
                  {t('wa.f4t')}
                </h2>
              </div>
              <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                {t('wa.f4d')}
              </p>
            </div>
          </div>

          {/* Social Proof & Guarantee badge */}
          <div className="flex items-center gap-4 pt-1 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>{t('wa.b1')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>{t('wa.b2')}</span>
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
                <span>{t('wa.tabKey')}</span>
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
                <span>{t('wa.tabRegister')}</span>
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
                <span>{t('wa.tabLogin')}</span>
              </button>
            </div>

            {/* TAB 1: QUICK SECRET KEY ACCESS */}
            {activeTab === 'secret' && (
              <form onSubmit={handleSecretSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black uppercase tracking-wider text-white">
                      {t('wa.keyTitle')}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {t('wa.keyBadge')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {t('wa.keyIntro')}
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 font-semibold mb-1.5">
                    {t('wa.keyLabel')}
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      value={quickSecretKey}
                      onChange={(e) => setQuickSecretKey(e.target.value)}
                      placeholder="K7QM2XPA9RTD"
                      dir="ltr"
                      autoComplete="off"
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-10 pr-4 py-3 text-xs font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:border-white/40 tracking-wider uppercase"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    <span>{t('wa.keyHelp')}</span>
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
                  <span>{t('wa.keySubmit')}</span>
                </button>

                <div className="pt-2 border-t border-white/[0.08] text-center">
                  <button
                    type="button"
                    onClick={() => setActiveTab('register')}
                    className="text-xs text-slate-400 hover:text-white transition inline-flex items-center gap-1"
                  >
                    <span>{t('wa.noDevice')}</span>
                    <strong className="text-white underline">{t('wa.createAccount')}</strong>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: DETAILED REGISTRATION FORM */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">
                    {t('wa.regTitle')}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('wa.regIntro')}
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-300 font-semibold mb-1">{t('wa.regName')}</label>
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder={t('wa.regNamePh')}
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-300 font-semibold mb-1">{t('wa.regDevice')}</label>
                    <div className="relative">
                      <Smartphone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={regDeviceName}
                        onChange={(e) => setRegDeviceName(e.target.value)}
                        placeholder={t('wa.regDevicePh')}
                        className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">{t('wa.email')}</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder={t('wa.emailPh')}
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">{t('wa.password')}</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder={t('wa.passwordPh')}
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                      aria-label={t('wa.showPassword')}
                      aria-pressed={showPassword}
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
                        {passwordStrength <= 1 && t('wa.strength1')}
                        {passwordStrength === 2 && t('wa.strength2')}
                        {passwordStrength === 3 && t('wa.strength3')}
                        {passwordStrength >= 4 && t('wa.strength4')}
                      </span>
                    </div>
                  )}
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
                    {t('wa.consentA')}{' '}
                    <button type="button" onClick={onOpenPrivacy} className="underline text-slate-200 hover:text-white">
                      {t('wa.consentB')}
                    </button>.
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
                  <span>{t('wa.regSubmit')}</span>
                </button>
              </form>
            )}

            {/* TAB 3: LOGIN FORM */}
            {activeTab === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-white">
                    {t('wa.loginTitle')}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('wa.loginIntro')}
                  </p>
                </div>

                {infoMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{infoMsg}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">{t('wa.email')}</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder={t('wa.emailPh')}
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">{t('wa.password')}</label>
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
                  <span>{t('wa.loginSubmit')}</span>
                </button>

                <div className="relative flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{t('wa.orPin')}</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                    {t('wa.pinLabel')}
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      inputMode="numeric"
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder={t('wa.pinPh')}
                      className="w-full rounded-xl bg-white/[0.05] border border-white/[0.1] pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/40 tracking-[0.3em]"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePinLogin}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-white/10 border border-white/15 text-white font-bold text-xs hover:bg-white/15 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  <Lock className="w-4 h-4" />
                  <span>{t('wa.pinSubmit')}</span>
                </button>

                <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={() => setActiveTab('secret')}
                    className="hover:text-white transition"
                  >
                    {t('wa.forgot')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('register')}
                    className="text-white underline font-bold"
                  >
                    {t('wa.createAccount')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* Subtle Footer Information */}
      <footer className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{t('wa.footer')}</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onOpenPrivacy}
            className="hover:text-slate-300 transition underline cursor-pointer"
          >
            {t('common.privacyPolicy')}
          </button>
        </div>
      </footer>
    </div>
    </>
  );
};
