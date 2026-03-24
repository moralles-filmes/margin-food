CREATE OR REPLACE FUNCTION public.set_cache(p_key text, p_payload jsonb, p_ttl_seconds int DEFAULT 120)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO dashboard_cache (key, payload, expires_at)
  VALUES (p_key, p_payload, now() + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at, created_at = now();
END; $$;

-- D) REFRESH MVs FUNCTION