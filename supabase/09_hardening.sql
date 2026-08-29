-- ============================================================================
--  09_hardening.sql — Durcissement issu du test d'intrusion du 29/08/2026
-- ----------------------------------------------------------------------------
--  Corrige deux constats :
--
--  HM-05 — L'anti-force-brute ne gardait qu'une porte sur huit. Seul
--          panel_get_device appelait panel_rl_check ; les sept autres fonctions
--          qui acceptent la clé secrète n'avaient aucune limite. De plus le
--          compteur se calait sur le PREMIER élément de X-Forwarded-For, un
--          en-tête fourni par le client : le changer à chaque requête donnait un
--          compteur neuf. On prend désormais l'IP posée par le proxy.
--
--  HM-07 — PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute nouvelle
--          fonction. Le « grant … to authenticated » de claim_device_by_secret
--          ne restreignait donc rien. On révoque PUBLIC partout et on change le
--          défaut pour les fonctions à venir.
--
--  Principe conservé : on ne compte QUE les échecs. Le téléphone qui synchronise
--  avec une bonne clé, et le panneau qui rafraîchit, ne sont jamais bridés.
--
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Identification de l'appelant, robuste à l'usurpation d'en-tête
-- ----------------------------------------------------------------------------
--  Ordre de confiance :
--    1. cf-connecting-ip  — posé par Cloudflare, non modifiable par le client
--    2. x-real-ip         — posé par le proxy
--    3. DERNIER élément de x-forwarded-for — le proxy ajoute la vraie IP à la
--       fin ; tout ce que le client a mis avant est ignoré.
--  Renvoie '' si rien n'est exploitable (on ne bloque alors personne).
-- ----------------------------------------------------------------------------
create or replace function panel_client_ip()
returns text
language plpgsql stable security definer set search_path = public as $$
declare
    h    json;
    v    text;
    xff  text;
    part text;
begin
    begin
        h := current_setting('request.headers', true)::json;
    exception when others then
        return '';
    end;
    if h is null then return ''; end if;

    v := btrim(coalesce(h ->> 'cf-connecting-ip', ''));
    if v <> '' then return v; end if;

    v := btrim(coalesce(h ->> 'x-real-ip', ''));
    if v <> '' then return v; end if;

    xff := coalesce(h ->> 'x-forwarded-for', '');
    if btrim(xff) = '' then return ''; end if;
    -- Dernier élément non vide : celui ajouté par notre propre proxy.
    foreach part in array string_to_array(xff, ',') loop
        if btrim(part) <> '' then v := btrim(part); end if;
    end loop;
    return coalesce(v, '');
end $$;


create or replace function panel_rl_check(p_action text, p_max int, p_window interval)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
    v_ip    text;
    v_count int;
begin
    v_ip := panel_client_ip();
    if v_ip is null or btrim(v_ip) = '' then
        return; -- IP inconnue → on ne bloque jamais un usage légitime par erreur
    end if;

    insert into panel_rate_limit(ip, action, window_start, count)
        values (v_ip, p_action, now(), 1)
    on conflict (ip, action) do update set
        count = case when panel_rate_limit.window_start < now() - p_window
                     then 1 else panel_rate_limit.count + 1 end,
        window_start = case when panel_rate_limit.window_start < now() - p_window
                            then now() else panel_rate_limit.window_start end
    returning count into v_count;

    if v_count > p_max then
        raise exception 'Trop de tentatives. Réessayez plus tard.' using errcode = 'P0001';
    end if;
end $$;


-- Raccourci : une tentative ratée sur une clé/identifiant.
create or replace function panel_rl_fail(p_action text, p_max int default 20)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
    perform panel_rl_check(p_action, p_max, interval '10 minutes');
end $$;


-- ----------------------------------------------------------------------------
--  2. Fonctions côté TÉLÉPHONE — on compte les clés invalides
-- ----------------------------------------------------------------------------

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
    if p_secret is null or length(p_secret) < 4 then
        perform panel_rl_fail('push_state_fail', 30);
        raise exception 'clé secrète invalide';
    end if;
    insert into devices(secret_key, name, battery_level, network_status, is_locked, is_online, last_seen)
    values (p_secret, coalesce(p_name,'Mon téléphone'), p_battery, p_network, coalesce(p_locked,false), true, now())
    on conflict (secret_key) do update set
        name           = coalesce(p_name, devices.name),
        battery_level  = coalesce(p_battery, devices.battery_level),
        network_status = coalesce(p_network, devices.network_status),
        is_locked      = coalesce(p_locked, devices.is_locked),
        is_online      = true,
        last_seen      = now(),
        updated_at     = now()
    returning id into v_id;
    return v_id;
