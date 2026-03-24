CREATE OR REPLACE FUNCTION public.get_or_set_cache(p_key text, p_ttl_seconds int DEFAULT 120)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_payload jsonb; v_expires timestamptz;
BEGIN
  SELECT payload, expires_at INTO v_payload, v_expires FROM dashboard_cache WHERE key = p_key;
  IF FOUND AND v_expires > now() THEN RETURN v_payload; END IF;
  RETURN NULL;
END; $$;