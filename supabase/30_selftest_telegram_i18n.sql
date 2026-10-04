-- ============================================================================
--  30_selftest_telegram_i18n.sql — Vérification de 29 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : tout est annulé. Faux téléphone et faux chats
--  uniquement ; aucune donnée réelle n'est lue. Le rapport s'affiche dans le
--  message d'erreur (« SELFTEST … »).
-- ============================================================================
do $$
declare
    v_ip text   := '203.0.113.79';
    k    text   := 'ZZL' || upper(substr(md5(random()::text), 1, 12));   -- clé forte (15)
    d    uuid;
    r    jsonb;
    tok  text;
    co   bigint := 930000001;   -- propriétaire
    cr   bigint := 930000002;   -- proche
    cu   bigint := 930000003;   -- compte inconnu
    u    bigint := 940000000;   -- update_id de base
    log  text   := '';
begin
    perform set_config('request.headers', json_build_object('x-real-ip', v_ip)::text, true);
    delete from panel_rate_limit where ip = v_ip;
    insert into devices(secret_key, name) values (k, 'Selftest') returning id into d;

    -- A. Normalisation des codes de langue.
    log := log || E'\nA en-US=' || coalesce(tg_lang_norm('en-US'), 'null')
               || ' ES=' || coalesce(tg_lang_norm('ES'), 'null')
               || ' es_419=' || coalesce(tg_lang_norm('es_419'), 'null')
               || ' pt-br=' || coalesce(tg_lang_norm('pt-br'), 'null')
               || ' null=' || coalesce(tg_lang_norm(null), 'null');

    -- B. Relève : langue enregistrée ; langue non gérée ignorée ; ancien appel accepté.
    r := tg_poll(k, 'es');
    log := log || E'\nB poll es ok=' || (r ->> 'ok') || ' lang=' || coalesce(tg_device_lang_of(d), 'null');
    perform tg_poll(k, 'de');
    log := log || ' | after de=' || tg_device_lang_of(d);
    r := tg_poll(k);
    log := log || ' | old 1-arg call ok=' || (r ->> 'ok');

    -- C. Lien propriétaire créé en anglais ; son Telegram est en français → anglais.
    tok := tg_create_start_link(k, 'link', null, 'Pixel', 'en') ->> 'token';
    r := tg_handle_update(u + 1, 1, co, '/start link_' || tok, 'Zz', 'fr');
    log := log || E'\nC lang=' || tg_device_lang_of(d)
               || ' reply=' || replace(left(r #>> '{replies,0,text}', 70), E'\n', ' ')
               || ' | btn=' || (r #>> '{replies,0,reply_markup,keyboard,0,0}')
               || ' | / menu lang=' || coalesce(r #>> '{commands,0,lang}', 'null');

    -- D. Propriétaire lié, Telegram en espagnol → menu en anglais.
    r := tg_handle_update(u + 2, 2, co, '/menu', 'Zz', 'es');
    log := log || E'\nD menu=' || (r #>> '{replies,0,text}')
               || ' | 1st btn=' || (r #>> '{replies,0,reply_markup,keyboard,0,0}');

    -- E. Le téléphone passe en arabe ; un ancien bouton français marche encore.
    perform tg_poll(k, 'ar');
    r := tg_handle_update(u + 3, 3, co, '🔊 Faire sonner', 'Zz', 'fr');
    log := log || E'\nE ack=' || (r #>> '{replies,0,text}');
    r := tg_handle_update(u + 4, 4, co, '📍 تحديد الموقع', 'Zz', null);
    r := tg_handle_update(u + 5, 5, co, '📋 Informe completo', 'Zz', null);
    log := log || ' | queued=' || (select string_agg(command, ',' order by id) from tg_inbox where device_id = d);

    -- F. Compte inconnu : langue de son Telegram, sinon le français.
    r := tg_handle_update(u + 6, 6, cu, '/status', 'Yy', 'es-ES');
    log := log || E'\nF unknown es: ' || (r #>> '{replies,0,text}');
    r := tg_handle_update(u + 7, 7, cu + 10, '/help', 'Yy', 'de');
    log := log || ' | de: ' || (r #>> '{replies,0,text}');
    r := tg_handle_update(u + 8, 8, cu + 11, 'ZZNOPENOPENOPE1', 'Yy', 'es');
    log := log || ' | wrong key: ' || (r #>> '{replies,0,text}');

    -- G. Bonne clé (commande en attente) : on passe à la langue du téléphone (arabe).
    r := tg_handle_update(u + 9, 9, cu, k, 'Yy', 'es');
    log := log || E'\nG key -> ' || (r #>> '{replies,0,text}')
               || ' | key msg deleted=' || jsonb_array_length(r -> 'delete');
    r := tg_handle_update(u + 10, 10, cu, '/menu', 'Yy', 'es');
    log := log || ' | session menu=' || (r #>> '{replies,0,text}');

    -- H. Proche (lien pair) : langue du téléphone, prénom du propriétaire inséré.
    tok := tg_create_start_link(k, 'pair', 'Mahdi', null) ->> 'token';
    r := tg_handle_update(u + 11, 11, cr, '/start pair_' || tok, 'Rel', 'en');
    log := log || E'\nH pair: ' || (r #>> '{replies,0,text}');

    -- I. Lien invalide, compte inconnu en anglais.
    r := tg_handle_update(u + 12, 12, cu + 20, '/start link_' || repeat('0', 32), 'X', 'en');
    log := log || E'\nI invalid: ' || (r #>> '{replies,0,text}');

    -- J. Ancienne fonction webhook (5 arguments, sans langue).
    r := tg_handle_update(u + 13, 13, cu + 30, '/help', 'X');
    log := log || E'\nJ old 5-arg unknown: ' || (r #>> '{replies,0,text}');
    r := tg_handle_update(u + 14, 14, co, '/help', 'X');
    log := log || ' | linked owner: ' || (r #>> '{replies,0,text}');

    -- K. Droits.
    log := log || E'\nK anon poll(2)=' || has_function_privilege('anon', 'tg_poll(text,text)', 'execute')
               || ' link(5)=' || has_function_privilege('anon', 'tg_create_start_link(text,text,text,text,text)', 'execute')
               || ' get_links=' || has_function_privilege('anon', 'tg_get_links(text)', 'execute')
               || ' | handle anon=' || has_function_privilege('anon', 'tg_handle_update(bigint,bigint,bigint,text,text,text)', 'execute')
               || ' service=' || has_function_privilege('service_role', 'tg_handle_update(bigint,bigint,bigint,text,text,text)', 'execute')
               || ' | anon tg_t=' || has_function_privilege('anon', 'tg_t(text,text)', 'execute')
               || ' set_lang=' || has_function_privilege('anon', 'tg_set_device_lang(uuid,text)', 'execute')
               || ' auth chat_lang=' || has_function_privilege('authenticated', 'tg_chat_lang(bigint,text)', 'execute')
               || ' anon read lang=' || has_table_privilege('anon', 'tg_device_lang', 'select')
               || ' | old poll(1)=' || exists (select 1 from pg_proc where proname = 'tg_poll' and pronargs = 1)
               || ' old handle(5)=' || exists (select 1 from pg_proc where proname = 'tg_handle_update' and pronargs = 5);

    -- L. Suppression du téléphone : sa langue part avec lui.
    delete from devices where id = d;
    log := log || E'\nL lang row after delete=' || exists (select 1 from tg_device_lang where device_id = d);

    raise exception 'SELFTEST (annulé)%', log;
end $$;
