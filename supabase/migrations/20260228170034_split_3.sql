CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(p_months int DEFAULT 24)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM audit_logs WHERE created_at < now() - (p_months || ' months')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  INSERT INTO audit_logs (source, module, entity, action, metadata, success)
  VALUES ('db', 'system', 'audit_logs', 'JOB_CLEANUP', jsonb_build_object('deleted_count', v_deleted, 'retention_months', p_months), true);
  RETURN v_deleted;
END; $$;