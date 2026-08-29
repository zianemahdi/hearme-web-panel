-- ============================================================================
--  10_selftest.sql — Autotest du parcours d'urgence
-- ----------------------------------------------------------------------------
--  POURQUOI CE FICHIER EXISTE
--
--  Le 29/08/2026, le magic link ET le PIN maître étaient hors service en
--  production depuis leur déploiement : pgcrypto vit dans le schéma
--  « extensions » sur Supabase, absent du search_path des fonctions. Chaque
--  appel levait une erreur.
--
--  Rien ne l'avait détecté — et surtout pas les tests E2E, qui restaient au
--  vert : ils n'essaient qu'un e-mail INCONNU, or panel_pin_login sort de
--  cette branche AVANT d'appeler crypt(). Les seuls chemins qui touchent
--  pgcrypto (gen_random_bytes, crypt, gen_salt) demandent un appareil valide,
--  donc aucun test en boîte noire ne pouvait les atteindre.
--
--  D'où cette fonction : elle joue le parcours complet sur un appareil jetable
--  qu'elle crée puis supprime, et renvoie un rapport. Elle échoue bruyamment
--  si une extension manque, si un jeton n'est pas à usage unique, si le PIN ne
--  se vérifie pas.
--
--  USAGE — Supabase → SQL Editor :   select selftest_emergency_flow();
--  À relancer après CHAQUE déploiement SQL. Réservée au propriétaire de la
--  base (aucun droit accordé à anon / authenticated).
-- ============================================================================

create or replace function selftest_emergency_flow()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_secret text := 'SELFTEST-' || encode(gen_random_bytes(8), 'hex');
    v_email  text := 'selftest-' || encode(gen_random_bytes(4), 'hex') || '@hearme.invalid';
    v_dev    uuid;
    v_tok    text;
    v_r      jsonb;
    checks   jsonb := '[]'::jsonb;
    failures int := 0;


    ok_step  boolean;
begin
    -- 1. Création de l'appareil jetable (chemin app normal).
    v_dev := push_device_state(v_secret, 'SELFTEST', 50, 'wifi', false);
    ok_step := v_dev is not null;
    checks := checks || jsonb_build_object('etape', '1. création appareil', 'ok', ok_step);
    if not ok_step then failures := failures + 1; end if;

    -- 2. MAGIC LINK — exerce gen_random_bytes (pgcrypto).
    --    C'est l'appel qui échouait avant le correctif du 29/08.
    v_tok := mint_access_token(v_secret, 15);
    ok_step := v_tok is not null and length(v_tok) = 48;
    checks := checks || jsonb_build_object(
        'etape', '2. émission du magic link (gen_random_bytes)',
        'ok', ok_step,
        'detail', coalesce(length(v_tok), 0) || ' caractères (48 attendus)');
    if not ok_step then failures := failures + 1; end if;

    -- 3. Consommation du jeton : doit réussir et rendre la clé.
    v_r := consume_access_token(v_tok);
    ok_step := (v_r ->> 'ok')::boolean is true and (v_r ->> 'secret') = v_secret;
    checks := checks || jsonb_build_object('etape', '3. consommation du jeton', 'ok', ok_step);
    if not ok_step then failures := failures + 1; end if;

    -- 4. Usage unique : le rejeu doit être refusé.
    v_r := consume_access_token(v_tok);
    ok_step := (v_r ->> 'error') = 'used';
    checks := checks || jsonb_build_object(
        'etape', '4. rejeu du même jeton refusé', 'ok', ok_step,
        'detail', coalesce(v_r ->> 'error', 'aucune erreur !'));
    if not ok_step then failures := failures + 1; end if;

    -- 5. PIN MAÎTRE — exerce crypt() + gen_salt() (pgcrypto).
    --    C'est l'appel qui échouait avant le correctif du 29/08.
    v_r := set_device_pin(v_secret, v_email, '1234');
    ok_step := (v_r ->> 'ok')::boolean is true;
    checks := checks || jsonb_build_object(
        'etape', '5. pose du PIN (crypt + gen_salt)', 'ok', ok_step,
        'detail', coalesce(v_r ->> 'error', 'ok'));
    if not ok_step then failures := failures + 1; end if;

    -- 6. Connexion avec le BON PIN — exerce crypt() en vérification.
    --    Chemin jamais couvert par les tests E2E (ils n'essaient qu'un e-mail inconnu).
    v_r := panel_pin_login(v_email, '1234');
    ok_step := (v_r ->> 'ok')::boolean is true and (v_r ->> 'secret') = v_secret;
    checks := checks || jsonb_build_object(
        'etape', '6. connexion avec le bon PIN (crypt)', 'ok', ok_step,
        'detail', coalesce(v_r ->> 'error', 'ok'));
    if not ok_step then failures := failures + 1; end if;

    -- 7. Mauvais PIN refusé.
    v_r := panel_pin_login(v_email, '9999');
    ok_step := (v_r ->> 'ok')::boolean is false;
    checks := checks || jsonb_build_object('etape', '7. mauvais PIN refusé', 'ok', ok_step);
    if not ok_step then failures := failures + 1; end if;

    -- 8. Liste blanche des commandes : une commande inventée doit être rejetée.
    begin
        perform panel_send_command(v_secret, 'wipe_everything');
        ok_step := false;   -- on n'aurait pas dû arriver ici
    exception when others then
        ok_step := true;
    end;
    checks := checks || jsonb_build_object('etape', '8. commande hors liste blanche rejetée', 'ok', ok_step);
    if not ok_step then failures := failures + 1; end if;

    -- 9. Nettoyage complet de l'appareil jetable.
    delete from device_access_tokens where device_id = v_dev;
    delete from device_pins          where device_id = v_dev;
    delete from device_commands      where device_id = v_dev;
    delete from device_locations     where device_id = v_dev;
    delete from security_photos      where device_id = v_dev;
    delete from devices              where id = v_dev;
    ok_step := not exists (select 1 from devices where id = v_dev);
    checks := checks || jsonb_build_object('etape', '9. nettoyage', 'ok', ok_step);
    if not ok_step then failures := failures + 1; end if;

    return jsonb_build_object(
        'verdict', case when failures = 0 then 'TOUT VA BIEN' else failures || ' ÉTAPE(S) EN ÉCHEC' end,
        'echecs', failures,
        'teste_le', now(),
        'details', checks
    );

exception when others then
    -- Filet de sécurité : on nettoie même si une étape a levé une exception,
    -- puis on remonte l'erreur telle quelle (c'est elle qui est instructive).
    begin
        delete from device_access_tokens where device_id = v_dev;
        delete from device_pins          where device_id = v_dev;
        delete from device_commands      where device_id = v_dev;
        delete from device_locations     where device_id = v_dev;
        delete from security_photos      where device_id = v_dev;
        delete from devices              where id = v_dev;
    exception when others then null;
    end;
    return jsonb_build_object(
        'verdict', 'ÉCHEC — exception',
        'erreur', sqlerrm,
        'code', sqlstate,
        'etapes_validees', checks,
        'teste_le', now()
    );
end;
$$;

-- Réservée au propriétaire de la base : elle écrit et supprime des lignes.
revoke execute on function selftest_emergency_flow() from public;
