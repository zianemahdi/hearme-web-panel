-- ============================================================================
--  22_selftest_device_cleanup.sql — Vérification de 21 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : la transaction est annulée, la base reste intacte.
--  Compte de test créé dans la transaction : aucun vrai compte n'est lu ni
--  modifié, et les nombres du rapport ne dépendent que des données du test.
--  Valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    v_ip    text := '203.0.113.81';
    tag     text := upper(substr(md5(random()::text), 1, 10));
    k_cur   text := 'ZZC' || tag;
    k_eold  text := 'ZZG' || tag;
    k_enew  text := 'ZZH' || tag;
    k_data  text := 'ZZI' || tag;
    k_tg    text := 'ZZJ' || tag;
    k_live  text := 'ZZK' || tag;
    k_oth   text := 'ZZL' || tag;
    d_cur   uuid;
    d_eold  uuid;
    d_enew  uuid;
    d_data  uuid;
    d_tg    uuid;
    d_live  uuid;
    d_oth   uuid;
    u       uuid := gen_random_uuid();
    r       jsonb;
    log     text := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip = v_ip;
    insert into auth.users(id, aud, role, email)
        values (u, 'authenticated', 'authenticated', 'selftest-' || lower(tag) || '@example.invalid');

    -- Ce téléphone (celui qui appelle), puis les anciennes fiches du compte.
    d_cur  := push_device_state(k_cur,  'Selftest actuel');
    d_eold := push_device_state(k_eold, 'Selftest vide ancien');     -- vide, muet 5 j  -> supprimé
    d_enew := push_device_state(k_enew, 'Selftest vide récent');     -- vide, muet 1 h  -> gardé
    d_data := push_device_state(k_data, 'Selftest positions');       -- 1 position      -> gardé
    d_tg   := push_device_state(k_tg,   'Selftest proche');          -- 1 proche        -> gardé
    d_live := push_device_state(k_live, 'Selftest actif');           -- vide mais actif -> gardé
    update devices set user_id = u where id in (d_cur, d_eold, d_enew, d_data, d_tg, d_live);
    update devices set last_seen = now() - interval '5 days' where id in (d_eold, d_data, d_tg);
    update devices set last_seen = now() - interval '1 hour' where id = d_enew;
    insert into device_locations(device_id, lat, lon) values (d_data, 36.75, 3.05);
    insert into tg_links(device_id, chat_id, role, name) values (d_tg, 9100003001, 'contact', 'Proche');
    -- Fiche vide et ancienne d'un autre (non rattachée à ce compte) : jamais touchée.
    d_oth := push_device_state(k_oth, 'Selftest autre');
    update devices set last_seen = now() - interval '5 days' where id = d_oth;

    -- A. Sans connexion : refusé.
    perform set_config('request.jwt.claims', '{}', true);
    log := log || E'\nA signed out -> list=' || (restorable_devices(k_cur) ->> 'error')
               || ' forget=' || (forget_empty_devices(k_cur) ->> 'error') || ' [not_signed_in x2]';

    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

    -- B. Liste : seulement ce qui a des données (ou est actif), et le nombre de fiches vides.
    r := restorable_devices(k_cur);
    log := log || E'\nB list -> ok=' || (r ->> 'ok') || ' [true]'
               || ' | listed=' || jsonb_array_length(r -> 'devices') || ' [3]'
               || ' data=' || exists (select 1 from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_data)
               || ' tg=' || exists (select 1 from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_tg)
               || ' live=' || exists (select 1 from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_live)
               || ' [true x3]'
               || ' | empty old listed=' || exists (select 1 from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_eold)
               || ' empty recent listed=' || exists (select 1 from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_enew)
               || ' [false x2] | empty=' || (r ->> 'empty') || ' [1]';

    -- C. Mauvaises clés : refusées, rien n'est supprimé.
    log := log || E'\nC bad key -> ' || (forget_empty_devices('NOPENOPENOPE1') ->> 'error') || ' [invalid_secret]'
               || ' | other account key -> ' || (forget_empty_devices(k_oth) ->> 'error') || ' [not_linked]'
               || ' | empty old still there=' || exists (select 1 from devices where id = d_eold) || ' [true]';

    -- D. Nettoyage.
    r := forget_empty_devices(k_cur);
    log := log || E'\nD forget -> ok=' || (r ->> 'ok') || ' removed=' || (r ->> 'removed') || ' [true 1]'
               || ' | empty old gone=' || (not exists (select 1 from devices where id = d_eold)) || ' [true]'
               || ' | kept: current=' || exists (select 1 from devices where id = d_cur)
               || ' empty recent=' || exists (select 1 from devices where id = d_enew)
               || ' data=' || exists (select 1 from devices where id = d_data)
               || ' tg=' || exists (select 1 from devices where id = d_tg)
               || ' live=' || exists (select 1 from devices where id = d_live)
               || ' other account=' || exists (select 1 from devices where id = d_oth)
               || ' [true x6] | data intact=' || (select count(*) from device_locations where device_id = d_data)
               || '/' || (select count(*) from tg_links where device_id = d_tg) || ' [1/1]';

    -- E. Après : plus rien à nettoyer, la liste est inchangée.
    r := restorable_devices(k_cur);
    log := log || E'\nE after -> empty=' || (r ->> 'empty') || ' [0] | listed=' || jsonb_array_length(r -> 'devices') || ' [3]';

    -- F. Droits.
    log := log || E'\nF anon list=' || has_function_privilege('anon', 'restorable_devices(text)', 'execute')
               || ' anon forget=' || has_function_privilege('anon', 'forget_empty_devices(text)', 'execute')
               || ' anon helper=' || has_function_privilege('anon', 'hm_device_has_data(uuid)', 'execute')
               || ' auth helper=' || has_function_privilege('authenticated', 'hm_device_has_data(uuid)', 'execute')
               || ' [false x4] | auth list=' || has_function_privilege('authenticated', 'restorable_devices(text)', 'execute')
               || ' auth forget=' || has_function_privilege('authenticated', 'forget_empty_devices(text)', 'execute')
               || ' [true x2]';

    delete from panel_rate_limit where ip = v_ip;
    raise exception 'SELFTEST (annulé)%', log;
end $$;
