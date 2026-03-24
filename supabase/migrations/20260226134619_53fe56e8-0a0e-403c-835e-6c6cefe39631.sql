
-- Fix user_roles RLS: drop restrictive policies, recreate as permissive
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- Permissive: users can read their own roles
CREATE POLICY "Users can read own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Permissive: admins can do everything
CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix profiles: drop restrictive select policies, recreate as permissive
DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Permissive: all authenticated can read profiles
CREATE POLICY "Authenticated can read profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Permissive: users can update own profile
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Fix other tables: drop restrictive, recreate as permissive
-- aprovacoes_solic_compra_mercado
DROP POLICY IF EXISTS "Admin/Compras can approve" ON public.aprovacoes_solic_compra_mercado;
DROP POLICY IF EXISTS "Authenticated can read aprovacoes" ON public.aprovacoes_solic_compra_mercado;

CREATE POLICY "Authenticated can read aprovacoes"
ON public.aprovacoes_solic_compra_mercado FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin or Compras can insert aprovacoes"
ON public.aprovacoes_solic_compra_mercado FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras'));

-- audit_log
DROP POLICY IF EXISTS "Admin can read audit" ON public.audit_log;
DROP POLICY IF EXISTS "Authenticated can insert audit" ON public.audit_log;

CREATE POLICY "Admin or Compras can read audit"
ON public.audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras'));

CREATE POLICY "Authenticated can insert audit"
ON public.audit_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- movimentacoes_estoque
DROP POLICY IF EXISTS "Admin/Compras can insert movimentacoes" ON public.movimentacoes_estoque;
DROP POLICY IF EXISTS "Authenticated can read movimentacoes" ON public.movimentacoes_estoque;

CREATE POLICY "Authenticated can read movimentacoes"
ON public.movimentacoes_estoque FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authorized can insert movimentacoes"
ON public.movimentacoes_estoque FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras') OR public.has_role(auth.uid(), 'compras_assistente'));

-- produtos
DROP POLICY IF EXISTS "Admin/Compras can manage produtos" ON public.produtos;
DROP POLICY IF EXISTS "Authenticated can read produtos" ON public.produtos;

CREATE POLICY "Authenticated can read produtos"
ON public.produtos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authorized can manage produtos"
ON public.produtos FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras') OR public.has_role(auth.uid(), 'compras_assistente'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras') OR public.has_role(auth.uid(), 'compras_assistente'));

-- solic_compra_mercado
DROP POLICY IF EXISTS "Admin/Compras can insert solic_mercado" ON public.solic_compra_mercado;
DROP POLICY IF EXISTS "Admin/Compras/Assistente can update solic_mercado" ON public.solic_compra_mercado;
DROP POLICY IF EXISTS "Authenticated can read solic_mercado" ON public.solic_compra_mercado;

CREATE POLICY "Authenticated can read solic_mercado"
ON public.solic_compra_mercado FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin or Compras can insert solic_mercado"
ON public.solic_compra_mercado FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras'));

CREATE POLICY "Authorized can update solic_mercado"
ON public.solic_compra_mercado FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras') OR public.has_role(auth.uid(), 'compras_assistente'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras') OR public.has_role(auth.uid(), 'compras_assistente'));

-- solic_compra_mercado_item
DROP POLICY IF EXISTS "Admin/Compras/Assistente can manage items" ON public.solic_compra_mercado_item;
DROP POLICY IF EXISTS "Authenticated can read solic_items" ON public.solic_compra_mercado_item;

CREATE POLICY "Authenticated can read solic_items"
ON public.solic_compra_mercado_item FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authorized can manage solic_items"
ON public.solic_compra_mercado_item FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras') OR public.has_role(auth.uid(), 'compras_assistente'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compras') OR public.has_role(auth.uid(), 'compras_assistente'));
