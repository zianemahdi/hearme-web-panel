-- ============================================================================
--  37_plus.sql — HearMe Plus : droits, fondateurs, limites du plan gratuit
-- ----------------------------------------------------------------------------
--  Plan complet : HearMe/docs/PLAN_PLUS.md.
--
--  INTERRUPTEUR : tant que plus_config.enforced = false, TOUT LE MONDE est traité
--  comme Plus : cette migration ne change rien pour les utilisateurs. Le jour du
--  lancement, plus_launch() crédite 12 mois aux comptes existants (fondateurs)
--  puis active les limites.
--
--  Gratuit / Plus côté serveur :
--    • proches Telegram : 1 / plus_contacts (2 tant que l'app n'affiche que 2 places)
--    • téléphones par compte : 1 / 3
--    • positions : 1 toutes les 14 min (sauf « Localiser » demandé) / direct
--    • conservation des positions et photos : 1 jour / 30 jours
--  Cadeau de vol : 48 h de Plus pour le téléphone, une fois par 30 jours.
-- ============================================================================

create table if not exists plus_config (
    id             boolean primary key default true check (id),
    enforced       boolean not null default false,
    launched_at    timestamptz,
    free_contacts  int not null default 1,
    plus_contacts  int not null default 2,
    free_devices   int not null default 1,
    plus_devices   int not null default 3
);
insert into plus_config(id) values (true) on conflict do nothing;
alter table plus_config enable row level security; -- aucune politique : fonctions seulement

-- Un droit par compte : abonnement Google Play, offre fondateur ou geste manuel.
create table if not exists plus_entitlements (
    user_id        uuid primary key references auth.users(id) on delete cascade,
    until          timestamptz not null,
    source         text not null check (source in ('founder', 'play', 'admin')),
    product_id     text,
    purchase_token text unique,
    updated_at     timestamptz not null default now()
);
alter table plus_entitlements enable row level security;

alter table devices add column if not exists plus_gift_at    timestamptz;
alter table devices add column if not exists plus_gift_until timestamptz;

-- ---------------------------------------------------------------------------
-- Lecture des droits
-- ---------------------------------------------------------------------------

create or replace function plus_enforced()
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select enforced from plus_config), false)
$$;

