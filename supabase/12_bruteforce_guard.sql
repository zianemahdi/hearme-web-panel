-- ============================================================================
--  12_bruteforce_guard.sql — Anti-force-brute qui fonctionne enfin + clés fortes
-- ----------------------------------------------------------------------------
--  Corrige deux constats de l'audit du 29/09/2026 :
--
--  HM-12 — L'anti-force-brute de 09_hardening.sql ne protégeait rien.
--          panel_rl_fail() compte l'échec PUIS la fonction lève
--          « clé secrète invalide » : l'exception annule toute la transaction,
--          compteur compris. Le compteur ne montait donc jamais pour
--          push_location, record_photo, poll_commands, rotate_secret,
--          panel_send_command, panel_request_regenerate, mint_access_token et
--          claim_device_by_secret. Et là où il montait, il n'était vérifié
--          qu'en cas d'échec : une clé JUSTE passait toujours, même après
--          mille essais. rotate_secret, sans limite, permettait de deviner une
--          clé puis de la remplacer : prise de contrôle de l'appareil.
--
--  HM-13 — 6 appareils (tests d'août) ont encore une clé de 6 caractères
--          (31^6 ≈ 900 millions de combinaisons) et rien n'empêchait d'en créer
--          de nouvelles.
--
--  Règles désormais appliquées à TOUTE fonction qui accepte une clé :
--    1. hm_guard() AVANT de regarder la clé : IP bloquée → refus, même avec
--       la bonne clé (30 échecs / 10 min, compteur commun à toutes les portes).
--    2. Clé inconnue → hm_fail() puis réponse « vide » (null, false, 0 ligne,
--       { ok:false }) SANS lever d'exception : le compteur est conservé.
--    3. hm_device_id() n'accepte que les clés fortes (12 à 64 caractères
--       alphanumériques). Les clés courtes sont en quarantaine : le téléphone
--       concerné peut encore se synchroniser (push_device_state) et changer
--       de clé (rotate_secret) — l'app le fait d'elle-même au démarrage —,
--       mais plus rien d'autre.
--
--  Contrats modifiés (clients mis à jour dans le même lot) :
--    rotate_secret            void → boolean  (true = changée, false = clé inconnue)
--    panel_request_regenerate void → boolean
--    panel_send_command, mint_access_token, claim_device_by_secret,
--    record_photo : null au lieu d'une erreur si la clé est invalide.
--
--  À exécuter dans Supabase → SQL Editor (ou via migration), après 11.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Outils communs (aucun droit d'exécution public — voir section 5)
-- ----------------------------------------------------------------------------

-- Clé forte : 12 à 64 caractères alphanumériques (format généré par l'app).
create or replace function hm_key_ok(p_secret text)
returns boolean
language sql immutable set search_path = public as $$
    select coalesce(p_secret, '') ~ '^[A-Za-z0-9]{12,64}$'
$$;

-- Appareil d'une clé FORTE, sinon null (les clés courtes sont en quarantaine).
create or replace function hm_device_id(p_secret text)
returns uuid
language sql stable set search_path = public as $$
    select d.id from devices d
    where hm_key_ok(p_secret) and d.secret_key = p_secret
$$;

-- IP bloquée ? Lève une exception : rien à conserver à ce stade.
create or replace function hm_guard()
returns void
language plpgsql stable set search_path = public as $$
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then
        raise exception 'Trop de tentatives. Réessayez plus tard.' using errcode = 'P0001';
    end if;
end $$;

-- Compte un échec de clé pour l'IP courante (la fonction appelante ne lève PAS ensuite).
create or replace function hm_fail()
returns void
language plpgsql set search_path = public as $$
begin
    perform tg_rl_count(panel_client_ip(), 'key_fail');
end $$;


-- ----------------------------------------------------------------------------
--  2. Côté TÉLÉPHONE
-- ----------------------------------------------------------------------------

-- Crée/actualise l'appareil. Un NOUVEL appareil exige une clé forte ; un
-- appareil existant à clé courte peut encore se synchroniser pour changer de clé.
create or replace function push_device_state(
    p_secret  text,
    p_name    text default null,
    p_battery int default null,
    p_network text default null,
    p_locked  boolean default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    perform hm_guard();
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        if not hm_key_ok(p_secret) then
            perform hm_fail();
            return null;
        end if;
        insert into devices(secret_key, name, battery_level, network_status, is_locked, is_online, last_seen)
        values (p_secret, coalesce(p_name, 'Mon téléphone'), p_battery, p_network,
                coalesce(p_locked, false), true, now())
        on conflict (secret_key) do nothing
        returning id into v_id;
        if v_id is not null then return v_id; end if;
        select id into v_id from devices where secret_key = p_secret; -- créé en parallèle
    end if;
    update devices set
        name           = coalesce(p_name, name),
        battery_level  = coalesce(p_battery, battery_level),
        network_status = coalesce(p_network, network_status),
        is_locked      = coalesce(p_locked, is_locked),
        is_online      = true,
        last_seen      = now(),
        updated_at     = now()
    where id = v_id;
    return v_id;
end $$;

create or replace function push_location(
    p_secret text, p_lat double precision, p_lon double precision,
    p_accuracy real default null, p_battery int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return; end if;
    if p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180 then
        raise exception 'coordonnées invalides';
    end if;
    insert into device_locations(device_id, lat, lon, accuracy_m, battery_level)
    values (v_id, p_lat, p_lon, p_accuracy, p_battery);
    update devices set last_seen = now(), is_online = true,
        battery_level = coalesce(p_battery, battery_level), updated_at = now()
    where id = v_id;
end $$;

create or replace function record_photo(
    p_secret text, p_path text, p_event text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pid uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return null; end if;
    insert into security_photos(device_id, storage_path, event_type)
    values (v_id, p_path, p_event) returning id into v_pid;
    return v_pid;
end $$;

create or replace function poll_commands(p_secret text)
returns table(id uuid, command text, params jsonb, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return; end if;
    update devices d set last_seen = now(), is_online = true where d.id = v_id;
    return query
      update device_commands c set status = 'delivered'
      where c.device_id = v_id and c.status = 'pending'
      returning c.id, c.command, c.params, c.created_at;
end $$;

create or replace function ack_command(p_secret text, p_command_id uuid, p_ok boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return; end if;
    update device_commands set
        status = case when p_ok then 'done' else 'failed' end,
        executed_at = now()
    where id = p_command_id and device_id = v_id;
end $$;

-- void → boolean : true = clé changée, false = ancienne clé inconnue.
-- L'ancienne clé peut être courte (sortie de quarantaine), la nouvelle doit être forte.
drop function if exists rotate_secret(text, text);
create function rotate_secret(p_old text, p_new text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
    perform hm_guard();
    if not hm_key_ok(p_new) then
        raise exception 'nouvelle clé trop faible (12 caractères alphanumériques minimum)';
    end if;
    update devices set secret_key = p_new, updated_at = now()
     where secret_key = p_old and p_old is not null and p_old <> '';
    if not found then
        perform hm_fail();
        return false;
    end if;
    return true;
end $$;


-- ----------------------------------------------------------------------------
--  3. Côté PANNEAU — lectures, commandes, accès d'urgence
-- ----------------------------------------------------------------------------

create or replace function panel_get_device(p_secret text)
returns table(id uuid, name text, battery_level int, network_status text,
              is_locked boolean, is_online boolean, last_seen timestamptz, secret_key text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return; end if;
    return query
        select d.id, d.name, d.battery_level, d.network_status,
               d.is_locked, d.is_online, d.last_seen, d.secret_key
        from devices d where d.id = v_id;
end $$;

-- (volatile et non plus stable : elles écrivent le compteur d'échecs)
create or replace function panel_get_locations(p_secret text, p_limit int default 50)
returns table(lat double precision, lon double precision, accuracy_m real,
              battery_level int, recorded_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return; end if;
    return query
        select l.lat, l.lon, l.accuracy_m, l.battery_level, l.recorded_at
        from device_locations l
        where l.device_id = v_id
        order by l.recorded_at desc
        limit greatest(1, least(p_limit, 500));
end $$;

create or replace function panel_get_photos(p_secret text, p_limit int default 12)
returns table(id uuid, storage_path text, event_type text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return; end if;
    return query
        select p.id, p.storage_path, p.event_type, p.created_at
        from security_photos p
        where p.device_id = v_id
        order by p.created_at desc
        limit greatest(1, least(p_limit, 60));
end $$;

-- Liste blanche inchangée (voir 08_lost_mode.sql). Clé invalide → null.
create or replace function panel_send_command(p_secret text, p_command text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cmd uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return null; end if;
    if p_command not in (
        'lock', 'alarm', 'ring', 'stopalarm', 'locate', 'photo',
        'activate_search', 'stop_search', 'declare_stolen', 'clear_stolen'
    ) then
        raise exception 'commande inconnue';
    end if;
    insert into device_commands(device_id, command)
        values (v_id, p_command)
        returning id into v_cmd;
    return v_cmd;
end $$;

-- void → boolean.
drop function if exists panel_request_regenerate(text);
create function panel_request_regenerate(p_secret text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return false; end if;
    insert into device_commands(device_id, command) values (v_id, 'regenerate_key');
    return true;
end $$;

-- Rattachement au compte connecté. Clé invalide → null ; appareil déjà pris →
-- erreur (ce n'est pas un essai de clé).
create or replace function claim_device_by_secret(p_secret text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return null; end if;
    update devices set user_id = auth.uid(), updated_at = now()
      where id = v_id and (user_id is null or user_id = auth.uid());
    if not found then raise exception 'appareil déjà rattaché à un autre compte'; end if;
    return v_id;
end $$;

create or replace function mint_access_token(p_secret text, p_ttl_minutes int default 15)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare d_id uuid; tok text;
begin
    perform hm_guard();
    d_id := hm_device_id(p_secret);
    if d_id is null then perform hm_fail(); return null; end if;
    delete from device_access_tokens
     where device_id = d_id and (used_at is not null or expires_at < now());
    tok := encode(gen_random_bytes(24), 'hex');
    insert into device_access_tokens(token, device_id, expires_at)
        values (tok, d_id, now() + make_interval(mins => greatest(1, p_ttl_minutes)));
    return tok;
end $$;

create or replace function consume_access_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r device_access_tokens; dev devices;
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then
        return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
    select * into r from device_access_tokens where token = p_token;
    if r.token is null then
        perform hm_fail();
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
        'ok', true, 'device_id', dev.id, 'name', dev.name,
        'secret', dev.secret_key,
        'issued_at', extract(epoch from now())::bigint,
        'scope', r.scope
    );
end $$;

create or replace function set_device_pin(p_secret text, p_email text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare d_id uuid; other uuid;
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then
        return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
    d_id := hm_device_id(p_secret);
    if d_id is null then
        perform hm_fail();
        return jsonb_build_object('ok', false, 'error', 'invalid_secret');
    end if;
    if p_email is null or length(trim(p_email)) = 0 then
        return jsonb_build_object('ok', false, 'error', 'no_email');
    end if;
    if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
        return jsonb_build_object('ok', false, 'error', 'bad_pin');
    end if;
    select device_id into other from device_pins
     where lower(email) = lower(trim(p_email)) and device_id <> d_id;
    if other is not null then
        return jsonb_build_object('ok', false, 'error', 'email_taken');
    end if;
    insert into device_pins(device_id, email, pin_hash, fail_count, locked_until, updated_at)
        values (d_id, lower(trim(p_email)), crypt(p_pin, gen_salt('bf')), 0, null, now())
    on conflict (device_id) do update
        set email = excluded.email, pin_hash = excluded.pin_hash,
            fail_count = 0, locked_until = null, updated_at = now();
    return jsonb_build_object('ok', true);
end $$;

-- PIN maître : verrou par appareil (5 essais / 15 min, inchangé) ET limite par
-- IP vérifiée AVANT le PIN — elle bloque désormais aussi l'essai de PIN courants
-- (1234, 0000…) sur de nombreuses adresses e-mail.
create or replace function panel_pin_login(p_email text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r device_pins; dev devices; v_ip text := panel_client_ip();
begin
    if tg_rl_blocked(v_ip, 'pin_login_fail', 20) then
        return jsonb_build_object('ok', false, 'error', 'locked');
    end if;
    select * into r from device_pins where lower(email) = lower(trim(coalesce(p_email, '')));
    if r.device_id is null then
        perform tg_rl_count(v_ip, 'pin_login_fail');
        return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if r.locked_until is not null and r.locked_until > now() then
        return jsonb_build_object('ok', false, 'error', 'locked');
    end if;
    if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
        update device_pins set fail_count = 0, locked_until = null where device_id = r.device_id;
        select * into dev from devices where id = r.device_id;
        return jsonb_build_object('ok', true, 'device_id', dev.id, 'name', dev.name,
                                  'secret', dev.secret_key);
    end if;
    perform tg_rl_count(v_ip, 'pin_login_fail');
    update device_pins
       set fail_count = fail_count + 1,
           locked_until = case when fail_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end
     where device_id = r.device_id;
    return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;


-- ----------------------------------------------------------------------------
--  4. Relais Telegram (11) — même garde, même compteur, clés fortes seulement
-- ----------------------------------------------------------------------------

create or replace function tg_create_start_link(
    p_secret      text,
    p_kind        text,
    p_owner_name  text default null,
    p_device_name text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_id  uuid;
    v_tok text;
    v_exp timestamptz;
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then return tg_err('rate_limited'); end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return tg_err('invalid_secret'); end if;
    if p_kind not in ('link', 'pair') then return tg_err('bad_kind'); end if;

    delete from tg_start_tokens
     where device_id = v_id and (kind = p_kind or expires_at < now());

    v_tok := encode(gen_random_bytes(16), 'hex');
    v_exp := now() + case p_kind when 'link' then interval '1 hour' else interval '24 hours' end;
    insert into tg_start_tokens(token, device_id, kind, owner_name, device_name, expires_at)
    values (v_tok, v_id, p_kind,
            nullif(left(btrim(coalesce(p_owner_name, '')), 64), ''),
            nullif(left(btrim(coalesce(p_device_name, '')), 64), ''),
            v_exp);
    return jsonb_build_object('ok', true, 'token', v_tok,
                              'expires_at', extract(epoch from v_exp)::bigint);
end $$;

create or replace function tg_get_links(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then return tg_err('rate_limited'); end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return tg_err('invalid_secret'); end if;
    return jsonb_build_object('ok', true, 'links', coalesce((
        select jsonb_agg(jsonb_build_object(
                   'chat_id', l.chat_id::text, 'role', l.role, 'name', l.name)
               order by (l.role = 'owner') desc, l.created_at)
          from tg_links l where l.device_id = v_id), '[]'::jsonb));
end $$;

create or replace function tg_unlink(p_secret text, p_chat_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then return tg_err('rate_limited'); end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return tg_err('invalid_secret'); end if;
    if coalesce(p_chat_id, '') !~ '^-?[0-9]{1,20}$' then return tg_err('bad_chat'); end if;
    delete from tg_links where device_id = v_id and chat_id = p_chat_id::bigint;
    return jsonb_build_object('ok', true, 'removed', found);
end $$;

create or replace function tg_poll(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_id   uuid;
    v_cmds jsonb;
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then return tg_err('rate_limited'); end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return tg_err('invalid_secret'); end if;
    with gone as (
        delete from tg_inbox i where i.device_id = v_id returning i.*
    )
    select coalesce(jsonb_agg(jsonb_build_object(
               'chat_id', g.chat_id::text, 'command', g.command,
               'sender_role', g.sender_role, 'sender_name', g.sender_name)
           order by g.id), '[]'::jsonb)
      into v_cmds
      from gone g
     where g.created_at > now() - interval '10 minutes';
    return jsonb_build_object('ok', true, 'commands', v_cmds);
end $$;

create or replace function tg_authorize_send(p_secret text, p_to text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_id    uuid;
    v_chats jsonb;
    v_count int;
begin
    if tg_rl_blocked(p_ip, 'key_fail', 30) then return tg_err('rate_limited'); end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then
        perform tg_rl_count(p_ip, 'key_fail');
        return tg_err('invalid_secret');
    end if;

    if p_to = 'all' then
        select coalesce(jsonb_agg(l.chat_id::text), '[]'::jsonb) into v_chats
          from tg_links l where l.device_id = v_id;
    elsif coalesce(p_to, '') ~ '^-?[0-9]{1,20}$' then
        if exists (select 1 from tg_links
                   where device_id = v_id and chat_id = p_to::bigint)
           or exists (select 1 from tg_sessions
                      where device_id = v_id and chat_id = p_to::bigint
                        and expires_at > now() - interval '15 minutes') then
            v_chats := jsonb_build_array(p_to);
        else
            return tg_err('chat_not_linked');
        end if;
    else
        return tg_err('bad_recipient');
    end if;

    if jsonb_array_length(v_chats) = 0 then
        return jsonb_build_object('ok', true, 'chat_ids', v_chats);
    end if;

    insert into tg_send_quota as q (device_id, window_start, count)
        values (v_id, now(), jsonb_array_length(v_chats))
    on conflict (device_id) do update set
        count = case when q.window_start < now() - interval '1 minute'
                     then excluded.count else q.count + excluded.count end,
        window_start = case when q.window_start < now() - interval '1 minute'
                            then now() else q.window_start end
    returning count into v_count;
    if v_count > 60 then return tg_err('rate_limited'); end if;

    return jsonb_build_object('ok', true, 'chat_ids', v_chats);
end $$;

-- Webhook : seule la vérification de clé change (clé forte, 12 car. minimum ;
-- un texte libre plus court n'est plus pris pour une clé). Le reste est
-- identique à 11_telegram_relay.sql.
create or replace function tg_handle_update(
    p_update_id  bigint,
    p_message_id bigint,
    p_chat_id    bigint,
    p_text       text,
    p_first_name text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_text    text := left(btrim(coalesce(p_text, '')), 512);
    v_name    text := nullif(left(btrim(coalesce(p_first_name, '')), 64), '');
    v_out     jsonb := '[]';
    v_del     jsonb := '[]';
    v_param   text;
    v_tok     tg_start_tokens;
    v_cmd     text;
    v_arg     text;
    v_key     text;
    v_linked  boolean;
    v_sess    uuid;
    v_pending text;
    v_dev     uuid;
    v_n       int;
begin
    insert into tg_seen_updates(update_id) values (p_update_id) on conflict do nothing;
    if not found then
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;
    if random() < 0.02 then perform tg_housekeeping(); end if;
    if v_text = '' then
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    if v_text ~ '^/start\s+(link|pair)_' then
        v_param := substring(v_text from '^/start\s+((?:link|pair)_[0-9a-f]{32})$');
        if v_param is not null then
            select * into v_tok from tg_start_tokens
             where token = substr(v_param, 6) and kind = left(v_param, 4)
               and expires_at > now()
             for update;
        end if;

        if v_tok.token is null then
            v_out := v_out || tg_reply(p_chat_id,
                '⚠️ Lien invalide ou expiré. Générez-en un nouveau dans l''app HearMe.');

        elsif v_tok.kind = 'link' then
            delete from tg_links where device_id = v_tok.device_id and role = 'owner';
            insert into tg_links(device_id, chat_id, role, name)
                values (v_tok.device_id, p_chat_id, 'owner', v_name)
            on conflict (device_id, chat_id) do update set role = 'owner', name = excluded.name;
            delete from tg_start_tokens where token = v_tok.token;
            v_out := v_out || tg_reply(p_chat_id,
                '📱 HearMe Security' || E'\n\n' ||
                'Votre smartphone (' || coalesce(v_tok.device_name, 'HearMe') ||
                ') est désormais lié à ce bot !' || E'\n' ||
                'Vous recevrez ici vos alertes de déverrouillage, photos et positions GPS.',
                jsonb_build_object(
                    'keyboard', jsonb_build_array(jsonb_build_array('🧪 Envoyer un test d''alarme')),
                    'resize_keyboard', true));

        elsif exists (select 1 from tg_links
                      where device_id = v_tok.device_id and chat_id = p_chat_id) then
            v_out := v_out || tg_reply(p_chat_id, '✅ Vous êtes déjà relié à ce téléphone.');

        else
            select count(*) into v_n from tg_links
             where device_id = v_tok.device_id and role = 'contact';
            if v_n >= 2 then
                v_out := v_out || tg_reply(p_chat_id,
                    '⚠️ Impossible d''ajouter : le nombre maximum de contacts de confiance est déjà atteint.');
            else
                insert into tg_links(device_id, chat_id, role, name)
                    values (v_tok.device_id, p_chat_id, 'contact', v_name);
                delete from tg_start_tokens where token = v_tok.token;
                v_out := v_out || tg_reply(p_chat_id,
                    '✅ C''est fait ! Vous êtes désormais un contact d''urgence de ' ||
                    coalesce(v_tok.owner_name, 'votre proche') ||
                    '. En cas de vol ou d''alerte, vous recevrez ici sa position et les photos.');
            end if;
        end if;
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    v_linked := exists (select 1 from tg_links where chat_id = p_chat_id);
    select device_id into v_sess from tg_sessions
     where chat_id = p_chat_id and expires_at > now();

    if lower(v_text) ~ '^/(start|help|menu)(@\S+)?(\s.*)?$' then
        v_out := v_out || tg_menu_reply(p_chat_id, v_linked or v_sess is not null);
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    select c.cmd, c.arg into v_cmd, v_arg from tg_parse_command(v_text) c;
    select command into v_pending from tg_pending
     where chat_id = p_chat_id and created_at > now() - interval '10 minutes';

    if v_cmd is not null then
        v_key := v_arg;
    elsif (v_pending is not null or (not v_linked and v_sess is null))
          and v_text ~ '^[A-Za-z0-9]{12,64}$' then
        v_key := v_text;
    end if;

    if v_key is not null then
        if p_message_id is not null then
            v_del := v_del || jsonb_build_array(
                jsonb_build_object('chat_id', p_chat_id, 'message_id', p_message_id));
        end if;
        if tg_key_blocked(p_chat_id) then
            v_out := v_out || tg_reply(p_chat_id,
                '⏳ Trop d''essais de clé. Réessayez dans 15 minutes.');
            return jsonb_build_object('replies', v_out, 'delete', v_del);
        end if;

        v_dev := coalesce(hm_device_id(v_key), hm_device_id(upper(v_key)));
        if v_dev is null then
            perform tg_key_fail(p_chat_id);
            delete from tg_pending where chat_id = p_chat_id;
            v_out := v_out || tg_reply(p_chat_id,
                '❌ Clé incorrecte. Choisissez à nouveau une action 👇', tg_menu_keyboard());
            return jsonb_build_object('replies', v_out, 'delete', v_del);
        end if;

        delete from tg_key_attempts where chat_id = p_chat_id;
        insert into tg_sessions(chat_id, device_id, expires_at)
            values (p_chat_id, v_dev, now() + interval '15 minutes')
        on conflict (chat_id) do update
            set device_id = excluded.device_id, expires_at = excluded.expires_at;
        v_cmd := coalesce(v_cmd, v_pending);
        delete from tg_pending where chat_id = p_chat_id;

        if v_cmd is null then
            v_out := v_out || tg_reply(p_chat_id,
                '✅ Clé acceptée pour 15 minutes — choisissez une action 👇', tg_menu_keyboard());
        else
            perform tg_enqueue(v_dev, p_chat_id, v_cmd, 'key', v_name);
            v_out := v_out || tg_ack(p_chat_id);
        end if;
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    if v_cmd is null then
        v_out := v_out || tg_menu_reply(p_chat_id, v_linked or v_sess is not null);
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    if v_linked then
        perform tg_enqueue(l.device_id, p_chat_id, v_cmd, l.role, coalesce(l.name, v_name))
           from tg_links l where l.chat_id = p_chat_id;
        v_out := v_out || tg_ack(p_chat_id);
    elsif v_sess is not null then
        perform tg_enqueue(v_sess, p_chat_id, v_cmd, 'key', v_name);
        v_out := v_out || tg_ack(p_chat_id);
    else
        insert into tg_pending(chat_id, command) values (p_chat_id, v_cmd)
        on conflict (chat_id) do update set command = excluded.command, created_at = now();
        v_out := v_out || tg_reply(p_chat_id,
            '🔑 Envoyez votre clé secrète pour exécuter « ' || v_text || ' » (12 caractères) :');
    end if;
    return jsonb_build_object('replies', v_out, 'delete', v_del);
end $$;


-- ----------------------------------------------------------------------------
--  5. Droits
-- ----------------------------------------------------------------------------
--  Les outils hm_* sont internes. rotate_secret et panel_request_regenerate
--  ont été recréées (type de retour changé) : on remet leurs droits.

do $$
declare f record;
begin
    for f in
        select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('hm_key_ok', 'hm_device_id', 'hm_guard', 'hm_fail',
                                                     'rotate_secret', 'panel_request_regenerate')
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    end loop;
end $$;

grant execute on function rotate_secret(text, text)          to anon;
grant execute on function panel_request_regenerate(text)     to anon, authenticated;
