-- 44 — Vitesse (conseiller Supabase, 2026-11-20). Appliqué sur le projet.
-- auth.uid() lu UNE fois par requête au lieu d'une fois par ligne : même règle,
-- même résultat, plus rapide quand il y a beaucoup de photos / positions.
-- + index sur tg_sessions.device_id (clé étrangère sans index).
alter policy devices_select_own on public.devices using (user_id = (select auth.uid()));
alter policy devices_update_own on public.devices using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy devices_delete_own on public.devices using (user_id = (select auth.uid()));
alter policy dloc_select_own on public.device_locations using (exists (select 1 from public.devices d where d.id = device_locations.device_id and d.user_id = (select auth.uid())));
alter policy photos_select_own on public.security_photos using (exists (select 1 from public.devices d where d.id = security_photos.device_id and d.user_id = (select auth.uid())));
alter policy cmd_select_own on public.device_commands using (exists (select 1 from public.devices d where d.id = device_commands.device_id and d.user_id = (select auth.uid())));
alter policy cmd_insert_own on public.device_commands with check (exists (select 1 from public.devices d where d.id = device_commands.device_id and d.user_id = (select auth.uid())));
create index if not exists idx_tg_sessions_device_id on public.tg_sessions (device_id);
