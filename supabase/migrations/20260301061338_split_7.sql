CREATE OR REPLACE FUNCTION public._salmon_cancel_manipulation_guarded(p_manip_id uuid, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'salmon:manipulacao:create') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:manipulacao:create)';
  END IF;
  RETURN public.cancel_salmon_manipulation_atomic(p_manip_id, p_reason);
END;
$$;

-- 9) _salmon_create_entry_guarded