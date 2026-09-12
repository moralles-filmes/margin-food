-- ── 1. RLS de fin_categorias/fin_centros_custo usava chaves fantasmas ──
-- financeiro:categorias:* e financeiro:centros-custo:* NUNCA existiram em
-- src/permissions/registry.ts (o único submódulo real é "Cadastros Base",
-- financeiro:cadastros:*, usado por CadastroBaseTree.tsx) — não aparecem em
-- Admin -> Permissões e nenhum role_permissions/user_permissions concede
-- essas chaves. Na prática a RLS só era satisfeita por finance:read/
-- finance:manage/system:global:manage. Caso real: juniorsaori01@gmail.com em
-- Royal Parma Bauru tinha ALLOW explícito em financeiro:cadastros:view/create
-- (a chave granular real) mas DENY em finance:read/finance:manage — a UI
-- liberava a tela (useCan('financeiro:cadastros:view') = true) e o botão de
-- criar, mas a RLS negava tudo: lista sempre vazia no SELECT e "new row
-- violates row-level security policy" no INSERT manual. Alinha as duas
-- tabelas à chave real do submódulo, mantendo finance:read/finance:manage/
-- system:global:manage como fallback (não quebra admin/diretor/gerente_geral,
-- que já têm as duas).
ALTER POLICY tenant_select_fin_categorias ON public.fin_categorias
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:view', 'finance:read', 'system:global:manage']))
  );

ALTER POLICY tenant_insert_fin_categorias ON public.fin_categorias
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:create', 'finance:manage', 'system:global:manage']))
  );

ALTER POLICY tenant_update_fin_categorias ON public.fin_categorias
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:edit', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
  );

ALTER POLICY tenant_delete_fin_categorias ON public.fin_categorias
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:delete', 'finance:manage', 'system:global:manage']))
  );

-- Mesmo padrão de bug, mesma tela (CadastroBaseTree carrega fin_categorias e
-- fin_centros_custo juntos sob um único gate financeiro:cadastros:*).
ALTER POLICY tenant_select_fin_centros_custo ON public.fin_centros_custo
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:view', 'finance:read', 'system:global:manage']))
  );

ALTER POLICY tenant_insert_fin_centros_custo ON public.fin_centros_custo
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:create', 'finance:manage', 'system:global:manage']))
  );

ALTER POLICY tenant_update_fin_centros_custo ON public.fin_centros_custo
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:edit', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
  );

ALTER POLICY tenant_delete_fin_centros_custo ON public.fin_centros_custo
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:cadastros:delete', 'finance:manage', 'system:global:manage']))
  );

-- ── 2. seed_default_categories(): falso-positivo de "já existe" ──
-- A checagem original contava qualquer linha com system_key IS NULL como
-- prova de plano de contas próprio já cadastrado. RECEITAS/DESPESAS NÃO
-- OPERACIONAIS são raiz de sistema (system_key preenchido), mas os filhos
-- "Descontos Obtidos"/"Descontos Concedidos" nascem com system_key NULL
-- (fin_get_categoria_desconto_baixa/_concedido) — bastava alguém já ter feito
-- 1 ajuste de conciliação para o botão "Modelo Padrão" ficar permanentemente
-- bloqueado com "Categories already exist for this company", mesmo a empresa
-- nunca tendo cadastrado nenhuma categoria de verdade (caso real: Royal Parma
-- Bauru). Exclui a subárvore de sistema (raiz + descendentes) da contagem.
-- Também garante as raízes NÃO OPERACIONAIS ao final, no mesmo padrão fixo
-- das demais empresas (Ren Sushi/Moralles), em vez de depender de um ajuste
-- de pagamento acontecer em algum momento para elas passarem a existir.
CREATE OR REPLACE FUNCTION public.seed_default_categories()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
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

  -- Garante as raízes fixas NÃO OPERACIONAIS (idempotente, mesmo padrão do
  -- resto do sistema) em vez de deixá-las dependentes de um ajuste de
  -- conciliação futuro.
  PERFORM public.fin_get_categoria_desconto_baixa(_company_id);
  PERFORM public.fin_get_categoria_desconto_concedido(_company_id);

  RETURN jsonb_build_object('status', 'ok', 'quantidade_inserida', _inserted);
END;
$function$;

