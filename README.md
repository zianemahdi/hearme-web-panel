# HearMe — Panneau Web d'urgence

Interface web d'urgence pour l'app **HearMe** : localise ton téléphone en temps
réel (carte satellite), verrouille / fais sonner l'appareil à distance, gère ta
clé secrète — depuis n'importe quel navigateur.

🔗 **En ligne : https://zianemahdi.github.io/hearme-web-panel/**

> **Note d'architecture (2026‑08).** Le panneau est désormais une **app React
> (Vite + TypeScript)** dans `webapp/`, déployée automatiquement par **GitHub
> Actions**. L'ancien panneau statique (HTML/JS à la racine du dépôt) est
> conservé mais **n'est plus servi** (on peut le supprimer un jour).

---

## 1. Pile technique

| Couche | Techno |
|---|---|
| Front | **React 19 + Vite 6 + TypeScript + Tailwind v4** (`webapp/`) |
| Carte | **Leaflet** — fond **Satellite (Esri World Imagery)** par défaut, comme l'app |
| Backend | **Supabase** (Postgres + Auth + RLS + Storage) |
| Anti‑bot | **hCaptcha** (`@hcaptcha/react-hcaptcha`, invisible) |
| Hébergement | **GitHub Pages** via **GitHub Actions** (build Vite → `dist/`) |

---

## 2. Deux modes d'accès

- **Compte (e‑mail + mot de passe)** — Supabase Auth + **RLS** : un compte ne voit
  que **ses** appareils. Protégé par **hCaptcha** + **confirmation e‑mail**
  (atterrit sur `confirm.html`, page HearMe). L'appareil est **rattaché
  automatiquement** au compte depuis l'app (pas besoin de saisir la clé).
- **Clé secrète** — accès rapide sans compte. La clé est **validée côté serveur**
  (RPC `panel_get_device`) : une clé au hasard est **refusée**. Protégé par un
  **anti‑force‑brute** (voir §5).

---

## 3. Structure

```
hearme-web-panel/
├── webapp/                       # ★ l'app React servie en prod
│   ├── index.html                # entrée Vite (SPA)
│   ├── vite.config.ts            # base: '/hearme-web-panel/'
│   ├── package.json
│   ├── public/
│   │   ├── privacy.html          # politique (URL Play Store) — servie telle quelle
│   │   ├── confirm.html          # page de confirmation e‑mail (marque HearMe)
│   │   └── assets/css/app.css
│   └── src/
│       ├── App.tsx               # état + grille bento + synchro live
│       ├── components/           # LiveMap, EmergencyControls, Battery/Network,
│       │                         #   SecretKeyCard, QuickProtectionBar, Navbar,
│       │                         #   WelcomeAuthPortal (auth + hCaptcha), PrivacyModal, SiteFooter
│       └── utils/                # supabaseClient.ts, mockData.ts (config Supabase), audio.ts
├── supabase/                     # SQL à exécuter dans Supabase → SQL Editor
│   ├── 01_panel_schema.sql       # tables + RLS + Realtime
│   ├── 02_panel_functions.sql    # fonctions RPC SECURITY DEFINER
│   ├── 03_panel_storage.sql      # bucket privé photos
│   ├── 04_panel_grants.sql       # GRANT tables → rôle authenticated (mode compte)
│   └── 05_panel_security.sql     # anti‑force‑brute (rate limit sur clés invalides)
├── .github/workflows/deploy.yml  # build + déploiement Pages
└── (racine)  index.html, dashboard.html, assets/…  # ANCIEN panneau statique (non servi)
```

---

## 4. Configuration

