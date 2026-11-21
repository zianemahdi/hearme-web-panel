-- 46 — Rareté des badges (version 1.15 de l'app).
-- Chaque installation envoie la liste de ses badges avec l'identifiant ANONYME du
-- compteur de parcours (migration 45 : tiré au hasard, sans lien avec le compte, le nom,
-- l'e-mail ou l'appareil). Le serveur ne renvoie que des totaux : combien d'installations
-- actives (vues ces 180 derniers jours) et combien ont chaque badge.

create table if not exists public.badge_installs (
  install_id  uuid        primary key,
  app_version text        not null default '' check (char_length(app_version) <= 20),
  last_seen   timestamptz not null default now()
);

create table if not exists public.badge_holders (
  install_id uuid        not null references public.badge_installs(install_id) on delete cascade,
  badge      text        not null,
  earned_at  timestamptz not null default now(),
  primary key (install_id, badge)
);

alter table public.badge_installs enable row level security;
alter table public.badge_holders  enable row level security;
-- Aucune policy : seulement via les deux fonctions ci-dessous.

create or replace function public.badge_ids()
returns text[] language sql immutable as $$
  select array['first_step','contacts','tested','strong','d7','d30','d180','d365',
               'sound','found5','challenge','founder','thief_eye','plus_year']
$$;

/** L'app envoie TOUS ses badges ; un badge n'est jamais retiré (gagné = gardé). */
create or replace function public.report_badges(p_install uuid, p_badges text[], p_version text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_install is null or coalesce(array_length(p_badges, 1), 0) > 40 then return; end if;
  insert into badge_installs (install_id, app_version, last_seen)
  values (p_install, left(coalesce(p_version, ''), 20), now())
  on conflict (install_id) do update set last_seen = now(), app_version = excluded.app_version;
  insert into badge_holders (install_id, badge)
  select p_install, b from unnest(coalesce(p_badges, '{}')) b where b = any(badge_ids())
  on conflict do nothing;
end $$;

/** Totaux seulement : { total, counts: { badge: n } }. */
create or replace function public.badge_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  with active as (select install_id from badge_installs where last_seen > now() - interval '180 days')
  select jsonb_build_object(
    'total', (select count(*) from active),
    'counts', coalesce((select jsonb_object_agg(badge, n) from (
        select h.badge, count(*) n from badge_holders h join active a using (install_id) group by h.badge) s), '{}'::jsonb))
$$;

revoke all on function public.report_badges(uuid, text[], text), public.badge_stats() from public;
grant execute on function public.report_badges(uuid, text[], text), public.badge_stats() to anon, authenticated;

-- Conservation : une installation pas revue depuis 12 mois est effacée (et ses badges).
select cron.schedule('hearme-purge-badges', '43 3 * * *',
  $$ delete from public.badge_installs where last_seen < now() - interval '12 months'; $$);
