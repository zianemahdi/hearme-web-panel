-- ============================================================================
--  38_selftest_plus.sql — Vérification de 37 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : tout est annulé (y compris le passage en « limites
--  actives »). Faux compte, faux téléphones, IP de documentation (203.0.113.x).
--  Rapport dans le message d'erreur ; valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    v_ip text := '203.0.113.87';
    u    uuid := gen_random_uuid();
    k1   text := 'ZZP' || upper(substr(md5(random()::text), 1, 12));
    k2   text := 'ZZQ' || upper(substr(md5(random()::text), 1, 12));
    d1   uuid;
    d2   uuid;
    n    int;
    r    jsonb;
    log  text := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip = v_ip;
    insert into auth.users(id, email) values (u, 'selftest-37@example.invalid');
    d1 := push_device_state(k1, 'Selftest 37 A');
    d2 := push_device_state(k2, 'Selftest 37 B');
    update devices set user_id = u where id = d1;

    -- A. Limites coupées : tout le monde est Plus, rien ne change.
    r := plus_status(k1);
    log := log || E'\nA enforced=' || (r ->> 'enforced') || ' [false]'
               || ' plus=' || ((r ->> 'until_ms')::bigint > extract(epoch from now()) * 1000) || ' [true]'
               || ' contacts=' || plus_max_contacts(d1) || ' [2]'
               || ' tg_patch=' || (position('plus_max_contacts' in (select pg_get_functiondef(p.oid)
                      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                      where s.nspname = 'public' and p.proname = 'tg_handle_update')) > 0) || ' [true]';

    -- B. Limites actives, compte gratuit.
    update plus_config set enforced = true;
    r := plus_status(k1);
    log := log || E'\nB until=' || (r ->> 'until_ms') || ' [0] contacts=' || plus_max_contacts(d1) || ' [1]';

    -- C. Positions : une seule toutes les 14 min, sauf « Localiser » demandé.
    perform push_location(k1, 36.7, 3.05, 10, 80);
    perform push_location(k1, 36.7, 3.05, 10, 80);
    select count(*) into n from device_locations where device_id = d1;
    log := log || E'\nC free_pushes=' || n || ' [1]';
    insert into device_commands(device_id, command) values (d1, 'locate');
    perform push_location(k1, 36.7, 3.05, 10, 80);
    select count(*) into n from device_locations where device_id = d1;
    log := log || ' after_locate=' || n || ' [2]';

    -- D. Téléphones : 1 en gratuit (le 2e est refusé).
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    begin
        perform claim_device_by_secret(k2);
        log := log || E'\nD second_device=accepté [refusé]';
    exception when others then
        log := log || E'\nD second_device=' || sqlerrm || ' [plus_device_limit]';
    end;
    log := log || ' same_device=' || (claim_device_by_secret(k1) = d1) || ' [true]';

    -- E. Cadeau de vol : 48 h, une fois par 30 jours.
    r := plus_claim_gift(k1);
    log := log || E'\nE gift=' || (r ->> 'ok') || ' [true] active=' || plus_device_active(d1) || ' [true]';
    r := plus_claim_gift(k1);
    log := log || ' again=' || (r ->> 'ok') || ' [false]';
    update devices set plus_gift_until = now() - interval '1 second' where id = d1;
    log := log || ' after_48h=' || plus_device_active(d1) || ' [false]';

    -- F. Abonnement : direct, 2 proches, 2e téléphone accepté.
    insert into plus_entitlements(user_id, until, source) values (u, now() + interval '1 month', 'play');
    log := log || E'\nF active=' || plus_device_active(d1) || ' [true] contacts=' || plus_max_contacts(d1) || ' [2]'
               || ' second_device=' || (claim_device_by_secret(k2) = d2) || ' [true]'
               || ' my_plus=' || (my_plus() ->> 'source') || ' [play]';

    -- G. Purge : photo de 2 jours gardée avec Plus, effacée en gratuit.
    insert into security_photos(device_id, storage_path, event_type, created_at)
        values (d1, d1 || '/selftest.jpg', 'theft', now() - interval '2 days');
    select count(*) into n from photos_to_purge(30, 500) where storage_path = d1 || '/selftest.jpg';
    log := log || E'\nG plus_purge=' || n || ' [0]';
    delete from plus_entitlements where user_id = u;
    select count(*) into n from photos_to_purge(30, 500) where storage_path = d1 || '/selftest.jpg';
    log := log || ' free_purge=' || n || ' [1]';

    -- H. Lancement : les comptes existants deviennent fondateurs.
    update plus_config set enforced = false;
    n := plus_launch();
    log := log || E'\nH founders>0=' || (n > 0) || ' [true] enforced=' || plus_enforced() || ' [true]'
               || ' u_founder=' || (select source from plus_entitlements where user_id = u) || ' [founder]';

    raise exception 'SELFTEST 37 (tout annulé) :%', log;
end $$;
