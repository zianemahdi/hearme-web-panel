-- ============================================================================
--  11_telegram_relay.sql — Relais Telegram côté serveur (webhook)
-- ----------------------------------------------------------------------------
--  Corrige deux constats de l'audit du 29/09/2026 :
--
--  HM-10 — Le token du bot Telegram était compilé dans l'APK. Décompiler l'app
--          (quelques minutes) donnait le contrôle total du bot : faux messages
--          « HearMe » envoyés à tous les utilisateurs, lecture de ce qu'ils
--          écrivent au bot.
--
--  HM-11 — Chaque téléphone lisait le MÊME bot par getUpdates. Telegram n'admet
--          qu'un seul lecteur à la fois (erreur 409) : dès deux utilisateurs,
--          commandes et liaisons se perdaient au hasard.
--
--  Nouvelle architecture (méthode recommandée par Telegram : webhook signé) :
--
--    Telegram ── webhook ──▶ fn telegram-webhook ──▶ tg_handle_update()
--                            (vérifie l'en-tête       liaisons, clé, routage
--                             secret)                         │
--                                                             ▼
--    téléphone ── tg_poll() ◀─────────────────────────── tg_inbox
--    téléphone ── fn telegram-send ──▶ tg_authorize_send() ──▶ Telegram
--                 (seule détentrice du token)
--
--  • Le token ne vit plus que dans les secrets Supabase (TELEGRAM_BOT_TOKEN).
--  • Le serveur est la source de vérité des liaisons : un téléphone ne peut
--    écrire qu'aux chats qui se sont liés EUX-MÊMES via un lien /start à usage
--    unique (128 bits, expirant). Le relais ne peut pas servir à spammer.
--  • La clé secrète envoyée au bot par un compte inconnu est vérifiée ICI, avec
--    limite d'essais, puis le message qui la contient est effacé du chat.
--
--  Mêmes conventions que 09_hardening.sql : SECURITY DEFINER + search_path
--  fixé, on ne compte que les échecs, EXECUTE accordé explicitement et au
--  minimum. Différence volontaire : panel_rl_check lève une exception, ce qui
--  annule son propre compteur et laisse passer une clé juste même après le
--  seuil. Ici, on vérifie le blocage AVANT de tester la clé, et on renvoie un
--  jsonb { ok:false, error } au lieu de lever — le compteur est donc conservé.
--
--  À exécuter dans Supabase → SQL Editor (ou via migration).
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Tables — toutes en RLS sans politique (refus par défaut) : on n'y accède
--     que par les fonctions ci-dessous.
-- ----------------------------------------------------------------------------

-- Chats liés à un appareil : son propriétaire et ses proches (2 max).
create table if not exists tg_links (
    device_id  uuid        not null references devices(id) on delete cascade,
    chat_id    bigint      not null,
    role       text        not null check (role in ('owner', 'contact')),
    name       text,
    created_at timestamptz not null default now(),
    primary key (device_id, chat_id)
);
create index if not exists tg_links_chat_idx on tg_links(chat_id);

