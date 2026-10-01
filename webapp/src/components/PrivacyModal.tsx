import React from 'react';
import { X, Shield } from 'lucide-react';

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
            Aucune publicité, aucune revente de données. Votre position n'est envoyée qu'en mode volé, perdu ou recherche. Le panneau web d'urgence est chiffré en transit (TLS) et cloisonné par compte ; il sert uniquement à retrouver votre propre téléphone.
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <span className="text-purple-400">1.</span> Données traitées par l'application HearMe
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li><strong>Microphone (mot-clé vocal) :</strong> l'écoute passe par la reconnaissance vocale d'Android, qui peut traiter l'audio sur les serveurs de son fournisseur (en général Google). HearMe n'enregistre ni n'envoie l'audio.</li>
              <li><strong>Géolocalisation GPS :</strong> envoyée uniquement en mode volé, perdu ou recherche, ou sur votre commande « Localiser ».</li>
              <li><strong>Caméra frontale (sécurité) :</strong> après un déverrouillage raté ou sur votre commande en mode alerte, une photo est envoyée sur votre Telegram, sans être conservée sur nos serveurs.</li>
              <li><strong>Signalement communautaire anonyme :</strong> Carte préventive des zones à risque sans conservation d'IP ni d'identifiant personnel.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <span className="text-purple-400">2.</span> Panneau web d'urgence & Sécurité Cloud
            </h3>
            <p className="text-slate-400">
              L'accès au panneau se fait de deux façons : par un <strong>compte (e-mail + mot de passe)</strong>, qui ne voit que vos propres appareils grâce au cloisonnement RLS (Row Level Security) ; ou par la <strong>clé secrète</strong> de l'appareil, qui ne donne accès qu'au terminal associé. Les échanges sont chiffrés en transit (TLS) et vos données ne sont ni vendues ni partagées.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <span className="text-purple-400">3.</span> Vos droits (Suppression & RGPD)
            </h3>
            <p className="text-slate-400">
              Vous pouvez supprimer votre compte et toutes vos données depuis l'app (Réglages → Compte → Supprimer mon compte) ou par e-mail. Détails dans la <a href="privacy.html" className="text-purple-300 underline">politique de confidentialité complète</a>.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">HearMe Antivol &bull; v2.5</span>
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
