
-- Fix overly permissive audit log insert policy
DROP POLICY IF EXISTS "System can insert audit" ON public.audit_log;
CREATE POLICY "Authenticated can insert audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