-- Jetons de deep-link « /start link_… » et « /start pair_… » : usage unique.
create table if not exists tg_start_tokens (
    token       text        primary key,
    device_id   uuid        not null references devices(id) on delete cascade,
    kind        text        not null check (kind in ('link', 'pair')),
    owner_name  text,          -- prénom affiché au proche (« contact d'urgence de … »)
    device_name text,          -- nom du téléphone affiché au propriétaire
    expires_at  timestamptz not null
);
create index if not exists tg_start_tokens_device_idx on tg_start_tokens(device_id);

-- Compte Telegram inconnu ayant prouvé la clé : autorisé 15 min sur cet appareil.
create table if not exists tg_sessions (
    chat_id    bigint      primary key,
    device_id  uuid        not null references devices(id) on delete cascade,
    expires_at timestamptz not null
);

-- Commande choisie par un compte inconnu, en attente de sa clé.
create table if not exists tg_pending (
    chat_id    bigint      primary key,
    command    text        not null,
    created_at timestamptz not null default now()
);

-- Clés fausses envoyées au bot. chat_id = 0 : compteur global (disjoncteur).
create table if not exists tg_key_attempts (
    chat_id      bigint      primary key,
    fails        int         not null default 0,
    window_start timestamptz not null default now()
);

-- File des commandes à exécuter par le téléphone (déjà authentifiées).
create table if not exists tg_inbox (
    id          bigint      generated always as identity primary key,
    device_id   uuid        not null references devices(id) on delete cascade,
    chat_id     bigint      not null,
    command     text        not null,
    sender_role text        not null check (sender_role in ('owner', 'contact', 'key')),
    sender_name text,
    created_at  timestamptz not null default now()
);
create index if not exists tg_inbox_device_idx on tg_inbox(device_id, id);

-- Idempotence : Telegram renvoie une mise à jour tant qu'il n'a pas reçu 200.
create table if not exists tg_seen_updates (
    update_id bigint      primary key,
    seen_at   timestamptz not null default now()
);

-- Quota d'envoi par appareil (si une clé fuit, le relais reste inoffensif).
create table if not exists tg_send_quota (
    device_id    uuid        primary key references devices(id) on delete cascade,
    window_start timestamptz not null default now(),
    count        int         not null default 0
);

alter table tg_links        enable row level security;
alter table tg_start_tokens enable row level security;
alter table tg_sessions     enable row level security;
alter table tg_pending      enable row level security;
alter table tg_key_attempts enable row level security;
alter table tg_inbox        enable row level security;
alter table tg_seen_updates enable row level security;
alter table tg_send_quota   enable row level security;

-- Défense en profondeur : même sans RLS, l'API publique ne verrait rien.
revoke all on table tg_links, tg_start_tokens, tg_sessions, tg_pending,
                    tg_key_attempts, tg_inbox, tg_seen_updates, tg_send_quota
    from anon, authenticated;


-- ----------------------------------------------------------------------------
--  2. Outils internes (aucun droit d'exécution public — voir section 5)
-- ----------------------------------------------------------------------------

create or replace function tg_err(p_code text)
returns jsonb
language sql immutable set search_path = public as $$
    select jsonb_build_object('ok', false, 'error', p_code)
$$;

-- Blocage par IP SANS exception (voir l'en-tête). IP inconnue → jamais bloqué.
create or replace function tg_rl_blocked(p_ip text, p_action text, p_max int)
returns boolean
language sql stable set search_path = public as $$
    select coalesce(btrim(p_ip), '') <> '' and exists (
        select 1 from panel_rate_limit r
        where r.ip = p_ip and r.action = p_action
          and r.count >= p_max
          and r.window_start > now() - interval '10 minutes')
$$;

create or replace function tg_rl_count(p_ip text, p_action text)
returns void
language plpgsql set search_path = public as $$
begin
    if coalesce(btrim(p_ip), '') = '' then return; end if;
    insert into panel_rate_limit(ip, action, window_start, count)
        values (p_ip, p_action, now(), 1)
    on conflict (ip, action) do update set
        count = case when panel_rate_limit.window_start < now() - interval '10 minutes'
                     then 1 else panel_rate_limit.count + 1 end,
        window_start = case when panel_rate_limit.window_start < now() - interval '10 minutes'
                            then now() else panel_rate_limit.window_start end;
end $$;

-- Clés fausses envoyées au bot : 5 / 15 min par compte Telegram, et disjoncteur
-- global à 500 / 10 min (ferme de comptes). Les chats LIÉS n'ont jamais besoin
-- de clé, et le panneau web reste ouvert : un blocage global ne prive personne
-- de ses moyens d'agir.
create or replace function tg_key_blocked(p_chat bigint)
returns boolean
language sql stable set search_path = public as $$
    select exists (
        select 1 from tg_key_attempts a
        where (a.chat_id = p_chat and a.fails >= 5
               and a.window_start > now() - interval '15 minutes')
           or (a.chat_id = 0 and a.fails >= 500
               and a.window_start > now() - interval '10 minutes'))
$$;

create or replace function tg_key_fail(p_chat bigint)
returns void
language sql set search_path = public as $$
    insert into tg_key_attempts as a (chat_id, fails, window_start)
        values (p_chat, 1, now()), (0, 1, now())
    on conflict (chat_id) do update set
        fails = case
            when a.window_start < now() - case when a.chat_id = 0
                     then interval '10 minutes' else interval '15 minutes' end
            then 1 else a.fails + 1 end,
        window_start = case
            when a.window_start < now() - case when a.chat_id = 0
                     then interval '10 minutes' else interval '15 minutes' end
            then now() else a.window_start end
$$;

-- Clavier d'actions (identique à l'ancien clavier de l'app).
create or replace function tg_menu_keyboard()
returns jsonb
language sql immutable set search_path = public as $$
    select jsonb_build_object(
        'keyboard', jsonb_build_array(
            jsonb_build_array('🔊 Faire sonner', '🔕 Stop sonnerie'),
            jsonb_build_array('📍 Localiser', '📸 Photo'),
            jsonb_build_array('📋 Rapport complet'),
            jsonb_build_array('🔒 Verrouiller', 'ℹ️ État'),
            jsonb_build_array('🆘 Nouvel accès')),
        'resize_keyboard', true)
$$;

create or replace function tg_reply(p_chat bigint, p_text text, p_markup jsonb default null)
returns jsonb
language sql immutable set search_path = public as $$
    select jsonb_strip_nulls(jsonb_build_object(
        'chat_id', p_chat, 'text', p_text, 'reply_markup', p_markup))
$$;

create or replace function tg_menu_reply(p_chat bigint, p_trusted boolean)
returns jsonb
language sql immutable set search_path = public as $$
    select tg_reply(p_chat,
        case when p_trusted
             then '🛡️ HearMe — choisissez une action 👇'
             else '🛡️ HearMe — choisissez une action, puis envoyez votre clé secrète.' end,
        tg_menu_keyboard())
$$;

create or replace function tg_ack(p_chat bigint)
returns jsonb
language sql immutable set search_path = public as $$
    select tg_reply(p_chat, '📨 Commande transmise au téléphone — réponse dans quelques secondes.')
$$;

-- Bouton ou « /commande [clé] » → commande normalisée (liste blanche) + argument.
create or replace function tg_parse_command(p_text text, out cmd text, out arg text)
language plpgsql immutable set search_path = public as $$
declare
    t     text := btrim(coalesce(p_text, ''));
    parts text[];
begin
    cmd := case t
        when '🔊 Faire sonner'              then '/ring'
        when '🔕 Stop sonnerie'             then '/stopalarm'
        when '📍 Localiser'                 then '/locate'
        when '📸 Photo'                     then '/photo'
        when '📋 Rapport complet'           then '/report'
        when '🔒 Verrouiller'               then '/lock'
        when 'ℹ️ État'                      then '/status'
        when '🆘 Nouvel accès'              then '/access'
        when '🧪 Envoyer un test d''alarme' then '/test'
    end;
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

-- Garde-fou : jamais plus de 50 commandes en attente pour un même téléphone.
create or replace function tg_enqueue(p_device uuid, p_chat bigint, p_cmd text,
                                      p_role text, p_name text)
returns void
language plpgsql set search_path = public as $$
begin
    if (select count(*) from tg_inbox where device_id = p_device) >= 50 then
        return;
    end if;
    insert into tg_inbox(device_id, chat_id, command, sender_role, sender_name)
        values (p_device, p_chat, p_cmd, p_role, p_name);
end $$;

-- Ménage des données temporaires (appelé au fil de l'eau par le webhook).
create or replace function tg_housekeeping()
returns void
language plpgsql set search_path = public as $$
begin
    delete from tg_seen_updates where seen_at      < now() - interval '2 days';
    delete from tg_start_tokens where expires_at   < now();
    delete from tg_sessions     where expires_at   < now() - interval '1 hour';
    delete from tg_pending      where created_at   < now() - interval '1 hour';
    delete from tg_inbox        where created_at   < now() - interval '1 hour';
    delete from tg_key_attempts where window_start < now() - interval '1 day';
end $$;


-- ----------------------------------------------------------------------------
--  3. Webhook — appelé UNIQUEMENT par la fonction telegram-webhook (service_role)
-- ----------------------------------------------------------------------------
--  Renvoie { replies: [{chat_id, text, reply_markup?}], delete: [{chat_id, message_id}] }
--  que la fonction exécute auprès de Telegram. Toute la décision est ici, dans
--  une seule transaction.

create or replace function tg_handle_update(
    p_update_id  bigint,
    p_message_id bigint,
    p_chat_id    bigint,
    p_text       text,
    p_first_name text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_text    text := left(btrim(coalesce(p_text, '')), 512);
    v_name    text := nullif(left(btrim(coalesce(p_first_name, '')), 64), '');
    v_out     jsonb := '[]';
    v_del     jsonb := '[]';
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
    if not found then  -- déjà traitée : Telegram réessaie, on ne rejoue rien
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;
    if random() < 0.02 then perform tg_housekeeping(); end if;
    if v_text = '' then
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    -- 1) Liaison par deep-link : « /start link_<jeton> » (propriétaire) ou
    --    « /start pair_<jeton> » (proche). Jeton consommé seulement en cas de succès.
    if v_text ~ '^/start\s+(link|pair)_' then
        v_param := substring(v_text from '^/start\s+((?:link|pair)_[0-9a-f]{32})$');
        if v_param is not null then
            select * into v_tok from tg_start_tokens
             where token = substr(v_param, 6) and kind = left(v_param, 4)
               and expires_at > now()
             for update;
        end if;

        if v_tok.token is null then
            v_out := v_out || tg_reply(p_chat_id,
                '⚠️ Lien invalide ou expiré. Générez-en un nouveau dans l''app HearMe.');

        elsif v_tok.kind = 'link' then
            -- Un seul propriétaire par téléphone : le nouveau remplace l'ancien.
            delete from tg_links where device_id = v_tok.device_id and role = 'owner';
            insert into tg_links(device_id, chat_id, role, name)
                values (v_tok.device_id, p_chat_id, 'owner', v_name)
            on conflict (device_id, chat_id) do update set role = 'owner', name = excluded.name;
            delete from tg_start_tokens where token = v_tok.token;
            v_out := v_out || tg_reply(p_chat_id,
                '📱 HearMe Security' || E'\n\n' ||
                'Votre smartphone (' || coalesce(v_tok.device_name, 'HearMe') ||
                ') est désormais lié à ce bot !' || E'\n' ||
                'Vous recevrez ici vos alertes de déverrouillage, photos et positions GPS.',
                jsonb_build_object(
                    'keyboard', jsonb_build_array(jsonb_build_array('🧪 Envoyer un test d''alarme')),
                    'resize_keyboard', true));

        elsif exists (select 1 from tg_links
                      where device_id = v_tok.device_id and chat_id = p_chat_id) then
            v_out := v_out || tg_reply(p_chat_id, '✅ Vous êtes déjà relié à ce téléphone.');

        else
            select count(*) into v_n from tg_links
             where device_id = v_tok.device_id and role = 'contact';
            if v_n >= 2 then
                v_out := v_out || tg_reply(p_chat_id,
                    '⚠️ Impossible d''ajouter : le nombre maximum de contacts de confiance est déjà atteint.');
            else
                insert into tg_links(device_id, chat_id, role, name)
                    values (v_tok.device_id, p_chat_id, 'contact', v_name);
                delete from tg_start_tokens where token = v_tok.token;
                v_out := v_out || tg_reply(p_chat_id,
                    '✅ C''est fait ! Vous êtes désormais un contact d''urgence de ' ||
                    coalesce(v_tok.owner_name, 'votre proche') ||
                    '. En cas de vol ou d''alerte, vous recevrez ici sa position et les photos.');
            end if;
        end if;
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    v_linked := exists (select 1 from tg_links where chat_id = p_chat_id);
    select device_id into v_sess from tg_sessions
     where chat_id = p_chat_id and expires_at > now();

    -- 2) Menu.
    if lower(v_text) ~ '^/(start|help|menu)(@\S+)?(\s.*)?$' then
        v_out := v_out || tg_menu_reply(p_chat_id, v_linked or v_sess is not null);
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    -- 3) Commande (bouton ou « /cmd [clé] ») ; sinon, peut-être la clé attendue.
    select c.cmd, c.arg into v_cmd, v_arg from tg_parse_command(v_text) c;
    select command into v_pending from tg_pending
     where chat_id = p_chat_id and created_at > now() - interval '10 minutes';

    if v_cmd is not null then
        v_key := v_arg;
    elsif (v_pending is not null or (not v_linked and v_sess is null))
          and v_text ~ '^[A-Za-z0-9]{6,64}$' then
        v_key := v_text;
    end if;

    -- 4) Vérification d'une clé secrète.
    if v_key is not null then
        -- Bonne ou mauvaise, la clé ne doit pas rester dans l'historique du chat.
        if p_message_id is not null then
            v_del := v_del || jsonb_build_array(
                jsonb_build_object('chat_id', p_chat_id, 'message_id', p_message_id));
        end if;
        if tg_key_blocked(p_chat_id) then
            v_out := v_out || tg_reply(p_chat_id,
                '⏳ Trop d''essais de clé. Réessayez dans 15 minutes.');
            return jsonb_build_object('replies', v_out, 'delete', v_del);
        end if;

        select id into v_dev from devices
         where secret_key in (v_key, upper(v_key)) limit 1;
        if v_dev is null then
            perform tg_key_fail(p_chat_id);
            delete from tg_pending where chat_id = p_chat_id;
            v_out := v_out || tg_reply(p_chat_id,
                '❌ Clé incorrecte. Choisissez à nouveau une action 👇', tg_menu_keyboard());
            return jsonb_build_object('replies', v_out, 'delete', v_del);
        end if;

        delete from tg_key_attempts where chat_id = p_chat_id;
        insert into tg_sessions(chat_id, device_id, expires_at)
            values (p_chat_id, v_dev, now() + interval '15 minutes')
        on conflict (chat_id) do update
            set device_id = excluded.device_id, expires_at = excluded.expires_at;
        v_cmd := coalesce(v_cmd, v_pending);
        delete from tg_pending where chat_id = p_chat_id;

        if v_cmd is null then
            v_out := v_out || tg_reply(p_chat_id,
                '✅ Clé acceptée pour 15 minutes — choisissez une action 👇', tg_menu_keyboard());
        else
            perform tg_enqueue(v_dev, p_chat_id, v_cmd, 'key', v_name);
            v_out := v_out || tg_ack(p_chat_id);
        end if;
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    -- 5) Message libre → menu.
    if v_cmd is null then
        v_out := v_out || tg_menu_reply(p_chat_id, v_linked or v_sess is not null);
        return jsonb_build_object('replies', v_out, 'delete', v_del);
    end if;

    -- 6) Commande d'un chat lié (propriétaire / proche) ou en session clé.
    if v_linked then
        perform tg_enqueue(l.device_id, p_chat_id, v_cmd, l.role, coalesce(l.name, v_name))
           from tg_links l where l.chat_id = p_chat_id;
        v_out := v_out || tg_ack(p_chat_id);
    elsif v_sess is not null then
        perform tg_enqueue(v_sess, p_chat_id, v_cmd, 'key', v_name);
        v_out := v_out || tg_ack(p_chat_id);
    else
        -- 7) Compte inconnu : la commande attend la clé (10 min).
        insert into tg_pending(chat_id, command) values (p_chat_id, v_cmd)
        on conflict (chat_id) do update set command = excluded.command, created_at = now();
        v_out := v_out || tg_reply(p_chat_id,
            '🔑 Envoyez votre clé secrète pour exécuter « ' || v_text || ' » (ex. : K7QMP4) :');
    end if;
    return jsonb_build_object('replies', v_out, 'delete', v_del);
