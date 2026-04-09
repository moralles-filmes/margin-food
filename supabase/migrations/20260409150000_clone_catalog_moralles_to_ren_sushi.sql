-- =============================================================================
-- Clone Catálogo: Moralles (MarginPro Oficial) → REN SUSHI
--
-- Copia categorias, locais de estoque e produtos da Moralles para a REN SUSHI.
-- - Saldo atual resetado para 0 (estoque físico não se transfere)
-- - is_salmon_raw_linked resetado para false
-- - Idempotente: ON CONFLICT DO NOTHING em categorias e locais
-- - Produtos: insere todos os ativos (sem proteção contra duplicata por nome,
--   pois não há unique constraint em produtos por nome+company)
-- =============================================================================

-- Desabilitar triggers que exigem auth.uid() (assert_tenant)
-- durante a migração de dados (roda como postgres superuser, sem sessão auth)
ALTER TABLE public.stock_categories DISABLE TRIGGER USER;
ALTER TABLE public.stock_locations  DISABLE TRIGGER USER;
ALTER TABLE public.produtos         DISABLE TRIGGER USER;

DO $$
DECLARE
  v_moralles_id  uuid;
  v_ren_sushi_id uuid;
  v_cat_count    int;
  v_loc_count    int;
  v_prod_count   int;
BEGIN

  -- 1. Localizar empresa Moralles (MarginPro Oficial)
  SELECT id INTO v_moralles_id
  FROM public.companies
  WHERE LOWER(nome) LIKE '%marginpro%' OR LOWER(nome) LIKE '%moralles%'
  ORDER BY created_at
  LIMIT 1;

  IF v_moralles_id IS NULL THEN
    RAISE EXCEPTION 'Empresa Moralles não encontrada. Verifique o nome na tabela companies.';
  END IF;

  RAISE NOTICE 'Moralles company_id: %', v_moralles_id;

  -- 2. Localizar REN SUSHI (deve já existir, criada via Painel Admin)
  --    Se não existir, cria automaticamente
  SELECT id INTO v_ren_sushi_id
  FROM public.companies
  WHERE LOWER(nome) LIKE '%ren sushi%' OR LOWER(nome) LIKE '%rensushi%'
  LIMIT 1;

  IF v_ren_sushi_id IS NULL THEN
    INSERT INTO public.companies (nome, ativo)
    VALUES ('Ren Sushi', true)
    RETURNING id INTO v_ren_sushi_id;
    RAISE NOTICE 'Empresa REN SUSHI criada com id: %', v_ren_sushi_id;
  ELSE
    RAISE NOTICE 'Empresa REN SUSHI encontrada: %', v_ren_sushi_id;
  END IF;

  -- 3. Copiar stock_categories
  INSERT INTO public.stock_categories (name, description, is_active, sort_order, company_id)
  SELECT name, description, is_active, sort_order, v_ren_sushi_id
  FROM public.stock_categories
  WHERE company_id = v_moralles_id AND is_active = true
  ON CONFLICT (company_id, lower(name)) WHERE is_active = true DO NOTHING;

  GET DIAGNOSTICS v_cat_count = ROW_COUNT;
  RAISE NOTICE 'Categorias inseridas: %', v_cat_count;

  -- 4. Copiar stock_locations
  INSERT INTO public.stock_locations (name, type, notes, is_active, company_id)
  SELECT name, type, notes, is_active, v_ren_sushi_id
  FROM public.stock_locations
  WHERE company_id = v_moralles_id AND is_active = true
  ON CONFLICT (company_id, lower(name)) WHERE is_active = true DO NOTHING;

  GET DIAGNOSTICS v_loc_count = ROW_COUNT;
  RAISE NOTICE 'Locais de estoque inseridos: %', v_loc_count;

  -- 5. Copiar produtos (apenas se ainda não foram copiados — evita duplicatas)
  --    Condição: produto com mesmo nome ainda não existe na REN SUSHI
  INSERT INTO public.produtos (
    nome_produto, sku, categoria, unidade_medida, conversoes,
    custo_padrao, fornecedores_preferenciais, lead_time_dias,
    estoque_minimo, estoque_ideal, local_estoque, ativo,
    observacoes, conta_no_cmv, is_salmon_raw_linked,
    saldo_atual, company_id
  )
  SELECT
    p.nome_produto,
    p.sku,
    p.categoria,
    p.unidade_medida,
    p.conversoes,
    p.custo_padrao,
    p.fornecedores_preferenciais,
    p.lead_time_dias,
    p.estoque_minimo,
    p.estoque_ideal,
    p.local_estoque,
    p.ativo,
    p.observacoes,
    p.conta_no_cmv,
    false,  -- is_salmon_raw_linked: resetar (vinculação específica por empresa)
    0,      -- saldo_atual: estoque zerado na nova empresa
    v_ren_sushi_id
  FROM public.produtos p
  WHERE p.company_id = v_moralles_id
    AND p.ativo = true
    -- Evitar duplicatas se migração rodar mais de uma vez
    AND NOT EXISTS (
      SELECT 1 FROM public.produtos p2
      WHERE p2.company_id = v_ren_sushi_id
        AND LOWER(p2.nome_produto) = LOWER(p.nome_produto)
    );

  GET DIAGNOSTICS v_prod_count = ROW_COUNT;
  RAISE NOTICE 'Produtos inseridos: %', v_prod_count;

  RAISE NOTICE '=== Clone concluído ===';
  RAISE NOTICE 'Moralles → REN SUSHI: % categorias, % locais, % produtos', v_cat_count, v_loc_count, v_prod_count;

END;
$$;

-- Reabilitar triggers
ALTER TABLE public.stock_categories ENABLE TRIGGER USER;
ALTER TABLE public.stock_locations  ENABLE TRIGGER USER;
ALTER TABLE public.produtos         ENABLE TRIGGER USER;
