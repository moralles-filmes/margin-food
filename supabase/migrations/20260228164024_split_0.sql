CREATE OR REPLACE FUNCTION public.log_audit(
  p_source text,
  p_module text,
  p_entity text,
  p_entity_id uuid,
  p_action text,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_user_id, source, module, entity, entity_id, action, before, after, metadata)
  VALUES (auth.uid(), p_source, p_module, p_entity, p_entity_id, p_action, p_before, p_after, p_metadata);
END;
$$;

-- Update create_transfer to log