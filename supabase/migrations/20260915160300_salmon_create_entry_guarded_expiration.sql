-- Wrapper guarded + p_expiration_date. Default NULL mantém compatível o client anterior ao deploy.
DROP FUNCTION IF EXISTS public._salmon_create_entry_guarded(text, text, text, text, integer, integer, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public._salmon_create_entry_guarded(
  p_entry_date text,
  p_lot text,
  p_sif text,
  p_supplier_name text,
  p_boxes integer,
  p_units integer,
  p_gross_kg numeric,
  p_total_value numeric,
  p_notes text DEFAULT ''::text,
  p_expiration_date text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_permission(auth.uid(), 'salmon:entradas:create') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:entradas:create)';
  END IF;
  RETURN public.create_salmon_entry_atomic(
    p_entry_date::date, p_lot, p_sif, p_supplier_name,
    p_boxes, p_units, p_gross_kg, p_total_value, p_notes,
    NULLIF(p_expiration_date, '')::date
  );
END;
$function$;
