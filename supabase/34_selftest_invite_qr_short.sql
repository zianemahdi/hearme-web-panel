-- ============================================================================
--  34_selftest_invite_qr_short.sql — Vérification de 33 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : tout est annulé. Faux téléphone et faux chats
--  uniquement ; aucune donnée réelle n'est lue. Rapport dans le message d'erreur.
-- ============================================================================
do $$
declare
    v_ip text   := '203.0.113.83';
    k    text   := 'ZZQ' || upper(substr(md5(random()::text), 1, 12));
    d    uuid;
    r    jsonb;
    l1 text; l2 text; l3 text; s1 text; s2 text; s3 text; lk text; old5 text;
    cr   bigint := 931000002;   -- proche
    cu   bigint := 931000003;   -- autre compte
    u    bigint := 951000000;   -- update_id de base
    log  text   := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip = v_ip;
    insert into devices(secret_key, name) values (k, 'Selftest QR') returning id into d;

    -- A. Un lien partagé (long), puis 3 QR (courts) : on garde les 2 QR récents + le lien.
    l1 := tg_create_start_link(k, 'pair', 'Mahdi', null, 'fr', false) ->> 'token';
    s1 := tg_create_start_link(k, 'pair', 'Mahdi', null, 'fr', true)  ->> 'token';
    s2 := tg_create_start_link(k, 'pair', 'Mahdi', null, 'fr', true)  ->> 'token';
    s3 := tg_create_start_link(k, 'pair', 'Mahdi', null, 'fr', true)  ->> 'token';
    log := log || E'\nA short=' || (select count(*) from tg_start_tokens where device_id = d and short)
               || ' long=' || (select count(*) from tg_start_tokens where device_id = d and kind = 'pair' and not short)
               || ' s1 gone=' || (not exists (select 1 from tg_start_tokens where token = s1))
               || ' l1 kept=' || exists (select 1 from tg_start_tokens where token = l1);

    -- B. Durées : QR 5 min, lien partagé 24 h, lien propriétaire 1 h (jamais court).
    lk := tg_create_start_link(k, 'link', null, 'Pixel', 'fr', true) ->> 'token';
    log := log || E'\nB qr min=' || (select round(extract(epoch from expires_at - now()) / 60) from tg_start_tokens where token = s3)
               || ' shared min=' || (select round(extract(epoch from expires_at - now()) / 60) from tg_start_tokens where token = l1)
               || ' owner min=' || (select round(extract(epoch from expires_at - now()) / 60) from tg_start_tokens where token = lk)
               || ' owner short=' || (select short from tg_start_tokens where token = lk);

    -- C. Le proche scanne le QR : il est ajouté, ce QR est consommé, le lien partagé reste.
    r := tg_handle_update(u + 1, 1, cr, '/start pair_' || s3, 'Rel', 'fr');
    log := log || E'\nC contact added=' || exists (select 1 from tg_links where device_id = d and chat_id = cr and role = 'contact')
               || ' s3 consumed=' || (not exists (select 1 from tg_start_tokens where token = s3))
               || ' l1 kept=' || exists (select 1 from tg_start_tokens where token = l1)
               || ' s2 kept=' || exists (select 1 from tg_start_tokens where token = s2);

    -- D. Un QR remplacé (s1) ne marche plus.
    r := tg_handle_update(u + 2, 2, cu, '/start pair_' || s1, 'Other', 'fr');
    log := log || E'\nD old qr linked=' || exists (select 1 from tg_links where device_id = d and chat_id = cu)
               || ' reply=' || left(coalesce(r #>> '{replies,0,text}', 'null'), 40);

    -- E. Deux partages gardent les 2 liens ; un 3e retire le plus ancien.
    l2 := tg_create_start_link(k, 'pair', 'Mahdi', null, 'fr', false) ->> 'token';
    log := log || E'\nE 2nd share: l1=' || exists (select 1 from tg_start_tokens where token = l1)
               || ' l2=' || exists (select 1 from tg_start_tokens where token = l2);
    l3 := tg_create_start_link(k, 'pair', 'Mahdi', null, 'fr', false) ->> 'token';
    log := log || ' | 3rd share: l1=' || exists (select 1 from tg_start_tokens where token = l1)
               || ' l2=' || exists (select 1 from tg_start_tokens where token = l2)
               || ' l3=' || exists (select 1 from tg_start_tokens where token = l3);

    -- F. Ancienne app : appel à 5 arguments (sans p_short) → lien long de 24 h.
    old5 := tg_create_start_link(k, 'pair', 'Mahdi', null, 'fr') ->> 'token';
    log := log || E'\nF old call short=' || (select short from tg_start_tokens where token = old5)
               || ' min=' || (select round(extract(epoch from expires_at - now()) / 60) from tg_start_tokens where token = old5);

    -- G. Jeton expiré nettoyé au prochain appel.
    update tg_start_tokens set expires_at = now() - interval '1 minute' where token = s2;
    perform tg_create_start_link(k, 'pair', 'Mahdi', null, 'fr', true);
    log := log || E'\nG expired removed=' || (not exists (select 1 from tg_start_tokens where token = s2));

    -- H. Droits : anon seulement ; l'ancienne signature à 5 arguments n'existe plus.
    log := log || E'\nH anon=' || has_function_privilege('anon', 'tg_create_start_link(text,text,text,text,text,boolean)', 'execute')
               || ' auth=' || has_function_privilege('authenticated', 'tg_create_start_link(text,text,text,text,text,boolean)', 'execute')
               || ' old sig=' || coalesce(to_regprocedure('tg_create_start_link(text,text,text,text,text)')::text, 'none');

    raise exception 'SELFTEST (annulé)%', log;
end $$;
