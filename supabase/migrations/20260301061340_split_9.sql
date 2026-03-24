CREATE OR REPLACE FUNCTION public._salmon_create_manipulation_guarded(
  p_entry_id uuid, p_manipulation_date text, p_fish_count int,
  p_gross_out_kg numeric, p_clean_in_kg numeric, p_leftover_kg numeric, p_notes text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'salmon:manipulacao:create') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:manipulacao:create)';
  END IF;
  RETURN public.create_salmon_manipulation_atomic(
    p_entry_id, p_manipulation_date::date, p_fish_count,
    p_gross_out_kg, p_clean_in_kg, p_leftover_kg, p_notes
  );
END;
$$;