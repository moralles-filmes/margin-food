-- Hardening produtos writes: always derive tenant company_id server-side
-- to prevent stale clients from sending placeholder company_id values.

CREATE OR REPLACE FUNCTION public.produtos_force_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- For authenticated app traffic, always enforce company_id from backend context
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.company_id := public.get_current_company_id();
    ELSIF TG_OP = 'UPDATE' THEN
      -- company_id is immutable for produtos rows
      NEW.company_id := OLD.company_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aa_produtos_force_company_id ON public.produtos;
CREATE TRIGGER trg_aa_produtos_force_company_id
BEFORE INSERT OR UPDATE ON public.produtos
FOR EACH ROW
EXECUTE FUNCTION public.produtos_force_company_id();