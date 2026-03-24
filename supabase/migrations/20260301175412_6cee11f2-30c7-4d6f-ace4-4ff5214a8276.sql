
-- PART 0: Ensure profiles has company_id (in case earlier migration was skipped/failed)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id uuid;
UPDATE public.profiles SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE public.profiles ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_company_fk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- SECURITY HARDENING

-- PART A: PROFILES
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.profiles FROM public;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_select_admin_company" ON public.profiles FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id() AND public.has_any_permission(auth.uid(), ARRAY['configuracoes:usuarios:view', 'system:global:manage']));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- PART B: RH COLABORADORES
ALTER TABLE public.rh_colaboradores FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rh_colaboradores FROM anon;
REVOKE ALL ON TABLE public.rh_colaboradores FROM public;
DROP POLICY IF EXISTS "Colaborador can read own rh_colaboradores" ON public.rh_colaboradores;
DROP POLICY IF EXISTS "perm_rh_colaboradores_select" ON public.rh_colaboradores;
DROP POLICY IF EXISTS "perm_rh_colaboradores_write" ON public.rh_colaboradores;
CREATE POLICY "rh_colaboradores_select_own" ON public.rh_colaboradores FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "rh_colaboradores_select_hr" ON public.rh_colaboradores FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:prontuario:view','rh:prontuario:manage','system:global:manage']));
CREATE POLICY "rh_colaboradores_insert_hr" ON public.rh_colaboradores FOR INSERT TO authenticated
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['rh:prontuario:create','rh:prontuario:manage','system:global:manage']));
CREATE POLICY "rh_colaboradores_update_hr" ON public.rh_colaboradores FOR UPDATE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:prontuario:edit','rh:prontuario:manage','system:global:manage']))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['rh:prontuario:edit','rh:prontuario:manage','system:global:manage']));
CREATE POLICY "rh_colaboradores_delete_hr" ON public.rh_colaboradores FOR DELETE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:prontuario:delete','system:global:manage']));

-- PART B2: RH FOLHA PAGAMENTO
ALTER TABLE public.rh_folha_pagamento FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rh_folha_pagamento FROM anon;
REVOKE ALL ON TABLE public.rh_folha_pagamento FROM public;
DROP POLICY IF EXISTS "Colaborador can read own folha" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "perm_rh_folha_select" ON public.rh_folha_pagamento;
DROP POLICY IF EXISTS "perm_rh_folha_write" ON public.rh_folha_pagamento;
CREATE POLICY "rh_folha_select_own" ON public.rh_folha_pagamento FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rh_colaboradores c WHERE c.id = rh_folha_pagamento.colaborador_id AND c.user_id = auth.uid()));
CREATE POLICY "rh_folha_select_hr" ON public.rh_folha_pagamento FOR SELECT TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:folha:view','rh:folha:manage','system:global:manage']));
CREATE POLICY "rh_folha_insert_hr" ON public.rh_folha_pagamento FOR INSERT TO authenticated
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['rh:folha:manage','system:global:manage']));
CREATE POLICY "rh_folha_update_hr" ON public.rh_folha_pagamento FOR UPDATE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:folha:manage','system:global:manage']))
  WITH CHECK (public.has_any_permission(auth.uid(), ARRAY['rh:folha:manage','system:global:manage']));
CREATE POLICY "rh_folha_delete_hr" ON public.rh_folha_pagamento FOR DELETE TO authenticated
  USING (public.has_any_permission(auth.uid(), ARRAY['rh:folha:manage','system:global:manage']));

-- PART D: PURCHASE_ORDERS
ALTER TABLE public.purchase_orders FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_orders FROM anon;
REVOKE ALL ON TABLE public.purchase_orders FROM public;
DROP POLICY IF EXISTS "Purchases editors can update purchase_orders" ON public.purchase_orders;
CREATE POLICY "po_update_draft" ON public.purchase_orders FOR UPDATE TO authenticated
  USING (status IN ('OPEN','DRAFT','SUBMITTED') AND (created_by = auth.uid() OR responsible_user_id = auth.uid() OR public.has_permission(auth.uid(), 'compras:pedidos:edit')))
  WITH CHECK (status IN ('OPEN','DRAFT','SUBMITTED'));
CREATE POLICY "po_update_approved" ON public.purchase_orders FOR UPDATE TO authenticated
  USING (status NOT IN ('OPEN','DRAFT','SUBMITTED') AND public.has_any_permission(auth.uid(), ARRAY['compras:lista:approve','system:global:manage']))
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.trg_po_block_post_approval_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF OLD.status NOT IN ('OPEN','DRAFT','SUBMITTED') THEN
    IF NEW.supplier_name IS DISTINCT FROM OLD.supplier_name THEN
      RAISE EXCEPTION 'Cannot change supplier after approval';
    END IF;
    IF NEW.total_estimated IS DISTINCT FROM OLD.total_estimated THEN
      RAISE EXCEPTION 'Cannot change estimated total after approval';
    END IF;
    IF NEW.total_confirmed IS DISTINCT FROM OLD.total_confirmed
       AND NOT has_any_permission(auth.uid(), ARRAY['compras:lista:approve','system:global:manage']) THEN
      RAISE EXCEPTION 'Cannot change confirmed total without approve permission';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_block_post_approval ON public.purchase_orders;
CREATE TRIGGER trg_po_block_post_approval
  BEFORE UPDATE ON public.purchase_orders FOR EACH ROW
  EXECUTE FUNCTION public.trg_po_block_post_approval_changes();
