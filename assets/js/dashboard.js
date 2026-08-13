/* =========================================================================
 * HearMe — Orchestration du tableau de bord (dashboard.html)
 * ========================================================================= */
(function () {
  const $ = (id) => document.getElementById(id);
  let stopLive = null;
  let lastRecordedAt = null;
  let pathPoints = [];
  let currentSecretShown = false;
  let device = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const mode = await HM.session.requireOrRedirect("index.html");
    if (!mode) return;

    // 1) Résoudre l'appareil actif.
    let devices = [];
    try { devices = await HM.api.listDevices(); }
    catch (e) { HM.util.toast(e.message || "Erreur de chargement.", "error"); }

    if (mode === "auth") {
      if (!devices.length) {
        HM.util.toast("Aucun appareil rattaché à ce compte.", "error");
        return setTimeout(() => location.replace("index.html"), 1500);
      }
      const cur = HM.session.getDeviceId() || devices[0].id;
      const chosen = devices.find((d) => d.id === cur) || devices[0];
      HM.session.setDevice(chosen.id, chosen.name);
      setupSwitcher(devices, chosen.id);
    } else {
      if (!devices.length) return location.replace("index.html");
      HM.session.setDevice(devices[0].id, devices[0].name);
    }

    // 2) Boutons globaux.
    $("btn-logout").addEventListener("click", async () => {
      if (stopLive) stopLive();
      await HM.session.clear();
      location.replace("index.html");
    });
    wireControls();
    wireSecretPanel();

    // 3) Carte.
    HM.map.init("map", HM.config.MAP.defaultCenter, HM.config.MAP.defaultZoom);
    $("btn-recenter").addEventListener("click", () => HM.map.recenter());

    // 4) Premier chargement.
    device = devices.find((d) => d.id === HM.session.getDeviceId()) || devices[0];
    renderDevice(device);
    await Promise.all([loadLocations(true), loadPhotos()]);

    // 5) Temps réel / polling.
    stopLive = HM.api.startLive({
      onLocation: onNewLocation,
      onDevice: (d) => { device = Object.assign({}, device, d); renderDevice(device); },
      onError: (e) => console.warn("[live]", e),
    });
    window.addEventListener("beforeunload", () => stopLive && stopLive());

    // Rafraîchit "il y a X" toutes les 20 s.
    setInterval(() => renderDevice(device), 20000);
  }

  /* ------------------------- Sélecteur d'appareils ---------------------- */
  function setupSwitcher(devices, currentId) {
    const sel = $("device-switcher");
    if (devices.length <= 1) { sel.classList.add("hidden"); return; }
    sel.classList.remove("hidden");
    sel.innerHTML = devices
      .map((d) => `<option value="${HM.util.esc(d.id)}"${d.id === currentId ? " selected" : ""}>${HM.util.esc(d.name)}</option>`)
      .join("");
    sel.addEventListener("change", () => {
      const d = devices.find((x) => x.id === sel.value);
      HM.session.setDevice(d.id, d.name);
      location.reload();
    });
  }

  /* ----------------------------- Rendu état ----------------------------- */
  function renderDevice(d) {
    if (!d) return;
    $("device-name").textContent = d.name || "Mon téléphone";

    const online = HM.util.isOnline(d.last_seen, HM.config.ONLINE_WINDOW_S);
    const badge = $("online-badge");
    badge.textContent = online ? "En ligne" : "Hors ligne";
    badge.className =
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
      (online ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400");
    $("last-update").textContent = "Vu " + HM.util.timeAgo(d.last_seen);

    // Batterie
    const bat = d.battery_level;
    $("stat-battery").textContent = (bat == null ? "—" : bat + " %");
    const bar = $("stat-battery-bar");
    bar.style.width = (bat == null ? 0 : Math.max(3, Math.min(100, bat))) + "%";
    bar.className =
      "h-full rounded-full transition-all " +
      (bat == null ? "bg-slate-500" : bat <= 15 ? "bg-rose-500" : bat <= 35 ? "bg-amber-400" : "bg-emerald-400");

    // Réseau
    const net = { wifi: "Wi-Fi", mobile: "Données mobiles", offline: "Hors ligne" };
    $("stat-network").textContent = net[d.network_status] || d.network_status || "—";

    // Verrouillage
    const lockEl = $("stat-lock");
    lockEl.textContent = d.is_locked ? "Verrouillé" : "Déverrouillé";
    lockEl.className =
      "text-lg font-semibold " + (d.is_locked ? "text-emerald-300" : "text-amber-300");

    // Clé secrète (respecte l'état masqué/révélé)
    if (d.secret_key) {
      $("secret-value").dataset.key = d.secret_key;
      paintSecret();
    }
  }

  /* ---------------------------- Positions ------------------------------- */
  async function loadLocations(fit) {
    let locs = [];
    try { locs = await HM.api.getLocations(); }
    catch (e) { HM.util.toast("Positions indisponibles.", "error"); }
    pathPoints = locs; // déjà du + récent au + ancien
    HM.map.setPath(pathPoints);
    if (locs[0]) {
      lastRecordedAt = locs[0].recorded_at;
      $("coords").textContent = locs[0].lat.toFixed(5) + ", " + locs[0].lon.toFixed(5);
      $("coords-time").textContent = HM.util.timeAgo(locs[0].recorded_at);
      if (fit) HM.map.recenter();
    } else {
      $("coords").textContent = "Aucune position";
      $("coords-time").textContent = "";
    }
  }

  function onNewLocation(l) {
    if (!l || l.recorded_at === lastRecordedAt) return;
    lastRecordedAt = l.recorded_at;
    pathPoints = [l].concat(pathPoints).slice(0, HM.config.MAP.maxLocationsPath);
    HM.map.setPath(pathPoints);
    HM.map.setLatest(l.lat, l.lon, l.accuracy_m, { fly: false });
    $("coords").textContent = l.lat.toFixed(5) + ", " + l.lon.toFixed(5);
    $("coords-time").textContent = "à l'instant";
    HM.util.toast("Nouvelle position reçue", "info");
  }

  /* ----------------------------- Galerie -------------------------------- */
  async function loadPhotos() {
    const host = $("gallery");
    let photos = [];
    try { photos = await HM.api.getPhotos(12); }
    catch (e) { /* silencieux */ }

    if (!photos.length) { $("gallery-empty").classList.remove("hidden"); host.innerHTML = ""; return; }
    $("gallery-empty").classList.add("hidden");

    const label = { unlock_failed: "Échec déverrouillage", remote_photo: "Photo à distance", theft: "Vol détecté" };
    host.innerHTML = photos.map((p) => {
      const when = new Date(p.created_at).toLocaleString("fr-FR");
      const tag = label[p.event_type] || p.event_type || "Capture";
      const media = p.url
        ? `<img src="${HM.util.esc(p.url)}" alt="${HM.util.esc(tag)}" loading="lazy" class="h-40 w-full object-cover">`
        : `<div class="h-40 w-full flex items-center justify-center text-xs text-slate-500 bg-white/5">Aperçu indisponible</div>`;
      return `<figure class="shrink-0 w-56 overflow-hidden rounded-xl border border-white/10 bg-black/30">
          ${media}
          <figcaption class="px-3 py-2">
            <div class="text-xs font-medium text-slate-200">${HM.util.esc(tag)}</div>
            <div class="text-[11px] text-slate-500">${HM.util.esc(when)}</div>
          </figcaption>
        </figure>`;
    }).join("");
  }

  /* -------------------------- Clé secrète ------------------------------- */
  function wireSecretPanel() {
    $("btn-reveal").addEventListener("click", () => { currentSecretShown = !currentSecretShown; paintSecret(); });
    $("btn-copy-key").addEventListener("click", async () => {
      const k = $("secret-value").dataset.key;
      if (!k) return;
      const ok = await HM.util.copy(k);
      HM.util.toast(ok ? "Clé copiée" : "Copie impossible", ok ? "success" : "error");
    });
    $("btn-regen").addEventListener("click", async () => {
      if (!confirm("Régénérer la clé secrète ?\n\nLe téléphone changera sa clé à sa prochaine synchronisation. En mode « clé secrète », il faudra ressaisir la nouvelle clé (affichée par l'app).")) return;
      try {
        await HM.api.requestRegenerate();
        HM.util.toast("Demande envoyée au téléphone.", "success");
      } catch (e) { HM.util.toast(e.message || "Échec.", "error"); }
    });
  }
  function paintSecret() {
    const el = $("secret-value");
    const k = el.dataset.key || "";
    el.textContent = currentSecretShown ? k : "•".repeat(Math.max(8, k.length));
    $("btn-reveal").textContent = currentSecretShown ? "Masquer" : "Afficher";
  }

  /* --------------------- Boutons de commande ---------------------------- */
  function wireControls() {
    const cmd = async (command, confirmMsg) => {
      if (confirmMsg && !confirm(confirmMsg)) return;
      try {
        await HM.api.sendCommand(command);
        HM.util.toast("Commande envoyée : " + command, "success");
      } catch (e) { HM.util.toast(e.message || "Échec de l'envoi.", "error"); }
    };
    $("btn-lock").addEventListener("click", () => cmd("lock", "Verrouiller l'appareil à distance ?"));
    $("btn-alarm").addEventListener("click", () => cmd("alarm", "Déclencher l'alarme sonore à distance ?"));
    $("btn-stopalarm").addEventListener("click", () => cmd("stopalarm"));
    $("btn-locate").addEventListener("click", () => cmd("locate"));
    $("btn-photo").addEventListener("click", () => cmd("photo"));
  }
})();
