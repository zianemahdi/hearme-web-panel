# Sauvegarde de la base HearMe

Une copie **chiffrée** de la base Supabase est faite **chaque lundi à 02:17 UTC** par
`.github/workflows/backup.yml`. L'offre gratuite de Supabase ne fait aucune sauvegarde
automatique : sans cette copie, une erreur ou une suppression serait définitive.

- Ce dépôt est **public** : la copie n'est jamais enregistrée dans le dépôt. Elle est
  chiffrée (GPG, AES-256) puis rangée comme « artifact » du run, illisible sans la phrase.
- GitHub efface chaque copie après **28 jours** : on a donc toujours les 4 dernières semaines.
  Ce délai est écrit dans la politique de confidentialité (comptes supprimés : plus aucune
  trace sous 30 jours) ; ne pas l'allonger sans la mettre à jour.

## Mise en place (une seule fois)

Dans GitHub : **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Valeur |
| --- | --- |
| `SUPABASE_DB_URL` | Supabase → bouton **Connect** → **Session pooler** → l'adresse `postgresql://…`, avec le mot de passe de la base à la place de `[YOUR-PASSWORD]` |
| `BACKUP_PASSPHRASE` | Une phrase de chiffrement de 20 caractères au moins, **gardée aussi hors de GitHub** (gestionnaire de mots de passe ou papier rangé). Perdue = copies illisibles. |

Puis **Actions → Sauvegarde de la base (chiffrée) → Run workflow** pour un premier essai.
Le journal affiche seulement des compteurs (nombre de tables), jamais de données.

## Récupérer une copie

1. **Actions → Sauvegarde de la base (chiffrée)** → le run voulu → **Artifacts** → télécharger
   `hearme-db-AAAA-MM-JJ` (un `.zip` qui contient `hearme-db-AAAA-MM-JJ.tar.gz.gpg`).
2. Déchiffrer (la phrase `BACKUP_PASSPHRASE` est demandée) puis ouvrir l'archive :

   ```bash
   gpg -o hearme-db.tar.gz -d hearme-db-AAAA-MM-JJ.tar.gz.gpg
   tar -xzf hearme-db.tar.gz
   ```

   On obtient `roles.sql`, `schema.sql` et `data.sql`.

## Restaurer

De préférence dans un **projet Supabase neuf** (jamais par-dessus la base en service sans
savoir exactement ce qu'on écrase). Commande de la documentation Supabase, avec la chaîne
**Session pooler** du projet de destination :

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "postgresql://…"
```

## Ce que la copie ne contient pas

- Les **fichiers** du stockage (photos de sécurité, gardées 30 jours au plus) : seule leur liste est dans la base.
- Les **secrets** des Edge Functions (SMTP, Telegram) et les réglages **Auth** (modèles d'e-mail, SMTP, Google) : à refaire dans le tableau de bord.
- Le code des Edge Functions et les migrations : ils sont déjà dans ce dépôt (`supabase/`).