/** Fin de Plus d'un compte (null = gratuit). Limites coupées : toujours Plus. */
create or replace function plus_user_until(p_user uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
    select case when not plus_enforced() then now() + interval '30 days'
                else (select until from plus_entitlements where user_id = p_user and until > now()) end
$$;

create or replace function plus_device_active(p_device uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select not plus_enforced() or exists (
        select 1 from devices d
         where d.id = p_device
           and (d.plus_gift_until > now() or plus_user_until(d.user_id) > now()))
$$;

create or replace function plus_max_contacts(p_device uuid)
returns int language sql stable security definer set search_path = public as $$
    select case when plus_device_active(p_device) then c.plus_contacts else c.free_contacts end
      from plus_config c
$$;

revoke execute on function plus_enforced(), plus_user_until(uuid), plus_device_active(uuid),
    plus_max_contacts(uuid) from public, anon, authenticated;

/** État Plus pour l'app (clé secrète du téléphone). Dates en epoch ms, 0 = aucune ; source = founder/play/admin. */
create or replace function plus_status(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid; v_gift timestamptz;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return null; end if;
    select user_id, plus_gift_until into v_user, v_gift from devices where id = v_id;
    return jsonb_build_object(
        'until_ms', coalesce(floor(extract(epoch from plus_user_until(v_user)) * 1000), 0)::bigint,
        'gift_until_ms', coalesce(floor(extract(epoch from v_gift) * 1000), 0)::bigint,
        'source', case when plus_enforced()
                       then (select source from plus_entitlements where user_id = v_user and until > now())
                  end,
        'enforced', plus_enforced());
end $$;

/** État Plus pour le panneau web (compte connecté). */
create or replace function my_plus()
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'enforced', plus_enforced(),
        'until', plus_user_until(auth.uid()),
        'source', (select source from plus_entitlements where user_id = auth.uid()))
$$;

revoke execute on function plus_status(text), my_plus() from public;
grant execute on function plus_status(text) to anon, authenticated;
grant execute on function my_plus() to authenticated;

/**
 * Vol confirmé ou téléphone déclaré volé : 48 h de Plus pour CE téléphone, une fois
 * par 30 jours. Jamais de paiement demandé pour retrouver un téléphone volé.
 */
create or replace function plus_claim_gift(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_until timestamptz;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return null; end if;
    update devices set plus_gift_at = now(), plus_gift_until = now() + interval '48 hours'
     where id = v_id and (plus_gift_at is null or plus_gift_at < now() - interval '30 days')
    returning plus_gift_until into v_until;
    if v_until is null then
        select plus_gift_until into v_until from devices where id = v_id;
        return jsonb_build_object('ok', false,
            'gift_until_ms', coalesce(floor(extract(epoch from v_until) * 1000), 0)::bigint);
    end if;
    return jsonb_build_object('ok', true, 'gift_until_ms', floor(extract(epoch from v_until) * 1000)::bigint);
end $$;
revoke execute on function plus_claim_gift(text) from public;
grant execute on function plus_claim_gift(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Limites
-- ---------------------------------------------------------------------------

-- Téléphones par compte : 1 en gratuit, 3 avec Plus (les téléphones déjà liés restent).
create or replace function public.claim_device_by_secret(p_secret text)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; v_n int; v_max int;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return null; end if;
    if plus_enforced() and not exists (select 1 from devices where id = v_id and user_id = auth.uid()) then
        select count(*) into v_n from devices where user_id = auth.uid();
        select case when plus_user_until(auth.uid()) > now() then plus_devices else free_devices end
          into v_max from plus_config;
        if v_n >= v_max then raise exception 'plus_device_limit'; end if;
    end if;
    update devices set user_id = auth.uid(), updated_at = now()
      where id = v_id and (user_id is null or user_id = auth.uid());
    if not found then raise exception 'appareil déjà rattaché à un autre compte'; end if;
    return v_id;
end $function$;

-- Positions : en gratuit, une toutes les 14 min, sauf si le propriétaire vient de
-- demander « Localiser » depuis le panneau. Le téléphone reste marqué « en ligne ».
create or replace function public.push_location(p_secret text, p_lat double precision,
    p_lon double precision, p_accuracy real default null::real, p_battery integer default null::integer)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return; end if;
    if p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180 then
        raise exception 'coordonnées invalides';
    end if;
    if plus_device_active(v_id)
       or not exists (select 1 from device_locations
                       where device_id = v_id and recorded_at > now() - interval '14 minutes')
       or exists (select 1 from device_commands
                   where device_id = v_id and command = 'locate'
                     and created_at > now() - interval '2 minutes') then
        insert into device_locations(device_id, lat, lon, accuracy_m, battery_level)
        values (v_id, p_lat, p_lon, p_accuracy, p_battery);
    end if;
    update devices set last_seen = now(), is_online = true,
        battery_level = coalesce(p_battery, battery_level), updated_at = now()
    where id = v_id;
end $function$;

-- Conservation : p_days pour Plus, 1 jour en gratuit (la dernière position reste).
create or replace function purge_old_locations(p_days int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
    if p_days is null or p_days < 1 then
        raise exception 'durée de conservation invalide : %', p_days;
    end if;
    delete from device_locations l
     where l.recorded_at < now() - make_interval(days => case when plus_device_active(l.device_id)
                                                              then p_days else 1 end)
       and l.id <> (select x.id from device_locations x
                     where x.device_id = l.device_id
                     order by x.recorded_at desc, x.id desc
                     limit 1);
    get diagnostics n = row_count;
    return n;
end $$;
revoke execute on function purge_old_locations(int) from public, anon, authenticated;

/** Photos à effacer (purge nocturne de device-photos) : 30 jours Plus, 1 jour gratuit. */
create or replace function photos_to_purge(p_days int default 30, p_limit int default 100)
returns table(id uuid, storage_path text) language sql stable security definer set search_path = public as $$
    select p.id, p.storage_path from security_photos p
     where p.created_at < now() - make_interval(days => case when plus_device_active(p.device_id)
                                                             then p_days else 1 end)
     order by p.created_at
     limit least(greatest(p_limit, 1), 500)
$$;
revoke execute on function photos_to_purge(int, int) from public, anon, authenticated;
grant execute on function photos_to_purge(int, int) to service_role;

-- Proches Telegram : la limite fixe (2) devient celle du plan. On remplace la seule
-- ligne concernée dans la fonction en place, sans recopier ses 300 lignes.
do $$
declare v_def text;
begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'tg_handle_update';
    if v_def is null then raise exception 'tg_handle_update introuvable'; end if;
    if position('plus_max_contacts' in v_def) > 0 then return; end if; -- déjà fait
    if (length(v_def) - length(replace(v_def, 'if v_n >= 2 then', ''))) / length('if v_n >= 2 then') <> 1 then
        raise exception 'tg_handle_update : limite des proches introuvable ou ambiguë';
    end if;
    execute replace(v_def, 'if v_n >= 2 then', 'if v_n >= plus_max_contacts(v_tok.device_id) then');
end $$;

-- ---------------------------------------------------------------------------
-- Lancement (à exécuter UNE fois, le jour du lancement de Plus — pas avant)
-- ---------------------------------------------------------------------------

/** Fondateurs : 12 mois de Plus pour chaque compte existant, puis limites actives. */
create or replace function plus_launch()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
    if plus_enforced() then raise exception 'Plus est déjà lancé'; end if;
    insert into plus_entitlements(user_id, until, source)
    select u.id, now() + interval '12 months', 'founder' from auth.users u
    on conflict (user_id) do update set until = greatest(plus_entitlements.until, excluded.until),
                                       updated_at = now();
    get diagnostics n = row_count;
    update plus_config set enforced = true, launched_at = now();
    return n;
end $$;
revoke execute on function plus_launch() from public, anon, authenticated;
