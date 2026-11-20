-- 45 — Compteur anonyme du parcours (version 1.13 de l'app).
-- Chaque installation tire un identifiant au hasard (sans lien avec le compte, ni nom,
-- ni e-mail, ni appareil) et signale UNE fois chaque étape atteinte :
--   open    = app ouverte la première fois
--   account = compte créé ou connecté
--   listen  = écoute du mot-clé activée
--   armed   = antivol armé
-- Sert seulement à savoir où les nouveaux s'arrêtent. Lecture : tableau de bord SQL.

create table if not exists public.funnel_events (
  install_id  uuid        not null,
  step        text        not null check (step in ('open', 'account', 'listen', 'armed')),
  app_version text        not null default '' check (char_length(app_version) <= 20),
  lang        text        not null default '' check (char_length(lang) <= 5),
  created_at  timestamptz not null default now(),
  primary key (install_id, step)
);

alter table public.funnel_events enable row level security;
-- Aucune policy : personne ne lit ni n'écrit directement, seulement via la fonction.

create or replace function public.log_funnel(p_install uuid, p_step text, p_version text default '', p_lang text default '')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.funnel_events (install_id, step, app_version, lang)
  values (p_install, p_step, left(coalesce(p_version, ''), 20), left(coalesce(p_lang, ''), 5))
  on conflict (install_id, step) do nothing;
$$;

revoke all on function public.log_funnel(uuid, text, text, text) from public;
grant execute on function public.log_funnel(uuid, text, text, text) to anon, authenticated;

-- Conservation 12 mois (politique de confidentialité) : purge chaque nuit.
select cron.schedule('hearme-purge-funnel', '41 3 * * *', $$ delete from public.funnel_events where created_at < now() - interval '12 months'; $$);
