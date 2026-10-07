-- ============================================================================
--  33_invite_qr_short.sql — QR d'invitation de 5 minutes + lien partagé 24 h
-- ----------------------------------------------------------------------------
--  Écran « Inviter un proche » : le QR affiché se renouvelle tout seul toutes
--  les 5 minutes (le proche est à côté), tandis que le lien envoyé par
--  WhatsApp / SMS reste valable 24 h (le proche peut l'ouvrir plus tard).
--
--  Jusqu'ici, créer un lien « pair » effaçait le précédent : le QR qui tourne
--  aurait tué le lien déjà envoyé, et un 2e partage tuait le 1er (2 proches
--  possibles). Désormais :
--    · colonne `short` : jeton court (QR, 5 min) ou long (partagé, 24 h) ;
--    · on garde les 2 plus récents de chaque sorte (un par place de proche) ;
--      l'ancien QR reste donc valable les quelques secondes du renouvellement.
--  Le bot accepte les deux comme avant (kind = 'pair', usage unique) :
--  tg_handle_update ne change pas. Lien propriétaire (« link », 1 h) : inchangé.
--  Les anciennes apps (sans p_short) obtiennent un lien long, comme avant.
-- ============================================================================

alter table tg_start_tokens add column if not exists short boolean not null default false;

drop function if exists tg_create_start_link(text, text, text, text, text);

create function tg_create_start_link(
    p_secret      text,
    p_kind        text,
    p_owner_name  text    default null,
    p_device_name text    default null,
    p_lang        text    default null,
    p_short       boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_id    uuid;
    v_tok   text;
    v_exp   timestamptz;
    v_short boolean := coalesce(p_short, false) and p_kind = 'pair';
begin
    if tg_rl_blocked(panel_client_ip(), 'key_fail', 30) then return tg_err('rate_limited'); end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then perform hm_fail(); return tg_err('invalid_secret'); end if;
    if p_kind not in ('link', 'pair') then return tg_err('bad_kind'); end if;
    perform tg_set_device_lang(v_id, p_lang);

    -- Expirés : partout. Lien propriétaire : un seul à la fois, comme avant.
    delete from tg_start_tokens
     where device_id = v_id and (expires_at < now() or (p_kind = 'link' and kind = 'link'));

    v_tok := encode(gen_random_bytes(16), 'hex');
    -- clock_timestamp() (instant réel) et non now() (début de transaction) : deux jetons
    -- créés à la suite n'ont jamais la même échéance, l'ordre « plus récent » reste sûr.
    v_exp := clock_timestamp() + case
                         when p_kind = 'link' then interval '1 hour'
                         when v_short         then interval '5 minutes'
                         else                      interval '24 hours'
                     end;
    insert into tg_start_tokens(token, device_id, kind, owner_name, device_name, expires_at, short)
    values (v_tok, v_id, p_kind,
            nullif(left(btrim(coalesce(p_owner_name, '')), 64), ''),
            nullif(left(btrim(coalesce(p_device_name, '')), 64), ''),
            v_exp, v_short);

    -- Proche : au plus 2 jetons de cette sorte — celui qu'on vient de créer (jamais
    -- supprimé) et le plus récent des autres.
    if p_kind = 'pair' then
        delete from tg_start_tokens
         where device_id = v_id and kind = 'pair' and short = v_short and token <> v_tok
           and token not in (select token from tg_start_tokens
                              where device_id = v_id and kind = 'pair' and short = v_short
                                and token <> v_tok
                              order by expires_at desc
                              limit 1);
    end if;

    return jsonb_build_object('ok', true, 'token', v_tok,
                              'expires_at', extract(epoch from v_exp)::bigint);
end $$;

-- Supabase accorde EXECUTE à tout le monde sur une nouvelle fonction : on retire,
-- puis on rend exactement ce que 29 accordait (l'app appelle avec la clé anon).
revoke execute on function tg_create_start_link(text, text, text, text, text, boolean) from public, anon, authenticated;
grant  execute on function tg_create_start_link(text, text, text, text, text, boolean) to anon;
