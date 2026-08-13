-- =========================================================================
-- HearMe — Panneau Web d'urgence : schéma (Supabase / PostgreSQL)
-- -------------------------------------------------------------------------
-- À exécuter dans Supabase → SQL Editor, sur LE MÊME projet que le Module 3
-- (carte communautaire). Aucune collision de noms avec incidents/risk_zones.
-- Ordre : 01_panel_schema → 02_panel_functions → 03_panel_storage.
-- =========================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid / gen_random_bytes

-- -------------------------------------------------------------------------
-- Appareils. Identifiés par leur "clé secrète Telegram" (= command_secret de
-- l'app). Un appareil PEUT être rattaché à un compte (user_id) via le panneau
-- web, mais ce n'est pas obligatoire (l'accès par clé seule reste possible).
-- -------------------------------------------------------------------------
create table if not exists devices (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid references auth.users(id) on delete set null,
    name           text not null default 'Mon téléphone',
    secret_key     text not null unique,
    battery_level  int,
    network_status text,            -- 'wifi' | 'mobile' | 'offline'
    is_locked      boolean not null default false,
    is_online      boolean not null default false,
    last_seen      timestamptz,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index if not exists idx_devices_user   on devices(user_id);
create index if not exists idx_devices_secret  on devices(secret_key);

-- Positions GPS (historique + dernière connue).
create table if not exists device_locations (
    id            bigserial primary key,
    device_id     uuid not null references devices(id) on delete cascade,
    lat           double precision not null,
    lon           double precision not null,
    accuracy_m    real,
    battery_level int,
    recorded_at   timestamptz not null default now()
);
create index if not exists idx_dloc_device_time on device_locations(device_id, recorded_at desc);

-- Photos de sécurité (métadonnées ; fichiers dans le bucket 'security-photos').
create table if not exists security_photos (
    id           uuid primary key default gen_random_uuid(),
    device_id    uuid not null references devices(id) on delete cascade,
    storage_path text not null,     -- '<device_id>/<uuid>.jpg'
    event_type   text,              -- 'unlock_failed' | 'remote_photo' | 'theft'
    created_at   timestamptz not null default now()
);
create index if not exists idx_photos_device_time on security_photos(device_id, created_at desc);

-- Commandes à distance (file d'attente : l'app les lit, exécute, puis acquitte).
create table if not exists device_commands (
    id          uuid primary key default gen_random_uuid(),
    device_id   uuid not null references devices(id) on delete cascade,
    command     text not null,      -- 'lock'|'alarm'|'stopalarm'|'locate'|'photo'|'regenerate_key'
    status      text not null default 'pending',  -- 'pending'|'delivered'|'done'|'failed'
    params      jsonb,
    created_at  timestamptz not null default now(),
    executed_at timestamptz
);
create index if not exists idx_cmd_device_status on device_commands(device_id, status, created_at);

-- -------------------------------------------------------------------------
-- Sécurité (RLS). L'anon N'A AUCUN accès direct : il passe par les fonctions
-- SECURITY DEFINER (02_panel_functions.sql). Un compte connecté ne voit QUE
-- ses propres appareils et leurs données.
-- -------------------------------------------------------------------------
alter table devices          enable row level security;
alter table device_locations enable row level security;
alter table security_photos  enable row level security;
alter table device_commands  enable row level security;

drop policy if exists devices_select_own on devices;
create policy devices_select_own on devices
  for select to authenticated using (user_id = auth.uid());

drop policy if exists devices_update_own on devices;
create policy devices_update_own on devices
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists devices_delete_own on devices;
create policy devices_delete_own on devices
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists dloc_select_own on device_locations;
create policy dloc_select_own on device_locations
  for select to authenticated
  using (exists (select 1 from devices d where d.id = device_id and d.user_id = auth.uid()));

drop policy if exists photos_select_own on security_photos;
create policy photos_select_own on security_photos
  for select to authenticated
  using (exists (select 1 from devices d where d.id = device_id and d.user_id = auth.uid()));

drop policy if exists cmd_select_own on device_commands;
create policy cmd_select_own on device_commands
  for select to authenticated
  using (exists (select 1 from devices d where d.id = device_id and d.user_id = auth.uid()));

drop policy if exists cmd_insert_own on device_commands;
create policy cmd_insert_own on device_commands
  for insert to authenticated
  with check (exists (select 1 from devices d where d.id = device_id and d.user_id = auth.uid()));

-- -------------------------------------------------------------------------
-- Temps réel : autorise le compte connecté à recevoir les nouvelles positions
-- et les changements d'état via Supabase Realtime (respecte la RLS ci-dessus).
-- -------------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table device_locations; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table devices;          exception when duplicate_object then null; end;
end $$;
