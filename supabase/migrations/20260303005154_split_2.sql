CREATE OR REPLACE FUNCTION public.produtos_force_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.company_id := public.get_current_company_id_strict();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.company_id := OLD.company_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure default also points to strict resolver
ALTER TABLE public.produtos
  ALTER COLUMN company_id SET DEFAULT public.get_current_company_id_strict();