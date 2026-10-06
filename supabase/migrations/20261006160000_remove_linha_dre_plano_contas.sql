-- Remove a Linha DRE, o Plano de Contas e o modelo de linhas da DRE: nenhum
-- relatório os lia. DRE e DFC são montados só pela árvore de fin_categorias.
--   * fin_categorias.linha_dre: gravada pelo Cadastro Base, devolvida por
--     get_fin_dre_summary/get_fin_dfc_summary/get_fin_presentation_category_metadata
--     e não usada por nenhuma tela.
--   * fin_plano_contas: nenhum lançamento, CP, CR ou categoria aponta para ela
--     (plano_contas_id vazio nas quatro tabelas).
--   * fin_dre_linhas: 12 linhas-modelo na empresa reservada do sistema, sem
--     leitor no banco nem no app.
--   * _guarded_update_categoria: só era chamada pelo CategoriasFinSection,
--     removido do app (o Cadastro Base grava direto, com lock por updated_at).
-- Aplicar só depois do deploy do frontend que parou de ler essas colunas
-- (PR #147); antes disso, a tela publicada ainda as selecionava.

-- PREFLIGHT: aborta se alguém passou a usar o Plano de Contas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos WHERE plano_contas_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.fin_contas_pagar WHERE plano_contas_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.fin_contas_receber WHERE plano_contas_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.fin_categorias WHERE plano_contas_id IS NOT NULL) THEN
    RAISE EXCEPTION 'PREFLIGHT: plano_contas_id em uso; a remoção do Plano de Contas precisa de revisão';
  END IF;
END $$;

-- 1. RPCs de relatório sem linha_dre (mesmas assinaturas: grants preservados).

CREATE OR REPLACE FUNCTION public.get_fin_dre_summary(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:dre:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  WITH effective_values AS (
    -- 1. Lançamentos REALIZADO/CONCILIADO com rateio
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND l.data_competencia BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 2. Lançamentos REALIZADO/CONCILIADO sem rateio
    SELECT l.categoria_id, l.valor
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND l.data_competencia BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = l.id AND r.company_id = v_company_id
      )
    UNION ALL
    -- 3. Contas a PAGAR em aberto com rateio (split sob o id da CP)
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_contas_pagar cp ON cp.id = r.lancamento_id AND cp.company_id = v_company_id
    WHERE cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 4. Contas a PAGAR em aberto sem rateio
    SELECT cp.categoria_id, cp.valor
    FROM fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = cp.id AND r.company_id = v_company_id
      )
    UNION ALL
    -- 5. Contas a RECEBER em aberto com rateio (split sob o id da CR)
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_contas_receber cr ON cr.id = r.lancamento_id AND cr.company_id = v_company_id
    WHERE cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 6. Contas a RECEBER em aberto sem rateio
    SELECT cr.categoria_id, cr.valor
    FROM fin_contas_receber cr
    WHERE cr.company_id = v_company_id
      AND cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = cr.id AND r.company_id = v_company_id
      )
  ),
  por_categoria AS (
    SELECT
      COALESCE(ev.categoria_id, '00000000-0000-0000-0000-000000000000')::text as cat_id,
      SUM(ev.valor) as total
    FROM effective_values ev
    GROUP BY ev.categoria_id
  )
  SELECT jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
    'categorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'codigo', c.codigo, 'tipo', c.tipo,
        'parent_id', c.parent_id, 'ordem', c.ordem, 'ativo', c.ativo,
        'grupo', c.grupo,
        'centro_custo_padrao_id', c.centro_custo_padrao_id
      ) ORDER BY c.ordem, c.codigo)
      FROM fin_categorias c
      WHERE c.company_id = v_company_id AND c.ativo = true
    ), '[]'::jsonb),
    'valores_por_categoria', COALESCE((
      SELECT jsonb_object_agg(pc.cat_id, pc.total)
      FROM por_categoria pc
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_fin_dfc_summary(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_saldo_inicial numeric;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();
  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fluxo:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial
  FROM fin_contas WHERE company_id = v_company_id AND ativo = true;
  v_saldo_inicial := v_saldo_inicial + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE -valor END)
    FROM fin_lancamentos
    WHERE company_id = v_company_id AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_pagamento, (conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, data_competencia) < p_inicio
  ), 0);

  WITH effective_values AS (
    SELECT allocation.categoria_id, allocation.valor, allocation.tipo
    FROM public._fin_dfc_effective_allocations(
      v_company_id,
      p_inicio,
      p_fim
    ) AS allocation
  ), por_categoria AS (
    SELECT CASE
      WHEN categoria_id IS NOT NULL THEN categoria_id::text
      WHEN tipo = 'RECEITA' THEN '00000000-0000-0000-0000-000000000101'
      ELSE '00000000-0000-0000-0000-000000000102'
    END cat_id, SUM(valor) total
    FROM effective_values GROUP BY 1
  ), categorias_resultado AS (
    SELECT c.id, c.nome, c.codigo, c.tipo, c.parent_id, c.ordem, c.ativo,
      c.grupo, c.centro_custo_padrao_id, c.system_key,
      c.excluir_dos_totais, c.updated_at
    FROM fin_categorias c WHERE c.company_id = v_company_id AND c.ativo = true
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000101'::uuid, 'Sem categoria — Receitas', 'S/C-R',
      'receita', NULL::uuid, 9980, true, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000101')
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000102'::uuid, 'Sem categoria — Despesas', 'S/C-D',
      'despesa', NULL::uuid, 9981, true, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000102')
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_saldo_inicial,
    'categorias', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.ordem, c.codigo) FROM categorias_resultado c), '[]'::jsonb),
    'valores_por_categoria', COALESCE((SELECT jsonb_object_agg(cat_id, total) FROM por_categoria), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_fin_presentation_category_metadata()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := public.assert_tenant();

  IF NOT (SELECT public.has_permission(auth.uid(), 'financeiro:relatorio-socios:view')) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      category.id::text,
      jsonb_build_object(
        'group', NULLIF(BTRIM(category.grupo), '')
      )
      ORDER BY category.id::text
    ),
    '{}'::jsonb
  )
  INTO v_result
  FROM public.fin_categorias category
  WHERE category.company_id = v_company_id;

  RETURN v_result;
