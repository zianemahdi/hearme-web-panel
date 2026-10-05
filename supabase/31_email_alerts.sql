-- ============================================================================
--  31_email_alerts.sql — Alertes par e-mail au propriétaire du compte
-- ----------------------------------------------------------------------------
--  En plus de Telegram, le téléphone peut prévenir son propriétaire par e-mail
--  (vol détecté, code faux, batterie faible, extinction), via la fonction
--  email-send (SMTP, secrets SMTP_USER / SMTP_PASS côté Supabase).
--
--  Sécurité (même modèle que tg_authorize_send) :
--  • le téléphone s'authentifie par sa clé secrète (clé forte, garde IP) ;
--  • le DESTINATAIRE est décidé ici, jamais par l'app : uniquement l'e-mail
--    confirmé du compte auquel le téléphone est rattaché. Le relais ne peut
--    donc pas servir à écrire à n'importe qui ;
--  • les textes sont écrits par la fonction (aucun texte libre venu de l'app) ;
--  • quota : 10 e-mails par heure et par téléphone.
-- ============================================================================

create table if not exists email_send_quota (
    device_id    uuid        primary key references devices(id) on delete cascade,
    window_start timestamptz not null default now(),
    count        int         not null default 0
);
alter table email_send_quota enable row level security;
revoke all on table email_send_quota from anon, authenticated;

-- { ok, to, lang, device_name } ou { ok:false, error } :
-- rate_limited · invalid_secret · no_account · no_email.
create or replace function email_authorize(p_secret text, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_id    uuid;
    v_user  uuid;
    v_name  text;
    v_email text;
    v_count int;
begin
    if tg_rl_blocked(p_ip, 'key_fail', 30) then return tg_err('rate_limited'); end if;
    v_id := hm_device_id(p_secret);
    if v_id is null then
        perform tg_rl_count(p_ip, 'key_fail');
        return tg_err('invalid_secret');
    end if;

    select d.user_id, d.name into v_user, v_name from devices d where d.id = v_id;
    if v_user is null then return tg_err('no_account'); end if;
    select u.email into v_email from auth.users u
     where u.id = v_user and u.email_confirmed_at is not null;
    if coalesce(v_email, '') = '' then return tg_err('no_email'); end if;

    insert into email_send_quota as q (device_id, window_start, count)
        values (v_id, now(), 1)
    on conflict (device_id) do update set
        count = case when q.window_start < now() - interval '1 hour' then 1 else q.count + 1 end,
        window_start = case when q.window_start < now() - interval '1 hour' then now() else q.window_start end
    returning count into v_count;
    if v_count > 10 then return tg_err('rate_limited'); end if;

    return jsonb_build_object('ok', true, 'to', v_email,
                              'lang', coalesce(tg_device_lang_of(v_id), 'fr'),
                              'device_name', v_name);
end $$;

revoke execute on function email_authorize(text, text) from public, anon, authenticated;
grant execute on function email_authorize(text, text) to service_role;
