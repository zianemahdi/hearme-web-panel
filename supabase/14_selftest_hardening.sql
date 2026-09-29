-- ============================================================================
--  14_selftest_hardening.sql — Vérification de 12 et 13 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Tout se passe dans un bloc qui se termine par RAISE : la transaction est
--  annulée, la base reste intacte. Le rapport s'affiche dans le message
--  d'erreur (« SELFTEST … »). Chaque ligne doit se lire comme attendu.
-- ============================================================================
do $$
declare
    v_ip  text := '203.0.113.77';
    k     text := 'ZZT' || upper(substr(md5(random()::text), 1, 12));  -- clé forte (15)
    k2    text := 'ZZU' || upper(substr(md5(random()::text), 1, 12));
    w     text := 'ZZ'  || upper(substr(md5(random()::text), 1, 4));   -- clé faible (6)
    d     uuid;
    dw    uuid;
    u     uuid;
    r     jsonb;
    t     text;
    b     boolean;
    x     uuid;
    n     int;
    n0    int;
    i     int;
    log   text := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip = v_ip;

    -- A. Création : clé forte acceptée, nouvelle clé faible refusée, ancienne faible tolérée.
    d := push_device_state(k, 'Test');
    x := push_device_state('ZZWEAK');
    insert into devices(secret_key, name) values (w, 'Legacy') returning id into dw;
    log := log || E'\nA new strong=' || (d is not null) || ' new weak=' || coalesce(x::text, 'null')
               || ' legacy weak sync=' || (push_device_state(w) = dw);

    -- B. Quarantaine des clés faibles.
    select count(*) into n from panel_get_device(w);
    select count(*) into n0 from poll_commands(w);
    log := log || E'\nB weak key panel rows=' || n || ' poll rows=' || n0;

    -- C. Clé forte : chemin normal.
    select count(*) into n from panel_get_device(k);
    x := panel_send_command(k, 'ring');
    select count(*) into n0 from poll_commands(k);
    log := log || E'\nC strong panel rows=' || n || ' send cmd=' || (x is not null) || ' polled=' || n0;

    -- D. Clé invalide : réponses « vides », jamais d'exception.
    log := log || E'\nD bad key: send=' || coalesce(panel_send_command('NOPENOPENOPE1', 'ring')::text, 'null')
               || ' mint=' || coalesce(mint_access_token('NOPENOPENOPE1'), 'null')
               || ' photo=' || coalesce(record_photo('NOPENOPENOPE1', 'x')::text, 'null')
               || ' regen=' || panel_request_regenerate('NOPENOPENOPE1')
               || ' rotate=' || rotate_secret('NOPENOPENOPE1', k2)
               || ' claim=' || coalesce(claim_device_by_secret('NOPENOPENOPE1')::text, 'null');

    -- E. Sortie de quarantaine : rotation d'une clé faible vers une clé forte.
    begin
        perform rotate_secret(w, 'short');
        log := log || E'\nE rotate to weak: ACCEPTED (BUG)';
    exception when others then
        log := log || E'\nE rotate to weak refused: ' || left(sqlerrm, 40);
    end;
    b := rotate_secret(w, k2);
    select count(*) into n from panel_get_device(k2);
    log := log || ' | weak->strong=' || b || ' panel rows now=' || n;

    -- F. Les échecs sont bien COMPTÉS (le bug de 09 : ils ne l'étaient jamais).
    select count into n from panel_rate_limit where ip = v_ip and action = 'key_fail';
    log := log || E'\nF failures counted=' || coalesce(n, 0);

    -- G. Au-delà de 30 échecs : même la BONNE clé est refusée.
    for i in 1..30 loop
        begin
            perform panel_send_command('NOPENOPENOPE' || i, 'ring');
        exception when others then null; -- au-delà du seuil : refus attendu
        end;
    end loop;
    begin
        select count(*) into n from panel_get_device(k2);
        log := log || E'\nG correct key after 30 fails: ACCEPTED (BUG)';
    exception when others then
        log := log || E'\nG correct key after 30 fails refused: ' || left(sqlerrm, 30);
    end;
    log := log || ' | tg_get_links=' || (tg_get_links(k2) ->> 'error')
               || ' consume=' || (consume_access_token('x') ->> 'error');
    delete from panel_rate_limit where ip = v_ip;

    -- H. PIN maître : bon PIN OK, puis blocage IP même avec le bon PIN.
    r := set_device_pin(k2, 'zz-selftest@example.com', '4821');
    log := log || E'\nH set pin=' || (r ->> 'ok')
               || ' wrong=' || (panel_pin_login('zz-selftest@example.com', '0000') ->> 'error')
               || ' right=' || (panel_pin_login('zz-selftest@example.com', '4821') ->> 'ok');
    for i in 1..20 loop
        perform panel_pin_login('zz-nobody' || i || '@example.com', '1234');
    end loop;
    log := log || ' | right PIN after 20 IP fails=' || (panel_pin_login('zz-selftest@example.com', '4821') ->> 'error');
    delete from panel_rate_limit where ip = v_ip;

    -- I. Telegram : une clé de 6 car. n'est plus prise pour une clé ; la forte oui.
    r := tg_handle_update(910000001, 1, 777, w, 'X');
    log := log || E'\nI tg weak free text -> deletes=' || jsonb_array_length(r -> 'delete')
               || ' reply=' || left(r #>> '{replies,0,text}', 20);
    r := tg_handle_update(910000002, 2, 777, '/ring ' || k2, 'X');
    log := log || ' | strong -> ' || left(r #>> '{replies,0,text}', 25);

    -- J. Carte : appareil non rattaché ignoré ; rattaché = 1 par cellule, 3 par jour.
    select count(*) into n0 from incidents;
    perform report_incident('NOPENOPENOPE1', 36.75, 3.05);
    perform report_incident(k2, 36.75, 3.05);
    select count(*) into n from incidents;
    log := log || E'\nJ bad key / unclaimed -> new incidents=' || (n - n0);
    select id into u from auth.users limit 1;
    update devices set user_id = u where secret_key = k2;
    perform report_incident(k2, 36.75, 3.05);
    perform report_incident(k2, 36.7505, 3.0505);   -- même cellule → ignoré
    perform report_incident(k2, 36.80, 3.05);
    perform report_incident(k2, 36.85, 3.05);
    perform report_incident(k2, 36.90, 3.05);        -- 4e du jour → ignoré
    select count(*) into n from incidents;
    log := log || ' | claimed: accepted=' || (n - n0) || ' (attendu 3)'
               || ' | quota rows=' || (select count(*) from incident_quota)
               || ' | reporter is hash=' || (select bool_and(reporter ~ '^[0-9a-f]{64}$') from incident_quota)
               || ' | no uuid stored=' || not exists (select 1 from incident_quota where reporter = u::text);

    -- K. Droits.
    log := log || E'\nK anon exec hm_guard=' || has_function_privilege('anon', 'hm_guard()', 'execute')
               || ' hm_device_id=' || has_function_privilege('anon', 'hm_device_id(text)', 'execute')
               || ' report_incident(new)=' || has_function_privilege('anon', 'report_incident(text,double precision,double precision,real)', 'execute')
               || ' old report_incident exists=' || exists (select 1 from pg_proc where proname = 'report_incident' and pronargs = 3)
               || ' rotate_secret=' || has_function_privilege('anon', 'rotate_secret(text,text)', 'execute')
               || ' regen(auth)=' || has_function_privilege('authenticated', 'panel_request_regenerate(text)', 'execute')
               || ' anon read quota=' || has_table_privilege('anon', 'incident_quota', 'select');

    raise exception 'SELFTEST (annulé)%', log;
end $$;
