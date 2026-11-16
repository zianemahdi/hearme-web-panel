-- ============================================================================
--  43_selftest_push_wake.sql — Vérification de 42 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : tout est annulé (y compris l'appel réseau mis en file
--  par pg_net). Faux téléphone. Rapport dans le message d'erreur ; attendu entre [ ].
-- ============================================================================
do $$
declare
    k1   text := 'ZZW' || upper(substr(md5(random()::text), 1, 12));
    d1   uuid;
    q0   bigint;
    log  text := '';
    w1   timestamptz;
begin
    d1 := push_device_state(k1, 'Selftest 42');

    -- A. Enregistrement du jeton, mauvaise clé, remplacement.
    log := log || E'\nA reg=' || register_push_token(k1, 'tokA') || ' [true]'
               || ' bad=' || register_push_token('ZZWNOPE' || k1, 'tokX') || ' [false]'
               || ' replace=' || register_push_token(k1, 'tokB') || ' [true]'
               || ' token=' || push_token_for(d1) || ' [tokB]';

    -- B. Une commande → un réveil (appel mis en file) ; une 2e aussitôt → regroupée.
    select count(*) into q0 from net.http_request_queue;
    insert into device_commands(device_id, command) values (d1, 'alarm');
    select woken_at into w1 from device_push where device_id = d1;
    log := log || E'\nB woken=' || (w1 is not null) || ' [true]'
               || ' queued=' || ((select count(*) from net.http_request_queue) - q0) || ' [1]';
    insert into device_commands(device_id, command) values (d1, 'photo');
    log := log || ' debounce=' || ((select count(*) from net.http_request_queue) - q0) || ' [1]';

    -- C. Plus tard (> 2 s) : nouveau réveil ; commande Telegram aussi.
    update device_push set woken_at = now() - interval '5 seconds' where device_id = d1;
    insert into tg_inbox(device_id, chat_id, command, sender_role) values (d1, 1, 'locate', 'owner');
    log := log || E'\nC tg_queued=' || ((select count(*) from net.http_request_queue) - q0) || ' [2]';

    -- D. Jeton oublié, jeton vide = désinscription, pas de jeton = pas d'appel.
    perform push_token_forget(d1, 'autre');
    log := log || E'\nD forget_other_kept=' || (push_token_for(d1) is not null) || ' [true]';
    perform register_push_token(k1, '');
    update device_push set woken_at = null where device_id = d1;
    insert into device_commands(device_id, command) values (d1, 'alarm');
    log := log || ' unregistered=' || (push_token_for(d1) is null) || ' [true]'
               || ' no_call=' || ((select count(*) from net.http_request_queue) - q0) || ' [2]';

    -- E. Droits : rien d'ouvert à anon sauf l'enregistrement.
    log := log || E'\nE anon_register=' || has_function_privilege('anon', 'register_push_token(text,text)', 'execute') || ' [true]'
               || ' anon_token_ok=' || has_function_privilege('anon', 'push_wake_token_ok(text)', 'execute') || ' [false]'
               || ' anon_token_for=' || has_function_privilege('anon', 'push_token_for(uuid)', 'execute') || ' [false]'
               || ' anon_wake=' || has_function_privilege('anon', 'hm_push_wake(uuid)', 'execute') || ' [false]'
               || ' anon_table=' || has_table_privilege('anon', 'device_push', 'select') || ' [false]'
               || ' token_ok(bad)=' || push_wake_token_ok('x') || ' [false]';

    raise exception 'SELFTEST (annulé)%', log;
end $$;
