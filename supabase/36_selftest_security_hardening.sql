-- ============================================================================
--  36_selftest_security_hardening.sql — Vérification de 35 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : tout est annulé. Faux compte, faux téléphones,
--  IP de documentation (203.0.113.x) ; aucune donnée réelle n'est lue.
--  Rapport dans le message d'erreur ; valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    v_ip  text := '203.0.113.85';
    v_ip2 text := '203.0.113.86';
    u     uuid := gen_random_uuid();
    mail  text := 'selftest-35@example.invalid';
    k     text := 'ZZS' || upper(substr(md5(random()::text), 1, 12));
    d     uuid;
    i     int;
    r     jsonb;
    lk    interval;
    nulls int := 0;
    log   text := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip in (v_ip, v_ip2);
    insert into auth.users(id, email) values (u, mail);
    d := push_device_state(k, 'Selftest 35');
    update devices set user_id = u where id = d;

    -- A. Nouveau PIN : 4 chiffres refusés, 6 acceptés.
    log := log || E'\nA pin4=' || (set_device_pin(k, mail, '4821') ->> 'error') || ' [bad_pin]'
               || ' pin6=' || (set_device_pin(k, mail, '482193') ->> 'ok') || ' [true]';

    -- B. Blocage progressif (on « fait passer le temps » entre deux essais).
    for i in 1..15 loop
        update account_pins set locked_until = now() - interval '1 second' where user_id = u;
        delete from panel_rate_limit where ip = v_ip;
        r := panel_pin_login(mail, '000000');
        if i in (4, 5, 9, 10, 14, 15) then
            select locked_until - now() into lk from account_pins where user_id = u;
            log := log || E'\nB fail ' || i || ' -> ' || case when lk is null or lk < interval '0'
                then 'pas de blocage' else round(extract(epoch from lk) / 60) || ' min' end;
        end if;
    end loop;
    log := log || '   [4: pas de blocage | 5,9: 15 min | 10,14: 60 min | 15: 1440 min]';
    log := log || E'\nB locked now=' || (panel_pin_login(mail, '482193') ->> 'error') || ' [locked]';

    -- C. Bon PIN (blocage expiré) : connexion et compteur remis à zéro.
    update account_pins set locked_until = null where user_id = u;
    delete from panel_rate_limit where ip = v_ip;
    log := log || E'\nC ok=' || (panel_pin_login(mail, '482193') ->> 'ok') || ' [true]';
    -- Relu dans une instruction À PART (l'instantané de la précédente ne voit pas l'écriture).
    log := log || ' fails=' || (select fail_count from account_pins where user_id = u) || ' [0]';

    -- D. Ancien PIN de 4 chiffres déjà enregistré : toujours accepté à la connexion.
    update account_pins set pin_hash = crypt('4821', gen_salt('bf')) where user_id = u;
    log := log || E'\nD old pin4 ok=' || (panel_pin_login(mail, '4821') ->> 'ok') || ' [true]';

    -- E. Création d'appareils : 5 par IP et par 10 min ; ensuite refus ;
    --    un appareil existant continue de se synchroniser ; une autre IP peut créer.
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip2)::text, true);
    for i in 1..6 loop
        if push_device_state('ZZT' || upper(substr(md5(random()::text), 1, 12)), 'Selftest E') is null then
            nulls := nulls + 1;
        end if;
    end loop;
    log := log || E'\nE 6 creations -> refusees=' || nulls || ' [1]'
               || ' | existant=' || (push_device_state(k, 'Selftest 35') = d) || ' [true]';
    perform set_config('request.headers', json_build_object('x-real-ip', '203.0.113.87')::text, true);
    log := log || ' | autre IP=' || (push_device_state('ZZU' || upper(substr(md5(random()::text), 1, 12)), 'Selftest E') is not null) || ' [true]';

    raise exception 'SELFTEST 35 (tout est annulé) :%', log;
end $$;
