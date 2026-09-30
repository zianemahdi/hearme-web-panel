-- ============================================================================
--  17_restore_device.sql — « Restaurer mon téléphone » après une réinstallation
-- ----------------------------------------------------------------------------
--  Une réinstallation (ou un effacement des données) donne une NOUVELLE clé,
--  donc un nouvel appareil vide : liaisons Telegram, proches, historique GPS
--  restaient sur l'ancien, devenu inaccessible.
--
--  Restaurer = l'ANCIEN appareil (qui garde son id, donc tout son historique)
--  prend la clé de la nouvelle installation ; la ligne vide créée par la
--  réinstallation est supprimée. Le PIN (15) est déjà lié au compte.
--
--  Garde-fous :
--   • connecté (JWT) ET détenteur de la nouvelle clé, rattachée à ce compte ;
--   • l'ancien appareil appartient au même compte ;
--   • il est muet depuis au moins 2 minutes (le téléphone synchronise toutes
--     les 7 à 12 s) : on ne débranche pas un téléphone vivant par erreur, ni
--     avec un simple mot de passe de compte volé ;
--   • les commandes restées en attente pendant qu'il était éteint sont
--     annulées : une alarme d'il y a 3 jours ne sonne pas à la restauration ;
--   • tout se fait dans une seule transaction.
-- ============================================================================

-- Anciens téléphones du compte, pour que l'app propose la restauration.
create or replace function restorable_devices(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_dev uuid; v_list jsonb;
begin
    if v_uid is null then
        return jsonb_build_object('ok', false, 'error', 'not_signed_in');
    end if;
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then
        return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
    v_dev := hm_device_id(p_secret);
    if v_dev is null then
        perform hm_fail();
        return jsonb_build_object('ok', false, 'error', 'invalid_secret');
    end if;
    if not exists (select 1 from devices where id = v_dev and user_id = v_uid) then
        return jsonb_build_object('ok', false, 'error', 'not_linked');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id,
               'name', d.name,
               'seen_ago_s', case when d.last_seen is null then null
                                  else greatest(0, extract(epoch from now() - d.last_seen))::bigint end,
               'active', coalesce(d.last_seen > now() - interval '2 minutes', false),
               'telegram', exists (select 1 from tg_links l where l.device_id = d.id and l.role = 'owner'),
               'contacts', (select count(*) from tg_links l where l.device_id = d.id and l.role = 'contact'),
               'locations', (select count(*) from device_locations x where x.device_id = d.id),
               'photos', (select count(*) from security_photos p where p.device_id = d.id)
           ) order by d.last_seen desc nulls last), '[]'::jsonb)
      into v_list
      from (select * from devices
             where user_id = v_uid and id <> v_dev
             order by last_seen desc nulls last
             limit 5) d;
    return jsonb_build_object('ok', true, 'devices', v_list);
end $$;

-- Restaure l'ancien appareil p_old sur cette installation (clé p_secret).
create or replace function restore_device(p_old uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_dev uuid; v_new uuid; o devices;
begin
    if v_uid is null then
        return jsonb_build_object('ok', false, 'error', 'not_signed_in');
    end if;
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then
        return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
    v_dev := hm_device_id(p_secret);
    if v_dev is null then
        perform hm_fail();
        return jsonb_build_object('ok', false, 'error', 'invalid_secret');
    end if;
    select id into v_new from devices where id = v_dev and user_id = v_uid;
    if v_new is null then
        return jsonb_build_object('ok', false, 'error', 'not_linked');
    end if;
    select * into o from devices where id = p_old and user_id = v_uid for update;
    if o.id is null or o.id = v_new then
        return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if o.last_seen is not null and o.last_seen > now() - interval '2 minutes' then
        return jsonb_build_object('ok', false, 'error', 'still_active');
    end if;
    -- Les photos sont rangées dans un dossier au nom de l'appareil : on ne les
    -- déplace pas. Juste après une réinstallation il n'y en a jamais.
    if exists (select 1 from security_photos where device_id = v_new) then
        return jsonb_build_object('ok', false, 'error', 'new_has_photos');
    end if;

    -- Commandes restées en attente pendant que l'ancien téléphone était éteint.
    delete from tg_inbox where device_id = o.id;
    update device_commands set status = 'failed', executed_at = now()
     where device_id = o.id and status in ('pending', 'delivered');

    -- Liaisons Telegram faites depuis la réinstallation : fusionnées. Un nouveau
    -- propriétaire remplace l'ancien ; un chat déjà propriétaire le reste.
    if exists (select 1 from tg_links where device_id = v_new and role = 'owner') then
        delete from tg_links
         where device_id = o.id and role = 'owner'
           and chat_id not in (select chat_id from tg_links where device_id = v_new);
    end if;
    insert into tg_links(device_id, chat_id, role, name, created_at)
    select o.id, chat_id, role, name, created_at from tg_links where device_id = v_new
    on conflict (device_id, chat_id) do update
        set role = case when tg_links.role = 'owner' or excluded.role = 'owner' then 'owner' else 'contact' end,
            name = coalesce(excluded.name, tg_links.name);
    update device_locations set device_id = o.id where device_id = v_new;

    -- La ligne vide de la réinstallation disparaît (jetons, file, quotas suivent
    -- en cascade), puis l'ancien appareil prend sa clé.
    delete from devices where id = v_new;
    update devices
       set secret_key = p_secret, is_online = true, last_seen = now(), updated_at = now()
     where id = o.id;
    return jsonb_build_object('ok', true, 'device_id', o.id, 'name', o.name);
end $$;

-- Droits : uniquement un utilisateur connecté (l'app, avec son jeton).
revoke execute on function restorable_devices(text)   from public, anon, authenticated;
revoke execute on function restore_device(uuid, text) from public, anon, authenticated;
grant  execute on function restorable_devices(text)   to authenticated;
grant  execute on function restore_device(uuid, text) to authenticated;