END;
$function$;

-- 2. Modelo Padrão sem linha_dre (mesma estrutura e mesmos grupos).

CREATE OR REPLACE FUNCTION public.seed_default_categories()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  _company_id uuid;
  _user_id uuid;
  _count int;
  _inserted int := 0;

  -- helper to insert a category and return its id
  _root_id uuid;
  _l1_id uuid;
  _l2_id uuid;
BEGIN
  -- Resolve caller
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _company_id := public.assert_tenant();

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'No company found for user';
  END IF;

  -- Check permission
  IF NOT public.has_permission(_user_id, 'financeiro:cadastros:create') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Check if categories already exist (excluindo a subárvore de sistema)
  WITH RECURSIVE system_subtree AS (
    SELECT id FROM public.fin_categorias
    WHERE company_id = _company_id AND system_key IS NOT NULL
    UNION ALL
    SELECT c.id
    FROM public.fin_categorias c
    JOIN system_subtree s ON c.parent_id = s.id
  )
  SELECT count(*) INTO _count
  FROM public.fin_categorias
  WHERE company_id = _company_id
    AND ativo = true
    AND system_key IS NULL
    AND id NOT IN (SELECT id FROM system_subtree);

  IF _count > 0 THEN
    RAISE EXCEPTION 'Categories already exist for this company';
  END IF;

  -- === 1. RECEITAS ===
  INSERT INTO fin_categorias (nome, codigo, tipo, parent_id, ordem, company_id, created_by)
  VALUES ('RECEITAS', '1', 'receita', NULL, 10, _company_id, _user_id) RETURNING id INTO _root_id;
  _inserted := _inserted + 1;

  -- 1.01 Receita Operacional
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Receita Operacional', '1.01', 'receita', 'receita_operacional', _root_id, 10, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;

  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Vendas Balcão', '1.01.01', 'receita', 'receita_operacional', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Delivery', '1.01.02', 'receita', 'receita_operacional', _l1_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Eventos', '1.01.03', 'receita', 'receita_operacional', _l1_id, 30, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- 1.02 Outras Receitas
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Outras Receitas', '1.02', 'receita', 'outras_receitas', _root_id, 20, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Receitas Financeiras', '1.02.01', 'receita', 'receita_financeira', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- === 2. DEDUÇÕES E CUSTOS ===
  INSERT INTO fin_categorias (nome, codigo, tipo, parent_id, ordem, company_id, created_by)
  VALUES ('DEDUÇÕES E CUSTOS', '2', 'despesa', NULL, 20, _company_id, _user_id) RETURNING id INTO _root_id;
  _inserted := _inserted + 1;

  -- 2.01 CMV
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('CMV (Custo da Mercadoria Vendida)', '2.01', 'despesa', 'cmv', _root_id, 10, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Alimentos', '2.01.01', 'despesa', 'cmv', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Bebidas', '2.01.02', 'despesa', 'cmv', _l1_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Embalagens', '2.01.03', 'despesa', 'cmv', _l1_id, 30, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- 2.02 Impostos
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Impostos e Taxas sobre Vendas', '2.02', 'despesa', 'impostos', _root_id, 20, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Impostos Federais', '2.02.01', 'despesa', 'impostos', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Taxas de Cartão / Marketplace', '2.02.02', 'despesa', 'taxa', _l1_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- === 3. DESPESAS OPERACIONAIS ===
  INSERT INTO fin_categorias (nome, codigo, tipo, parent_id, ordem, company_id, created_by)
  VALUES ('DESPESAS OPERACIONAIS', '3', 'despesa', NULL, 30, _company_id, _user_id) RETURNING id INTO _root_id;
  _inserted := _inserted + 1;

  -- 3.01 Pessoal
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Pessoal', '3.01', 'despesa', 'pessoal', _root_id, 10, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Salários e Encargos', '3.01.01', 'despesa', 'pessoal', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Benefícios', '3.01.02', 'despesa', 'pessoal', _l1_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Pró-labore', '3.01.03', 'despesa', 'pessoal', _l1_id, 30, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- 3.02 Ocupação
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Ocupação', '3.02', 'despesa', 'ocupacao', _root_id, 20, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Aluguel', '3.02.01', 'despesa', 'ocupacao', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Condomínio', '3.02.02', 'despesa', 'ocupacao', _l1_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('IPTU', '3.02.03', 'despesa', 'ocupacao', _l1_id, 30, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- 3.03 Utilidades
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Utilidades', '3.03', 'despesa', 'utilidades', _root_id, 30, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Energia Elétrica', '3.03.01', 'despesa', 'utilidades', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Água', '3.03.02', 'despesa', 'utilidades', _l1_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Gás', '3.03.03', 'despesa', 'utilidades', _l1_id, 30, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Internet / Telefone', '3.03.04', 'despesa', 'utilidades', _l1_id, 40, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- 3.04 Vendas e Marketing
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Vendas e Marketing', '3.04', 'despesa', 'marketing', _root_id, 40, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Marketing Digital', '3.04.01', 'despesa', 'marketing', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Comissões', '3.04.02', 'despesa', 'marketing', _l1_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Material Promocional', '3.04.03', 'despesa', 'marketing', _l1_id, 30, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- 3.05 Administrativas
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Administrativas', '3.05', 'despesa', 'administrativa', _root_id, 50, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Contabilidade', '3.05.01', 'despesa', 'administrativa', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Sistemas / Software', '3.05.02', 'despesa', 'administrativa', _l1_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Material de Escritório', '3.05.03', 'despesa', 'administrativa', _l1_id, 30, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- 3.06 Manutenção
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Manutenção', '3.06', 'despesa', 'manutencao', _root_id, 60, _company_id, _user_id) RETURNING id INTO _l1_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Manutenção Predial', '3.06.01', 'despesa', 'manutencao', _l1_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Manutenção de Equipamentos', '3.06.02', 'despesa', 'manutencao', _l1_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- === 4. DESPESAS FINANCEIRAS ===
  INSERT INTO fin_categorias (nome, codigo, tipo, parent_id, ordem, company_id, created_by)
  VALUES ('DESPESAS FINANCEIRAS', '4', 'despesa', NULL, 40, _company_id, _user_id) RETURNING id INTO _root_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Juros e Multas', '4.01', 'despesa', 'financeira', _root_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Tarifas Bancárias', '4.02', 'despesa', 'financeira', _root_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- === 5. INVESTIMENTOS ===
  INSERT INTO fin_categorias (nome, codigo, tipo, parent_id, ordem, company_id, created_by)
  VALUES ('INVESTIMENTOS', '5', 'despesa', NULL, 50, _company_id, _user_id) RETURNING id INTO _root_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Equipamentos', '5.01', 'despesa', 'investimento', _root_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Reformas', '5.02', 'despesa', 'investimento', _root_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- === 6. FINANCIAMENTOS ===
  INSERT INTO fin_categorias (nome, codigo, tipo, parent_id, ordem, company_id, created_by)
  VALUES ('FINANCIAMENTOS', '6', 'despesa', NULL, 60, _company_id, _user_id) RETURNING id INTO _root_id;
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Empréstimos', '6.01', 'despesa', 'empréstimo', _root_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Aportes de Sócios', '6.02', 'receita', 'aporte', _root_id, 20, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, parent_id, ordem, company_id, created_by)
  VALUES ('Distribuição de Lucros', '6.03', 'despesa', 'dividendos', _root_id, 30, _company_id, _user_id);
  _inserted := _inserted + 1;

  -- Garante as raízes fixas NÃO OPERACIONAIS (idempotente, mesmo padrão do
  -- resto do sistema) em vez de deixá-las dependentes de um ajuste de
  -- conciliação futuro.
  PERFORM public.fin_get_categoria_desconto_baixa(_company_id);
  PERFORM public.fin_get_categoria_desconto_concedido(_company_id);

  RETURN jsonb_build_object('status', 'ok', 'quantidade_inserida', _inserted);
