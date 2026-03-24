
-- =============================================
-- FICHA TÉCNICA — ENTERPRISE HARDENING P0/P1
-- =============================================

-- ─── BLOCO 3: SOFT DELETE columns ───
ALTER TABLE public.ficha_componentes 
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.canais_venda 
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- Partial indexes for soft-delete aware queries
CREATE INDEX IF NOT EXISTS idx_ficha_componentes_active 
  ON public.ficha_componentes (company_id, tipo) 
  WHERE deleted_at IS NULL AND ativo = true;

CREATE INDEX IF NOT EXISTS idx_canais_venda_active 
  ON public.canais_venda (company_id) 
  WHERE deleted_at IS NULL AND ativo = true;

-- ─── BLOCO 5: IDEMPOTENCY — Fix UNIQUE constraints ───
-- precificacao_canal: drop old unique, add tenant-scoped one
ALTER TABLE public.precificacao_canal 
  DROP CONSTRAINT IF EXISTS precificacao_canal_componente_id_canal_id_key;

ALTER TABLE public.precificacao_canal 
  ADD CONSTRAINT precificacao_canal_company_comp_canal_uq 
  UNIQUE (company_id, componente_id, canal_id);

-- config_precificacao: ensure one row per tenant
CREATE UNIQUE INDEX IF NOT EXISTS config_precificacao_company_uq 
  ON public.config_precificacao (company_id);

-- ─── BLOCO 2: FIX RLS — Remove permissive policies, add tenant-filtered ones ───

-- == ficha_componentes ==
DROP POLICY IF EXISTS "perm_ficha_comp_select" ON public.ficha_componentes;
DROP POLICY IF EXISTS "perm_ficha_componentes_select" ON public.ficha_componentes;
DROP POLICY IF EXISTS "perm_ficha_comp_write" ON public.ficha_componentes;

CREATE POLICY "ficha_comp_select" ON public.ficha_componentes
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:pre-preparos:view','ficha:itens-prontos:view','ficha:produtos-finais:view',
      'ficha:analise:view','ficha:markup:view','system:global:manage'
    ])
  );

CREATE POLICY "ficha_comp_insert" ON public.ficha_componentes
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:pre-preparos:create','ficha:itens-prontos:create','ficha:produtos-finais:create',
      'system:global:manage'
    ])
  );

CREATE POLICY "ficha_comp_update" ON public.ficha_componentes
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:pre-preparos:edit','ficha:itens-prontos:edit','ficha:produtos-finais:edit',
      'system:global:manage'
    ])
  )
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "ficha_comp_delete" ON public.ficha_componentes
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:pre-preparos:delete','ficha:itens-prontos:delete','ficha:produtos-finais:delete',
      'system:global:manage'
    ])
  );

-- == ficha_componente_itens ==
DROP POLICY IF EXISTS "Authenticated can read ficha_componente_itens" ON public.ficha_componente_itens;
DROP POLICY IF EXISTS "perm_ficha_itens_select" ON public.ficha_componente_itens;
DROP POLICY IF EXISTS "perm_ficha_itens_write" ON public.ficha_componente_itens;

CREATE POLICY "ficha_itens_select" ON public.ficha_componente_itens
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:pre-preparos:view','ficha:itens-prontos:view','ficha:produtos-finais:view',
      'ficha:analise:view','ficha:markup:view','system:global:manage'
    ])
  );

CREATE POLICY "ficha_itens_insert" ON public.ficha_componente_itens
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:pre-preparos:edit','ficha:itens-prontos:edit','ficha:produtos-finais:edit',
      'system:global:manage'
    ])
  );

CREATE POLICY "ficha_itens_update" ON public.ficha_componente_itens
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:pre-preparos:edit','ficha:itens-prontos:edit','ficha:produtos-finais:edit',
      'system:global:manage'
    ])
  )
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "ficha_itens_delete" ON public.ficha_componente_itens
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:pre-preparos:edit','ficha:itens-prontos:edit','ficha:produtos-finais:edit',
      'system:global:manage'
    ])
  );

-- == canais_venda ==
DROP POLICY IF EXISTS "Authenticated can read canais_venda" ON public.canais_venda;
DROP POLICY IF EXISTS "perm_canais_venda_select" ON public.canais_venda;
DROP POLICY IF EXISTS "perm_canais_venda_write" ON public.canais_venda;

