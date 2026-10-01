// =========================================================================
// HearMe — Edge Function "delete-account" (Deno / Supabase)
// -------------------------------------------------------------------------
// Supprime le compte de l'utilisateur connecté et toutes ses données
// (exigence Google Play). Appelée par l'app : Réglages → Compte → Supprimer
// mon compte, avec le JWT de l'utilisateur en Authorization.
//
//   1. photos du stockage privé 'security-photos' (dossier = id de l'appareil),
//      via l'API Storage, la seule autorisée à effacer des fichiers ;
//   2. delete_account_data(uid) (19_delete_account.sql) : téléphones et tout
//      ce qui en dépend, quotas de la carte, PIN ;
//   3. le compte lui-même (e-mail, mot de passe, identités Google).
// Chaque étape peut être rejouée : une suppression interrompue se termine en
// relançant la demande.
//
// Réponse : { ok: true, devices, files } ou { ok: false, error }.
// Déploiement : supabase functions deploy delete-account   (JWT vérifié)
// =========================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "security-photos";
const PAGE = 100;

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // L'identité vient du JWT de l'utilisateur, jamais d'un paramètre de la requête.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ ok: false, error: "not_signed_in" }, 401);
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  const uid = who?.user?.id;
  if (whoErr || !uid) return json({ ok: false, error: "not_signed_in" }, 401);

  // 1. Photos du stockage privé, téléphone par téléphone.
  const { data: devices, error: devErr } = await admin
    .from("devices").select("id").eq("user_id", uid);
  if (devErr) return json({ ok: false, error: "server" }, 500);
  let files = 0;
  for (const d of devices ?? []) {
    for (;;) {
      const { data: list, error: listErr } = await admin.storage
        .from(BUCKET).list(d.id, { limit: PAGE });
      if (listErr) return json({ ok: false, error: "server" }, 500);
      if (!list || list.length === 0) break;
      const paths = list.map((f) => `${d.id}/${f.name}`);
      const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths);
      if (rmErr) return json({ ok: false, error: "server" }, 500);
      files += paths.length;
      if (list.length < PAGE) break;
    }
  }

  // 2. Données en base.
  const { data: res, error: dbErr } = await admin.rpc("delete_account_data", { p_uid: uid });
  if (dbErr || !res?.ok) return json({ ok: false, error: "server" }, 500);

  // 3. Le compte lui-même.
  const { error: authErr } = await admin.auth.admin.deleteUser(uid);
  if (authErr) return json({ ok: false, error: "server" }, 500);

  return json({ ok: true, devices: res.devices ?? 0, files });
});