-- ── 3. onboard_new_company(): garante as raízes NÃO OPERACIONAIS desde o dia 1 ──
-- Antes, RECEITAS/DESPESAS NÃO OPERACIONAIS só nasciam de forma reativa (1º
-- ajuste de pagamento com divergência). Uma empresa nova que ainda não
-- processou nenhuma conciliação ficava sem essa estrutura fixa, quebrando a
-- expectativa de "mesmo padrão para todas as lojas, novas ou existentes".
CREATE OR REPLACE FUNCTION public.onboard_new_company(p_company_name text, p_cnpj text DEFAULT NULL::text, p_admin_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_new_company_id uuid;
  v_result jsonb;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  IF NOT has_permission(v_caller_uid, 'system:global:manage') THEN
    RAISE EXCEPTION '403: Sem permissão (system:global:manage)';
  END IF;

  IF p_company_name IS NULL OR trim(p_company_name) = '' THEN
    RAISE EXCEPTION '400: Nome da empresa é obrigatório';
  END IF;

  IF p_cnpj IS NOT NULL AND trim(p_cnpj) <> '' THEN
    IF EXISTS (SELECT 1 FROM companies WHERE cnpj = trim(p_cnpj)) THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado';
    END IF;
  END IF;

  INSERT INTO companies (nome, cnpj, ativo)
  VALUES (trim(p_company_name), NULLIF(trim(p_cnpj), ''), true)
  RETURNING id INTO v_new_company_id;

  INSERT INTO public.turnos (company_id, nome, hora_inicio, hora_fim, ativo)
  VALUES
    (v_new_company_id, 'Manhã', '07:00:00'::time, '15:00:00'::time, true),
    (v_new_company_id, 'Tarde', '15:00:00'::time, '23:00:00'::time, true),
    (v_new_company_id, 'Noite', '23:00:00'::time, '07:00:00'::time, true),
    (v_new_company_id, 'Geral', '00:00:00'::time, '23:59:59'::time, true);

  -- Plano de contas fixo: raízes NÃO OPERACIONAIS sempre presentes, mesmo
  -- padrão de Ren Sushi/Moralles, desde a criação da empresa.
  PERFORM public.fin_get_categoria_desconto_baixa(v_new_company_id);
  PERFORM public.fin_get_categoria_desconto_concedido(v_new_company_id);

  INSERT INTO public.company_memberships(user_id, company_id) VALUES(v_caller_uid, v_new_company_id)
    ON CONFLICT(user_id, company_id) DO UPDATE SET status='active', updated_at=now();

  INSERT INTO user_roles (user_id, company_id, role)
  VALUES (v_caller_uid, v_new_company_id, 'admin')
  ON CONFLICT (user_id, company_id, role) DO NOTHING;

  IF p_admin_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_user_id) THEN
      RAISE EXCEPTION '404: Usuário admin não encontrado';
    END IF;

    INSERT INTO public.company_memberships(user_id,company_id) VALUES(p_admin_user_id,v_new_company_id) ON CONFLICT(user_id,company_id) DO UPDATE SET status='active',updated_at=now();

    INSERT INTO user_roles (user_id, company_id, role)
    VALUES (p_admin_user_id, v_new_company_id, 'admin')
    ON CONFLICT (user_id, company_id, role) DO NOTHING;
  END IF;

  INSERT INTO job_roles (company_id, nome, descricao)
  VALUES
    (v_new_company_id, 'Gerente Geral', 'Responsável geral pela operação'),
    (v_new_company_id, 'Chef de Cozinha', 'Responsável pela cozinha e fichas técnicas'),
    (v_new_company_id, 'Estoquista', 'Responsável pelo controle de estoque'),
    (v_new_company_id, 'Comprador', 'Responsável pelas compras e fornecedores'),
    (v_new_company_id, 'Financeiro', 'Responsável pelo módulo financeiro'),
    (v_new_company_id, 'Operador', 'Operação geral do dia a dia')
  ON CONFLICT (company_id, nome) DO NOTHING;

  INSERT INTO admin_actions_log (actor_user_id, company_id, action, details)
  VALUES (
    v_caller_uid,
    v_new_company_id,
    'COMPANY_CREATED',
    jsonb_build_object(
      'company_name', trim(p_company_name),
      'cnpj', p_cnpj,
      'admin_user_id', p_admin_user_id
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'company_id', v_new_company_id,
    'company_name', trim(p_company_name)
  );

  RETURN v_result;
END;
$function$;
