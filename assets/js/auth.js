/* =========================================================================
 * HearMe — Logique de la page de connexion (index.html)
 * ========================================================================= */
(function () {
  const $ = (id) => document.getElementById(id);

  // Si déjà connecté, aller directement au tableau de bord.
  (async function redirectIfLogged() {
    const mode = HM.session.getMode();
    if (mode === "secret" && HM.session.getSecret()) return location.replace("dashboard.html");
    if (mode === "auth" && (await HM.session.hasAuthSession())) return location.replace("dashboard.html");
  })();

  /* ---------------------------- Onglets --------------------------------- */
  const tabs = { account: $("tab-account"), secret: $("tab-secret") };
  const panels = { account: $("panel-account"), secret: $("panel-secret") };
  function select(which) {
    Object.keys(tabs).forEach((k) => {
      tabs[k].setAttribute("aria-selected", String(k === which));
      panels[k].classList.toggle("hidden", k !== which);
    });
  }
  tabs.account.addEventListener("click", () => select("account"));
  tabs.secret.addEventListener("click", () => select("secret"));

  /* ------------------- Onglet "Compte" (email + MDP) -------------------- */
  let signupMode = false;
  const accBtn = $("btn-account");
  const accMsg = $("account-msg");

  $("account-mode-toggle").addEventListener("click", (e) => {
    e.preventDefault();
    signupMode = !signupMode;
    $("account-title").textContent = signupMode ? "Créer un compte" : "Se connecter";
    accBtn.textContent = signupMode ? "Créer mon compte" : "Se connecter";
    $("account-mode-toggle").textContent = signupMode
      ? "J'ai déjà un compte" : "Créer un compte";
    accMsg.textContent = "";
  });

  async function afterAuth() {
    HM.session.setAuth();
    let devices = [];
    try { devices = await HM.api.listDevices(); } catch (_) {}
    if (!devices.length) {
      // Compte sans appareil → proposer le rattachement par clé.
      $("claim-box").classList.remove("hidden");
      accMsg.textContent = "Connecté. Rattachez votre téléphone avec sa clé secrète.";
      accMsg.className = "text-sm text-emerald-300 min-h-5";
      return;
    }
    const d = devices[0];
    HM.session.setDevice(d.id, d.name);
    location.replace("dashboard.html");
  }

  $("form-account").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || !password) return;
    accBtn.disabled = true;
    accMsg.textContent = "…";
    accMsg.className = "text-sm text-slate-400 min-h-5";
    try {
      if (signupMode) {
        const { data, error } = await HM.sb.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          accMsg.textContent = "Compte créé. Vérifiez votre e-mail pour le confirmer, puis connectez-vous.";
          accMsg.className = "text-sm text-emerald-300 min-h-5";
          signupMode = false;
          $("account-title").textContent = "Se connecter";
          accBtn.textContent = "Se connecter";
          return;
        }
      } else {
        const { error } = await HM.sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await afterAuth();
    } catch (err) {
      accMsg.textContent = translate(err.message || "Échec de la connexion.");
      accMsg.className = "text-sm text-rose-300 min-h-5";
    } finally {
      accBtn.disabled = false;
    }
  });

  // Rattachement d'un appareil (compte sans appareil).
  $("btn-claim").addEventListener("click", async () => {
    const key = $("claim-secret").value.trim();
    if (!key) return;
    $("btn-claim").disabled = true;
    try {
      const id = await HM.api.claimDevice(key);
      HM.session.setDevice(id);
      location.replace("dashboard.html");
    } catch (err) {
      accMsg.textContent = translate(err.message || "Clé invalide.");
      accMsg.className = "text-sm text-rose-300 min-h-5";
    } finally {
      $("btn-claim").disabled = false;
    }
  });

  /* ------------------- Onglet "Clé secrète" ----------------------------- */
  const secMsg = $("secret-msg");
  $("form-secret").addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = $("secret-key").value.trim();
    if (!key) return;
    $("btn-secret").disabled = true;
    secMsg.textContent = "Vérification…";
    secMsg.className = "text-sm text-slate-400 min-h-5";
    HM.session.setSecret(key);
    try {
      const d = await HM.api.getDevice();
      if (!d) throw new Error("Aucun appareil pour cette clé secrète.");
      HM.session.setDevice(d.id, d.name);
      location.replace("dashboard.html");
    } catch (err) {
      await HM.session.clear();
      secMsg.textContent = translate(err.message || "Clé secrète invalide.");
      secMsg.className = "text-sm text-rose-300 min-h-5";
    } finally {
      $("btn-secret").disabled = false;
    }
  });

  // Traductions FR de quelques messages Supabase.
  function translate(m) {
    const map = {
      "Invalid login credentials": "E-mail ou mot de passe incorrect.",
      "Email not confirmed": "E-mail non confirmé. Vérifiez votre boîte mail.",
      "User already registered": "Un compte existe déjà avec cet e-mail.",
      "Password should be at least 6 characters":
        "Le mot de passe doit contenir au moins 6 caractères.",
    };
    return map[m] || m;
  }
})();
