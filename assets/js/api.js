/* =========================================================================
 * HearMe — Couche d'accès aux données (abstrait les 2 modes d'accès)
 * -------------------------------------------------------------------------
 *  Mode "auth"   → tables directes protégées par RLS (auth.uid()) + Realtime.
 *  Mode "secret" → fonctions RPC "SECURITY DEFINER" validées par la clé, +
 *                  interrogation périodique (polling) car l'anon n'a pas de
 *                  Realtime sur des tables sans policy.
 * ========================================================================= */
window.HM = window.HM || {};

HM.api = (function () {
  const sb = () => HM.sb;
  const mode = () => HM.session.getMode();
  const secret = () => HM.session.getSecret();
  const anon = () => HM.config.SUPABASE_ANON_KEY;

  function normLoc(r) {
    return {
      lat: r.lat, lon: r.lon,
      accuracy_m: r.accuracy_m ?? null,
      battery_level: r.battery_level ?? null,
      recorded_at: r.recorded_at,
    };
  }

  /* --------------------------------------------------------------------- */
  /*  Appareils                                                            */
  /* --------------------------------------------------------------------- */

  /** Liste des appareils accessibles. */
  async function listDevices() {
    if (mode() === "secret") {
      const { data, error } = await sb().rpc("panel_get_device", { p_secret: secret() });
      if (error) throw error;
      if (!data || !data.length) throw new Error("Aucun appareil pour cette clé secrète.");
      return data;
    }
    const { data, error } = await sb()
      .from("devices")
      .select("id,name,battery_level,network_status,is_locked,is_online,last_seen,secret_key")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /** Instantané de l'appareil actif. */
  async function getDevice() {
    if (mode() === "secret") {
      const { data, error } = await sb().rpc("panel_get_device", { p_secret: secret() });
      if (error) throw error;
      return (data && data[0]) || null;
    }
    const id = HM.session.getDeviceId();
    if (!id) { const l = await listDevices(); return l[0] || null; }
    const { data, error } = await sb()
      .from("devices")
      .select("id,name,battery_level,network_status,is_locked,is_online,last_seen,secret_key")
      .eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  /* --------------------------------------------------------------------- */
  /*  Positions GPS                                                        */
  /* --------------------------------------------------------------------- */

  async function getLocations(limit) {
    limit = limit || HM.config.MAP.maxLocationsPath;
    if (mode() === "secret") {
      const { data, error } = await sb().rpc("panel_get_locations", {
        p_secret: secret(), p_limit: limit,
      });
      if (error) throw error;
      return (data || []).map(normLoc);
    }
    const id = HM.session.getDeviceId();
    if (!id) return [];
    const { data, error } = await sb()
      .from("device_locations")
      .select("lat,lon,accuracy_m,battery_level,recorded_at")
      .eq("device_id", id)
      .order("recorded_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(normLoc);
  }

  /* --------------------------------------------------------------------- */
  /*  Photos de sécurité                                                   */
  /* --------------------------------------------------------------------- */

  async function getPhotos(limit) {
    limit = limit || 12;
    if (mode() === "secret") {
      // Chemin privilégié : Edge Function qui renvoie des URLs signées.
      try {
        const res = await fetch(
          `${HM.config.SUPABASE_URL}/functions/v1/${HM.config.PHOTOS_FUNCTION}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anon(),
              Authorization: "Bearer " + anon(),
            },
            body: JSON.stringify({ secret: secret(), action: "list", limit }),
          }
        );
        if (res.ok) {
          const j = await res.json();
          return (j.photos || []).map((p) => ({
            id: p.id, event_type: p.event_type, created_at: p.created_at, url: p.url || null,
          }));
        }
      } catch (_) { /* fonction non déployée → repli métadonnées */ }
      const { data, error } = await sb().rpc("panel_get_photos", {
        p_secret: secret(), p_limit: limit,
      });
      if (error) throw error;
      return (data || []).map((p) => ({
        id: p.id, event_type: p.event_type, created_at: p.created_at, url: null,
      }));
    }

    // Mode "compte" : lecture RLS + URLs signées côté client.
    const id = HM.session.getDeviceId();
    if (!id) return [];
    const { data, error } = await sb()
      .from("security_photos")
      .select("id,storage_path,event_type,created_at")
      .eq("device_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const out = [];
    for (const p of data || []) {
      let url = null;
      try {
        const s = await sb().storage.from("security-photos").createSignedUrl(p.storage_path, 3600);
        url = s.data ? s.data.signedUrl : null;
      } catch (_) {}
      out.push({ id: p.id, event_type: p.event_type, created_at: p.created_at, url });
    }
    return out;
  }

  /* --------------------------------------------------------------------- */
  /*  Commandes d'urgence & clé secrète                                    */
  /* --------------------------------------------------------------------- */

  async function sendCommand(command) {
    if (mode() === "secret") {
      const { error } = await sb().rpc("panel_send_command", {
        p_secret: secret(), p_command: command,
      });
      if (error) throw error;
      return;
    }
    const id = HM.session.getDeviceId();
    if (!id) throw new Error("Appareil non sélectionné.");
    const { error } = await sb().from("device_commands").insert({ device_id: id, command });
    if (error) throw error;
  }

  /** Demande la régénération de la clé : l'app la fera tourner à sa prochaine sync. */
  async function requestRegenerate() {
    if (mode() === "secret") {
      const { error } = await sb().rpc("panel_request_regenerate", { p_secret: secret() });
      if (error) throw error;
      return;
    }
    const id = HM.session.getDeviceId();
    if (!id) throw new Error("Appareil non sélectionné.");
    const { error } = await sb()
      .from("device_commands")
      .insert({ device_id: id, command: "regenerate_key" });
    if (error) throw error;
  }

  /** (Mode compte) rattache un appareil au compte connecté via sa clé. */
  async function claimDevice(secretKey) {
    const { data, error } = await sb().rpc("claim_device_by_secret", { p_secret: secretKey.trim() });
    if (error) throw error;
    return data; // uuid de l'appareil
  }

  /* --------------------------------------------------------------------- */
  /*  Temps réel (auth) / polling (secret)                                 */
  /* --------------------------------------------------------------------- */

  function startLive({ onLocation, onDevice, onError }) {
    if (mode() === "auth") {
      const id = HM.session.getDeviceId();
      const ch = sb()
        .channel("hm-live-" + id)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "device_locations", filter: "device_id=eq." + id },
          (p) => onLocation && onLocation(normLoc(p.new)))
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "devices", filter: "id=eq." + id },
          (p) => onDevice && onDevice(p.new))
        .subscribe();
      return () => { try { sb().removeChannel(ch); } catch (_) {} };
    }

    // Mode "secret" : polling.
    let alive = true;
    async function tick() {
      if (!alive) return;
      try {
        const d = await getDevice();
        if (d && onDevice) onDevice(d);
        const locs = await getLocations(1);
        if (locs[0] && onLocation) onLocation(locs[0]);
      } catch (e) { onError && onError(e); }
    }
    const iv = setInterval(tick, HM.config.POLL_INTERVAL_MS);
    return () => { alive = false; clearInterval(iv); };
  }

  return {
    listDevices, getDevice, getLocations, getPhotos,
    sendCommand, requestRegenerate, claimDevice, startLive,
  };
})();
