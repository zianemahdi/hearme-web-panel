-- ============================================================================
--  27_device_alert_state.sql — Le panneau voit le mode d'alerte du téléphone
-- ----------------------------------------------------------------------------
--  Problème : l'interrupteur « Activer la recherche » du panneau ne connaissait
--  que ce que CE navigateur avait envoyé. Après un rechargement, il revenait sur
--  « arrêté » alors que le téléphone était encore en mode recherche.
--
--  Le vrai état est sur le téléphone (is_lost = recherche/perdu, is_stolen = volé) :
--  le propriétaire peut aussi le changer depuis l'app. Le téléphone le signale
--  donc à chaque synchronisation (push_device_state), et panel_get_device le
--  renvoie au panneau.
--
--  null = « inconnu » : version de l'app qui ne le signale pas encore, ou appel
--  qui ne le précise pas (liaison du compte, Telegram) → la valeur ne change pas.
--
--  Compatibilité : les deux nouveaux paramètres ont une valeur par défaut, les
--  versions actuelles de l'app (5 paramètres nommés) continuent de fonctionner.
--  Les signatures changent : on supprime puis recrée (une seule version de
--  chaque fonction), dans la même transaction.
-- ============================================================================

alter table devices add column if not exists is_lost   boolean;
alter table devices add column if not exists is_stolen boolean;
comment on column devices.is_lost   is 'Mode recherche / perdu, signalé par le téléphone (null = non signalé)';
comment on column devices.is_stolen is 'Déclaré volé, signalé par le téléphone (null = non signalé)';


-- 1. Le téléphone signale son état (+ son mode d'alerte).
drop function if exists push_device_state(text, text, int, text, boolean);
create function push_device_state(
    p_secret  text,
    p_name    text    default null,
    p_battery int     default null,
    p_network text    default null,
    p_locked  boolean default null,
    p_lost    boolean default null,
    p_stolen  boolean default null
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
        insert into devices(secret_key, name, battery_level, network_status, is_locked, is_online, last_seen,
                            is_lost, is_stolen)
        values (p_secret, coalesce(p_name, 'Mon téléphone'), p_battery, p_network,
                coalesce(p_locked, false), true, now(), p_lost, p_stolen)
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
        is_lost        = coalesce(p_lost, is_lost),
        is_stolen      = coalesce(p_stolen, is_stolen),
        is_online      = true,
        last_seen      = now(),
        updated_at     = now()
    where id = v_id;
    return v_id;
end $$;

revoke all on function push_device_state(text, text, int, text, boolean, boolean, boolean) from public;
grant execute on function push_device_state(text, text, int, text, boolean, boolean, boolean) to anon;


-- 2. Le panneau lit l'appareil, mode d'alerte compris.
drop function if exists panel_get_device(text);
create function panel_get_device(p_secret text)
returns table(id uuid, name text, battery_level int, network_status text,
              is_locked boolean, is_online boolean, last_seen timestamptz, secret_key text,
              is_lost boolean, is_stolen boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return; end if;
    return query
        select d.id, d.name, d.battery_level, d.network_status,
               d.is_locked, d.is_online, d.last_seen, d.secret_key,
               d.is_lost, d.is_stolen
        from devices d where d.id = v_id;
end $$;

revoke all on function panel_get_device(text) from public;
grant execute on function panel_get_device(text) to anon, authenticated;
