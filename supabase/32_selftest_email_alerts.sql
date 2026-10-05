-- ============================================================================
--  32_selftest_email_alerts.sql — Vérification de 31 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : tout est annulé. Faux utilisateur et faux
--  téléphones créés DANS la transaction ; aucune donnée réelle n'est lue.
-- ============================================================================
do $$
declare
    v_ip text := '203.0.113.81';
    k    text := 'ZZE' || upper(substr(md5(random()::text), 1, 12));
    k2   text := 'ZZF' || upper(substr(md5(random()::text), 1, 12));
    k3   text := 'ZZG' || upper(substr(md5(random()::text), 1, 12));
    u    uuid := gen_random_uuid();
    u2   uuid := gen_random_uuid();
    d    uuid;
    r    jsonb;
    i    int;
    log  text := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip = v_ip;

    insert into auth.users(id, email, email_confirmed_at, aud, role)
        values (u, 'selftest-mail@example.invalid', now(), 'authenticated', 'authenticated');
    insert into auth.users(id, email, aud, role)
        values (u2, 'selftest-unconfirmed@example.invalid', 'authenticated', 'authenticated');
    insert into devices(secret_key, name, user_id) values (k, 'Pixel test', u) returning id into d;
    insert into devices(secret_key, name) values (k2, 'Sans compte');
    insert into devices(secret_key, name, user_id) values (k3, 'Non confirmé', u2);
    perform tg_set_device_lang(d, 'es');

    -- A. Téléphone rattaché, e-mail confirmé : destinataire = e-mail du compte.
    r := email_authorize(k, v_ip);
    log := log || E'\nA ok=' || (r ->> 'ok') || ' to=' || coalesce(r ->> 'to', 'null')
               || ' lang=' || coalesce(r ->> 'lang', 'null') || ' name=' || coalesce(r ->> 'device_name', 'null');

    -- B. Refus : clé fausse, téléphone sans compte, e-mail non confirmé.
    log := log || E'\nB bad key=' || (email_authorize('NOPENOPENOPE1', v_ip) ->> 'error')
               || ' no account=' || (email_authorize(k2, v_ip) ->> 'error')
               || ' unconfirmed=' || (email_authorize(k3, v_ip) ->> 'error');

    -- C. Quota : 10 par heure (le 1er est déjà compté en A).
    for i in 2..10 loop perform email_authorize(k, v_ip); end loop;
    log := log || E'\nC 11th=' || coalesce(email_authorize(k, v_ip) ->> 'error', 'ok');

    -- D. Droits.
    log := log || E'\nD anon exec=' || has_function_privilege('anon', 'email_authorize(text,text)', 'execute')
               || ' auth exec=' || has_function_privilege('authenticated', 'email_authorize(text,text)', 'execute')
               || ' service exec=' || has_function_privilege('service_role', 'email_authorize(text,text)', 'execute')
               || ' anon read quota=' || has_table_privilege('anon', 'email_send_quota', 'select');

    -- E. Suppression du téléphone : son quota part avec lui.
    delete from devices where id = d;
    log := log || E'\nE quota row after delete=' || exists (select 1 from email_send_quota where device_id = d);

    raise exception 'SELFTEST (annulé)%', log;
end $$;
