-- ============================================================================
--  21_device_cleanup.sql — Anciennes installations vides
-- ----------------------------------------------------------------------------
--  Chaque réinstallation (ou effacement des données) crée un nouvel appareil.
--  Celles qui n'ont jamais rien eu (ni Telegram, ni proche, ni position, ni
--  photo) encombraient « Restaurer mon téléphone » : des fiches « Mon téléphone »
--  identiques, et la limite de 5 pouvait cacher l'ancien téléphone qui, lui,
--  a des données.
--
--   • restorable_devices : ne propose que les appareils qui ont quelque chose à
--     rendre (ou encore actifs), jusqu'à 10, et compte les fiches vides ;
--   • forget_empty_devices : à la demande de l'utilisateur, supprime les fiches
--     vides de SON compte, muettes depuis plus d'un jour. Jamais l'appareil qui
--     appelle, jamais un appareil qui a des données.
--
--  Garde-fous identiques à 17 : connecté (JWT) ET détenteur d'une clé rattachée
--  à ce compte ; anti-force brute partagé (key_fail). Le PIN de secours (15)
--  appartient au compte : il ne compte pas comme donnée d'un appareil.
-- ============================================================================

-- Un appareil a-t-il quelque chose à rendre ? (usage interne)
create or replace function hm_device_has_data(p_device uuid)
returns boolean
language sql stable set search_path = public as $$
    select exists (select 1 from tg_links where device_id = p_device)
        or exists (select 1 from device_locations where device_id = p_device)
        or exists (select 1 from security_photos where device_id = p_device)
$$;

-- Anciens téléphones du compte, pour que l'app propose la restauration.
create or replace function restorable_devices(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_dev uuid; v_list jsonb; v_empty int;
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
               and (hm_device_has_data(id) or coalesce(last_seen > now() - interval '2 minutes', false))
             order by last_seen desc nulls last
             limit 10) d;
    -- Ce que forget_empty_devices supprimerait.
    select count(*) into v_empty
      from devices
     where user_id = v_uid and id <> v_dev
       and (last_seen is null or last_seen < now() - interval '1 day')
       and not hm_device_has_data(id);
    return jsonb_build_object('ok', true, 'devices', v_list, 'empty', v_empty);
end $$;

-- Supprime les fiches vides du compte (demandé par l'utilisateur depuis l'app).
create or replace function forget_empty_devices(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_dev uuid; n int;
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
    -- Commandes, jetons, files et quotas de ces appareils suivent en cascade.
    delete from devices
     where user_id = v_uid and id <> v_dev
       and (last_seen is null or last_seen < now() - interval '1 day')
       and not hm_device_has_data(id);
    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'removed', n);
end $$;

-- Droits : uniquement un utilisateur connecté (l'app, avec son jeton).
revoke execute on function hm_device_has_data(uuid)      from public, anon, authenticated;
revoke execute on function restorable_devices(text)      from public, anon, authenticated;
revoke execute on function forget_empty_devices(text)    from public, anon, authenticated;
grant  execute on function restorable_devices(text)      to authenticated;
grant  execute on function forget_empty_devices(text)    to authenticated;
