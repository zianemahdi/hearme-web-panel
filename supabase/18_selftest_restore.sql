-- ============================================================================
--  18_selftest_restore.sql — Vérification de 17 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : la transaction est annulée, la base reste intacte.
--  Le rapport s'affiche dans le message d'erreur. Valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    v_ip   text := '203.0.113.79';
    k_old  text := 'ZZO' || upper(substr(md5(random()::text), 1, 12));
    k_new  text := 'ZZN' || upper(substr(md5(random()::text), 1, 12));
    k_oth  text := 'ZZX' || upper(substr(md5(random()::text), 1, 12));
    d_old  uuid;
    d_new  uuid;
    d_oth  uuid;
    u      uuid;
    r      jsonb;
    log    text := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip = v_ip;
    select id into u from auth.users limit 1;

    -- Ancienne installation : Telegram (propriétaire + 1 proche), 2 positions,
    -- une commande Telegram et une commande panneau restées en attente.
    d_old := push_device_state(k_old, 'Selftest ancien');
    update devices set user_id = u, last_seen = now() - interval '3 days' where id = d_old;
    insert into tg_links(device_id, chat_id, role, name) values
        (d_old, 9100001001, 'owner', 'Moi'), (d_old, 9100001002, 'contact', 'Proche A');
    insert into device_locations(device_id, lat, lon) values (d_old, 36.75, 3.05), (d_old, 36.76, 3.06);
    insert into tg_inbox(device_id, chat_id, command, sender_role) values (d_old, 9100001001, 'alarm', 'owner');
    insert into device_commands(device_id, command) values (d_old, 'alarm');

    -- Réinstallation : nouvelle clé, rattachée au compte, un proche ajouté entre-temps.
    d_new := push_device_state(k_new, 'Selftest nouveau');
    update devices set user_id = u where id = d_new;
    insert into tg_links(device_id, chat_id, role, name) values (d_new, 9100001003, 'contact', 'Proche B');
    insert into device_locations(device_id, lat, lon) values (d_new, 36.77, 3.07);

    -- Appareil d'un autre (non rattaché à ce compte).
    d_oth := push_device_state(k_oth, 'Selftest autre');

    -- A. Sans connexion : refusé.
    perform set_config('request.jwt.claims', '{}', true);
    log := log || E'\nA signed out -> ' || (restorable_devices(k_new) ->> 'error') || ' [not_signed_in]';

    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);

    -- B. Liste : l'ancien est proposé avec son contenu, pas la nouvelle installation.
    r := restorable_devices(k_new);
    log := log || E'\nB list -> ok=' || (r ->> 'ok') || ' [true]'
               || ' | old listed=' || exists (select 1 from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_old) || ' [true]'
               || ' | new listed=' || exists (select 1 from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_new) || ' [false]'
               || ' | old telegram=' || (select e ->> 'telegram' from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_old) || ' [true]'
               || ' contacts=' || (select e ->> 'contacts' from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_old) || ' [1]'
               || ' locations=' || (select e ->> 'locations' from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_old) || ' [2]'
               || ' active=' || (select e ->> 'active' from jsonb_array_elements(r -> 'devices') e where (e ->> 'id')::uuid = d_old) || ' [false]';

    -- C. Téléphone encore actif : refusé.
    update devices set last_seen = now() where id = d_old;
    log := log || E'\nC still active -> ' || (restore_device(d_old, k_new) ->> 'error') || ' [still_active]';
    update devices set last_seen = now() - interval '3 days' where id = d_old;

    -- D. Appareil d'un autre compte, clé inconnue : refusés.
    log := log || E'\nD other account -> ' || (restore_device(d_oth, k_new) ->> 'error') || ' [not_found]'
               || ' | bad key -> ' || (restore_device(d_old, 'NOPENOPENOPE1') ->> 'error') || ' [invalid_secret]';

    -- E. Restauration.
    r := restore_device(d_old, k_new);
    log := log || E'\nE restore -> ok=' || (r ->> 'ok') || ' [true]';
    log := log || ' | new row gone=' || (not exists (select 1 from devices where id = d_new)) || ' [true]'
               || ' | new key opens old=' || (hm_device_id(k_new) = d_old) || ' [true]'
               || ' | old key dead=' || (hm_device_id(k_old) is null) || ' [true]'
               || ' | links=' || (select count(*) from tg_links where device_id = d_old) || ' [3]'
               || ' owner kept=' || exists (select 1 from tg_links where device_id = d_old and chat_id = 9100001001 and role = 'owner') || ' [true]'
               || ' | locations=' || (select count(*) from device_locations where device_id = d_old) || ' [3]'
               || ' | stale tg cmds=' || (select count(*) from tg_inbox where device_id = d_old) || ' [0]'
               || ' stale panel cmds=' || (select count(*) from device_commands where device_id = d_old and status = 'pending') || ' [0]';

    -- F. L'ancienne clé ne rouvre plus rien (panneau resté ouvert dessus).
    log := log || E'\nF panel with old key -> rows=' || (select count(*) from panel_get_device(k_old)) || ' [0]';

    -- G. Droits : seulement un utilisateur connecté.
    log := log || E'\nG anon list=' || has_function_privilege('anon', 'restorable_devices(text)', 'execute')
               || ' anon restore=' || has_function_privilege('anon', 'restore_device(uuid,text)', 'execute')
               || ' [false x2] | auth list=' || has_function_privilege('authenticated', 'restorable_devices(text)', 'execute')
               || ' auth restore=' || has_function_privilege('authenticated', 'restore_device(uuid,text)', 'execute')
               || ' [true x2]';

    delete from panel_rate_limit where ip = v_ip;
    raise exception 'SELFTEST (annulé)%', log;
end $$;
