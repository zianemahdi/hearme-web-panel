-- ============================================================================
--  39_plus_play.sql — HearMe Plus : abonnements Google Play (étape C)
-- ----------------------------------------------------------------------------
--  L'Edge Function « play-verify » vérifie chaque achat auprès de Google
--  (API Android Publisher) puis appelle plus_apply_play() avec la date de fin
--  donnée par Google. Rien n'est accordé sur la seule parole de l'app.
--
--  Un compte peut avoir à la fois un don (fondateur, geste manuel) et un
--  abonnement : base_until garde le don, play_until l'abonnement, et until
--  (lu partout) est le plus tardif des deux. Si l'abonnement s'arrête, le
--  fondateur retrouve ses 12 mois.
-- ============================================================================

alter table plus_entitlements add column if not exists base_until  timestamptz;
alter table plus_entitlements add column if not exists base_source text
    check (base_source in ('founder', 'admin'));
alter table plus_entitlements add column if not exists play_until  timestamptz;

update plus_entitlements set base_until = until, base_source = source
 where source in ('founder', 'admin') and base_until is null;

/** Propriétaire d'un téléphone (Edge Function, après photo_authorize). */
create or replace function plus_device_owner(p_device uuid)
returns uuid language sql stable security definer set search_path = public as $$
    select user_id from devices where id = p_device
$$;

/**
 * Abonnement vérifié par Google : p_until = fin de la période payée (dans le passé
 * si l'abonnement est terminé, suspendu ou en attente). p_linked = ancien jeton
 * remplacé (réabonnement, changement de formule).
 * Une notification tardive d'un ANCIEN jeton n'écrase jamais un abonnement plus récent.
 */
create or replace function plus_apply_play(p_user uuid, p_until timestamptz, p_product text,
    p_token text, p_linked text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e plus_entitlements; v_until timestamptz;
begin
    if p_user is null or p_until is null or coalesce(p_token, '') = '' then
        raise exception 'paramètres manquants';
    end if;
    if not exists (select 1 from auth.users where id = p_user) then
        return jsonb_build_object('ok', false, 'error', 'unknown_user');
    end if;
    if exists (select 1 from plus_entitlements where purchase_token = p_token and user_id <> p_user) then
        return jsonb_build_object('ok', false, 'error', 'token_owner');
    end if;

    select * into e from plus_entitlements where user_id = p_user for update;
    if found and e.purchase_token is not null and e.purchase_token <> p_token
       and e.purchase_token is distinct from p_linked
       and coalesce(e.play_until, '-infinity') > p_until then
        return jsonb_build_object('ok', true, 'stale', true);
    end if;

    v_until := greatest(coalesce(e.base_until, '-infinity'), p_until);
    insert into plus_entitlements(user_id, until, source, product_id, purchase_token, play_until, updated_at)
    values (p_user, v_until, 'play', p_product, p_token, p_until, now())
    on conflict (user_id) do update set
        until          = v_until,
        source         = case when plus_entitlements.base_until is not null
                                   and plus_entitlements.base_until >= p_until
                              then plus_entitlements.base_source else 'play' end,
        product_id     = p_product,
        purchase_token = p_token,
        play_until     = p_until,
        updated_at     = now();
    return jsonb_build_object('ok', true,
        'until_ms', floor(extract(epoch from v_until) * 1000)::bigint,
        'active', v_until > now());
end $$;

revoke execute on function plus_device_owner(uuid), plus_apply_play(uuid, timestamptz, text, text, text)
    from public, anon, authenticated;
grant execute on function plus_device_owner(uuid), plus_apply_play(uuid, timestamptz, text, text, text)
    to service_role;

-- Lancement : les fondateurs gardent leurs 12 mois dans base_until (un abonnement
-- pris par un testeur avant le lancement n'est pas perdu).
create or replace function plus_launch()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
    if plus_enforced() then raise exception 'Plus est déjà lancé'; end if;
    insert into plus_entitlements(user_id, until, source, base_until, base_source)
    select u.id, now() + interval '12 months', 'founder', now() + interval '12 months', 'founder'
      from auth.users u
    on conflict (user_id) do update set
        base_until  = excluded.base_until,
        base_source = 'founder',
        until       = greatest(plus_entitlements.until, excluded.until),
        source      = case when excluded.until >= plus_entitlements.until then 'founder'
                           else plus_entitlements.source end,
        updated_at  = now();
    get diagnostics n = row_count;
    update plus_config set enforced = true, launched_at = now();
    return n;
end $$;
revoke execute on function plus_launch() from public, anon, authenticated;
