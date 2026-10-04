-- ============================================================================
--  29_telegram_i18n.sql — Le bot Telegram répond dans la langue du TÉLÉPHONE
-- ----------------------------------------------------------------------------
--  Jusqu'ici, toutes les réponses du bot (liaison, menu, clé, accusés) étaient
--  en français. Désormais (fr / en / es / ar) :
--
--  • le téléphone envoie la langue de son système à chaque relève (tg_poll) et
--    à la création d'un lien /start (tg_create_start_link) → tg_device_lang ;
--  • un chat lié à un téléphone (propriétaire ou proche), ou en session clé,
--    reçoit les réponses dans la langue de CE téléphone ;
--  • un compte inconnu (aucun téléphone encore) : langue de son Telegram si elle
--    est gérée, sinon le français (comme l'app) ;
--  • les boutons du clavier sont traduits ; les anciens boutons (français) et ceux
--    des 4 langues restent reconnus.
--
--  Compatibilité : les nouveaux paramètres ont une valeur par défaut. Les appels
--  actuels (ancienne app, ancienne fonction telegram-webhook) continuent de
--  marcher ; ils obtiennent simplement le français comme avant.
--
--  Fonctions dont la signature change : supprimées puis recréées (sinon deux
--  versions coexisteraient et l'appel deviendrait ambigu). Seuls tg_handle_update
--  et tg_menu_reply les appelaient ; les deux sont recréées ici.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Langue du téléphone
-- ----------------------------------------------------------------------------

create table if not exists tg_device_lang (
    device_id  uuid        primary key references devices(id) on delete cascade,
    lang       text        not null check (lang in ('fr', 'en', 'es', 'ar')),
    updated_at timestamptz not null default now()
);
alter table tg_device_lang enable row level security;
revoke all on table tg_device_lang from anon, authenticated;

-- « en-US », « EN », « es_419 » → code géré ; sinon null.
create or replace function tg_lang_norm(p_lang text)
returns text
language sql immutable set search_path = public as $$
    select case when l in ('fr', 'en', 'es', 'ar') then l end
      from (select lower(split_part(split_part(btrim(coalesce(p_lang, '')), '-', 1), '_', 1)) as l) x
$$;

create or replace function tg_device_lang_of(p_device uuid)
returns text
language sql stable set search_path = public as $$
    select lang from tg_device_lang where device_id = p_device
$$;

-- Écrit seulement si la langue change (tg_poll est appelé souvent).
create or replace function tg_set_device_lang(p_device uuid, p_lang text)
returns void
language plpgsql set search_path = public as $$
declare v_lang text := tg_lang_norm(p_lang);
begin
    if p_device is null or v_lang is null then return; end if;
    insert into tg_device_lang as t (device_id, lang) values (p_device, v_lang)
    on conflict (device_id) do update set lang = excluded.lang, updated_at = now()
     where t.lang is distinct from excluded.lang;
end $$;

-- Langue d'un chat : son téléphone (propriétaire d'abord, puis proche, puis
-- session clé), sinon la langue de son Telegram, sinon le français.
create or replace function tg_chat_lang(p_chat bigint, p_tg_lang text)
returns text
language sql stable set search_path = public as $$
    select coalesce(
        (select dl.lang from tg_links l join tg_device_lang dl on dl.device_id = l.device_id
          where l.chat_id = p_chat
          order by (l.role = 'owner') desc, l.created_at desc limit 1),
        (select dl.lang from tg_sessions s join tg_device_lang dl on dl.device_id = s.device_id
          where s.chat_id = p_chat and s.expires_at > now()),
        tg_lang_norm(p_tg_lang),
        'fr')
$$;


-- ----------------------------------------------------------------------------
--  2. Textes (fr / en / es / ar) — %s = valeur insérée par format()
-- ----------------------------------------------------------------------------

create or replace function tg_t(p_lang text, p_key text)
returns text
language sql immutable set search_path = public as $$
    select coalesce(d -> coalesce(tg_lang_norm(p_lang), 'fr') ->> p_key, d -> 'fr' ->> p_key, p_key)
      from (select '{"fr":{"link_invalid":"⚠️ Lien invalide ou expiré. Générez-en un nouveau dans l''app HearMe.","owner_linked":"📱 HearMe Security\n\nVotre smartphone (%s) est désormais lié à ce bot !\nVous recevrez ici vos alertes de déverrouillage, photos et positions GPS.","already_linked":"✅ Vous êtes déjà relié à ce téléphone.","contacts_full":"⚠️ Impossible d''ajouter : le nombre maximum de contacts de confiance est déjà atteint.","contact_added":"✅ C''est fait ! Vous êtes désormais un contact d''urgence de %s. En cas de vol ou d''alerte, vous recevrez ici sa position et les photos.","your_relative":"votre proche","menu_trusted":"🛡️ HearMe — choisissez une action 👇","menu_key":"🛡️ HearMe — choisissez une action, puis envoyez votre clé secrète.","ack":"📨 Commande transmise au téléphone — réponse dans quelques secondes.","key_blocked":"⏳ Trop d''essais de clé. Réessayez dans 15 minutes.","key_wrong":"❌ Clé incorrecte. Choisissez à nouveau une action 👇","key_ok":"✅ Clé acceptée pour 15 minutes — choisissez une action 👇","key_ask":"🔑 Envoyez votre clé secrète pour exécuter « %s » (12 caractères) :","btn_ring":"🔊 Faire sonner","btn_stop":"🔕 Stop sonnerie","btn_locate":"📍 Localiser","btn_photo":"📸 Photo","btn_report":"📋 Rapport complet","btn_lock":"🔒 Verrouiller","btn_status":"ℹ️ État","btn_access":"🆘 Nouvel accès","btn_test":"🧪 Envoyer un test d''alarme"},"en":{"link_invalid":"⚠️ This link is invalid or has expired. Create a new one in the HearMe app.","owner_linked":"📱 HearMe Security\n\nYour smartphone (%s) is now linked to this bot!\nYou''ll get your unlock alerts, photos and GPS locations here.","already_linked":"✅ You''re already linked to this phone.","contacts_full":"⚠️ Can''t add you: this phone already has the maximum number of trusted contacts.","contact_added":"✅ Done! You''re now an emergency contact for %s. If there''s a theft or an alert, you''ll get the location and photos here.","your_relative":"your relative","menu_trusted":"🛡️ HearMe — choose an action 👇","menu_key":"🛡️ HearMe — choose an action, then send your secret key.","ack":"📨 Command sent to the phone — reply in a few seconds.","key_blocked":"⏳ Too many key attempts. Try again in 15 minutes.","key_wrong":"❌ Wrong key. Choose an action again 👇","key_ok":"✅ Key accepted for 15 minutes — choose an action 👇","key_ask":"🔑 Send your secret key to run “%s” (12 characters):","btn_ring":"🔊 Ring","btn_stop":"🔕 Stop ringing","btn_locate":"📍 Locate","btn_photo":"📸 Photo","btn_report":"📋 Full report","btn_lock":"🔒 Lock","btn_status":"ℹ️ Status","btn_access":"🆘 New access","btn_test":"🧪 Send a test alarm"},"es":{"link_invalid":"⚠️ Enlace no válido o caducado. Genera uno nuevo en la app HearMe.","owner_linked":"📱 HearMe Security\n\n¡Tu smartphone (%s) ya está vinculado a este bot!\nAquí recibirás tus alertas de desbloqueo, fotos y ubicaciones GPS.","already_linked":"✅ Ya estás vinculado a este teléfono.","contacts_full":"⚠️ No se puede añadir: ya se alcanzó el número máximo de contactos de confianza.","contact_added":"✅ ¡Listo! Ahora eres contacto de emergencia de %s. En caso de robo o alerta, recibirás aquí la ubicación y las fotos.","your_relative":"tu familiar","menu_trusted":"🛡️ HearMe — elige una acción 👇","menu_key":"🛡️ HearMe — elige una acción y luego envía tu clave secreta.","ack":"📨 Orden enviada al teléfono: respuesta en unos segundos.","key_blocked":"⏳ Demasiados intentos de clave. Vuelve a intentarlo en 15 minutos.","key_wrong":"❌ Clave incorrecta. Elige de nuevo una acción 👇","key_ok":"✅ Clave aceptada durante 15 minutos: elige una acción 👇","key_ask":"🔑 Envía tu clave secreta para ejecutar «%s» (12 caracteres):","btn_ring":"🔊 Hacer sonar","btn_stop":"🔕 Parar sonido","btn_locate":"📍 Localizar","btn_photo":"📸 Foto","btn_report":"📋 Informe completo","btn_lock":"🔒 Bloquear","btn_status":"ℹ️ Estado","btn_access":"🆘 Nuevo acceso","btn_test":"🧪 Enviar una alarma de prueba"},"ar":{"link_invalid":"⚠️ الرابط غير صالح أو منتهي الصلاحية. أنشئ رابطًا جديدًا في تطبيق HearMe.","owner_linked":"📱 HearMe Security\n\nهاتفك (%s) مرتبط الآن بهذا البوت!\nستصلك هنا تنبيهات فتح القفل والصور ومواقع GPS.","already_linked":"✅ أنت مرتبط بهذا الهاتف بالفعل.","contacts_full":"⚠️ تعذّرت الإضافة: تم بلوغ الحد الأقصى لجهات الاتصال الموثوقة.","contact_added":"✅ تم! أصبحت الآن جهة اتصال طوارئ لـ %s. في حال السرقة أو التنبيه، ستصلك هنا المواقع والصور.","your_relative":"قريبك","menu_trusted":"🛡️ HearMe — اختر إجراءً 👇","menu_key":"🛡️ HearMe — اختر إجراءً، ثم أرسل مفتاحك السري.","ack":"📨 تم إرسال الأمر إلى الهاتف — سيصل الرد خلال ثوانٍ.","key_blocked":"⏳ محاولات كثيرة جدًا لإدخال المفتاح. أعد المحاولة بعد 15 دقيقة.","key_wrong":"❌ المفتاح غير صحيح. اختر إجراءً من جديد 👇","key_ok":"✅ تم قبول المفتاح لمدة 15 دقيقة — اختر إجراءً 👇","key_ask":"🔑 أرسل مفتاحك السري لتنفيذ «%s» (12 حرفًا):","btn_ring":"🔊 تشغيل الرنين","btn_stop":"🔕 إيقاف الرنين","btn_locate":"📍 تحديد الموقع","btn_photo":"📸 صورة","btn_report":"📋 تقرير كامل","btn_lock":"🔒 قفل الهاتف","btn_status":"ℹ️ الحالة","btn_access":"🆘 وصول جديد","btn_test":"🧪 إرسال تنبيه تجريبي"}}'::jsonb as d) x
$$;

drop function if exists tg_menu_reply(bigint, boolean);
drop function if exists tg_menu_keyboard();
drop function if exists tg_ack(bigint);

create or replace function tg_menu_keyboard(p_lang text default 'fr')
returns jsonb
language sql immutable set search_path = public as $$
    select jsonb_build_object(
        'keyboard', jsonb_build_array(
            jsonb_build_array(tg_t(p_lang, 'btn_ring'), tg_t(p_lang, 'btn_stop')),
            jsonb_build_array(tg_t(p_lang, 'btn_locate'), tg_t(p_lang, 'btn_photo')),
            jsonb_build_array(tg_t(p_lang, 'btn_report')),
            jsonb_build_array(tg_t(p_lang, 'btn_lock'), tg_t(p_lang, 'btn_status')),
            jsonb_build_array(tg_t(p_lang, 'btn_access'))),
        'resize_keyboard', true)
$$;

create or replace function tg_menu_reply(p_chat bigint, p_trusted boolean, p_lang text default 'fr')
returns jsonb
language sql immutable set search_path = public as $$
    select tg_reply(p_chat,
        tg_t(p_lang, case when p_trusted then 'menu_trusted' else 'menu_key' end),
        tg_menu_keyboard(p_lang))
$$;

create or replace function tg_ack(p_chat bigint, p_lang text default 'fr')
returns jsonb
language sql immutable set search_path = public as $$
    select tg_reply(p_chat, tg_t(p_lang, 'ack'))
$$;

-- Bouton (de n'importe laquelle des 4 langues) ou « /commande [clé] ».
create or replace function tg_parse_command(p_text text, out cmd text, out arg text)
language plpgsql immutable set search_path = public as $$
declare
    t     text := btrim(coalesce(p_text, ''));
    parts text[];
begin
    select b.c into cmd
      from (values ('btn_ring', '/ring'), ('btn_stop', '/stopalarm'), ('btn_locate', '/locate'),
                   ('btn_photo', '/photo'), ('btn_report', '/report'), ('btn_lock', '/lock'),
                   ('btn_status', '/status'), ('btn_access', '/access'), ('btn_test', '/test')) b(k, c)
      cross join unnest(array['fr', 'en', 'es', 'ar']) l(lang)
     where tg_t(l.lang, b.k) = t
     limit 1;
    if cmd is not null or left(t, 1) <> '/' then return; end if;

    parts := regexp_split_to_array(t, '\s+');
    cmd := lower(split_part(parts[1], '@', 1));
    if cmd not in ('/report', '/locate', '/photo', '/ring', '/alarm', '/stopalarm',
                   '/lock', '/status', '/test', '/access') then
        cmd := null;
        return;
    end if;
    arg := nullif(btrim(parts[2]), '');
end $$;


-- ----------------------------------------------------------------------------
--  3. Webhook — même logique que 12_bruteforce_guard.sql, textes traduits.
--     p_lang = langue du Telegram de l'expéditeur (from.language_code).
--     Réponse : + « commands » = [{chat_id, lang}] → la fonction telegram-webhook
--     met le menu « / » de ce chat dans cette langue.
-- ----------------------------------------------------------------------------

drop function if exists tg_handle_update(bigint, bigint, bigint, text, text);

create or replace function tg_handle_update(
    p_update_id  bigint,
    p_message_id bigint,
    p_chat_id    bigint,
    p_text       text,
    p_first_name text,
    p_lang       text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_text    text := left(btrim(coalesce(p_text, '')), 512);
    v_name    text := nullif(left(btrim(coalesce(p_first_name, '')), 64), '');
    v_out     jsonb := '[]';
    v_del     jsonb := '[]';
    v_menu    jsonb := '[]';
    v_lang    text;
    v_param   text;
    v_tok     tg_start_tokens;
    v_cmd     text;
    v_arg     text;
    v_key     text;
    v_linked  boolean;
    v_sess    uuid;
    v_pending text;
    v_dev     uuid;
    v_n       int;
begin
    insert into tg_seen_updates(update_id) values (p_update_id) on conflict do nothing;
    if not found then
        return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
    end if;
    if random() < 0.02 then perform tg_housekeeping(); end if;
    if v_text = '' then
        return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
    end if;

    if v_text ~ '^/start\s+(link|pair)_' then
        v_param := substring(v_text from '^/start\s+((?:link|pair)_[0-9a-f]{32})$');
        if v_param is not null then
            select * into v_tok from tg_start_tokens
             where token = substr(v_param, 6) and kind = left(v_param, 4)
               and expires_at > now()
             for update;
        end if;

        if v_tok.token is null then
            v_lang := tg_chat_lang(p_chat_id, p_lang);
            v_out := v_out || tg_reply(p_chat_id, tg_t(v_lang, 'link_invalid'));
            return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
        end if;

        -- Le lien désigne le téléphone : sa langue, même pour un proche.
        v_lang := coalesce(tg_device_lang_of(v_tok.device_id), tg_lang_norm(p_lang), 'fr');

        if v_tok.kind = 'link' then
            delete from tg_links where device_id = v_tok.device_id and role = 'owner';
            insert into tg_links(device_id, chat_id, role, name)
                values (v_tok.device_id, p_chat_id, 'owner', v_name)
            on conflict (device_id, chat_id) do update set role = 'owner', name = excluded.name;
            delete from tg_start_tokens where token = v_tok.token;
            v_out := v_out || tg_reply(p_chat_id,
                format(tg_t(v_lang, 'owner_linked'), coalesce(v_tok.device_name, 'HearMe')),
                jsonb_build_object(
                    'keyboard', jsonb_build_array(jsonb_build_array(tg_t(v_lang, 'btn_test'))),
                    'resize_keyboard', true));
            v_menu := jsonb_build_array(jsonb_build_object('chat_id', p_chat_id, 'lang', v_lang));

        elsif exists (select 1 from tg_links
                      where device_id = v_tok.device_id and chat_id = p_chat_id) then
            v_out := v_out || tg_reply(p_chat_id, tg_t(v_lang, 'already_linked'));

        else
            select count(*) into v_n from tg_links
             where device_id = v_tok.device_id and role = 'contact';
            if v_n >= 2 then
                v_out := v_out || tg_reply(p_chat_id, tg_t(v_lang, 'contacts_full'));
            else
                insert into tg_links(device_id, chat_id, role, name)
                    values (v_tok.device_id, p_chat_id, 'contact', v_name);
                delete from tg_start_tokens where token = v_tok.token;
                v_out := v_out || tg_reply(p_chat_id,
                    format(tg_t(v_lang, 'contact_added'),
                           coalesce(v_tok.owner_name, tg_t(v_lang, 'your_relative'))));
                v_menu := jsonb_build_array(jsonb_build_object('chat_id', p_chat_id, 'lang', v_lang));
            end if;
        end if;
        return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
    end if;

    v_lang := tg_chat_lang(p_chat_id, p_lang);
    v_linked := exists (select 1 from tg_links where chat_id = p_chat_id);
    select device_id into v_sess from tg_sessions
     where chat_id = p_chat_id and expires_at > now();

    if lower(v_text) ~ '^/(start|help|menu)(@\S+)?(\s.*)?$' then
        v_out := v_out || tg_menu_reply(p_chat_id, v_linked or v_sess is not null, v_lang);
        v_menu := jsonb_build_array(jsonb_build_object('chat_id', p_chat_id, 'lang', v_lang));
        return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
    end if;

    select c.cmd, c.arg into v_cmd, v_arg from tg_parse_command(v_text) c;
    select command into v_pending from tg_pending
     where chat_id = p_chat_id and created_at > now() - interval '10 minutes';

    if v_cmd is not null then
        v_key := v_arg;
    elsif (v_pending is not null or (not v_linked and v_sess is null))
          and v_text ~ '^[A-Za-z0-9]{12,64}$' then
        v_key := v_text;
    end if;

    if v_key is not null then
        if p_message_id is not null then
            v_del := v_del || jsonb_build_array(
                jsonb_build_object('chat_id', p_chat_id, 'message_id', p_message_id));
        end if;
        if tg_key_blocked(p_chat_id) then
            v_out := v_out || tg_reply(p_chat_id, tg_t(v_lang, 'key_blocked'));
            return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
        end if;

        v_dev := coalesce(hm_device_id(v_key), hm_device_id(upper(v_key)));
        if v_dev is null then
            perform tg_key_fail(p_chat_id);
            delete from tg_pending where chat_id = p_chat_id;
            v_out := v_out || tg_reply(p_chat_id, tg_t(v_lang, 'key_wrong'), tg_menu_keyboard(v_lang));
            return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
        end if;

        -- Clé juste : on parle désormais la langue de CE téléphone.
        v_lang := coalesce(tg_device_lang_of(v_dev), v_lang);
        delete from tg_key_attempts where chat_id = p_chat_id;
        insert into tg_sessions(chat_id, device_id, expires_at)
            values (p_chat_id, v_dev, now() + interval '15 minutes')
        on conflict (chat_id) do update
            set device_id = excluded.device_id, expires_at = excluded.expires_at;
        v_cmd := coalesce(v_cmd, v_pending);
        delete from tg_pending where chat_id = p_chat_id;

        if v_cmd is null then
            v_out := v_out || tg_reply(p_chat_id, tg_t(v_lang, 'key_ok'), tg_menu_keyboard(v_lang));
        else
            perform tg_enqueue(v_dev, p_chat_id, v_cmd, 'key', v_name);
            v_out := v_out || tg_ack(p_chat_id, v_lang);
        end if;
        return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
    end if;

    if v_cmd is null then
        v_out := v_out || tg_menu_reply(p_chat_id, v_linked or v_sess is not null, v_lang);
        return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
    end if;

    if v_linked then
        perform tg_enqueue(l.device_id, p_chat_id, v_cmd, l.role, coalesce(l.name, v_name))
           from tg_links l where l.chat_id = p_chat_id;
        v_out := v_out || tg_ack(p_chat_id, v_lang);
    elsif v_sess is not null then
        perform tg_enqueue(v_sess, p_chat_id, v_cmd, 'key', v_name);
        v_out := v_out || tg_ack(p_chat_id, v_lang);
    else
        insert into tg_pending(chat_id, command) values (p_chat_id, v_cmd)
        on conflict (chat_id) do update set command = excluded.command, created_at = now();
        v_out := v_out || tg_reply(p_chat_id, format(tg_t(v_lang, 'key_ask'), v_text));
    end if;
    return jsonb_build_object('replies', v_out, 'delete', v_del, 'commands', v_menu);
end $$;


-- ----------------------------------------------------------------------------
--  4. Côté téléphone : la langue part avec la relève et la création de lien.
--     Corps identiques à 12_bruteforce_guard.sql + l'enregistrement de la langue.
-- ----------------------------------------------------------------------------

drop function if exists tg_poll(text);

create or replace function tg_poll(p_secret text, p_lang text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_id   uuid;
    v_cmds jsonb;
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then return tg_err('rate_limited'); end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return tg_err('invalid_secret'); end if;
    perform tg_set_device_lang(v_id, p_lang);
    with gone as (
        delete from tg_inbox i where i.device_id = v_id returning i.*
    )
    select coalesce(jsonb_agg(jsonb_build_object(
               'chat_id', g.chat_id::text, 'command', g.command,
               'sender_role', g.sender_role, 'sender_name', g.sender_name)
           order by g.id), '[]'::jsonb)
      into v_cmds
      from gone g
     where g.created_at > now() - interval '10 minutes';
    return jsonb_build_object('ok', true, 'commands', v_cmds);
end $$;

drop function if exists tg_create_start_link(text, text, text, text);

create or replace function tg_create_start_link(
    p_secret      text,
    p_kind        text,
    p_owner_name  text default null,
    p_device_name text default null,
    p_lang        text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_id  uuid;
    v_tok text;
    v_exp timestamptz;
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then return tg_err('rate_limited'); end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return tg_err('invalid_secret'); end if;
    if p_kind not in ('link', 'pair') then return tg_err('bad_kind'); end if;
    perform tg_set_device_lang(v_id, p_lang);

    delete from tg_start_tokens
     where device_id = v_id and (kind = p_kind or expires_at < now());

    v_tok := encode(gen_random_bytes(16), 'hex');
    v_exp := now() + case p_kind when 'link' then interval '1 hour' else interval '24 hours' end;
    insert into tg_start_tokens(token, device_id, kind, owner_name, device_name, expires_at)
    values (v_tok, v_id, p_kind,
            nullif(left(btrim(coalesce(p_owner_name, '')), 64), ''),
            nullif(left(btrim(coalesce(p_device_name, '')), 64), ''),
            v_exp);
    return jsonb_build_object('ok', true, 'token', v_tok,
                              'expires_at', extract(epoch from v_exp)::bigint);
end $$;


-- ----------------------------------------------------------------------------
--  5. Droits — uniquement sur ce qui est créé ou recréé ici
-- ----------------------------------------------------------------------------
--  Supabase accorde EXECUTE à tout le monde sur une nouvelle fonction : on retire,
--  puis on rend exactement ce que 11/12 accordaient.

revoke execute on function tg_lang_norm(text)                                     from public, anon, authenticated;
revoke execute on function tg_device_lang_of(uuid)                                from public, anon, authenticated;
revoke execute on function tg_set_device_lang(uuid, text)                         from public, anon, authenticated;
revoke execute on function tg_chat_lang(bigint, text)                             from public, anon, authenticated;
revoke execute on function tg_t(text, text)                                       from public, anon, authenticated;
revoke execute on function tg_menu_keyboard(text)                                 from public, anon, authenticated;
revoke execute on function tg_menu_reply(bigint, boolean, text)                   from public, anon, authenticated;
revoke execute on function tg_ack(bigint, text)                                   from public, anon, authenticated;
revoke execute on function tg_parse_command(text)                                 from public, anon, authenticated;
revoke execute on function tg_handle_update(bigint, bigint, bigint, text, text, text) from public, anon, authenticated;
revoke execute on function tg_poll(text, text)                                    from public, anon, authenticated;
revoke execute on function tg_create_start_link(text, text, text, text, text)     from public, anon, authenticated;

grant execute on function tg_poll(text, text)                                to anon;
grant execute on function tg_create_start_link(text, text, text, text, text) to anon;
grant execute on function tg_handle_update(bigint, bigint, bigint, text, text, text) to service_role;
