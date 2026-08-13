-- =========================================================================
-- HearMe — Panneau Web d'urgence : stockage des photos de sécurité
-- -------------------------------------------------------------------------
-- Bucket PRIVÉ. Chemin des fichiers : '<device_id>/<uuid>.jpg'.
--   • Compte connecté  → lecture via URL signée (policy ci-dessous).
--   • Accès par clé     → lecture via l'Edge Function 'device-photos'
--                         (service_role, hors RLS) — voir supabase/functions/.
-- L'upload se fait par l'Edge Function (service_role), donc AUCUNE policy
-- d'écriture pour l'anon n'est nécessaire (surface d'attaque réduite).
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('security-photos', 'security-photos', false)
on conflict (id) do nothing;

-- Lecture des photos par le propriétaire connecté (1er segment du chemin = device_id).
drop policy if exists "hm_read_own_photos" on storage.objects;
create policy "hm_read_own_photos" on storage.objects
for select to authenticated
using (
  bucket_id = 'security-photos'
  and exists (
    select 1 from public.devices d
    where d.id::text = (storage.foldername(name))[1]
      and d.user_id = auth.uid()
  )
);
