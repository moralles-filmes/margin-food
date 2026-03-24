-- Drop existing function with old parameter name, then recreate with action validation
DROP FUNCTION IF EXISTS public.sync_permissions_from_registry(jsonb);

CREATE FUNCTION public.sync_permissions_from_registry(
  _entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entry jsonb;
  _key text;
  _action text;
  _parts text[];
  _inserted int := 0;
  _skipped int := 0;
  _invalid text[] := '{}';
  _allowed_actions text[] := ARRAY['view','create','edit','delete','export','manage','approve','close','reconcile','cancel','simulate'];
BEGIN
  IF NOT has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION 'Forbidden: requires system:global:manage';
  END IF;

  FOR _entry IN SELECT * FROM jsonb_array_elements(_entries)
  LOOP
    _key := _entry->>'key';
    _parts := string_to_array(_key, ':');

    IF array_length(_parts, 1) != 3 THEN
      _invalid := array_append(_invalid, format('Bad format: %s', _key));
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    _action := _parts[3];

    IF NOT (_action = ANY(_allowed_actions)) THEN
      _invalid := array_append(_invalid, format('Invalid action "%s" in key "%s". Allowed: %s', _action, _key, array_to_string(_allowed_actions, ', ')));
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.permissions (key, description, module, action)
    VALUES (
      _key,
      COALESCE(_entry->>'description', ''),
      COALESCE(_entry->>'module', _parts[1]),
      _action
    )
    ON CONFLICT (key) DO UPDATE SET
      description = EXCLUDED.description,
      module = EXCLUDED.module,
      action = EXCLUDED.action;

    _inserted := _inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', _inserted,
    'skipped', _skipped,
    'invalid', to_jsonb(_invalid)
  );
END;
$$;