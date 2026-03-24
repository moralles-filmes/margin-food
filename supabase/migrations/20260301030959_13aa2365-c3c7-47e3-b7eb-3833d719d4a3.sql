
-- RPC to sync permission entries from the frontend registry into the permissions table.
-- Admin-only. Upserts all entries and optionally removes orphans.
CREATE OR REPLACE FUNCTION public.sync_permissions_from_registry(p_permissions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count_inserted int := 0;
  v_count_updated int := 0;
  v_count_deleted int := 0;
  v_entry jsonb;
  v_existing text[];
BEGIN
  -- Admin-only guard
  IF NOT has_permission(auth.uid(), 'system:admin') THEN
    RAISE EXCEPTION 'Sem permissão (system:admin).';
  END IF;

  -- Upsert each permission
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_permissions)
  LOOP
    INSERT INTO permissions (key, description, module, submodule, action)
    VALUES (
      v_entry->>'key',
      v_entry->>'description',
      v_entry->>'module',
      COALESCE(v_entry->>'submodule', ''),
      v_entry->>'action'
    )
    ON CONFLICT (key) DO UPDATE SET
      description = EXCLUDED.description,
      module = EXCLUDED.module,
      submodule = EXCLUDED.submodule,
      action = EXCLUDED.action;

    IF FOUND THEN
      v_count_inserted := v_count_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'upserted', v_count_inserted,
    'status', 'ok'
  );
END;
$function$;
