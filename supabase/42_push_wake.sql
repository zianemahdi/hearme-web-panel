-- 42 — Réveil instantané (Firebase Cloud Messaging)
--
-- Une commande du panneau (device_commands) ou du bot Telegram (tg_inbox) attendait
-- que le téléphone endormi refasse son tour de synchronisation (parfois plusieurs
-- minutes). Désormais, chaque nouvelle commande appelle la fonction Edge push-wake,
-- qui demande à Google de réveiller le téléphone. Le message ne contient rien de
-- personnel : le téléphone va ensuite chercher sa commande lui-même, comme avant.
--
-- * device_push   : jeton Firebase de chaque appareil (supprimé avec l'appareil).
-- * register_push_token(p_secret, p_token) : appelé par l'app (clé de l'appareil).
-- * hm_push_wake(device_id) : déclenché à l'insertion d'une commande ; au plus un
--   réveil toutes les 2 s par appareil (rafales photo + alarme).
-- * Jeton d'appel interne (Vault « hearme_push_wake ») vérifié par push_wake_token_ok
--   dans la fonction Edge, comme la purge des photos.

create table if not exists public.device_push (
    device_id  uuid primary key references public.devices(id) on delete cascade,
    token      text not null,
    updated_at timestamptz not null default now(),
    woken_at   timestamptz
);
alter table public.device_push enable row level security;
-- Aucune politique : accès uniquement par les fonctions ci-dessous (security definer).
revoke all on public.device_push from anon, authenticated;

create or replace function public.register_push_token(p_secret text, p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
    perform hm_guard();
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return false; end if;
    if p_token is null or length(btrim(p_token)) = 0 then
        delete from device_push where device_id = v_id;
        return true;
    end if;
    if length(p_token) > 4096 then raise exception 'jeton invalide'; end if;
    insert into device_push(device_id, token) values (v_id, btrim(p_token))
    on conflict (device_id) do update set token = excluded.token, updated_at = now();
    return true;
end $$;
revoke all on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to anon, authenticated;

-- Jeton interne : tiré au hasard, rangé dans le Vault, jamais affiché.
do $$
begin
    if not exists (select 1 from vault.secrets where name = 'hearme_push_wake') then
        perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
                                    'hearme_push_wake',
                                    'Appel interne base → fonction Edge push-wake');
    end if;
end $$;

create or replace function public.push_wake_token_ok(p_token text)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
    select coalesce(length(p_token) >= 32 and p_token = (
        select decrypted_secret from vault.decrypted_secrets where name = 'hearme_push_wake'
    ), false)
$$;
revoke all on function public.push_wake_token_ok(text) from public, anon, authenticated;
grant execute on function public.push_wake_token_ok(text) to service_role;

-- Pour la fonction Edge (service_role) : le jeton Firebase d'un appareil.
create or replace function public.push_token_for(p_device uuid)
returns text
language sql
security definer
set search_path to 'public'
as $$ select token from device_push where device_id = p_device $$;
revoke all on function public.push_token_for(uuid) from public, anon, authenticated;
grant execute on function public.push_token_for(uuid) to service_role;

-- Jeton refusé par Google (appli désinstallée…) : on l'oublie.
create or replace function public.push_token_forget(p_device uuid, p_token text)
returns void
language sql
security definer
set search_path to 'public'
as $$ delete from device_push where device_id = p_device and token = p_token $$;
revoke all on function public.push_token_forget(uuid, text) from public, anon, authenticated;
grant execute on function public.push_token_forget(uuid, text) to service_role;

create or replace function public.hm_push_wake(p_device uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    -- Pas de jeton, ou réveil déjà demandé il y a moins de 2 s : rien à faire.
    update device_push set woken_at = now()
     where device_id = p_device
       and (woken_at is null or woken_at < now() - interval '2 seconds');
    if not found then return; end if;
    perform net.http_post(
        url     := 'https://muggtgcwmawcpmzjrvxo.supabase.co/functions/v1/push-wake',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-wake-token', (select decrypted_secret from vault.decrypted_secrets
                              where name = 'hearme_push_wake')),
        body    := jsonb_build_object('device_id', p_device),
        timeout_milliseconds := 10000);
exception when others then
    -- Le réveil est un plus : une panne ne doit jamais bloquer la commande elle-même.
    null;
end $$;
revoke all on function public.hm_push_wake(uuid) from public, anon, authenticated;

create or replace function public.hm_push_wake_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    perform hm_push_wake(new.device_id);
    return new;
end $$;
revoke all on function public.hm_push_wake_trigger() from public, anon, authenticated;

drop trigger if exists push_wake_on_command on public.device_commands;
create trigger push_wake_on_command
    after insert on public.device_commands
    for each row execute function public.hm_push_wake_trigger();

drop trigger if exists push_wake_on_tg_inbox on public.tg_inbox;
create trigger push_wake_on_tg_inbox
    after insert on public.tg_inbox
    for each row execute function public.hm_push_wake_trigger();