end $$;


-- ----------------------------------------------------------------------------
--  4. Côté TÉLÉPHONE — authentifié par la clé secrète (rôle anon)
-- ----------------------------------------------------------------------------

-- Crée un lien /start à usage unique (link = propriétaire 1 h, pair = proche 24 h).
-- Un seul lien actif par type : en générer un nouveau invalide l'ancien.
create or replace function tg_create_start_link(
    p_secret      text,
    p_kind        text,
    p_owner_name  text default null,
    p_device_name text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_ip  text := panel_client_ip();
    v_id  uuid;
    v_tok text;
    v_exp timestamptz;
begin
    if tg_rl_blocked(v_ip, 'tg_device_fail', 30) then return tg_err('rate_limited'); end if;
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform tg_rl_count(v_ip, 'tg_device_fail');
        return tg_err('invalid_secret');
    end if;
    if p_kind not in ('link', 'pair') then return tg_err('bad_kind'); end if;

    delete from tg_start_tokens
     where device_id = v_id and (kind = p_kind or expires_at < now());

    -- 128 bits d'aléa en hex (32 car.) : conforme au paramètre /start de Telegram.
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

-- Liaisons actuelles (propriétaire d'abord). L'app s'en sert comme cache.
create or replace function tg_get_links(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_ip text := panel_client_ip();
    v_id uuid;
begin
    if tg_rl_blocked(v_ip, 'tg_device_fail', 30) then return tg_err('rate_limited'); end if;
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform tg_rl_count(v_ip, 'tg_device_fail');
        return tg_err('invalid_secret');
    end if;
    return jsonb_build_object('ok', true, 'links', coalesce((
        select jsonb_agg(jsonb_build_object(
                   'chat_id', l.chat_id::text, 'role', l.role, 'name', l.name)
               order by (l.role = 'owner') desc, l.created_at)
          from tg_links l where l.device_id = v_id), '[]'::jsonb));
end $$;

-- Retire un chat (proche supprimé dans l'app) : il ne reçoit plus rien et ne
-- peut plus piloter le téléphone.
create or replace function tg_unlink(p_secret text, p_chat_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_ip text := panel_client_ip();
    v_id uuid;
begin
    if tg_rl_blocked(v_ip, 'tg_device_fail', 30) then return tg_err('rate_limited'); end if;
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform tg_rl_count(v_ip, 'tg_device_fail');
        return tg_err('invalid_secret');
    end if;
    if coalesce(p_chat_id, '') !~ '^-?[0-9]{1,20}$' then return tg_err('bad_chat'); end if;
    delete from tg_links where device_id = v_id and chat_id = p_chat_id::bigint;
    return jsonb_build_object('ok', true, 'removed', found);
end $$;

-- Commandes en attente pour ce téléphone (retirées de la file). Une commande de
-- plus de 10 min n'est plus exécutée : une sonnerie tardive serait un piège.
create or replace function tg_poll(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_ip   text := panel_client_ip();
    v_id   uuid;
    v_cmds jsonb;
begin
    if tg_rl_blocked(v_ip, 'tg_device_fail', 30) then return tg_err('rate_limited'); end if;
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform tg_rl_count(v_ip, 'tg_device_fail');
        return tg_err('invalid_secret');
    end if;
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


-- ----------------------------------------------------------------------------
--  5. Envoi — appelé UNIQUEMENT par la fonction telegram-send (service_role)
-- ----------------------------------------------------------------------------
--  p_to = 'all' (propriétaire + proches) ou un chat_id précis, qui doit être lié
--  à ce téléphone ou en session clé (+15 min de grâce pour finir de répondre).
--  p_ip = IP du téléphone, relevée par la fonction (anti-force-brute de la clé).

create or replace function tg_authorize_send(p_secret text, p_to text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_id    uuid;
    v_chats jsonb;
    v_count int;
begin
    if tg_rl_blocked(p_ip, 'tg_send_fail', 30) then return tg_err('rate_limited'); end if;
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        perform tg_rl_count(p_ip, 'tg_send_fail');
        return tg_err('invalid_secret');
    end if;

    if p_to = 'all' then
        select coalesce(jsonb_agg(l.chat_id::text), '[]'::jsonb) into v_chats
          from tg_links l where l.device_id = v_id;
    elsif coalesce(p_to, '') ~ '^-?[0-9]{1,20}$' then
        if exists (select 1 from tg_links
                   where device_id = v_id and chat_id = p_to::bigint)
           or exists (select 1 from tg_sessions
                      where device_id = v_id and chat_id = p_to::bigint
                        and expires_at > now() - interval '15 minutes') then
            v_chats := jsonb_build_array(p_to);
        else
            return tg_err('chat_not_linked');
        end if;
    else
        return tg_err('bad_recipient');
    end if;

    if jsonb_array_length(v_chats) = 0 then
        return jsonb_build_object('ok', true, 'chat_ids', v_chats);
    end if;

    -- 60 messages / minute / téléphone : large pour une alerte, inutile pour spammer.
    insert into tg_send_quota as q (device_id, window_start, count)
        values (v_id, now(), jsonb_array_length(v_chats))
    on conflict (device_id) do update set
        count = case when q.window_start < now() - interval '1 minute'
                     then excluded.count else q.count + excluded.count end,
        window_start = case when q.window_start < now() - interval '1 minute'
                            then now() else q.window_start end
    returning count into v_count;
    if v_count > 60 then return tg_err('rate_limited'); end if;

    return jsonb_build_object('ok', true, 'chat_ids', v_chats);
end $$;


-- ----------------------------------------------------------------------------
--  6. Droits — le minimum, explicitement
-- ----------------------------------------------------------------------------
--  Supabase accorde EXECUTE à anon/authenticated sur toute nouvelle fonction :
--  on retire tout sur les tg_*, puis on rend seulement ce qui est nécessaire.

do $$
declare f record;
begin
    for f in
        select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'tg\_%'
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    end loop;
end $$;

-- Téléphone (anon + clé secrète) :
grant execute on function tg_create_start_link(text, text, text, text) to anon;
grant execute on function tg_get_links(text)                           to anon;
grant execute on function tg_unlink(text, text)                        to anon;
grant execute on function tg_poll(text)                                to anon;

-- Edge Functions (service_role) :
grant execute on function tg_handle_update(bigint, bigint, bigint, text, text) to service_role;
grant execute on function tg_authorize_send(text, text, text)                  to service_role;