CREATE POLICY "canais_select" ON public.canais_venda
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:canais:view','ficha:markup:view','system:global:manage'
    ])
  );

CREATE POLICY "canais_insert" ON public.canais_venda
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:canais:manage','system:global:manage'])
  );

CREATE POLICY "canais_update" ON public.canais_venda
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:canais:manage','system:global:manage'])
  )
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "canais_delete" ON public.canais_venda
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:canais:manage','system:global:manage'])
  );

-- == precificacao_canal ==
DROP POLICY IF EXISTS "Authenticated can read precificacao_canal" ON public.precificacao_canal;
DROP POLICY IF EXISTS "perm_prec_canal_select" ON public.precificacao_canal;
DROP POLICY IF EXISTS "perm_prec_canal_write" ON public.precificacao_canal;

CREATE POLICY "prec_canal_select" ON public.precificacao_canal
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:markup:view','ficha:analise:view','system:global:manage'])
  );

CREATE POLICY "prec_canal_insert" ON public.precificacao_canal
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:markup:manage','system:global:manage'])
  );

CREATE POLICY "prec_canal_update" ON public.precificacao_canal
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:markup:manage','system:global:manage'])
  )
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "prec_canal_delete" ON public.precificacao_canal
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:markup:manage','system:global:manage'])
  );

-- == cenarios_simulacao ==
DROP POLICY IF EXISTS "Authenticated can read cenarios_simulacao" ON public.cenarios_simulacao;
DROP POLICY IF EXISTS "perm_cenarios_select" ON public.cenarios_simulacao;
DROP POLICY IF EXISTS "perm_cenarios_write" ON public.cenarios_simulacao;

CREATE POLICY "cenarios_select" ON public.cenarios_simulacao
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:analise:view','ficha:analise:simulate','system:global:manage'])
  );

CREATE POLICY "cenarios_insert" ON public.cenarios_simulacao
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:analise:simulate','system:global:manage'])
  );

CREATE POLICY "cenarios_update" ON public.cenarios_simulacao
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:analise:simulate','system:global:manage'])
  )
  WITH CHECK (company_id = get_current_company_id());

CREATE POLICY "cenarios_delete" ON public.cenarios_simulacao
  FOR DELETE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:analise:simulate','system:global:manage'])
  );

-- == config_precificacao ==
DROP POLICY IF EXISTS "Authenticated can read config_precificacao" ON public.config_precificacao;
DROP POLICY IF EXISTS "perm_config_prec_select" ON public.config_precificacao;
DROP POLICY IF EXISTS "perm_config_prec_write" ON public.config_precificacao;

CREATE POLICY "config_prec_select" ON public.config_precificacao
  FOR SELECT TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY[
      'ficha:markup:view','ficha:analise:view','system:global:manage'
    ])
  );

CREATE POLICY "config_prec_insert" ON public.config_precificacao
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:markup:manage','system:global:manage'])
  );

CREATE POLICY "config_prec_update" ON public.config_precificacao
  FOR UPDATE TO authenticated
  USING (
    company_id = get_current_company_id()
    AND has_any_permission(auth.uid(), ARRAY['ficha:markup:manage','system:global:manage'])
  )
  WITH CHECK (company_id = get_current_company_id());

