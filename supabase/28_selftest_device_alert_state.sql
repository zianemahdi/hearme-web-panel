-- ============================================================================
--  28_selftest_device_alert_state.sql — Vérification de 27 (sans laisser de trace)
-- ----------------------------------------------------------------------------
--  Bloc terminé par RAISE : la transaction est annulée, la base reste intacte.
--  Le rapport ne porte que sur l'appareil du test. Valeur attendue entre [ ].
-- ============================================================================
do $$
declare
    tag text := upper(substr(md5(random()::text), 1, 10));
    k   text;
    d   uuid;
    r   record;
    log text := '';
begin
    k := 'ZZS' || tag;

    -- A. Nouveau téléphone, sans mode signalé : inconnu.
    d := push_device_state(k, 'Selftest alerte');
    select * into r from panel_get_device(k);
    log := log || E'\nA new -> lost=' || coalesce(r.is_lost::text, 'null') || ' [null]'
               || ' stolen=' || coalesce(r.is_stolen::text, 'null') || ' [null]';

    -- B. Le téléphone passe en mode recherche.
    perform push_device_state(k, p_lost => true);
    select * into r from panel_get_device(k);
    log := log || E'\nB lost on -> lost=' || coalesce(r.is_lost::text, 'null') || ' [true]'
               || ' stolen=' || coalesce(r.is_stolen::text, 'null') || ' [null]';

    -- C. Appel sans mode (liaison du compte, Telegram) : rien ne change.
    perform push_device_state(k, 'Selftest renommé');
    select * into r from panel_get_device(k);
    log := log || E'\nC no flags -> lost=' || coalesce(r.is_lost::text, 'null') || ' [true]'
               || ' name=' || r.name || ' [Selftest renommé]';

    -- D. Recherche arrêtée, téléphone déclaré volé.
    perform push_device_state(k, p_lost => false, p_stolen => true);
    select * into r from panel_get_device(k);
    log := log || E'\nD -> lost=' || coalesce(r.is_lost::text, 'null') || ' [false]'
               || ' stolen=' || coalesce(r.is_stolen::text, 'null') || ' [true]';

    -- E. Appel des versions actuelles de l'app (5 paramètres) : accepté, mode inchangé.
    log := log || E'\nE old call -> id ok=' || (push_device_state(k, 'Selftest', 55, 'wifi', false) = d) || ' [true]';
    select * into r from panel_get_device(k);
    log := log || ' battery=' || r.battery_level || ' [55] stolen=' || coalesce(r.is_stolen::text, 'null') || ' [true]';

    -- F. Mauvaise clé : rien.
    log := log || E'\nF wrong key -> rows=' || (select count(*) from panel_get_device('ZZX' || tag)) || ' [0]';

    -- G. Une seule version de chaque fonction, et les bons droits.
    log := log || E'\nG versions -> push=' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                               where n.nspname = 'public' and p.proname = 'push_device_state') || ' [1]'
               || ' get=' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'panel_get_device') || ' [1]';
    log := log || E'\n  rights -> push anon=' || has_function_privilege('anon', 'push_device_state(text,text,int,text,boolean,boolean,boolean)', 'execute') || ' [true]'
               || ' get anon=' || has_function_privilege('anon', 'panel_get_device(text)', 'execute') || ' [true]'
               || ' get authenticated=' || has_function_privilege('authenticated', 'panel_get_device(text)', 'execute') || ' [true]'
               || ' public=' || exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                        where n.nspname = 'public' and p.proname in ('push_device_state', 'panel_get_device')
                                          and (p.proacl is null or array_to_string(p.proacl, ',') ~ '(^|,)=X')) || ' [false]';

    raise exception 'SELFTEST (annulé, rien n''est conservé) :%', log;
end $$;
