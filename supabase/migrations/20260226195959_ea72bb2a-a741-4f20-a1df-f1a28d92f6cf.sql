
-- Drop old admin-only policy on user_roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Create new policy that allows master roles (admin, diretor, gerente_geral)
CREATE POLICY "Masters can manage all roles" ON public.user_roles
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'diretor'::app_role) OR 
  has_role(auth.uid(), 'gerente_geral'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'diretor'::app_role) OR 
  has_role(auth.uid(), 'gerente_geral'::app_role)
);

-- Also update audit_log read policy to include master roles
DROP POLICY IF EXISTS "Admin or Compras can read audit" ON public.audit_log;
CREATE POLICY "Masters or Compras can read audit" ON public.audit_log
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'diretor'::app_role) OR 
  has_role(auth.uid(), 'gerente_geral'::app_role) OR 
  has_role(auth.uid(), 'compras'::app_role)
);
