CREATE OR REPLACE FUNCTION public.rbac_permissions_diff(
  _registry_keys jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _missing jsonb;
  _extra jsonb;
  _invalid_format jsonb;
  _invalid_action jsonb;
  _allowed_actions text[] := ARRAY['view','create','edit','delete','export','manage','approve','close','reconcile','cancel','simulate'];
BEGIN
  IF NOT has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION 'Forbidden: requires system:global:manage';
  END IF;

  -- Keys in registry but not in DB
  SELECT jsonb_agg(rk.val ORDER BY rk.val)
  INTO _missing
  FROM jsonb_array_elements_text(_registry_keys) AS rk(val)
  WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = rk.val);

  -- Keys in DB but not in registry
  SELECT jsonb_agg(p.key ORDER BY p.key)
  INTO _extra
  FROM permissions p
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(_registry_keys) AS rk(val) WHERE rk.val = p.key
  );

  -- Keys in DB with invalid format (not 3 parts)
  SELECT jsonb_agg(p.key ORDER BY p.key)
  INTO _invalid_format
  FROM permissions p
  WHERE array_length(string_to_array(p.key, ':'), 1) != 3;

  -- Keys in DB with invalid action
  SELECT jsonb_agg(p.key ORDER BY p.key)
  INTO _invalid_action
  FROM permissions p
  WHERE NOT ((string_to_array(p.key, ':'))[3] = ANY(_allowed_actions))
    AND array_length(string_to_array(p.key, ':'), 1) = 3;

  RETURN jsonb_build_object(
    'status', CASE
      WHEN COALESCE(jsonb_array_length(COALESCE(_missing, '[]'::jsonb)), 0) = 0
       AND COALESCE(jsonb_array_length(COALESCE(_extra, '[]'::jsonb)), 0) = 0
       AND COALESCE(jsonb_array_length(COALESCE(_invalid_format, '[]'::jsonb)), 0) = 0
       AND COALESCE(jsonb_array_length(COALESCE(_invalid_action, '[]'::jsonb)), 0) = 0
      THEN 'PASS' ELSE 'FAIL' END,
    'missing_in_db', COALESCE(_missing, '[]'::jsonb),
    'extra_in_db', COALESCE(_extra, '[]'::jsonb),
    'invalid_format', COALESCE(_invalid_format, '[]'::jsonb),
    'invalid_action', COALESCE(_invalid_action, '[]'::jsonb),
    'timestamp', now()
  );
END;
$$;