-- ─── BLOCO 4: ATOMIC RPC for salvar_componente_itens ───
CREATE OR REPLACE FUNCTION public.ficha_salvar_componente_itens_atomic(
  _componente_pai_id uuid,
  _itens jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_parent_tipo text;
  v_child_tipo text;
  v_item jsonb;
  v_idx int := 0;
  v_custo_total numeric := 0;
  v_custo_unitario numeric := 0;
  v_rendimento numeric;
  v_perda numeric;
  v_rendimento_liq numeric;
  v_custo_indireto numeric;
BEGIN
  -- 1. Assert tenant (fail-closed)
  v_company_id := assert_tenant();

  -- 2. Lock parent component (prevent concurrent edits)
  SELECT tipo, rendimento, perda_estimada_percent, custo_indireto
  INTO v_parent_tipo, v_rendimento, v_perda, v_custo_indireto
  FROM ficha_componentes
  WHERE id = _componente_pai_id
    AND company_id = v_company_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_parent_tipo IS NULL THEN
    RAISE EXCEPTION 'Componente pai não encontrado ou não pertence ao tenant';
  END IF;

  -- 3. Validate hierarchy for each child component
  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens)
  LOOP
    IF v_item->>'componente_filho_id' IS NOT NULL AND v_item->>'componente_filho_id' != '' THEN
      SELECT tipo INTO v_child_tipo
      FROM ficha_componentes
      WHERE id = (v_item->>'componente_filho_id')::uuid
        AND company_id = v_company_id
        AND deleted_at IS NULL;

      IF v_child_tipo IS NULL THEN
        RAISE EXCEPTION 'Componente filho % não encontrado no tenant', v_item->>'componente_filho_id';
      END IF;

      IF v_parent_tipo = 'PRE_PREPARO' AND v_child_tipo != 'PRE_PREPARO' THEN
        RAISE EXCEPTION 'Pré-Preparo só aceita insumos e outros pré-preparos. "%" não permitido.', v_child_tipo;
      END IF;
      IF v_parent_tipo = 'ITEM_PRONTO' AND v_child_tipo != 'PRE_PREPARO' THEN
        RAISE EXCEPTION 'Item Pronto só aceita insumos, pré-preparos e salmão. "%" não permitido.', v_child_tipo;
      END IF;
      IF v_parent_tipo = 'PRODUTO_FINAL' AND v_child_tipo != 'ITEM_PRONTO' THEN
        RAISE EXCEPTION 'Produto Final só aceita itens prontos e insumos. "%" não permitido.', v_child_tipo;
      END IF;
    END IF;

    -- Block PRODUTO_FINAL from using salmon directly
    IF v_parent_tipo = 'PRODUTO_FINAL' AND (v_item->>'origem') = 'MODULO_SALMAO' THEN
      RAISE EXCEPTION 'Produto Final não pode usar salmão diretamente.';
    END IF;
  END LOOP;

  -- 4. Delete existing items (within tenant scope)
  DELETE FROM ficha_componente_itens
  WHERE componente_pai_id = _componente_pai_id
    AND company_id = v_company_id;

  -- 5. Insert new items (with explicit company_id)
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(_itens)
  LOOP
    INSERT INTO ficha_componente_itens (
      componente_pai_id, componente_filho_id, produto_id,
      quantidade, unidade, custo_snapshot, ordem, origem,
      unidade_original, quantidade_original, company_id
    ) VALUES (
      _componente_pai_id,
      NULLIF(v_item->>'componente_filho_id', '')::uuid,
      NULLIF(v_item->>'produto_id', '')::uuid,
      COALESCE((v_item->>'quantidade')::numeric, 0),
      COALESCE(v_item->>'unidade', 'un'),
      COALESCE((v_item->>'custo_snapshot')::numeric, 0),
      v_idx,
      COALESCE(v_item->>'origem', 'ESTOQUE_GERAL'),
      COALESCE(v_item->>'unidade_original', ''),
      COALESCE((v_item->>'quantidade_original')::numeric, 0),
      v_company_id
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- 6. Simple cost recalculation (sum of snapshots + indirect)
  -- Full recursive calc is done by the EF after this returns
  SELECT COALESCE(SUM(quantidade * custo_snapshot), 0)
  INTO v_custo_total
  FROM ficha_componente_itens
  WHERE componente_pai_id = _componente_pai_id
    AND company_id = v_company_id;

  v_custo_total := v_custo_total + COALESCE(v_custo_indireto, 0);
  v_rendimento_liq := COALESCE(v_rendimento, 1) * (1 - COALESCE(v_perda, 0) / 100);
  IF v_rendimento_liq > 0 THEN
    v_custo_unitario := v_custo_total / v_rendimento_liq;
  ELSE
    v_custo_unitario := v_custo_total;
  END IF;

  -- 7. Update parent costs
  UPDATE ficha_componentes
  SET custo_total_calculado = ROUND(v_custo_total, 2),
      custo_unitario_calculado = ROUND(v_custo_unitario, 2),
      updated_at = now()
  WHERE id = _componente_pai_id
    AND company_id = v_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'custoTotal', ROUND(v_custo_total, 2),
    'custoUnitario', ROUND(v_custo_unitario, 2),
    'itensCount', v_idx
  );
END;
$$;
