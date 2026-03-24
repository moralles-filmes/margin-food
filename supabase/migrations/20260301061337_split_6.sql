CREATE OR REPLACE FUNCTION public._salmon_cancel_entry_guarded(p_entry_id uuid, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'salmon:entradas:delete') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:entradas:delete)';
  END IF;
  RETURN public.cancel_salmon_entry_atomic(p_entry_id, p_reason);
END;
$$;

-- 8) _salmon_cancel_manipulation_guarded