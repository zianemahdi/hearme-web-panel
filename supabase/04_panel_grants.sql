-- =========================================================================
-- HearMe — Panneau Web : privilèges de table pour le rôle 'authenticated'
-- -------------------------------------------------------------------------
-- Les policies RLS existent déjà (01_panel_schema.sql) MAIS sans ces GRANT le
-- rôle 'authenticated' reçoit « permission denied for table devices » : une
-- policy RLS n'accorde rien, elle ne fait que filtrer un privilège déjà donné.
--
-- Résultat du manque : en mode « compte », le panneau ne peut pas lire ses
-- tables → il croit qu'aucun appareil n'est rattaché, redemande la clé, et
-- boucle entre la connexion et le tableau de bord.
--
-- L'anon n'a AUCUN accès direct (il passe par les RPC SECURITY DEFINER), donc
-- on ne lui accorde rien ici.
--
-- À exécuter dans Supabase → SQL Editor (une fois).
-- =========================================================================

grant select, update, delete on devices          to authenticated;
grant select                 on device_locations  to authenticated;
grant select                 on security_photos   to authenticated;
grant select, insert         on device_commands   to authenticated;
