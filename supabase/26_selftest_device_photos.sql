-- ============================================================================
--  26_selftest_device_photos.sql — Vérification de 25 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : la transaction est annulée, la base reste intacte.
--  Valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    v_ip  text := '203.0.113.82';
    v_ip2 text := '203.0.113.83';
    k     text := 'ZZQ' || upper(substr(md5(random()::text), 1, 12));
    d     uuid;
    r     jsonb;
    i     int;
    log   text := '';
begin
    delete from panel_rate_limit where ip in (v_ip, v_ip2);
    d := push_device_state(k, 'Selftest photos');

    -- A. Bonne clé : autorisé, appareil renvoyé.
    r := photo_authorize(k, v_ip, true);
    log := log || E'\nA good key -> ok=' || (r ->> 'ok') || ' device=' || ((r ->> 'device_id')::uuid = d) || ' [true true]';

    -- B. Mauvaise clé : refusée et comptée ; au 30e échec, l'IP est bloquée (même la bonne clé).
    r := photo_authorize('NOPENOPENOPE1', v_ip2, false);
    log := log || E'\nB bad key -> ' || (r ->> 'error') || ' [invalid_secret]';
    for i in 2..30 loop perform photo_authorize('NOPENOPENOPE1', v_ip2, false); end loop;
    log := log || ' | after 30 -> ' || (photo_authorize(k, v_ip2, false) ->> 'error') || ' [rate_limited]'
               || ' | other ip still ok=' || (photo_authorize(k, v_ip, false) ->> 'ok') || ' [true]';

    -- C. Quota : 30 photos dans l'heure, la 31e est refusée ; la liste reste permise.
    insert into security_photos(device_id, storage_path, event_type)
        select d, d || '/selftest-' || g || '.jpg', 'remote_photo' from generate_series(1, 30) g;
    log := log || E'\nC quota -> upload=' || (photo_authorize(k, v_ip, true) ->> 'error') || ' [quota]'
               || ' list ok=' || (photo_authorize(k, v_ip, false) ->> 'ok') || ' [true]';

    -- D. Jeton de purge : seul celui du Vault passe.
    log := log || E'\nD purge token -> vault=' || photo_purge_token_ok(
                    (select decrypted_secret from vault.decrypted_secrets where name = 'hearme_photo_purge'))
               || ' [true] wrong=' || photo_purge_token_ok('nope') || ' empty=' || photo_purge_token_ok('')
               || ' [false false]';

    -- E. Droits : rien pour anon / authenticated.
    log := log || E'\nE anon authorize=' || has_function_privilege('anon', 'photo_authorize(text,text,boolean)', 'execute')
               || ' auth authorize=' || has_function_privilege('authenticated', 'photo_authorize(text,text,boolean)', 'execute')
               || ' anon token=' || has_function_privilege('anon', 'photo_purge_token_ok(text)', 'execute')
               || ' anon record_photo=' || has_function_privilege('anon', 'record_photo(text,text,text)', 'execute')
               || ' [false x4] | service_role=' || has_function_privilege('service_role', 'photo_authorize(text,text,boolean)', 'execute')
               || ' [true] | table service_role sel/ins/del=' || has_table_privilege('service_role', 'security_photos', 'select')
               || '/' || has_table_privilege('service_role', 'security_photos', 'insert')
               || '/' || has_table_privilege('service_role', 'security_photos', 'delete')
               || ' anon insert=' || has_table_privilege('anon', 'security_photos', 'insert') || ' [true/true/true false]';

    -- F. Purge planifiée et pg_net.
    log := log || E'\nF cron -> ' || coalesce((select schedule || ' active=' || active from cron.job
                                               where jobname = 'hearme-purge-photos'), 'absent')
               || ' [29 3 * * * active=true] | pg_net=' || exists (select 1 from pg_extension where extname = 'pg_net')
               || ' [true]';

    delete from panel_rate_limit where ip in (v_ip, v_ip2);
    raise exception 'SELFTEST (annulé)%', log;
end $$;