- **Supabase** : URL + clé **anon** codées dans `webapp/src/utils/mockData.ts`
  (`DEFAULT_SUPABASE_CONFIG`). La clé anon est **publique par conception** (elle est
  aussi dans l'APK) ; la sécurité repose sur RLS + RPC + rate‑limit + captcha.
- **hCaptcha** : constante `HCAPTCHA_SITE_KEY` dans
  `webapp/src/components/WelcomeAuthPortal.tsx` (Site Key **publique**).
- ⚠️ **Ne mets jamais** ici la clé `service_role` ni le token Telegram.

---

## 5. Backend Supabase (SQL Editor, dans l'ordre)

```
01_panel_schema.sql   → tables devices / device_locations / security_photos / device_commands + RLS + Realtime
02_panel_functions.sql→ RPC : push_device_state, push_location, poll_commands, ack_command,
                        panel_get_device, panel_get_locations, panel_send_command,
                        claim_device_by_secret, rotate_secret, …
04_panel_grants.sql   → GRANT select/insert/update/delete aux tables pour 'authenticated'
                        (INDISPENSABLE au mode compte : une policy RLS filtre un droit, elle ne l'accorde pas)
05_panel_security.sql → table panel_rate_limit + panel_rl_check() ; panel_get_device réécrit
                        pour bloquer après 15 clés INVALIDES / 10 min / IP (le polling clé valide n'est jamais limité)
03_panel_storage.sql  → bucket privé 'security-photos' (galerie = V2)
```

**CAPTCHA (Supabase dashboard)** : Authentication → **Attack Protection** →
*Enable CAPTCHA protection* → **hCaptcha** → coller la **Secret Key** (`ES_…`) → Save.
⚠️ À activer **en dernier**, une fois le panneau redéployé ET l'app rebuildée avec
la vraie Site Key (le CAPTCHA est **global au projet** : il s'applique app + panneau).

---

## 6. Déploiement (GitHub Actions → Pages)

Le workflow `.github/workflows/deploy.yml` se déclenche à chaque push sous
`webapp/**` : `npm install --legacy-peer-deps` → `vite build` → publie
`webapp/dist` sur GitHub Pages.

**Réglage requis une fois** : repo → **Settings → Pages → Source = « GitHub
Actions »** (⚠️ pas « Deploy from a branch », sinon Pages sert l'ancien site
statique de la racine). Après un changement de Source, **relancer un déploiement**
(un simple push) pour publier.

URL : `https://zianemahdi.github.io/hearme-web-panel/`
Pages conservées : `…/privacy.html` (politique) et `…/confirm.html` (confirmation e‑mail).

---

## 7. Développement local

```bash
cd webapp
npm install --legacy-peer-deps
npm run dev        # http://localhost:3000
```

---

## 8. Modèle de sécurité

- **Anon = aucun accès direct aux tables** (vérifié : `GET /rest/v1/devices` → **401**).
  Tout passe par les fonctions `SECURITY DEFINER` (mode clé) ou par RLS (mode compte).
- **Mode compte** : RLS `user_id = auth.uid()` + **hCaptcha** + confirmation e‑mail.
- **Mode clé** : la clé est **validée** (RPC) et **rate‑limitée** contre le brute‑force.
- **Clés à 12 caractères** côté app (31¹² combinaisons) — voir l'app HearMe.
- La clé `service_role` n'est utilisée **que** dans l'Edge Function (jamais côté navigateur).

---

## 9. Intégration côté app (déjà faite)

L'app HearMe (`../HearMe`) alimente le backend et se rattache au compte :
- `SupabaseSync` : `push_device_state` / `push_location` / `poll_commands` / `ack_command`.
- `SupabaseAuth` + `LoginActivity` : inscription/connexion e‑mail (**+ hCaptcha**).
- `AccountLinker` : **rattachement auto** de l'appareil au compte (`claim_device_by_secret`).

---

## 10. Reste possible (non bloquant)
- [ ] Galerie photos réelle via Edge Function `device-photos` (aujourd'hui V2, non déployée).
- [ ] Supprimer les anciens fichiers statiques de la racine (non servis).
- [ ] Supprimer l'appareil de démo `HearMeDemo2026` de la table `devices`.

Voir [`CHANGELOG.md`](CHANGELOG.md) pour l'historique détaillé.