end $$;

create or replace function push_location(
    p_secret text, p_lat double precision, p_lon double precision,
    p_accuracy real default null, p_battery int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform panel_rl_fail('push_location_fail', 30);
        raise exception 'clé secrète invalide';
    end if;
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
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform panel_rl_fail('record_photo_fail', 30);
        raise exception 'clé secrète invalide';
    end if;
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
    select d.id into v_id from devices d where d.secret_key = p_secret;
    if v_id is null then
        perform panel_rl_fail('poll_commands_fail', 30);
        raise exception 'clé secrète invalide';
    end if;
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
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform panel_rl_fail('ack_command_fail', 30);
        return; -- silencieux, comme avant : un ack orphelin n'est pas une erreur
    end if;
    update device_commands set
        status = case when p_ok then 'done' else 'failed' end,
        executed_at = now()
    where id = p_command_id and device_id = v_id;
end $$;

create or replace function rotate_secret(p_old text, p_new text)
returns void
language plpgsql security definer set search_path = public as $$
begin
    if p_new is null or length(p_new) < 6 then raise exception 'nouvelle clé trop courte'; end if;
    update devices set secret_key = p_new, updated_at = now() where secret_key = p_old;
    if not found then
        perform panel_rl_fail('rotate_secret_fail', 10);
        raise exception 'clé actuelle invalide';
    end if;
end $$;


-- ----------------------------------------------------------------------------
--  3. Fonctions côté PANNEAU — lectures et commandes
-- ----------------------------------------------------------------------------
--  panel_get_locations / panel_get_photos passent de « language sql » à plpgsql
--  pour pouvoir compter les échecs. Comportement inchangé : clé inconnue = 0 ligne.

create or replace function panel_get_locations(p_secret text, p_limit int default 50)
returns table(lat double precision, lon double precision, accuracy_m real,
              battery_level int, recorded_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
    select d.id into v_id from devices d where d.secret_key = p_secret;
    if v_id is null then
        perform panel_rl_fail('panel_read_fail', 20);
        return;
    end if;
    return query
        select l.lat, l.lon, l.accuracy_m, l.battery_level, l.recorded_at
        from device_locations l
        where l.device_id = v_id
        order by l.recorded_at desc
        limit greatest(1, least(p_limit, 500));
end $$;

create or replace function panel_get_photos(p_secret text, p_limit int default 12)
returns table(id uuid, storage_path text, event_type text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_id uuid;
begin
    select d.id into v_id from devices d where d.secret_key = p_secret;
    if v_id is null then
        perform panel_rl_fail('panel_read_fail', 20);
        return;
    end if;
    return query
        select p.id, p.storage_path, p.event_type, p.created_at
        from security_photos p
        where p.device_id = v_id
        order by p.created_at desc
        limit greatest(1, least(p_limit, 60));
end $$;

--  Liste blanche conservée telle quelle (voir 08_lost_mode.sql).
create or replace function panel_send_command(p_secret text, p_command text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cmd uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform panel_rl_fail('send_command_fail', 20);
        raise exception 'clé secrète invalide';
    end if;
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

create or replace function panel_request_regenerate(p_secret text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform panel_rl_fail('send_command_fail', 20);
        raise exception 'clé secrète invalide';
    end if;
    insert into device_commands(device_id, command) values (v_id, 'regenerate_key');
end $$;

create or replace function claim_device_by_secret(p_secret text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform panel_rl_fail('claim_fail', 10);
        raise exception 'aucun appareil pour cette clé';
    end if;
    update devices set user_id = auth.uid(), updated_at = now()
      where id = v_id and (user_id is null or user_id = auth.uid());
    if not found then raise exception 'appareil déjà rattaché à un autre compte'; end if;
    return v_id;
end $$;


-- ----------------------------------------------------------------------------
--  4. Accès d'urgence — magic link et PIN
-- ----------------------------------------------------------------------------
--  (search_path = public, extensions : pgcrypto vit dans « extensions » sur
--   Supabase — c'est le correctif HM-01/HM-02 du 29/08.)

create or replace function mint_access_token(p_secret text, p_ttl_minutes int default 15)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare d_id uuid; tok text;
begin
    select id into d_id from devices where secret_key = p_secret;
    if d_id is null then
        perform panel_rl_fail('mint_token_fail', 10);
        raise exception 'invalid secret';
    end if;

    delete from device_access_tokens
     where device_id = d_id and (used_at is not null or expires_at < now());

    tok := encode(gen_random_bytes(24), 'hex');
    insert into device_access_tokens(token, device_id, expires_at)
        values (tok, d_id, now() + make_interval(mins => greatest(1, p_ttl_minutes)));
    return tok;
end $$;

--  Le jeton fait 96 bits : le deviner est hors de portée. On limite quand même
--  les essais pour éviter le martèlement du serveur.
create or replace function consume_access_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r device_access_tokens; dev devices;
begin
    select * into r from device_access_tokens where token = p_token;
    if r.token is null then
        perform panel_rl_fail('consume_token_fail', 20);
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
        'secret', dev.secret_key,
        'issued_at', extract(epoch from now())::bigint,   -- borne la session de crise
        'scope', r.scope
    );
end $$;

create or replace function set_device_pin(p_secret text, p_email text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare d_id uuid; other uuid;
begin
    select id into d_id from devices where secret_key = p_secret;
    if d_id is null then
        perform panel_rl_fail('set_pin_fail', 10);
        return jsonb_build_object('ok', false, 'error', 'invalid_secret');
    end if;
    if p_email is null or length(trim(p_email)) = 0 then
        return jsonb_build_object('ok', false, 'error', 'no_email');
    end if;
    if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
        return jsonb_build_object('ok', false, 'error', 'bad_pin');
    end if;

    select device_id into other
      from device_pins
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

--  Double protection : verrou par appareil (5 essais / 15 min, déjà en place)
--  ET limite par IP, qui couvre aussi le balayage d'adresses e-mail inconnues.
create or replace function panel_pin_login(p_email text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r device_pins; dev devices;
begin
    select * into r from device_pins where lower(email) = lower(trim(coalesce(p_email, '')));
    if r.device_id is null then
        perform panel_rl_fail('pin_login_fail', 20);
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
    else
        perform panel_rl_fail('pin_login_fail', 20);
        update device_pins
           set fail_count = fail_count + 1,
               locked_until = case when fail_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end
         where device_id = r.device_id;
        return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
end $$;


-- ----------------------------------------------------------------------------
--  5. HM-07 — Fermer l'accès PUBLIC hérité
-- ----------------------------------------------------------------------------
--  PostgreSQL accorde EXECUTE à PUBLIC sur toute nouvelle fonction. On révoque,
--  puis on rend explicites les droits dont l'app et le panneau ont réellement
--  besoin. Les fonctions internes (panel_rl_check, panel_client_ip, panel_rl_fail)
--  ne reçoivent AUCUN droit : elles sont appelées depuis des fonctions
--  SECURITY DEFINER, donc sous l'identité du propriétaire.

do $$
declare f record;
begin
    for f in
        select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
    loop
        begin
            execute format('revoke execute on function %s from public', f.sig);
        exception when others then
            raise notice 'révocation ignorée sur % : %', f.sig, sqlerrm;
        end;
    end loop;
end $$;

-- Les fonctions à venir ne seront plus exposées à PUBLIC par défaut.
alter default privileges in schema public revoke execute on functions from public;

-- Côté téléphone (anon) :
grant execute on function push_device_state(text,text,int,text,boolean)                  to anon;
grant execute on function push_location(text,double precision,double precision,real,int) to anon;
grant execute on function record_photo(text,text,text)                                   to anon;
grant execute on function poll_commands(text)                                            to anon;
grant execute on function ack_command(text,uuid,boolean)                                 to anon;
grant execute on function rotate_secret(text,text)                                       to anon;
grant execute on function mint_access_token(text,int)                                    to anon, authenticated;
grant execute on function set_device_pin(text,text,text)                                 to anon, authenticated;

-- Côté panneau (accès par clé, magic link ou PIN) :
grant execute on function panel_get_device(text)              to anon, authenticated;
grant execute on function panel_get_locations(text,int)       to anon, authenticated;
grant execute on function panel_get_photos(text,int)          to anon, authenticated;
grant execute on function panel_send_command(text,text)       to anon, authenticated;
grant execute on function panel_request_regenerate(text)      to anon, authenticated;
grant execute on function consume_access_token(text)          to anon, authenticated;
grant execute on function panel_pin_login(text,text)          to anon, authenticated;

-- Rattachement au compte : réservé aux comptes connectés — désormais pour de bon.
grant execute on function claim_device_by_secret(text)        to authenticated;

-- Carte communautaire (Module 3) :
grant execute on function report_incident(double precision,double precision,real)                     to anon, authenticated;
grant execute on function zones_in_bbox(double precision,double precision,double precision,double precision) to anon, authenticated;
