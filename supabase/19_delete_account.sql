-- ============================================================================
--  19_delete_account.sql — Suppression d'un compte et de toutes ses données
-- ----------------------------------------------------------------------------
--  Google Play exige qu'un utilisateur puisse supprimer son compte depuis l'app.
--  L'Edge Function « delete-account » (JWT de l'utilisateur) :
--    1. efface les photos du stockage privé (dossier = id de l'appareil) par
--       l'API Storage — la seule autorisée à supprimer des fichiers ;
--    2. appelle delete_account_data() ci-dessous ;
--    3. supprime le compte lui-même (auth.admin.deleteUser).
--  Chaque étape peut être rejouée : une suppression interrompue se termine en
--  relançant la demande.
--
--  delete_account_data() n'est exécutable QUE par le service_role (l'Edge
--  Function) : un utilisateur ne peut pas l'appeler pour l'identifiant d'un autre.
-- ============================================================================

create or replace function delete_account_data(p_uid uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n_dev int; n_quota int;
begin
    if p_uid is null then
        raise exception 'identifiant de compte manquant';
    end if;
    -- Téléphones du compte : positions, commandes, jetons d'accès, liaisons et
    -- file Telegram, quotas d'envoi suivent en cascade (on delete cascade).
    delete from devices where user_id = p_uid;
    get diagnostics n_dev = row_count;
    -- Quotas de la carte communautaire (empreinte sha256 du compte). Les
    -- signalements eux-mêmes sont anonymes et ne sont liés à personne.
    delete from incident_quota where reporter = encode(digest(p_uid::text, 'sha256'), 'hex');
    get diagnostics n_quota = row_count;
    -- PIN de secours (aussi supprimé en cascade avec le compte ; explicite ici).
    delete from account_pins where user_id = p_uid;
    return jsonb_build_object('ok', true, 'devices', n_dev, 'quota', n_quota);
end $$;

revoke execute on function delete_account_data(uuid) from public, anon, authenticated;
grant  execute on function delete_account_data(uuid) to service_role;
