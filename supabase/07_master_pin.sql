-- ============================================================================
--  07_master_pin.sql — PIN maître : reconnexion permanente au tableau de crise
--  sans lien et sans dépendre du téléphone.
-- ----------------------------------------------------------------------------
--  Le propriétaire définit dans l'app un PIN (4 à 8 chiffres) associé à un
--  identifiant (son e-mail). L'app l'enregistre côté serveur (haché bcrypt) via
--  set_device_pin(). Plus tard, sur le panneau, il saisit identifiant + PIN :
--  panel_pin_login() vérifie le haché et ouvre la session de crise (mode clé).
--
--  Sécurité : PIN jamais stocké en clair (bcrypt via pgcrypto), anti-force-brute
--  intégré (5 échecs → verrouillage 15 min), message générique (ne révèle pas si
--  l'identifiant existe). À exécuter dans Supabase → SQL Editor.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists device_pins (
    device_id    uuid primary key references devices(id) on delete cascade,
    email        text not null,
    pin_hash     text not null,
    fail_count   int  not null default 0,
    locked_until timestamptz,
    updated_at   timestamptz not null default now()
);
-- Un identifiant = un seul appareil.
create unique index if not exists idx_device_pins_email on device_pins(lower(email));

alter table device_pins enable row level security;   -- aucune policy : accès via RPC uniquement

-- ----------------------------------------------------------------------------
--  Définir / changer le PIN (appelé par le TÉLÉPHONE, anon + clé secrète).
-- ----------------------------------------------------------------------------
create or replace function set_device_pin(p_secret text, p_email text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
    d_id  uuid;
    other uuid;
begin
    select id into d_id from devices where secret_key = p_secret;
    if d_id is null then
        return jsonb_build_object('ok', false, 'error', 'invalid_secret');
    end if;
    if p_email is null or length(trim(p_email)) = 0 then
        return jsonb_build_object('ok', false, 'error', 'no_email');
    end if;
    if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
        return jsonb_build_object('ok', false, 'error', 'bad_pin');
    end if;

    -- Identifiant déjà utilisé par un AUTRE appareil ?
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
end;
$$;

-- ----------------------------------------------------------------------------
--  Connexion par PIN depuis le PANNEAU (anon). Renvoie la clé secrète de
--  l'appareil (session de crise) si identifiant + PIN corrects.
-- ----------------------------------------------------------------------------
create or replace function panel_pin_login(p_email text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
    r   device_pins;
    dev devices;
begin
    select * into r from device_pins where lower(email) = lower(trim(coalesce(p_email, '')));
    if r.device_id is null then
        return jsonb_build_object('ok', false, 'error', 'invalid');       -- message générique
    end if;
    if r.locked_until is not null and r.locked_until > now() then
        return jsonb_build_object('ok', false, 'error', 'locked');
    end if;

    if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
        update device_pins set fail_count = 0, locked_until = null where device_id = r.device_id;
        select * into dev from devices where id = r.device_id;
        return jsonb_build_object('ok', true, 'device_id', dev.id, 'name', dev.name, 'secret', dev.secret_key);
    else
        update device_pins
           set fail_count = fail_count + 1,
               locked_until = case when fail_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end
         where device_id = r.device_id;
        return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
end;
$$;

grant execute on function set_device_pin(text, text, text) to anon, authenticated;
grant execute on function panel_pin_login(text, text)      to anon, authenticated;
