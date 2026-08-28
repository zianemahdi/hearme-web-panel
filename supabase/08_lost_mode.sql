-- ============================================================================
--  08_lost_mode.sql — Mode « recherche / perdu » + « faire sonner »
-- ----------------------------------------------------------------------------
--  Élargit la liste blanche de panel_send_command pour autoriser :
--   • ring            → faire sonner (non intrusif, toujours permis)
--   • activate_search / stop_search → mode recherche (débloque photo + GPS)
--   • declare_stolen / clear_stolen → déclarer volé
--  Le téléphone applique ces états (is_lost / is_stolen) et n'autorise photo &
--  localisation QUE dans cet état d'alerte.
--
--  À exécuter dans Supabase → SQL Editor.
-- ============================================================================

create or replace function panel_send_command(p_secret text, p_command text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id  uuid;
    v_cmd uuid;
begin
    select id into v_id from devices where secret_key = p_secret;
    if v_id is null then
        raise exception 'clé secrète invalide';
    end if;
    if p_command not in (
        'lock', 'alarm', 'ring', 'stopalarm', 'locate', 'photo',
        'activate_search', 'stop_search', 'declare_stolen', 'clear_stolen'
    ) then
        raise exception 'commande inconnue';
    end if;
    insert into device_commands(device_id, command)
        values (v_id, p_command)
        returning id into v_cmd;
    return v_cmd;
end;
$$;

grant execute on function panel_send_command(text, text) to anon, authenticated;
