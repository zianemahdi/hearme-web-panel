-- ============================================================================
--  06_emergency_access.sql — Accès d'urgence par « magic link » (one-time token)
-- ----------------------------------------------------------------------------
--  Le TÉLÉPHONE (encore vivant au moment du vol) génère un jeton à usage unique
--  via mint_access_token() puis envoie le lien au proche par Telegram. Le PANNEAU
--  échange ce jeton contre l'accès au tableau de crise via consume_access_token()
--  (usage unique + expiration courte). Aucune donnée sensible n'est exposée : le
--  jeton n'est valide qu'une fois et pour une durée limitée.
--
--  À exécuter dans Supabase → SQL Editor (projet muggtgcwmawcpmzjrvxo).
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists device_access_tokens (
    token       text primary key,
    device_id   uuid not null references devices(id) on delete cascade,
    scope       text not null default 'crisis',      -- 'crisis' = GPS/alarme/photos, pas les réglages du compte
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null,
    used_at     timestamptz
);
create index if not exists idx_dat_device on device_access_tokens(device_id);

alter table device_access_tokens enable row level security;
-- Aucune policy → ni anon ni authenticated ne lisent/écrivent la table en direct ;
-- tout passe par les RPC SECURITY DEFINER ci-dessous.

-- ----------------------------------------------------------------------------
--  Génération du jeton par le TÉLÉPHONE (anon + clé secrète de l'appareil).
--  TTL par défaut : 15 minutes. Renvoie le jeton (texte) à mettre dans le lien.
-- ----------------------------------------------------------------------------
create or replace function mint_access_token(p_secret text, p_ttl_minutes int default 15)
returns text
language plpgsql
security definer
set search_path = public, extensions   -- pgcrypto (gen_random_bytes) vit dans "extensions" sur Supabase
as $$
declare
    d_id uuid;
    tok  text;
begin
    select id into d_id from devices where secret_key = p_secret;
    if d_id is null then
        raise exception 'invalid secret';
    end if;

    -- On purge les vieux jetons de cet appareil (hygiène).
    delete from device_access_tokens
     where device_id = d_id and (used_at is not null or expires_at < now());

    tok := encode(gen_random_bytes(24), 'hex');   -- 48 caractères hex
    insert into device_access_tokens(token, device_id, expires_at)
        values (tok, d_id, now() + make_interval(mins => greatest(1, p_ttl_minutes)));
    return tok;
end;
$$;

-- ----------------------------------------------------------------------------
--  Échange du jeton par le PANNEAU (anon). Usage unique : marqué « used » à la
--  première consommation. Renvoie la clé secrète de l'appareil pour ouvrir la
--  session de crise (mode clé), ou une erreur (not_found / used / expired).
-- ----------------------------------------------------------------------------
create or replace function consume_access_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    r   device_access_tokens;
    dev devices;
begin
    select * into r from device_access_tokens where token = p_token;
    if r.token is null then
        return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if r.used_at is not null then
        return jsonb_build_object('ok', false, 'error', 'used');
    end if;
    if r.expires_at < now() then
        return jsonb_build_object('ok', false, 'error', 'expired');
    end if;

    update device_access_tokens set used_at = now() where token = r.token;

    select * into dev from devices where id = r.device_id;
    return jsonb_build_object(
        'ok', true,
        'device_id', dev.id,
        'name', dev.name,
        'secret', dev.secret_key,   -- ouvre la session « clé secrète » (tableau de crise uniquement)
        'scope', r.scope
    );
end;
$$;

grant execute on function mint_access_token(text, int)   to anon, authenticated;
grant execute on function consume_access_token(text)     to anon, authenticated;
