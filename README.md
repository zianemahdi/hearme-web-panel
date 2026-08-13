# HearMe — Panneau Web d'urgence

Interface web d'urgence pour l'app **HearMe** : localisez votre téléphone en
temps réel, consultez les photos de sécurité, verrouillez / faites sonner
l'appareil à distance, et retrouvez votre clé secrète — depuis n'importe quel
navigateur.

- **Zéro build** : HTML + Tailwind (CDN) + `@supabase/supabase-js` + MapLibre.
- **Hébergeable** sur GitHub Pages ou Vercel (fichiers statiques).
- **Deux accès** : compte (e-mail + mot de passe) ou **clé secrète** (accès rapide).

> ⚠️ **Important — intégration app requise.** Le panneau lit/écrit de nouvelles
> tables Supabase que **l'app Android ne remplit pas encore**. Voir
> [§6 Intégration côté app](#6-intégration-côté-app-android). Tant que l'app ne
> pousse pas ses données, le tableau de bord s'affiche mais reste vide.

---

## 1. Fonctionnalités ↔ implémentation

| Demande | Où |
|---|---|
| Connexion e-mail + mot de passe (Supabase Auth) | `assets/js/auth.js` |
| Accès rapide par clé secrète | `auth.js` + RPC `panel_get_device` |
| Carte temps réel (MapLibre + Realtime) | `map.js`, `dashboard.js`, `api.js#startLive` |
| Galerie photos (Storage privé) | `api.js#getPhotos` + Edge Function `device-photos` |
| Batterie / réseau / verrouillage | `dashboard.js#renderDevice` |
| Affichage & régénération de la clé | carte « Clé secrète » du dashboard |
| Alarme / verrouillage à distance | `panel_send_command` → table `device_commands` |
| Page `/privacy` (Google Play) | `privacy.html` |

---

## 2. Structure

```
hearme-web-panel/
├── index.html            # Connexion (compte + clé secrète)
├── dashboard.html        # Tableau de bord d'urgence
├── privacy.html          # Politique de confidentialité (/privacy)
├── assets/
│   ├── css/app.css
│   └── js/
│       ├── config.js       # URL + clé anon Supabase (publique)
│       ├── supabase.js     # init client
│       ├── session.js      # modes d'accès + utilitaires
│       ├── api.js          # couche données (auth vs clé)
│       ├── map.js          # MapLibre (satellite/plan)
│       ├── auth.js         # logique de connexion
│       └── dashboard.js    # logique du tableau de bord
├── supabase/
│   ├── 01_panel_schema.sql       # tables + RLS + Realtime
│   ├── 02_panel_functions.sql    # fonctions RPC
│   ├── 03_panel_storage.sql      # bucket privé + policy
│   └── functions/device-photos/  # Edge Function (URLs signées + upload)
├── vercel.json           # cleanUrls (/privacy, /dashboard)
└── .nojekyll             # GitHub Pages
```

---

## 3. Configuration

`assets/js/config.js` est déjà pré-rempli avec **votre** projet Supabase
(`muggtgcwmawcpmzjrvxo`) et la clé **anon**. Cette clé est **publique par
conception** (elle est déjà dans l'APK) ; la sécurité repose sur le RLS et les
fonctions RPC. **Ne mettez jamais** ici la clé `service_role` ni le token Telegram.

---

## 4. Backend Supabase (≈ 5 min)

Sur le **même** projet que le Module 3, dans **SQL Editor**, exécutez dans l'ordre :

1. `supabase/01_panel_schema.sql`
2. `supabase/02_panel_functions.sql`
3. `supabase/03_panel_storage.sql`

Puis déployez l'Edge Function (galerie en mode clé secrète + uploads) :

```bash
supabase functions deploy device-photos --no-verify-jwt
```

> Le Realtime (positions live en mode compte) est activé par le bloc
> `alter publication supabase_realtime …` de `01_panel_schema.sql`.

---

## 5. Déploiement

### GitHub Pages
```bash
cd hearme-web-panel
git init && git add . && git commit -m "HearMe web panel"
git branch -M main
git remote add origin https://github.com/<vous>/hearme-web-panel.git
git push -u origin main
```
Puis **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
URL : `https://<vous>.github.io/hearme-web-panel/` — la politique est à
`…/privacy.html`.

### Vercel
Importez le repo (ou `vercel` en CLI). Aucune commande de build. Grâce à
`vercel.json` (`cleanUrls`), la politique est servie proprement sur **`/privacy`**.

---

## 6. Intégration côté app (Android)

Le panneau attend que l'app **HearMe** alimente Supabase avec sa **clé secrète**
(le `command_secret` existant). Toutes les fonctions sont appelables comme
`CommunityReporter` le fait déjà (POST `…/rest/v1/rpc/<fn>` avec la clé anon).

**À ajouter dans l'app :**

| Quand | Appel RPC |
|---|---|
| Périodiquement / au démarrage | `push_device_state(p_secret, p_name, p_battery, p_network, p_locked)` |
| À chaque position | `push_location(p_secret, p_lat, p_lon, p_accuracy, p_battery)` |
| Boucle de commandes (toutes 5–15 s) | `poll_commands(p_secret)` → exécuter → `ack_command(p_secret, id, ok)` |
| Après capture photo | upload via Edge Function `device-photos` (`action:"upload"`) **ou** `record_photo(p_secret, path, event)` |
| Sur commande `regenerate_key` | générer une nouvelle clé locale puis `rotate_secret(ancienne, nouvelle)` |

Les commandes `poll_commands` (`lock`, `alarm`, `stopalarm`, `locate`, `photo`)
correspondent exactement à ce que gère déjà `AntiTheftService.executeCommand`
pour Telegram — il suffit de router la file Supabase vers le même dispatcher.

**Exemple (Kotlin, style `CommunityReporter`) :**
```kotlin
fun pushLocation(lat: Double, lon: Double, acc: Float?, battery: Int?) {
    val url = URL("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/push_location")
    (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
        setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
        setRequestProperty("Content-Type", "application/json")
        doOutput = true
        val body = JSONObject().apply {
            put("p_secret", commandSecret)   // = clé secrète Telegram
            put("p_lat", lat); put("p_lon", lon)
            put("p_accuracy", acc); put("p_battery", battery)
        }
        outputStream.use { it.write(body.toString().toByteArray()) }
        responseCode   // 204 attendu
    }
}
```

---

## 7. Modèle d'accès & sécurité

- **Mode compte** : RLS via `auth.uid()` — un compte ne voit **que** ses
  appareils. Positions live par **Realtime**. Photos par **URL signée** (client).
- **Mode clé secrète** : uniquement les fonctions `panel_*` / `push_*` /
  `poll_*`, chacune cloisonnée à l'appareil de la clé. Rafraîchissement par
  **polling** (`config.POLL_INTERVAL_MS`). Photos via l'**Edge Function**.
- L'anon **n'a aucun accès direct** aux tables (aucune policy anon).
- La clé `service_role` n'est utilisée **que** dans l'Edge Function
  (variable d'environnement injectée par Supabase), jamais côté navigateur.

**⚠️ À durcir avant un usage large :**
1. **Longueur de la clé secrète.** L'accès par clé n'est aussi fort que la clé.
   Le `command_secret` actuel est court → **passez-le à ≥ 12 caractères**
   aléatoires pour résister au brute-force.
2. **Rate-limiting** sur les fonctions `panel_*` (essais par IP/clé) via une
   Edge Function ou un WAF (Cloudflare), comme pour `report_incident`.
3. **Confirmation e-mail** activée dans Supabase Auth (Settings → Auth).

---

## 8. Test en local

Les scripts sont des `<script>` classiques (pas d'ES modules) : un simple
serveur statique suffit.
```bash
npx serve .
# ou : python -m http.server 8080
```
Puis ouvrez `http://localhost:8080`.

---

## 9. Reste à faire

- [ ] Brancher l'app Android sur les RPC ci-dessus (§6).
- [ ] Rallonger le `command_secret` (≥ 12 car.).
- [ ] Faire relire `privacy.html` par un juriste ; renseigner le responsable de traitement.
- [ ] (Option) rate-limiting sur `panel_*`.
