/* =========================================================================
 * HearMe — Session & utilitaires
 * -------------------------------------------------------------------------
 * Deux modes d'accès :
 *   • "auth"   : connexion Supabase (email + mot de passe) → RLS via auth.uid()
 *   • "secret" : accès rapide par "Clé Secrète Telegram" → fonctions RPC
 * ========================================================================= */
window.HM = window.HM || {};

HM.session = (function () {
  const K = {
    mode: "hm_mode",         // 'auth' | 'secret'
    secret: "hm_secret",     // clé secrète (mode 'secret')
    deviceId: "hm_device_id",
    deviceName: "hm_device_name",
  };

  return {
    KEYS: K,
    getMode() { return localStorage.getItem(K.mode); },

    /** Ouvre une session "clé secrète". */
    setSecret(secret) {
      localStorage.setItem(K.mode, "secret");
      localStorage.setItem(K.secret, secret.trim());
    },
    getSecret() { return localStorage.getItem(K.secret) || ""; },

    /** Marque la session comme "compte connecté". */
    setAuth() {
      localStorage.setItem(K.mode, "auth");
      localStorage.removeItem(K.secret);
    },

    setDevice(id, name) {
      if (id) localStorage.setItem(K.deviceId, id);
      if (name) localStorage.setItem(K.deviceName, name);
    },
    getDeviceId() { return localStorage.getItem(K.deviceId) || null; },
    getDeviceName() { return localStorage.getItem(K.deviceName) || "Mon téléphone"; },

    /** Y a-t-il une session côté "compte" (JWT Supabase valide) ? */
    async hasAuthSession() {
      try {
        const { data } = await HM.sb.auth.getSession();
        return !!(data && data.session);
      } catch (_) { return false; }
    },

    /** Efface toute trace de session et déconnecte Supabase. */
    async clear() {
      try { await HM.sb.auth.signOut(); } catch (_) {}
      Object.values(K).forEach((k) => localStorage.removeItem(k));
    },

    /** Redirige vers la page de connexion si aucune session valide. */
    async requireOrRedirect(loginUrl) {
      const mode = this.getMode();
      if (mode === "secret" && this.getSecret()) return "secret";
      if (mode === "auth" && (await this.hasAuthSession())) return "auth";
      location.replace(loginUrl || "index.html");
      return null;
    },
  };
})();

/* --------------------------- petits utilitaires --------------------------- */
HM.util = {
  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  },

  /** "il y a 3 min" à partir d'un ISO / Date. */
  timeAgo(ts) {
    if (!ts) return "—";
    const d = (ts instanceof Date) ? ts : new Date(ts);
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 5) return "à l'instant";
    if (s < 60) return `il y a ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const j = Math.round(h / 24);
    return `il y a ${j} j`;
  },

  isOnline(lastSeen, windowS) {
    if (!lastSeen) return false;
    const age = (Date.now() - new Date(lastSeen).getTime()) / 1000;
    return age <= (windowS || 150);
  },

  async copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const t = document.createElement("textarea");
      t.value = text; document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(t); return ok;
    }
  },

  /** Notification éphémère. type: 'info' | 'success' | 'error'. */
  toast(msg, type) {
    let host = document.getElementById("hm-toasts");
    if (!host) {
      host = document.createElement("div");
      host.id = "hm-toasts";
      host.className = "fixed z-[999] bottom-4 right-4 flex flex-col gap-2 items-end";
      document.body.appendChild(host);
    }
    const colors = {
      success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
      error: "border-rose-500/40 bg-rose-500/10 text-rose-200",
      info: "border-white/15 bg-white/10 text-slate-100",
    };
    const el = document.createElement("div");
    el.className =
      "hm-toast pointer-events-auto max-w-xs rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur " +
      (colors[type] || colors.info);
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(6px)"; }, 3200);
    setTimeout(() => el.remove(), 3600);
  },
};
