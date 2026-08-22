-- =========================================================================
-- HearMe — Panneau Web : durcissement anti-force-brute (rate limiting)
-- -------------------------------------------------------------------------
-- Objectif : empêcher de DEVINER une clé secrète en martelant l'endpoint.
-- Principe : on ne compte QUE les tentatives avec une clé INVALIDE (les appels
-- avec une bonne clé — le polling du tableau de bord toutes les 8 s — ne sont
-- jamais limités). Au-delà de 15 échecs / 10 min par IP, l'endpoint refuse.
--
-- Combiné aux clés de 12 caractères de l'app (31^12 ≈ 8e17 combinaisons), le
-- brute-force devient totalement irréaliste.
--
-- À exécuter dans Supabase → SQL Editor (une fois). Idempotent.
-- =========================================================================

-- Compteur de tentatives par IP + action. L'anon n'y a AUCUN accès direct
-- (RLS activé, aucune policy) : seules les fonctions SECURITY DEFINER l'utilisent.
create table if not exists panel_rate_limit (
    ip           text not null,
    action       text not null,
    window_start timestamptz not null default now(),
    count        int not null default 0,
    primary key (ip, action)
);
alter table panel_rate_limit enable row level security;

-- Vérifie/incrémente le compteur pour l'IP appelante. Lève une exception si la
-- limite est dépassée. "Fail-open" si l'IP est indisponible (ne bloque jamais
-- un usage légitime par erreur).
create or replace function panel_rl_check(p_action text, p_max int, p_window interval)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
    v_ip    text;
    v_count int;
begin
    begin
        v_ip := split_part(
            coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
            ',', 1
        );
    exception when others then
        v_ip := '';
    end;

    if v_ip is null or btrim(v_ip) = '' then
        return; -- IP inconnue → on ne bloque pas
    end if;
    v_ip := btrim(v_ip);

    insert into panel_rate_limit(ip, action, window_start, count)
        values (v_ip, p_action, now(), 1)
    on conflict (ip, action) do update set
        count = case when panel_rate_limit.window_start < now() - p_window
                     then 1 else panel_rate_limit.count + 1 end,
        window_start = case when panel_rate_limit.window_start < now() - p_window
                            then now() else panel_rate_limit.window_start end
    returning count into v_count;

    if v_count > p_max then
        raise exception 'Trop de tentatives. Réessayez plus tard.' using errcode = 'P0001';
    end if;
end $$;

-- panel_get_device durci : ne compte QUE les clés invalides (les bonnes clés,
-- donc le polling du dashboard, ne sont jamais limitées).
create or replace function panel_get_device(p_secret text)
returns table(
    id uuid, name text, battery_level int, network_status text,
    is_locked boolean, is_online boolean, last_seen timestamptz, secret_key text
)
language plpgsql volatile security definer set search_path = public as $$
declare v_exists boolean;
begin
    select exists(select 1 from devices d where d.secret_key = p_secret) into v_exists;
    if not v_exists then
        -- Clé invalide → tentative ratée (anti-brute-force), puis 0 ligne.
        perform panel_rl_check('panel_get_device_fail', 15, interval '10 minutes');
        return;
    end if;
    return query
        select d.id, d.name, d.battery_level, d.network_status,
               d.is_locked, d.is_online, d.last_seen, d.secret_key
        from devices d where d.secret_key = p_secret limit 1;
end $$;

-- Les droits d'exécution sont conservés par CREATE OR REPLACE ; on les remet
-- explicitement par sécurité.
grant execute on function panel_get_device(text) to anon, authenticated;

-- (Optionnel) purge des vieux compteurs — sans effet fonctionnel, juste du ménage.
-- delete from panel_rate_limit where window_start < now() - interval '1 day';
