-- ============================================================================
--  16_selftest_master_pin.sql — Vérification de 15 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Même principe que 14 : tout se passe dans un bloc qui se termine par RAISE,
--  la transaction est annulée et la base reste intacte. Le rapport s'affiche
--  dans le message d'erreur (« SELFTEST … »). Valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    v_ip    text := '203.0.113.78';
    k1      text := 'ZZP' || upper(substr(md5(random()::text), 1, 12));
    k2      text := 'ZZQ' || upper(substr(md5(random()::text), 1, 12));
    d1      uuid;
    d2      uuid;
    u       uuid;
    u_email text;
    i       int;
    log     text := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip = v_ip;
    select id, lower(btrim(email)) into u, u_email
      from auth.users where coalesce(email, '') <> '' limit 1;
    delete from account_pins where user_id = u;          -- départ propre (annulé à la fin)
    d1 := push_device_state(k1, 'Selftest ancien');

    -- A. Téléphone sans compte : PIN refusé, statut « non lié ».
    log := log || E'\nA unlinked -> ' || (set_device_pin(k1, 'x@example.com', '4821') ->> 'error')
               || ' [not_linked] | status linked=' || (pin_status(k1) ->> 'linked') || ' [false]';

    -- B. Téléphone rattaché : PIN accepté et rangé sous le COMPTE.
    update devices set user_id = u, last_seen = now() - interval '1 day' where id = d1;
    log := log || E'\nB linked -> ok=' || (set_device_pin(k1, 'attaquant@example.com', '4821') ->> 'ok') || ' [true]';
    -- Vérification dans une instruction À PART : dans la même instruction que
    -- l'écriture, l'instantané de Postgres ne voit pas encore la nouvelle ligne.
    log := log || ' | stored for account=' || exists (select 1 from account_pins where user_id = u) || ' [true]';

    -- C. RÉINSTALLATION : nouvelle clé, nouvel appareil rattaché au même compte,
    --    AUCUN nouveau PIN saisi → le PIN existe déjà et ouvre le NOUVEAU téléphone.
    d2 := push_device_state(k2, 'Selftest réinstallé');
    update devices set user_id = u, last_seen = now() + interval '1 minute' where id = d2;
    log := log || E'\nC reinstall -> status has_pin=' || (pin_status(k2) ->> 'has_pin') || ' [true]'
               || ' | login opens new phone=' || ((panel_pin_login(u_email, '4821') ->> 'device_id')::uuid = d2)
               || ' [true] | email case-insensitive=' || (panel_pin_login(upper(u_email), '4821') ->> 'ok') || ' [true]';

    -- D. Changer le PIN depuis le nouveau téléphone : l'ancien ne marche plus.
    log := log || E'\nD change -> ok=' || (set_device_pin(k2, '', '9137') ->> 'ok')
               || ' [true] | old pin=' || (panel_pin_login(u_email, '4821') ->> 'error')
               || ' [invalid] | new pin=' || (panel_pin_login(u_email, '9137') ->> 'ok') || ' [true]';

    -- E. 5 erreurs → verrou 15 min, même avec le bon PIN.
    for i in 1..5 loop perform panel_pin_login(u_email, '0000'); end loop;
    log := log || E'\nE after 5 fails, right pin -> ' || (panel_pin_login(u_email, '9137') ->> 'error') || ' [locked]';
    delete from panel_rate_limit where ip = v_ip;

    -- F. Adresse inconnue, PIN mal formé, clé inconnue.
    log := log || E'\nF unknown email -> ' || (panel_pin_login('zz-nobody@example.com', '1234') ->> 'error')
               || ' [invalid] | bad pin -> ' || (set_device_pin(k2, '', '12') ->> 'error')
               || ' [bad_pin] | bad key -> ' || (pin_status('NOPENOPENOPE1') ->> 'error') || ' [invalid_secret]';

    -- G. Droits et nettoyage.
    log := log || E'\nG anon: set_pin=' || has_function_privilege('anon', 'set_device_pin(text,text,text)', 'execute')
               || ' status=' || has_function_privilege('anon', 'pin_status(text)', 'execute')
               || ' login=' || has_function_privilege('anon', 'panel_pin_login(text,text)', 'execute')
               || ' [true x3] | authenticated status=' || has_function_privilege('authenticated', 'pin_status(text)', 'execute')
               || ' anon read table=' || has_table_privilege('anon', 'account_pins', 'select')
               || ' [false x2] | old table gone=' || (to_regclass('public.device_pins') is null) || ' [true]';

    delete from panel_rate_limit where ip = v_ip;
    raise exception 'SELFTEST (annulé)%', log;
end $$;
