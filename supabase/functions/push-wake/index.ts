// push-wake — réveil instantané d'un téléphone HearMe (Firebase Cloud Messaging).
//
// Appelée UNIQUEMENT par la base (trigger sur device_commands / tg_inbox, 42_push_wake.sql)
//   POST { device_id }  + en-tête x-wake-token (Vault « hearme_push_wake »)
// Envoie un message prioritaire « réveille-toi » ({ t: "wake" }) : aucun contenu personnel,
// le téléphone va ensuite chercher sa commande lui-même.
//
// Secret requis : FCM_SERVICE_ACCOUNT = le fichier JSON du compte de service Firebase
// (projet hearme-509817), collé tel quel dans Supabase › Edge Functions › Secrets.
// Déployer avec verify_jwt = false (le jeton interne remplace le JWT).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let sa: ServiceAccount | null = null;
let cached: { token: string; exp: number } | null = null;

function serviceAccount(): ServiceAccount {
  if (!sa) {
    const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
    if (!raw) throw new Error("FCM_SERVICE_ACCOUNT manquant");
    sa = JSON.parse(raw) as ServiceAccount;
  }
  return sa;
}

// Jeton OAuth Google (1 h) obtenu avec le compte de service, gardé en mémoire.
async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const acct = serviceAccount();
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: acct.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const pem = acct.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`),
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status}`);
  const out = await res.json();
  cached = { token: out.access_token, exp: now + (out.expires_in ?? 3600) };
  return cached.token;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false });
  const wakeToken = (req.headers.get("x-wake-token") ?? "").trim();
  const { data: allowed } = await admin.rpc("push_wake_token_ok", { p_token: wakeToken });
  if (allowed !== true) return json(401, { ok: false });

  let deviceId = "";
  try {
    deviceId = String((await req.json()).device_id ?? "");
  } catch { /* corps invalide */ }
  if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return json(400, { ok: false });

  const { data: fcmToken } = await admin.rpc("push_token_for", { p_device: deviceId });
  if (!fcmToken) return json(200, { ok: true, sent: false });

  try {
    const acct = serviceAccount();
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${acct.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await accessToken()}`,
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            data: { t: "wake" },
            android: { priority: "HIGH", ttl: "60s" },
          },
        }),
      },
    );
    if (res.ok) return json(200, { ok: true, sent: true });
    const detail = await res.text();
    // Appli désinstallée / jeton périmé : on l'oublie (le téléphone en renverra un neuf).
    if (res.status === 404 || detail.includes("UNREGISTERED")) {
      await admin.rpc("push_token_forget", { p_device: deviceId, p_token: fcmToken });
    }
    console.error("fcm", res.status, detail.slice(0, 300));
    return json(200, { ok: true, sent: false });
  } catch (e) {
    console.error("push-wake", (e as Error).message);
    return json(200, { ok: true, sent: false });
  }
});