END;
$function$;

-- 3. RPCs sem uso.
DROP FUNCTION IF EXISTS public._guarded_update_categoria(uuid, text, text, text, text, uuid, timestamptz);
DROP FUNCTION IF EXISTS public._guarded_update_plano_contas(uuid, text, text, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public._guarded_delete_plano_contas(uuid);

-- 4. Colunas e tabelas (as FKs para fin_plano_contas saem com as colunas).
ALTER TABLE public.fin_categorias DROP COLUMN IF EXISTS linha_dre, DROP COLUMN IF EXISTS plano_contas_id;
ALTER TABLE public.fin_lancamentos DROP COLUMN IF EXISTS plano_contas_id;
ALTER TABLE public.fin_contas_pagar DROP COLUMN IF EXISTS plano_contas_id;
ALTER TABLE public.fin_contas_receber DROP COLUMN IF EXISTS plano_contas_id;
DROP TABLE IF EXISTS public.fin_plano_contas;
DROP TABLE IF EXISTS public.fin_dre_linhas;

-- PÓS-VALIDAÇÃO: nenhuma função pode continuar citando o que saiu (PL/pgSQL
-- só resolve colunas na primeira execução; o erro apareceria em produção).
DO $$
DECLARE
  v_funcoes text;
BEGIN
  SELECT string_agg(n.nspname || '.' || p.proname, ', ')
  INTO v_funcoes
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND (p.prosrc ILIKE '%linha_dre%' OR p.prosrc ILIKE '%plano_contas%' OR p.prosrc ILIKE '%fin_dre_linhas%');

  IF v_funcoes IS NOT NULL THEN
    RAISE EXCEPTION 'POS-VALIDACAO: funções ainda citam Linha DRE/Plano de Contas: %', v_funcoes;
  END IF;
END $$;
