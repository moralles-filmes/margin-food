
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT company_id INTO _company_id
  FROM public.profiles
  WHERE id = _user_id;

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'No company found for user';
  END IF;

  -- Check permission
  IF NOT public.has_permission(_user_id, 'financeiro:cadastros:create') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Check if categories already exist
  SELECT count(*) INTO _count
  FROM public.fin_categorias
  WHERE company_id = _company_id AND ativo = true;

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
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('CMV (Custo da Mercadoria Vendida)', '2.01', 'despesa', 'cmv', 'CMV', _root_id, 10, _company_id, _user_id) RETURNING id INTO _l1_id;
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
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('Impostos e Taxas sobre Vendas', '2.02', 'despesa', 'impostos', 'Deduções', _root_id, 20, _company_id, _user_id) RETURNING id INTO _l1_id;
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
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('Pessoal', '3.01', 'despesa', 'pessoal', 'Despesas Operacionais', _root_id, 10, _company_id, _user_id) RETURNING id INTO _l1_id;
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
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('Ocupação', '3.02', 'despesa', 'ocupacao', 'Despesas Operacionais', _root_id, 20, _company_id, _user_id) RETURNING id INTO _l1_id;
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
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('Utilidades', '3.03', 'despesa', 'utilidades', 'Despesas Operacionais', _root_id, 30, _company_id, _user_id) RETURNING id INTO _l1_id;
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
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('Vendas e Marketing', '3.04', 'despesa', 'marketing', 'Despesas Operacionais', _root_id, 40, _company_id, _user_id) RETURNING id INTO _l1_id;
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
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('Administrativas', '3.05', 'despesa', 'administrativa', 'Despesas Operacionais', _root_id, 50, _company_id, _user_id) RETURNING id INTO _l1_id;
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
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('Manutenção', '3.06', 'despesa', 'manutencao', 'Despesas Operacionais', _root_id, 60, _company_id, _user_id) RETURNING id INTO _l1_id;
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
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('Juros e Multas', '4.01', 'despesa', 'financeira', 'Despesas Financeiras', _root_id, 10, _company_id, _user_id);
  _inserted := _inserted + 1;
  INSERT INTO fin_categorias (nome, codigo, tipo, grupo, linha_dre, parent_id, ordem, company_id, created_by)
  VALUES ('Tarifas Bancárias', '4.02', 'despesa', 'financeira', 'Despesas Financeiras', _root_id, 20, _company_id, _user_id);
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

  RETURN jsonb_build_object('status', 'ok', 'quantidade_inserida', _inserted);
END;
$$;
