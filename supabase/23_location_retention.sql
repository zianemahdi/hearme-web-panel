-- ============================================================================
--  23_location_retention.sql — Positions conservées 30 jours
-- ----------------------------------------------------------------------------
--  Google Play (et le RGPD) demandent une durée de conservation définie. Chaque
--  nuit, les positions de plus de 30 jours sont supprimées, sauf la DERNIÈRE de
--  chaque téléphone : le panneau doit pouvoir montrer où il a été vu pour la
--  dernière fois, même s'il est éteint depuis longtemps. Celle-ci part avec le
--  téléphone ou le compte (suppression en cascade, 19).
--
--  Tâche pg_cron « hearme-purge-locations », tous les jours à 03:17 UTC.
--  Fonction réservée au serveur : ni l'app ni le panneau ne peuvent l'appeler.
-- ============================================================================

create or replace function purge_old_locations(p_days int default 30)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
    if p_days is null or p_days < 1 then
        raise exception 'durée de conservation invalide : %', p_days;
    end if;
    delete from device_locations l
     where l.recorded_at < now() - make_interval(days => p_days)
       and l.id <> (select x.id from device_locations x
                     where x.device_id = l.device_id
                     order by x.recorded_at desc, x.id desc
                     limit 1);
    get diagnostics n = row_count;
    return n;
end $$;

revoke execute on function purge_old_locations(int) from public, anon, authenticated;

-- Même nom = mise à jour de la tâche existante (pg_cron ≥ 1.3) : rejouable sans doublon.
select cron.schedule('hearme-purge-locations', '17 3 * * *', $$select public.purge_old_locations(30)$$);
