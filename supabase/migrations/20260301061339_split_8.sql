CREATE OR REPLACE FUNCTION public._salmon_create_entry_guarded(
  p_entry_date text, p_lot text, p_sif text, p_supplier_name text,
  p_boxes int, p_units int, p_gross_kg numeric, p_total_value numeric, p_notes text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'salmon:entradas:create') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:entradas:create)';
  END IF;
  RETURN public.create_salmon_entry_atomic(
    p_entry_date::date, p_lot, p_sif, p_supplier_name,
    p_boxes, p_units, p_gross_kg, p_total_value, p_notes
  );
END;
$$;

-- 10) _salmon_create_manipulation_guarded