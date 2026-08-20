import React from 'react';
import { X, Shield, Lock, FileText, CheckCircle2, Globe, Heart } from 'lucide-react';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05050a]/90 backdrop-blur-xl overflow-y-auto">
      <div className="relative w-full max-w-3xl my-8 rounded-3xl hm-card-pro p-7 sm:p-9 shadow-2xl space-y-6 text-slate-300">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                <span className="hm-gradient-text">HearMe</span> — Politique de confidentialité
              </h2>
              <p className="text-xs text-slate-400">Conformité RGPD & Google Play Store</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-5 text-xs sm:text-sm leading-relaxed">
          <div className="p-4 rounded-2xl bg-purple-950/25 border border-purple-500/30 text-purple-200">
            <strong className="text-white block mb-1">En bref & Engagement de transparence :</strong>
            HearMe traite vos données en priorité <strong>localement sur votre mobile</strong>. Le micro et les capteurs ne quittent jamais votre téléphone sans votre autorisation expresse. Le panneau web d'urgence est un outil sécurisé chiffré de bout en bout pour vous permettre de retrouver votre mobile volé ou égaré.
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <span className="text-purple-400">1.</span> Données traitées par l'application HearMe
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li><strong>Microphone (Mot-clé vocal) :</strong> La détection du mot-clé se fait à 100% sur l'appareil. Aucun flux audio continu n'est conservé ni transmis sur le cloud.</li>
              <li><strong>Géolocalisation GPS :</strong> Utilisée exclusivement pour le module antivol et le traçage sur carte en direct.</li>
              <li><strong>Caméra frontale (Sécurité) :</strong> En cas de mauvais code PIN répété ou de commande distante, un cliché d'urgence est capturé pour identifier le ravisseur.</li>
              <li><strong>Signalement communautaire anonyme :</strong> Carte préventive des zones à risque sans conservation d'IP ni d'identifiant personnel.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <span className="text-purple-400">2.</span> Panneau web d'urgence & Sécurité Cloud
            </h3>
            <p className="text-slate-400">
              Les communications entre l'application mobile et le panneau web reposent sur des fonctions RPC sécurisées (PostgreSQL RLS / Row Level Security). La clé secrète ne donne accès qu'au terminal associé.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <span className="text-purple-400">3.</span> Vos droits (Suppression & RGPD)
            </h3>
            <p className="text-slate-400">
              Vous pouvez à tout moment purger l'intégralité de votre historique de positions, vos clichés de sécurité et supprimer votre compte ou révoquer votre clé secrète.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">HearMe Antivol &bull; v2.4</span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110 text-white font-bold text-xs transition shadow-lg shadow-purple-950/40 active:scale-95"
          >
            J'ai compris
          </button>
        </div>
      </div>
    </div>
  );
};
