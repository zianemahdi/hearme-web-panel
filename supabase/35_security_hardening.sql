-- ============================================================================
--  35_security_hardening.sql — Audit de sécurité du 15/10/2026
-- ----------------------------------------------------------------------------
--  1. PIN de secours : blocage PROGRESSIF. Avant : 15 min après 5 erreurs, et à
--     chaque erreur suivante encore 15 min — un attaquant patient (qui change
--     d'adresse IP) pouvait essayer ~100 PIN par jour sur un compte ; un PIN de
--     4 chiffres tombait en quelques mois. Désormais : 5 erreurs → 15 min,
--     10 → 1 h, 15 et plus → 24 h. Le compteur ne repart à zéro qu'après le bon
--     PIN (ou un nouveau PIN choisi dans l'app).
--  2. Nouveaux PIN : 6 chiffres minimum (les PIN de 4–5 chiffres déjà
--     enregistrés restent valables à la connexion).
--  3. Création d'appareils : 5 nouveaux téléphones au plus par IP et par
--     10 minutes (avant : sans limite — de quoi encombrer la base de fiches vides).
-- ============================================================================

-- 1. Connexion par PIN de secours ------------------------------------------------
create or replace function public.panel_pin_login(p_email text, p_pin text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare v_ip text := panel_client_ip(); v_user uuid; r account_pins; dev devices; n int;
begin
    if tg_rl_blocked(v_ip, 'pin_login_fail', 20) then
        return jsonb_build_object('ok', false, 'error', 'locked');
    end if;
    select id into v_user from auth.users
     where lower(email) = lower(btrim(coalesce(p_email, '')))
     limit 1;
    select * into r from account_pins where user_id = v_user;  -- aucune ligne → champs nuls
    if r.user_id is null then
        -- Même coût qu'une vraie vérification : le temps de réponse ne révèle pas
        -- si l'adresse a un compte.
        perform crypt(coalesce(p_pin, ''), gen_salt('bf'));
        perform tg_rl_count(v_ip, 'pin_login_fail');
        return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    if r.locked_until is not null and r.locked_until > now() then
        return jsonb_build_object('ok', false, 'error', 'locked');
    end if;
    if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
        update account_pins set fail_count = 0, locked_until = null where user_id = v_user;
        select * into dev from devices
         where user_id = v_user
         order by last_seen desc nulls last, updated_at desc
         limit 1;
        if dev.id is null then
            return jsonb_build_object('ok', false, 'error', 'no_device');
        end if;
        return jsonb_build_object('ok', true, 'device_id', dev.id, 'name', dev.name,
                                  'secret', dev.secret_key);
    end if;
    perform tg_rl_count(v_ip, 'pin_login_fail');
    n := coalesce(r.fail_count, 0) + 1;
    update account_pins
       set fail_count = n,
           locked_until = case
               when n >= 15 then now() + interval '24 hours'
               when n >= 10 then now() + interval '1 hour'
               when n >= 5  then now() + interval '15 minutes'
               else locked_until end
     where user_id = v_user;
    return jsonb_build_object('ok', false, 'error', 'invalid');
end $function$;

-- 2. Choix d'un PIN : 6 à 8 chiffres --------------------------------------------
create or replace function public.set_device_pin(p_secret text, p_email text, p_pin text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare d_id uuid; v_user uuid;
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then
        return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
    d_id := hm_device_id(p_secret);
    if d_id is null then
        perform hm_fail();
        return jsonb_build_object('ok', false, 'error', 'invalid_secret');
    end if;
    if p_pin is null or p_pin !~ '^[0-9]{6,8}$' then
        return jsonb_build_object('ok', false, 'error', 'bad_pin');
    end if;
    select user_id into v_user from devices where id = d_id;
    if v_user is null then
        return jsonb_build_object('ok', false, 'error', 'not_linked');
    end if;
    insert into account_pins(user_id, pin_hash, fail_count, locked_until, updated_at)
        values (v_user, crypt(p_pin, gen_salt('bf')), 0, null, now())
    on conflict (user_id) do update
        set pin_hash = excluded.pin_hash, fail_count = 0, locked_until = null, updated_at = now();
    return jsonb_build_object('ok', true);
end $function$;

-- 3. Nouveaux appareils : 5 par IP et par 10 minutes ------------------------------
create or replace function public.push_device_state(p_secret text, p_name text default null::text,
    p_battery integer default null::integer, p_network text default null::text,
    p_locked boolean default null::boolean, p_lost boolean default null::boolean,
    p_stolen boolean default null::boolean)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid; v_ip text := panel_client_ip();
begin
    perform hm_guard();
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        if not hm_key_ok(p_secret) then
            perform hm_fail();
            return null;
        end if;
        -- Un vrai téléphone ne se crée qu'une fois (réinstallation : rarement plus) ;
        -- au-delà, c'est quelqu'un qui remplit la base de fiches vides.
        if tg_rl_blocked(v_ip, 'device_new', 5) then
            return null;
        end if;
        insert into devices(secret_key, name, battery_level, network_status, is_locked, is_online, last_seen,
                            is_lost, is_stolen)
        values (p_secret, coalesce(p_name, 'Mon téléphone'), p_battery, p_network,
                coalesce(p_locked, false), true, now(), p_lost, p_stolen)
        on conflict (secret_key) do nothing
        returning id into v_id;
        if v_id is not null then
            perform tg_rl_count(v_ip, 'device_new');
            return v_id;
        end if;
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
end $function$;
