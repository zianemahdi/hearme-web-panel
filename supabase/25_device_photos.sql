-- ============================================================================
--  25_device_photos.sql — Photos du porteur visibles dans le panneau (30 jours)
-- ----------------------------------------------------------------------------
--  Jusqu'ici, la photo prise par l'app (déverrouillage raté, ou commande en
--  mode volé / perdu) partait seulement sur Telegram. Elle est maintenant aussi
--  rangée dans le bucket PRIVÉ « security-photos » (03), pour que le
--  propriétaire la voie dans le panneau web.
--
--  Tout passe par l'Edge Function « device-photos » (service_role) :
--   • envoi (app) et liste / suppression (panneau) : clé du téléphone, vérifiée
--     ici par photo_authorize() avec le MÊME anti-force brute par IP que le
--     panneau (« key_fail », 30 échecs / 10 min) ; 30 photos / heure au plus ;
--   • liens d'affichage signés et temporaires (10 min), jamais publics ;
--   • purge nocturne : photos de plus de 30 jours supprimées (fichier + ligne),
--     déclenchée par pg_cron via pg_net avec un jeton rangé dans le Vault.
--  La suppression du compte efface déjà les photos (19, Edge Function).
-- ============================================================================

create extension if not exists pg_net;

-- Vérifie la clé d'un téléphone (appelée par l'Edge Function avec l'IP du client).
create or replace function photo_authorize(p_secret text, p_ip text, p_upload boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int;
begin
    if tg_rl_blocked(p_ip, 'key_fail', 30) then
        return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then
        perform tg_rl_count(p_ip, 'key_fail');
        return jsonb_build_object('ok', false, 'error', 'invalid_secret');
    end if;
    if p_upload then
        select count(*) into v_n from security_photos
         where device_id = v_id and created_at > now() - interval '1 hour';
        if v_n >= 30 then
            return jsonb_build_object('ok', false, 'error', 'quota');
        end if;
    end if;
    return jsonb_build_object('ok', true, 'device_id', v_id);
end $$;

-- Jeton de la purge nocturne : créé une fois, rangé chiffré dans le Vault.
do $$
begin
    if not exists (select 1 from vault.secrets where name = 'hearme_photo_purge') then
        perform vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'hex'),
            'hearme_photo_purge',
            'Purge nocturne des photos (pg_cron → Edge Function device-photos)');
    end if;
end $$;

create or replace function photo_purge_token_ok(p_token text)
returns boolean
language sql stable security definer set search_path = public as $$
    select coalesce(p_token, '') <> '' and exists (
        select 1 from vault.decrypted_secrets
         where name = 'hearme_photo_purge' and decrypted_secret = p_token)
$$;

-- Droits : service_role uniquement (l'Edge Function).
revoke execute on function photo_authorize(text, text, boolean) from public, anon, authenticated;
revoke execute on function photo_purge_token_ok(text)           from public, anon, authenticated;
grant  execute on function photo_authorize(text, text, boolean) to service_role;
grant  execute on function photo_purge_token_ok(text)           to service_role;

-- L'Edge Function lit, ajoute et supprime les lignes de photos (service_role
-- uniquement : aucun droit nouveau pour anon / authenticated).
grant select, insert, delete on table security_photos to service_role;

-- Ancien chemin d'enregistrement direct (sans fichier) : plus utilisé, on le ferme.
revoke execute on function record_photo(text, text, text) from public, anon, authenticated;

-- Purge nocturne, 03:29 UTC (après celle des positions, 23). Même nom = mise à jour.
select cron.schedule('hearme-purge-photos', '29 3 * * *', $$
    select net.http_post(
        url     := 'https://muggtgcwmawcpmzjrvxo.supabase.co/functions/v1/device-photos',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-purge-token', (select decrypted_secret from vault.decrypted_secrets
                               where name = 'hearme_photo_purge')),
        body    := '{"action":"purge"}'::jsonb,
        timeout_milliseconds := 30000)
$$);
