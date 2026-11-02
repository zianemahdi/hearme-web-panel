// =========================================================================
// HearMe — Edge Function "play-verify" (Deno / Supabase)
// -------------------------------------------------------------------------
// Abonnements HearMe Plus par Google Play (39_plus_play.sql, HearMe/docs/PLAN_PLUS.md).
//
//   App     JSON { purchase_token } + en-tête x-device-secret  → { ok, until_ms, active }
//   Google  notification Pub/Sub (RTDN) sur ?rtdn=<jeton>       → 200 (204 si ignorée)
//
// Chaque jeton est vérifié auprès de Google (purchases.subscriptionsv2.get) avec le
// compte de service Play (secret GOOGLE_PLAY_SERVICE_ACCOUNT, JSON). L'achat doit
// porter l'identifiant du compte HearMe (obfuscatedExternalAccountId, mis par l'app)
// et, côté app, appartenir au propriétaire du téléphone. Le serveur acquitte l'achat
// (sinon Google le rembourse au bout de 3 jours) et enregistre la date de fin.
//
// Secrets : GOOGLE_PLAY_SERVICE_ACCOUNT, PLAY_RTDN_TOKEN (jeton du lien Pub/Sub).
// Sans compte de service : 503 not_configured (rien n'est accordé).
// Déploiement sans vérification JWT : clé du téléphone ou jeton RTDN vérifiés ici.
// =========================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PACKAGE = "com.gethearme.app";
const PRODUCT = "hearme_plus";
const API = Deno.env.get("PLAY_API_BASE") ?? "https://androidpublisher.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
// Accès tant que la période payée court (un abonnement annulé reste actif jusqu'à sa fin).
const ENTITLED = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED",
]);
const TOKEN_RE = /^[A-Za-z0-9._\-]{20,600}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Même ordre de confiance que panel_client_ip() (09_hardening.sql).
function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const parts = (req.headers.get("x-forwarded-for") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return parts.at(-1) ?? "";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------------------------------------------------------------------------
// Jeton d'accès Google (JWT RS256 signé avec la clé du compte de service)
// ---------------------------------------------------------------------------

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };
let cached: { token: string; exp: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT");
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = new TextEncoder();

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 60) return cached.token;
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600,
  })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claims}`)));
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`google_token ${res.status}: ${await res.text()}`);
  const body = await res.json();
  cached = { token: body.access_token, exp: now + (body.expires_in ?? 3600) };
  return cached.token;
}

// ---------------------------------------------------------------------------
// Vérification d'un jeton d'achat
// ---------------------------------------------------------------------------

type Verdict =
  | { ok: true; until_ms: number; active: boolean; stale?: boolean }
  | { ok: false; error: string; status: number };

type LineItem = { productId?: string; expiryTime?: string };

async function verifyToken(sa: ServiceAccount, token: string, expectUser: string | null): Promise<Verdict> {
  const auth = { Authorization: `Bearer ${await accessToken(sa)}` };
  const base = `${API}/androidpublisher/v3/applications/${PACKAGE}/purchases`;
  const res = await fetch(`${base}/subscriptionsv2/tokens/${encodeURIComponent(token)}`, { headers: auth });
  if (res.status === 404 || res.status === 410 || res.status === 400) {
    return { ok: false, error: "unknown_purchase", status: 404 };
  }
  if (!res.ok) throw new Error(`google_get ${res.status}: ${await res.text()}`);
  const sub = await res.json();

  const items: LineItem[] = (sub.lineItems ?? []).filter((l: LineItem) => l.productId === PRODUCT);
  if (!items.length) return { ok: false, error: "wrong_product", status: 400 };
  const user = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? "";
  if (!UUID_RE.test(user)) return { ok: false, error: "no_account", status: 403 };
  if (expectUser && user.toLowerCase() !== expectUser.toLowerCase()) {
    return { ok: false, error: "account_mismatch", status: 403 };
  }

  const expiry = Math.max(...items.map((l) => Date.parse(l.expiryTime ?? "") || 0));
  const until = ENTITLED.has(sub.subscriptionState) ? expiry : Math.min(expiry, Date.now());

  const { data, error } = await admin.rpc("plus_apply_play", {
    p_user: user,
    p_until: new Date(until || Date.now()).toISOString(),
    p_product: PRODUCT,
    p_token: token,
    p_linked: sub.linkedPurchaseToken ?? null,
  });
  if (error) throw new Error(`plus_apply_play: ${error.message}`);
  if (!data?.ok) return { ok: false, error: data?.error ?? "denied", status: 403 };

  // Acquittement : obligatoire sous 3 jours, sinon Google rembourse l'achat.
  if (sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING" && ENTITLED.has(sub.subscriptionState)) {
    const ack = await fetch(`${base}/subscriptions/${PRODUCT}/tokens/${encodeURIComponent(token)}:acknowledge`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{}",
    });
    if (!ack.ok) console.error("acknowledge:", ack.status, await ack.text());
  }
  return { ok: true, until_ms: data.until_ms ?? 0, active: !!data.active, stale: data.stale };
}

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

async function fromApp(req: Request, sa: ServiceAccount): Promise<Response> {
  const secret = (req.headers.get("x-device-secret") ?? "").trim();
  if (!secret) return json({ error: "missing_secret" }, 401);
  const { data: auth, error } = await admin.rpc("photo_authorize", {
    p_secret: secret, p_ip: clientIp(req), p_upload: false,
  });
  if (error) {
    console.error("photo_authorize:", error.message);
    return json({ error: "server_error" }, 500);
  }
  if (!auth?.ok) return json({ error: auth?.error ?? "denied" }, auth?.error === "rate_limited" ? 429 : 401);

  let body: { purchase_token?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const token = typeof body.purchase_token === "string" ? body.purchase_token : "";
  if (!TOKEN_RE.test(token)) return json({ error: "bad_token" }, 400);

  const { data: owner, error: ownerErr } = await admin.rpc("plus_device_owner", { p_device: auth.device_id });
  if (ownerErr) {
    console.error("plus_device_owner:", ownerErr.message);
    return json({ error: "server_error" }, 500);
  }
  if (!owner) return json({ error: "not_signed_in" }, 403);

  const v = await verifyToken(sa, token, owner as string);
  return v.ok ? json(v) : json({ ok: false, error: v.error }, v.status);
}

// Notification temps réel de Google (Pub/Sub, abonnement « push »).
async function fromGoogle(req: Request, sa: ServiceAccount): Promise<Response> {
  let note: Record<string, any>;
  try {
    const body = await req.json();
    note = JSON.parse(atob(body?.message?.data ?? ""));
  } catch {
    return new Response(null, { status: 204 }); // illisible : inutile de la renvoyer
  }
  const token = note?.subscriptionNotification?.purchaseToken;
  if (note?.packageName !== PACKAGE || typeof token !== "string" || !TOKEN_RE.test(token)) {
    return new Response(null, { status: 204 }); // test ou autre produit
  }
  const v = await verifyToken(sa, token, null);
  if (!v.ok) console.warn("rtdn:", v.error);
  return json({ ok: v.ok });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const rtdn = new URL(req.url).searchParams.get("rtdn");
  if (rtdn !== null) {
    const expected = Deno.env.get("PLAY_RTDN_TOKEN") ?? "";
    if (!expected || !safeEqual(rtdn, expected)) return json({ error: "denied" }, 403);
  }
  const sa = serviceAccount();
  if (!sa) return json({ error: "not_configured" }, 503);
  try {
    return rtdn !== null ? await fromGoogle(req, sa) : await fromApp(req, sa);
  } catch (e) {
    console.error("play-verify:", (e as Error).message);
    // 500 : l'app propose « Restaurer mes achats », Pub/Sub renvoie la notification.
    return json({ error: "server_error" }, 500);
  }
});
