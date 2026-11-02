-- ============================================================================
--  40_selftest_plus_play.sql — Vérification de 39 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : tout est annulé. Faux comptes, faux téléphone.
--  Rapport dans le message d'erreur ; valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    u    uuid := gen_random_uuid();
    w    uuid := gen_random_uuid();
    k1   text := 'ZZR' || upper(substr(md5(random()::text), 1, 12));
    d1   uuid;
    r    jsonb;
    e    plus_entitlements;
    log  text := '';
begin
    insert into auth.users(id, email) values (u, 'selftest-39a@example.invalid'),
                                             (w, 'selftest-39b@example.invalid');
    d1 := push_device_state(k1, 'Selftest 39');
    update devices set user_id = u where id = d1;
    update plus_config set enforced = true;

    -- A. Propriétaire du téléphone, compte inconnu.
    log := log || E'\nA owner_ok=' || (plus_device_owner(d1) = u) || ' [true]'
               || ' unknown=' || (plus_apply_play(gen_random_uuid(), now() + interval '30 days',
                                   'hearme_plus', 'tokZ') ->> 'error') || ' [unknown_user]';

    -- B. Premier abonnement.
    r := plus_apply_play(u, now() + interval '30 days', 'hearme_plus', 'tok1');
    select * into e from plus_entitlements where user_id = u;
    log := log || E'\nB ok=' || (r ->> 'ok') || ' [true] active=' || (r ->> 'active') || ' [true]'
               || ' source=' || e.source || ' [play] status_play=' || (plus_status(k1) ->> 'source') || ' [play]';

    -- C. Même jeton pour un autre compte : refusé.
    log := log || E'\nC other=' || (plus_apply_play(w, now() + interval '30 days', 'hearme_plus', 'tok1') ->> 'error')
               || ' [token_owner]';

    -- D. Réabonnement (nouveau jeton lié à l'ancien), puis notification tardive de l'ancien.
    r := plus_apply_play(u, now() + interval '60 days', 'hearme_plus', 'tok2', 'tok1');
    r := plus_apply_play(u, now() - interval '1 day', 'hearme_plus', 'tok1');
    select * into e from plus_entitlements where user_id = u;
    log := log || E'\nD stale=' || coalesce(r ->> 'stale', 'false') || ' [true] token=' || e.purchase_token || ' [tok2]'
               || ' still_plus=' || (e.until > now() + interval '59 days') || ' [true]';

    -- E. Expiration du jeton actuel : plus de Plus.
    r := plus_apply_play(u, now() - interval '1 minute', 'hearme_plus', 'tok2');
    log := log || E'\nE active=' || (r ->> 'active') || ' [false] status_until=' || (plus_status(k1) ->> 'until_ms') || ' [0]';

    -- F. Fondateur (12 mois) qui s'abonne 1 mois puis arrête : il retrouve ses 12 mois.
    delete from plus_entitlements where user_id = w;
    update plus_config set enforced = false;
    perform plus_launch();
    select * into e from plus_entitlements where user_id = w;
    log := log || E'\nF launch_base=' || e.base_source || ' [founder]';
    r := plus_apply_play(w, now() + interval '30 days', 'hearme_plus', 'tokW');
    select * into e from plus_entitlements where user_id = w;
    log := log || ' source=' || e.source || ' [founder] long=' || (e.until > now() + interval '11 months') || ' [true]';
    r := plus_apply_play(w, now() + interval '400 days', 'hearme_plus', 'tokW');
    select * into e from plus_entitlements where user_id = w;
    log := log || ' longer_play=' || e.source || ' [play]';
    r := plus_apply_play(w, now() - interval '1 minute', 'hearme_plus', 'tokW');
    select * into e from plus_entitlements where user_id = w;
    log := log || ' after_cancel=' || e.source || ' [founder] kept=' || (e.until > now() + interval '11 months') || ' [true]';

    -- G. Droits : rien pour anon / authenticated.
    log := log || E'\nG anon=' || has_function_privilege('anon', 'plus_apply_play(uuid,timestamptz,text,text,text)', 'execute')
               || ' [false] auth=' || has_function_privilege('authenticated', 'plus_device_owner(uuid)', 'execute') || ' [false]';

    raise exception 'SELFTEST 39 (tout annulé) :%', log;
end $$;
