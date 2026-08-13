/* =========================================================================
 * HearMe — Panneau Web d'urgence : configuration
 * -------------------------------------------------------------------------
 * La clé "anon" est PUBLIQUE par conception (comme dans l'APK). La sécurité
 * repose entièrement sur le Row Level Security (RLS) + les fonctions RPC
 * "SECURITY DEFINER" définies dans /supabase/*.sql. Ne mettez JAMAIS ici la
 * clé "service_role" ni le token Telegram.
 * ========================================================================= */
window.HM = window.HM || {};

HM.config = {
  // --- Supabase (projet HearMe) ---------------------------------------------
  SUPABASE_URL: "https://muggtgcwmawcpmzjrvxo.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11Z2d0Z2N3bWF3Y3BtempydnhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNzc2MTgsImV4cCI6MjEwMTk1MzYxOH0.kDjrNHNLLE5c9mMRFG_fOZpzIzD6JfYjbDkZsWhGVEA",

  // --- Edge Function (optionnelle) pour les photos en mode "clé secrète" -----
  // Déployez supabase/functions/device-photos pour activer la galerie sans
  // connexion. En mode "compte", les URLs signées sont générées côté client.
  PHOTOS_FUNCTION: "device-photos",

  // --- Rafraîchissement en mode "clé secrète" (pas de Realtime pour l'anon) --
  POLL_INTERVAL_MS: 8000,

  // --- Carte (Alger par défaut, comme l'app Android) ------------------------
  MAP: {
    defaultCenter: [3.05, 36.75], // [lon, lat]
    defaultZoom: 12,
    maxLocationsPath: 40,         // nb de points d'historique tracés
  },

  // Considéré "en ligne" si vu il y a moins de N secondes.
  ONLINE_WINDOW_S: 150,
};
