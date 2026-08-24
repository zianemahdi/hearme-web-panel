# Journal des changements — HearMe (panneau web + app)

## 2026‑08‑21 — Grande session (auth, migration React, sécurité, CAPTCHA)

### 🔐 Authentification & comptes (app + panneau)
- **App** : `LoginActivity` transformée en **vraie inscription / connexion Supabase**
  (e‑mail + mot de passe) via `SupabaseAuth` (REST GoTrue) ; session stockée chiffrée
  (`SecurePrefs`). **Rattachement automatique** de l'appareil au compte
  (`AccountLinker` → `claim_device_by_secret`) : le panneau voit l'appareil **sans clé**.
- **Correctif « Invalid API key »** : la `SUPABASE_ANON_KEY` de `local.properties`
  contenait **3 espaces parasites** au milieu du JWT (211 → 208 car.) → cassait auth
  ET REST. Nettoyée et vérifiée (HTTP 200).
- **Confirmation e‑mail** : page **`confirm.html`** à la marque HearMe (au lieu de la
  page Supabase/localhost par défaut) ; Site URL Supabase pointée dessus.
- Création de compte **vérifiée** de bout en bout (signup → e‑mail → connexion).

### ⚛️ Migration du panneau vers React (app AI Studio)
- Remplacement de l'ancien panneau statique par une **app React 19 + Vite + Tailwind v4**
  (dans `webapp/`), branchée au **même** projet Supabase et aux mêmes RPC.
- **CI/CD** : `.github/workflows/deploy.yml` (build Vite → GitHub Pages via **GitHub Actions**).
- Correctifs de câblage : `base` Vite, `detectSessionInUrl`, `panel_get_device` lu comme
  tableau + vrais noms de champs, `panel_send_command` / `rotate_secret` params, résolution
  de l'appareil en mode compte. Dépendance Gemini inutile retirée.
- **`privacy.html`** (URL Play Store) et **`confirm.html`** conservés dans `webapp/public/`.

### 🧹 Nettoyage (honnêteté du panneau)
- Retiré les **modules démo/non branchés** : galerie photos (fictive), carte vocale,
  simulateur d'appareil, modal « config Supabase », téléphone 3D.
- Retiré les **fausses valeurs** : autonomie/santé/T° batterie, Mbps/latence/IP réseau,
  cap/vitesse/« satellites » de la carte, jargon « radar tactique », bouton « écoute audio ».
- **Fond 3D** (Three.js) supprimé, **sirène muette** côté navigateur (le bouton envoie juste
  la commande), **texte gris → blanc** (mode sombre).
- **Liens Wix « site officiel »** retirés partout (barre + pieds de page) ; réseaux sociaux
  et liens légaux trompeurs retirés du pied de page ; politique de confidentialité (modal)
  corrigée (retrait du surclaim « chiffré de bout en bout », ajout du mode compte).
- **Vue mobile** corrigée (barre du haut qui débordait). **Carte** en **Satellite** par
  défaut (comme l'app).

### 🚀 Déploiement
- Débloqué le blocage **GitHub Pages** : Source basculée sur **« GitHub Actions »**
  (servait l'ancien statique) + redéploiement.

### 🛡️ Durcissement sécurité
- **Audit** : la clé anon publique **ne peut PAS** lire les tables (401) — modèle sain.
- **Mode clé** : validation serveur → une clé au hasard est **refusée** (avant, n'importe
  quelle clé entrait).
- **Clés à 12 caractères** (au lieu de 6/8) dans l'app.
- **Anti‑force‑brute** (`05_panel_security.sql`) : blocage après 15 clés **invalides** /
  10 min / IP (le polling clé valide n'est jamais limité). **Vérifié** (16ᵉ essai → HTTP 400).
- **`04_panel_grants.sql`** : GRANT tables au rôle `authenticated` (corrige
  « permission denied for table devices » du mode compte).

### 💬 Telegram
- Clé envoyée au **contact de confiance** en **`<code>` (monospace)** → dans Telegram,
  **appuyer sur la clé la copie** (juste la clé, pas tout le message) ; `sendMessage`
  gagne `parseMode=HTML`.
- « Regenerate key » fait maintenant une **rotation côté serveur** (garde le lien au compte,
  pas de doublon).

### 🤖 CAPTCHA anti‑abus (hCaptcha) — panneau + app
- **Panneau** : `@hcaptcha/react-hcaptcha` invisible sur inscription/connexion → jeton
  passé à Supabase.
- **App** : SDK natif `com.github.hCaptcha.hcaptcha-android-sdk:sdk:5.0.1` (JitPack) ;
  `SupabaseAuth` ajoute `gotrue_meta_security.captcha_token` ; `LoginActivity.runCaptcha{}`.
- **Activé** dans Supabase (Auth → Attack Protection → hCaptcha + Secret Key) et **vérifié
  en live** (le panneau valide le captcha de bout en bout).
- ℹ️ Essai **Pro** hCaptcha 14 j (mode 99.9% passif) → repasse en **gratuit** ensuite ;
  le CAPTCHA reste **gratuit à vie** (parfois une case à cocher). Ne pas s'abonner.

### 🧾 Rappels
- Tout le stack est **gratuit** : GitHub Pages, Supabase (free), hCaptcha (free), Telegram.
  Seul bémol : un projet Supabase gratuit se **met en pause après ~1 semaine sans activité**
  (bouton « Restore »).
- L'app doit être **rebuildée** (Android Studio) pour embarquer : clés 12 car., captcha,
  clé copiable Telegram.
