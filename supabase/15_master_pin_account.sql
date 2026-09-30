-- ============================================================================
--  15_master_pin_account.sql — PIN de secours rattaché au COMPTE
-- ----------------------------------------------------------------------------
--  Avant : le PIN appartenait à un APPAREIL (device_pins), identifié par un
--  e-mail envoyé par l'app, une adresse = un seul appareil. Conséquences :
--   • chaque réinstallation crée un nouvel appareil (nouvelle clé) ; l'ancien
--     gardait l'adresse → « email_taken » pour toujours, PIN impossible ;
--   • l'adresse n'était pas vérifiée : n'importe quel détenteur d'une clé
--     pouvait « réserver » l'adresse de quelqu'un d'autre.
--  Maintenant : un PIN par COMPTE (account_pins.user_id).
--   • Défini depuis un téléphone rattaché au compte (clé forte + devices.user_id).
--   • Connexion au panneau : e-mail du compte + PIN → le téléphone du compte
--     vu le plus récemment. Après réinstallation + reconnexion, rien à refaire.
--   • Le PIN est haché (bcrypt) : personne ne peut le relire, pas même nous.
--   • pin_status(clé) : l'app affiche « PIN défini » même après réinstallation.
--  Inchangé : garde IP avant la clé, 4 à 8 chiffres, 5 erreurs → 15 min de
--  verrou, 20 échecs par IP, signatures appelées par l'app et le panneau.
-- ============================================================================

-- 1. Table (aucune policy : accès uniquement via les fonctions ci-dessous).
create table if not exists account_pins (
    user_id      uuid primary key references auth.users(id) on delete cascade,
    pin_hash     text not null,
    fail_count   int  not null default 0,
    locked_until timestamptz,
    updated_at   timestamptz not null default now()
);
alter table account_pins enable row level security;
revoke all on table account_pins from public, anon, authenticated;

-- 2. Reprise des PIN existants, UNIQUEMENT ceux d'un appareil rattaché à un
--    compte (propriétaire prouvé). Un PIN posé sur un appareil sans compte avec
--    une adresse non vérifiée n'est pas repris : l'offrir au titulaire de cette
--    adresse donnerait l'accès à un inconnu. Plusieurs appareils : le plus récent.
insert into account_pins(user_id, pin_hash, fail_count, locked_until, updated_at)
select distinct on (d.user_id) d.user_id, p.pin_hash, 0, null, p.updated_at
  from device_pins p join devices d on d.id = p.device_id
 where d.user_id is not null
 order by d.user_id, p.updated_at desc
on conflict (user_id) do nothing;

-- 3. Définir / changer le PIN depuis le téléphone.
--    p_email est ignoré (gardé pour les anciennes versions de l'app).
create or replace function set_device_pin(p_secret text, p_email text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
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
    if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
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
end $$;

-- 4. L'app demande si le compte de ce téléphone a déjà un PIN (réinstallation).
create or replace function pin_status(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
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
    select user_id into v_user from devices where id = d_id;
    return jsonb_build_object(
        'ok', true,
        'linked', v_user is not null,
        'has_pin', v_user is not null and exists (select 1 from account_pins where user_id = v_user)
    );
end $$;

-- 5. Connexion au panneau : e-mail du compte + PIN → téléphone le plus récent.
create or replace function panel_pin_login(p_email text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_ip text := panel_client_ip(); v_user uuid; r account_pins; dev devices;
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
    update account_pins
       set fail_count = fail_count + 1,
           locked_until = case when fail_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end
     where user_id = v_user;
    return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

-- 6. Droits : l'app (anon + clé) et le panneau (anon ou connecté).
revoke execute on function pin_status(text) from public, anon, authenticated;
grant execute on function pin_status(text)                   to anon;
grant execute on function set_device_pin(text, text, text)   to anon;
grant execute on function panel_pin_login(text, text)        to anon, authenticated;

-- 7. L'ancien autotest (10_selftest.sql) est cassé depuis 12 : ses clés
--    « SELFTEST-… » contiennent un tiret, donc sont refusées. Il vise aussi
--    l'ancienne table. Les autotests annulés (14, 16) le remplacent.
drop function if exists selftest_emergency_flow();

-- 8. Ancienne table : plus aucune fonction ne doit s'en servir, sinon on annule
--    TOUTE la migration plutôt que de casser une fonction oubliée.
do $$
declare f text;
begin
    select string_agg(p.proname, ', ') into f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc ilike '%device_pins%';
    if f is not null then
        raise exception 'device_pins encore utilisée par : %', f;
    end if;
end $$;
drop table device_pins;
