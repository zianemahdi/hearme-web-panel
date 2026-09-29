// =========================================================================
// HearMe — Edge Function "telegram-webhook" (Deno / Supabase)
// -------------------------------------------------------------------------
// Point d'entrée UNIQUE des messages envoyés au bot. Telegram l'appelle
// (webhook) avec l'en-tête X-Telegram-Bot-Api-Secret-Token ; on le vérifie en
// temps constant, puis tg_handle_update() (SQL, 11_telegram_relay.sql) décide
// de tout : liaison /start, menu, vérification de clé, file du téléphone.
// Ici on se contente d'exécuter ses réponses auprès de Telegram et d'effacer
// les messages qui contenaient une clé secrète.
//
// Secret requis (Supabase → Edge Functions → Secrets) :
//   TELEGRAM_BOT_TOKEN   token du bot (@BotFather). Ne JAMAIS le mettre dans l'app.
// Le secret du webhook est DÉRIVÉ du token (HMAC-SHA256) : un seul secret à
// gérer, et il change de lui-même si le token est révoqué.
//
// Déploiement (Telegram n'envoie pas de JWT : l'authentification est l'en-tête) :
//   supabase functions deploy telegram-webhook --no-verify-jwt
// Installation / réparation du webhook — idempotent, sans risque (l'URL et le
// secret sont fixés ici, l'appelant ne choisit rien) :
//   GET https://<projet>.supabase.co/functions/v1/telegram-webhook?setup=1
// =========================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const API = `https://api.telegram.org/bot${TOKEN}`;
const SELF_URL = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

const admin = createClient(
  SUPABASE_URL,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Menu « / » affiché par Telegram (même liste que l'ancienne app).
const COMMANDS = [
  { command: "ring", description: "Faire sonner le téléphone (à tout moment)" },
  { command: "locate", description: "Position GPS (mode alerte requis)" },
  { command: "photo", description: "Photo du porteur (mode alerte requis)" },
  { command: "report", description: "Rapport complet : photo, position et état" },
  { command: "stopalarm", description: "Stopper la sonnerie" },
  { command: "lock", description: "Verrouiller le téléphone" },
  { command: "status", description: "Obtenir l'état de l'appareil" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// secret_token = HMAC-SHA256(token, contexte) en hex : 64 car. [0-9a-f],
// conforme aux exigences de Telegram (1–256 car., A-Z a-z 0-9 _ -).
let secretPromise: Promise<string> | null = null;
function webhookSecret(): Promise<string> {
  secretPromise ??= (async () => {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode("hearme-telegram-webhook-v1"));
    return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  })();
  return secretPromise;
}

// Comparaison en temps constant : ne révèle pas, par le délai, où ça diverge.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function tg(method: string, payload: Record<string, unknown>) {
  try {
    const r = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch {
    return { ok: false };
  }
}

async function setup(): Promise<Response> {
  const hook = await tg("setWebhook", {
    url: SELF_URL,
    secret_token: await webhookSecret(),
    allowed_updates: ["message"],
  });
  const cmds = await tg("setMyCommands", { commands: COMMANDS });
  const info = await tg("getWebhookInfo", {});
  return json({
    webhook: hook?.ok === true,
    commands: cmds?.ok === true,
    url: info?.result?.url ?? null,
    pending_update_count: info?.result?.pending_update_count ?? null,
    last_error_message: info?.result?.last_error_message ?? null,
  });
}

Deno.serve(async (req) => {
  if (!TOKEN) return json({ error: "bot_not_configured" }, 503);

  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("setup")) return await setup();
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(got, await webhookSecret())) return json({ error: "forbidden" }, 401);

  // Corps illisible ou message hors sujet : 200, inutile que Telegram réessaie.
  let update: any;
  try { update = await req.json(); } catch { return json({ ok: true }); }
  const msg = update?.message;
  if (!msg || msg.chat?.type !== "private" || typeof msg.text !== "string") {
    return json({ ok: true });
  }

  const { data, error } = await admin.rpc("tg_handle_update", {
    p_update_id: update.update_id,
    p_message_id: msg.message_id ?? null,
    p_chat_id: msg.chat.id,
    p_text: msg.text,
    p_first_name: msg.from?.first_name ?? null,
  });
  if (error) {
    // 500 → Telegram réessaiera ; la transaction SQL a été annulée, rien n'est à moitié fait.
    console.error("tg_handle_update:", error.message);
    return json({ error: "server_error" }, 500);
  }

  // D'abord effacer la clé du chat, ensuite répondre.
  for (const d of data?.delete ?? []) await tg("deleteMessage", d);
  for (const r of data?.replies ?? []) {
    await tg("sendMessage", { ...r, disable_web_page_preview: true });
  }
  return json({ ok: true });
});
