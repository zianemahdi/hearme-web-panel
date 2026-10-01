-- ============================================================================
--  20_selftest_delete_account.sql — Vérification de 19 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : la transaction est annulée, la base reste intacte.
--  Valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    v_ip   text := '203.0.113.80';
    k1     text := 'ZZD' || upper(substr(md5(random()::text), 1, 12));
    k2     text := 'ZZE' || upper(substr(md5(random()::text), 1, 12));
    k_oth  text := 'ZZF' || upper(substr(md5(random()::text), 1, 12));
    d1     uuid;
    d2     uuid;
    d_oth  uuid;
    u      uuid;
    r      jsonb;
    log    text := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip = v_ip;
    select id into u from auth.users limit 1;

    -- Deux téléphones du compte, avec positions, commandes, Telegram et PIN.
    d1 := push_device_state(k1, 'Selftest 1');
    d2 := push_device_state(k2, 'Selftest 2');
    update devices set user_id = u where id in (d1, d2);
    insert into device_locations(device_id, lat, lon) values (d1, 36.75, 3.05), (d2, 36.76, 3.06);
    insert into device_commands(device_id, command) values (d1, 'ring');
    insert into tg_links(device_id, chat_id, role, name) values (d1, 9100002001, 'owner', 'Moi');
    insert into tg_inbox(device_id, chat_id, command, sender_role) values (d1, 9100002001, 'ring', 'owner');
    insert into account_pins(user_id, pin_hash) values (u, 'x')
        on conflict (user_id) do update set pin_hash = 'x';
    insert into incident_quota(reporter, cell, day, n)
        values (encode(digest(u::text, 'sha256'), 'hex'), '*', current_date, 1)
        on conflict (reporter, cell, day) do nothing;
    -- Le téléphone de quelqu'un d'autre ne doit pas être touché.
    d_oth := push_device_state(k_oth, 'Selftest autre');

    -- A. Droits : seul le service_role peut l'appeler.
    log := log || E'\nA anon=' || has_function_privilege('anon', 'delete_account_data(uuid)', 'execute')
               || ' authenticated=' || has_function_privilege('authenticated', 'delete_account_data(uuid)', 'execute')
               || ' [false x2] | service_role=' || has_function_privilege('service_role', 'delete_account_data(uuid)', 'execute') || ' [true]';

    -- B. Suppression.
    r := delete_account_data(u);
    log := log || E'\nB ok=' || (r ->> 'ok') || ' [true] | devices>=2: ' || ((r ->> 'devices')::int >= 2) || ' [true]';

    -- C. Plus rien du compte.
    log := log || E'\nC devices=' || (select count(*) from devices where user_id = u)
               || ' locations=' || (select count(*) from device_locations where device_id in (d1, d2))
               || ' commands=' || (select count(*) from device_commands where device_id in (d1, d2))
               || ' tg_links=' || (select count(*) from tg_links where device_id in (d1, d2))
               || ' tg_inbox=' || (select count(*) from tg_inbox where device_id in (d1, d2))
               || ' pin=' || (select count(*) from account_pins where user_id = u)
               || ' quota=' || (select count(*) from incident_quota where reporter = encode(digest(u::text, 'sha256'), 'hex'))
               || ' [0 x7]';

    -- D. Le téléphone d'un autre est intact ; un identifiant vide est refusé.
    log := log || E'\nD other phone kept=' || exists (select 1 from devices where id = d_oth) || ' [true]';
    begin
        perform delete_account_data(null);
        log := log || ' | null uid -> accepted [refused]';
    exception when others then
        log := log || ' | null uid -> refused [refused]';
    end;

    delete from panel_rate_limit where ip = v_ip;
    raise exception 'SELFTEST (annulé)%', log;
end $$;
