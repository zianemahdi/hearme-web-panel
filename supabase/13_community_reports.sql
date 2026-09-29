-- ============================================================================
--  13_community_reports.sql — Carte communautaire : signalements vérifiés
-- ----------------------------------------------------------------------------
--  HM-14 (audit du 29/09/2026) — report_incident était appelable par n'importe
--  qui, sans clé ni limite (la version en production avait même perdu les
--  garde-fous de backend/supabase/02_functions.sql). Un simple script pouvait
--  injecter des milliers de faux incidents et faire passer n'importe quel
--  quartier pour dangereux.
--
--  Une zone devient orange à partir d'environ 10 incidents récents dans une
--  cellule de 400 m (recompute_risk_zones). On veut donc qu'UNE personne ne
--  puisse pas, seule, colorer un quartier :
--
--    1. Seul un téléphone RATTACHÉ À UN COMPTE peut signaler (clé forte de
--       l'appareil + devices.user_id). Créer des « appareils » est gratuit ;
--       créer des comptes vérifiés (e-mail confirmé / Google) ne l'est pas.
--    2. 1 signalement par compte et par cellule de 400 m sur 30 jours : il faut
--       donc ~10 comptes DIFFÉRENTS pour colorer une zone.
--    3. 3 signalements par compte et par jour.
--    4. Garde-fous de volume d'origine conservés (5 / 500 m / 5 min, 60 / min).
--
--  Vie privée (RGPD, minimisation) : la table incidents reste ANONYME (aucun
--  identifiant, position décalée de ±150 m, heure arrondie à 10 min — inchangé).
--  Les quotas ne stockent qu'une empreinte SHA-256 du compte, la cellule et le
--  JOUR (jamais l'heure ni la position exacte), effacés au bout de 30 jours.
--  Un dépassement est ignoré silencieusement : rien n'est révélé à un spammeur.
--
--  À exécuter après 12_bruteforce_guard.sql (utilise hm_guard / hm_device_id).
-- ============================================================================

create table if not exists incident_quota (
    reporter text not null,               -- sha256(user_id), jamais l'identifiant en clair
    cell     text not null,               -- cellule de 400 m, ou '*' = compteur du jour
    day      date not null default current_date,
    n        int  not null default 0,
    primary key (reporter, cell, day)
);
alter table incident_quota enable row level security;
revoke all on table incident_quota from anon, authenticated;

-- L'ancienne signature (sans clé) disparaît : plus d'accès anonyme.
drop function if exists report_incident(double precision, double precision, real);

create or replace function report_incident(
    p_secret   text,
    p_lat      double precision,
    p_lon      double precision,
    p_accuracy real default null
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
    jitter_m double precision := 150;
    v_dev    uuid;
    v_user   uuid;
    v_rep    text;
    v_cell   text;
    v_today  int;
    pt       geometry;
begin
    perform hm_guard();
    if p_lat is null or p_lon is null
       or p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180 then
        raise exception 'coordonnées invalides';
    end if;

    v_dev := hm_device_id(p_secret);
    if v_dev is null then perform hm_fail(); return; end if;

    -- 1. Téléphone rattaché à un compte, sinon ignoré (ce n'est pas un essai de clé).
    select user_id into v_user from devices where id = v_dev;
    if v_user is null then return; end if;

    v_rep := encode(digest(v_user::text, 'sha256'), 'hex');
    pt := ST_Transform(ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326), 3857);
    select ST_X(g)::bigint || ':' || ST_Y(g)::bigint into v_cell
      from (select ST_SnapToGrid(pt, 400) as g) s;

    -- 2. Une fois par compte et par cellule sur 30 jours.
    if exists (select 1 from incident_quota
               where reporter = v_rep and cell = v_cell and day > current_date - 30) then
        return;
    end if;

    -- 3. Trois fois par compte et par jour.
    select n into v_today from incident_quota
     where reporter = v_rep and cell = '*' and day = current_date;
    if coalesce(v_today, 0) >= 3 then return; end if;

    -- 4. Garde-fous de volume (repris de backend/supabase/02_functions.sql).
    if (select count(*) from incidents
        where created_at > now() - interval '5 minutes'
          and ST_DWithin(geom, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography, 500)) >= 5 then
        return;
    end if;
    if (select count(*) from incidents where created_at > now() - interval '1 minute') >= 60 then
        return;
    end if;

    insert into incident_quota(reporter, cell, day, n) values (v_rep, v_cell, current_date, 1)
    on conflict (reporter, cell, day) do update set n = incident_quota.n + 1;
    insert into incident_quota(reporter, cell, day, n) values (v_rep, '*', current_date, 1)
    on conflict (reporter, cell, day) do update set n = incident_quota.n + 1;
    if random() < 0.05 then
        delete from incident_quota where day < current_date - 30;
    end if;

    -- Anonymisation inchangée : ±150 m, heure arrondie à 10 min, aucun identifiant.
    pt := ST_Translate(pt, (random() - 0.5) * 2 * jitter_m, (random() - 0.5) * 2 * jitter_m);
    insert into incidents (geom, occurred_at, accuracy_m)
    values (
        ST_Transform(pt, 4326)::geography,
        date_trunc('hour', now())
            + (floor(extract(minute from now()) / 10) * interval '10 minutes'),
        p_accuracy
    );
end $$;

revoke execute on function report_incident(text, double precision, double precision, real)
    from public, authenticated;
grant execute on function report_incident(text, double precision, double precision, real) to anon;
