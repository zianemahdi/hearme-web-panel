import React, { useState } from 'react';
import { Settings, Database, Key, Save, RotateCcw, X, CheckCircle2, ShieldAlert } from 'lucide-react';
import { getStoredConfig, saveStoredConfig } from '../utils/supabaseClient';
import { DEFAULT_SUPABASE_CONFIG } from '../utils/mockData';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onConfigSaved }) => {
  const current = getStoredConfig();
  const [url, setUrl] = useState(current.url);
  const [anonKey, setAnonKey] = useState(current.anonKey);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveStoredConfig(url.trim(), anonKey.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onConfigSaved();
      onClose();
    }, 1200);
  };

  const handleResetDefault = () => {
    setUrl(DEFAULT_SUPABASE_CONFIG.url);
    setAnonKey(DEFAULT_SUPABASE_CONFIG.anonKey);
    saveStoredConfig(DEFAULT_SUPABASE_CONFIG.url, DEFAULT_SUPABASE_CONFIG.anonKey);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onConfigSaved();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05050a]/90 backdrop-blur-xl">
      <div className="w-full max-w-lg rounded-3xl hm-card-pro p-7 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Connexion Backend Supabase</h3>
              <p className="text-xs text-slate-400">Paramètres API & Base de données en temps réel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">URL du projet Supabase</label>
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-purple-500/80"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Clé Publique Anonyme (Anon Key)</label>
            <textarea
              rows={3}
              required
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1Ni..."
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 font-mono break-all focus:outline-none focus:border-purple-500/80"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Cette clé publique est sécurisée par les politiques de sécurité (RLS) PostgreSQL de votre instance.
            </p>
          </div>

          {savedSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Paramètres enregistrés avec succès !</span>
            </div>
          )}

          <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetDefault}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Valeurs par défaut</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-white/[0.08] text-xs font-semibold text-slate-300 hover:bg-white/[0.05] transition"
              >
                Fermer
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110 text-white font-bold text-xs transition shadow-lg shadow-purple-950/40 active:scale-95"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Enregistrer</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
