
-- Drop and recreate with correct permission guard (returns jsonb)
DROP FUNCTION IF EXISTS public._salmon_cancel_manipulation_guarded(uuid, text);

CREATE OR REPLACE FUNCTION public._salmon_cancel_manipulation_guarded(p_manip_id uuid, p_reason text DEFAULT ''::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'salmon:manipulacao:delete') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:manipulacao:delete)';
  END IF;
  RETURN public.cancel_salmon_manipulation_atomic(p_manip_id, p_reason);
END;
$$;
