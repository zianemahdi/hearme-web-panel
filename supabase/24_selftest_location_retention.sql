-- ============================================================================
--  24_selftest_location_retention.sql — Vérification de 23 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : la transaction est annulée, la base reste intacte.
--  Le rapport ne porte que sur les appareils du test (aucun total global).
--  Valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    tag   text := upper(substr(md5(random()::text), 1, 10));
    d_mix uuid;   -- positions anciennes + une récente
    d_old uuid;   -- uniquement des positions anciennes (téléphone éteint depuis longtemps)
    d_new uuid;   -- uniquement des positions récentes
    keep  bigint;
    last  bigint;
    log   text := '';
begin
    d_mix := push_device_state('ZZM' || tag, 'Selftest mixte');
    d_old := push_device_state('ZZN' || tag, 'Selftest ancien');
    d_new := push_device_state('ZZP' || tag, 'Selftest récent');

    insert into device_locations(device_id, lat, lon, recorded_at) values
        (d_mix, 36.70, 3.00, now() - interval '40 days'),
        (d_mix, 36.71, 3.01, now() - interval '35 days'),
        (d_mix, 36.72, 3.02, now() - interval '5 days'),
        (d_old, 36.80, 3.10, now() - interval '60 days'),
        (d_old, 36.81, 3.11, now() - interval '45 days'),
        (d_new, 36.90, 3.20, now() - interval '2 days'),
        (d_new, 36.91, 3.21, now() - interval '1 hour');
    select id into keep from device_locations where device_id = d_mix and recorded_at > now() - interval '6 days';
    select id into last from device_locations where device_id = d_old and recorded_at > now() - interval '46 days';

    -- A. Garde-fou.
    begin
        perform purge_old_locations(0);
        log := log || E'\nA days=0 -> accepted [refused]';
    exception when others then
        log := log || E'\nA days=0 -> refused [refused]';
    end;

    perform purge_old_locations(30);

    -- B. Mixte : les 2 anciennes partent, la récente reste.
    log := log || E'\nB mixed -> rows=' || (select count(*) from device_locations where device_id = d_mix) || ' [1]'
               || ' recent kept=' || exists (select 1 from device_locations where id = keep) || ' [true]';
    -- C. Éteint depuis longtemps : seule sa dernière position reste.
    log := log || E'\nC old only -> rows=' || (select count(*) from device_locations where device_id = d_old) || ' [1]'
               || ' last kept=' || exists (select 1 from device_locations where id = last) || ' [true]';
    -- D. Récent : rien ne bouge.
    log := log || E'\nD recent -> rows=' || (select count(*) from device_locations where device_id = d_new) || ' [2]';
    -- E. Plus rien de plus de 30 jours, hormis la dernière position d'un téléphone.
    log := log || E'\nE leftovers older than 30 days (test devices) -> '
               || (select count(*) from device_locations
                    where device_id in (d_mix, d_old, d_new)
                      and recorded_at < now() - interval '30 days' and id <> last) || ' [0]';
    -- F. Tâche planifiée et droits.
    log := log || E'\nF cron -> ' || coalesce((select schedule || ' ' || command from cron.job
                                               where jobname = 'hearme-purge-locations'), 'absent')
               || ' [17 3 * * * select public.purge_old_locations(30)]'
               || ' | anon=' || has_function_privilege('anon', 'purge_old_locations(int)', 'execute')
               || ' authenticated=' || has_function_privilege('authenticated', 'purge_old_locations(int)', 'execute')
               || ' [false x2]';

    raise exception 'SELFTEST (annulé)%', log;
end $$;
