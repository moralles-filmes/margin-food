
-- Tighten audit log insert to only allow own user_id
DROP POLICY "Authenticated can insert audit_inventario_log" ON public.audit_inventario_log;
CREATE POLICY "Users can insert own audit_inventario_log" ON public.audit_inventario_log 
  FOR INSERT TO authenticated 
  WITH CHECK (auth.uid() = user_id);
