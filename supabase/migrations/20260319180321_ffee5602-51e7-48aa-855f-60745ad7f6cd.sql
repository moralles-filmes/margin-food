-- Compatibility overload for legacy/text callers of log_audit.
-- Fixes runtime failures in requisition item attendance RPCs that still pass p_entity_id as text.
CREATE OR REPLACE FUNCTION public.log_audit(
  p_source text,
  p_module text,
  p_entity text,
  p_entity_id text,
  p_action text,
  p_before jsonb DEFAULT NULL::jsonb,
  p_after jsonb DEFAULT NULL::jsonb,
  p_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_entity_uuid uuid;
  v_metadata jsonb;
BEGIN
  v_metadata := COALESCE(p_metadata, '{}'::jsonb);

  IF p_source IS NOT NULL AND p_source <> '' THEN
    v_metadata := jsonb_build_object('source', p_source) || v_metadata;
  END IF;

  IF p_entity_id IS NOT NULL
     AND p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_entity_uuid := p_entity_id::uuid;
    PERFORM public.log_audit(
      p_source := p_source,
      p_module := p_module,
      p_entity := p_entity,
      p_entity_id := v_entity_uuid,
      p_action := p_action,
      p_before := p_before,
      p_after := p_after,
      p_metadata := CASE WHEN v_metadata = '{}'::jsonb THEN NULL ELSE v_metadata END
    );
    RETURN;
  END IF;

  PERFORM public.audit_log_write(
    _module := p_module,
    _action := p_action,
    _entity_type := p_entity,
    _entity_id := p_entity_id,
    _before := p_before,
    _after := p_after,
    _metadata := CASE WHEN v_metadata = '{}'::jsonb THEN NULL ELSE v_metadata END,
    _severity := 'info'
  );
END;
$function$;