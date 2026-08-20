-- =========================================================================
-- HearMe — Panneau Web d'urgence : fonctions RPC
-- -------------------------------------------------------------------------
-- Deux publics :
--   • CÔTÉ APP (téléphone)   → s'authentifie par sa clé secrète (rôle anon).
--   • CÔTÉ PANNEAU (secret)  → lecture/commande par la clé secrète (anon).
--   • CÔTÉ PANNEAU (compte)  → tables directes via RLS ; + claim ci-dessous.
-- Toutes ces fonctions sont SECURITY DEFINER : elles seules touchent aux
-- tables pour le rôle anon. Chacune est cloisonnée à l'appareil de la clé.
-- =========================================================================

-- =====================  CÔTÉ APP (téléphone)  ============================

-- Crée/actualise l'appareil (upsert au premier contact) : état + heartbeat.
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

-- Ajoute une position GPS + met à jour le heartbeat.
create or replace function push_location(
    p_secret text, p_lat double precision, p_lon double precision,
    p_accuracy real default null, p_battery int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then raise exception 'clé secrète invalide'; end if;
    if p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180 then
        raise exception 'coordonnées invalides';
    end if;
    insert into device_locations(device_id, lat, lon, accuracy_m, battery_level)
    values (v_id, p_lat, p_lon, p_accuracy, p_battery);
    update devices set last_seen = now(), is_online = true,
        battery_level = coalesce(p_battery, battery_level), updated_at = now()
    where id = v_id;
end $$;

-- Enregistre une photo déjà déposée dans le bucket (chemin relatif).
create or replace function record_photo(
    p_secret text, p_path text, p_event text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_pid uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then raise exception 'clé secrète invalide'; end if;
    insert into security_photos(device_id, storage_path, event_type)
    values (v_id, p_path, p_event) returning id into v_pid;
    return v_pid;
end $$;

-- L'app récupère ses commandes en attente et les marque 'delivered'.
create or replace function poll_commands(p_secret text)
returns table(id uuid, command text, params jsonb, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_id uuid;
begin
    select d.id into v_id from devices d where d.secret_key = p_secret;
    if v_id is null then raise exception 'clé secrète invalide'; end if;
    update devices d set last_seen = now(), is_online = true where d.id = v_id;
    return query
      update device_commands c set status = 'delivered'
      where c.device_id = v_id and c.status = 'pending'
      returning c.id, c.command, c.params, c.created_at;
end $$;

-- L'app confirme l'exécution d'une commande.
create or replace function ack_command(p_secret text, p_command_id uuid, p_ok boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
begin
    update device_commands set
        status = case when p_ok then 'done' else 'failed' end,
        executed_at = now()
    where id = p_command_id
      and device_id = (select id from devices where secret_key = p_secret);
end $$;

-- Rotation de la clé (l'app génère la nouvelle après la commande regenerate_key).
create or replace function rotate_secret(p_old text, p_new text)
returns void
language plpgsql security definer set search_path = public as $$
begin
    if p_new is null or length(p_new) < 6 then raise exception 'nouvelle clé trop courte'; end if;
    update devices set secret_key = p_new, updated_at = now() where secret_key = p_old;
    if not found then raise exception 'clé actuelle invalide'; end if;
end $$;

-- =====================  CÔTÉ PANNEAU (accès par clé)  ====================

create or replace function panel_get_device(p_secret text)
returns table(
    id uuid, name text, battery_level int, network_status text,
    is_locked boolean, is_online boolean, last_seen timestamptz, secret_key text
)
language sql stable security definer set search_path = public as $$
    select d.id, d.name, d.battery_level, d.network_status,
           d.is_locked, d.is_online, d.last_seen, d.secret_key
    from devices d where d.secret_key = p_secret limit 1;
$$;

create or replace function panel_get_locations(p_secret text, p_limit int default 50)
returns table(lat double precision, lon double precision, accuracy_m real,
              battery_level int, recorded_at timestamptz)
language sql stable security definer set search_path = public as $$
    select l.lat, l.lon, l.accuracy_m, l.battery_level, l.recorded_at
    from device_locations l
    join devices d on d.id = l.device_id
    where d.secret_key = p_secret
    order by l.recorded_at desc
    limit greatest(1, least(p_limit, 500));
$$;

create or replace function panel_get_photos(p_secret text, p_limit int default 12)
returns table(id uuid, storage_path text, event_type text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
    select p.id, p.storage_path, p.event_type, p.created_at
    from security_photos p
    join devices d on d.id = p.device_id
    where d.secret_key = p_secret
    order by p.created_at desc
    limit greatest(1, least(p_limit, 60));
$$;

-- Envoyer une commande d'urgence (verrouiller / alarme / …).
create or replace function panel_send_command(p_secret text, p_command text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cmd uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then raise exception 'clé secrète invalide'; end if;
    if p_command not in ('lock','alarm','stopalarm','locate','photo') then
        raise exception 'commande inconnue';
    end if;
    insert into device_commands(device_id, command) values (v_id, p_command)
    returning id into v_cmd;
    return v_cmd;
end $$;

-- Demande la régénération de la clé : l'app la fera tourner à sa prochaine sync.
create or replace function panel_request_regenerate(p_secret text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then raise exception 'clé secrète invalide'; end if;
    insert into device_commands(device_id, command) values (v_id, 'regenerate_key');
end $$;

-- =====================  CÔTÉ PANNEAU (compte connecté)  =================

-- Rattache un appareil (par sa clé) au compte connecté.
create or replace function claim_device_by_secret(p_secret text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then raise exception 'aucun appareil pour cette clé'; end if;
    update devices set user_id = auth.uid(), updated_at = now()
      where id = v_id and (user_id is null or user_id = auth.uid());
    if not found then raise exception 'appareil déjà rattaché à un autre compte'; end if;
    return v_id;
end $$;

-- =====================  DROITS D'EXÉCUTION  =============================
-- Côté app (anon) :
grant execute on function push_device_state(text,text,int,text,boolean) to anon;
grant execute on function push_location(text,double precision,double precision,real,int) to anon;
grant execute on function record_photo(text,text,text) to anon;
grant execute on function poll_commands(text) to anon;
grant execute on function ack_command(text,uuid,boolean) to anon;
grant execute on function rotate_secret(text,text) to anon;
-- Côté panneau (clé secrète = anon, et aussi utilisable connecté) :
grant execute on function panel_get_device(text) to anon, authenticated;
grant execute on function panel_get_locations(text,int) to anon, authenticated;
grant execute on function panel_get_photos(text,int) to anon, authenticated;
grant execute on function panel_send_command(text,text) to anon, authenticated;
grant execute on function panel_request_regenerate(text) to anon, authenticated;
-- Rattachement réservé aux comptes connectés :
grant execute on function claim_device_by_secret(text) to authenticated;
