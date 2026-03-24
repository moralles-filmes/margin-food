
-- 1) Create app_config table for system-wide settings
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write app_config
CREATE POLICY "Service role only" ON public.app_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed default_company_id with the real company
-- INSERT INTO public.app_config (key, value)
-- VALUES ('default_company_id', '68fd6ab4-0088-4671-b77f-7991ac26c42a')
-- ON CONFLICT (key) DO NOTHING;

-- 2) Replace handle_new_user() with fail-closed logic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_placeholder uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  -- Priority 1: from user metadata
  IF NEW.raw_user_meta_data->>'company_id' IS NOT NULL THEN
    BEGIN
      v_company_id := (NEW.raw_user_meta_data->>'company_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_company_id := NULL;
    END;
  END IF;

  -- Reject placeholder even if explicitly passed
  IF v_company_id = v_placeholder THEN
    v_company_id := NULL;
  END IF;

  -- Priority 2: from app_config default
  IF v_company_id IS NULL THEN
    SELECT value::uuid INTO v_company_id
    FROM public.app_config
    WHERE key = 'default_company_id';
  END IF;

  -- Priority 3: most recent real company
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE id != v_placeholder AND ativo = true
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Fail-closed: no valid company found
  IF v_company_id IS NULL OR v_company_id = v_placeholder THEN
    RAISE EXCEPTION 'No valid company_id for new user. Set raw_user_meta_data.company_id or configure default_company_id in app_config.';
  END IF;

  INSERT INTO public.profiles (id, nome, email, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    COALESCE(NEW.email, ''),
    v_company_id
  );

  RETURN NEW;
END;
$function$;
