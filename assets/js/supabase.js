/* =========================================================================
 * HearMe — Initialisation du client Supabase (UMD global "supabase")
 * Charge après config.js et après le <script> supabase-js du CDN.
 * ========================================================================= */
window.HM = window.HM || {};

(function () {
  const cfg = HM.config || {};
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("[HearMe] SDK Supabase introuvable. Vérifiez le <script> du CDN.");
    return;
  }
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("VOTRE_")) {
    console.warn("[HearMe] SUPABASE_URL non configurée dans assets/js/config.js.");
  }

  // Client partagé pour toute l'app (auth + REST + Realtime + Storage).
  HM.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "hearme-panel-auth",
    },
  });
})();
