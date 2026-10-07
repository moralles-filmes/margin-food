-- ── Lacunas de leitura/gravação de cadastros, lote 2 (mesma família do 20261007120000) ──
-- A) produtos: Compras, Ficha Técnica e Inventário Rápido montam a lista de
--    itens a partir de produtos ativos, mas nenhuma policy aceitava as chaves
--    dessas telas — seletor vazio, sem erro (não dava para montar pedido,
--    incluir insumo na ficha nem contar item).
-- B) colaboradores do RH: as sub-abas fora do Prontuário só recebiam o próprio
--    registro (a RLS de rh_colaboradores aceita só rh:prontuario:*). Uma policy
--    de lookup exporia salário e CPF, então a lista vem por RPC com colunas
--    mascaradas por chave; a RLS da tabela não muda.
-- C) parâmetros do Salmão: nenhuma unidade real conseguia gravar — a escrita
--    exigia salmon:dashboard:edit, que não existe no registry, e o front só
--    fazia UPDATE de linha existente (a única linha da tabela é da empresa
--    placeholder). Passa a gravar por RPC, com upsert por unidade.
-- D) chave legada: o banco não expande LEGACY_PERMISSION_MAP (só o useCan do
--    front expande), então todo gate leva também a legada que abre a mesma tela
--    — inclusive os de suppliers/salmon_config_select do 20261007120000.

-- ── A) produtos ──
-- Decisão do usuário: essas telas podem ver custo (a linha inteira trafega).
-- Planejamento fica de fora: só usa produtos junto de movimentacoes_estoque, e
-- quem lê movimentações já lê produtos. Nunca chave operacional:* aqui (ver
-- CLAUDE.md, módulo operacional).
CREATE POLICY operational_active_lookup ON public.produtos
FOR SELECT TO authenticated USING (
  ativo AND company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'compras:pedidos:view',
      'compras:cotacao:view',
      'compras:calendario:view',
      'compras:ranking:view',
      'ficha:pre-preparos:view',
      'ficha:itens-prontos:view',
      'ficha:produtos-finais:view',
      'inventario:rapido:view',
      'purchases:read', 'purchases:market:read', 'compras:read',
      'recipes:read', 'ficha:read',
      'inventory:read'
    ]::text[]))
);

-- ── B) colaboradores do RH ──
-- CPF/telefone/e-mail só com Prontuário; salário, valor-hora e adicional
-- noturno só com Prontuário, Folha, Custos ou Dashboard. O próprio registro
-- vem sempre completo, como na policy rh_colaboradores_select_own. Mural fica
-- fora da lista: não usa colaboradores e costuma ir para o quadro inteiro.
-- Quem grava no cadastro (rh_colaboradores_update exige rh:prontuario:manage)
-- sempre recebe a linha completa, então salvar a edição não apaga campo oculto.
-- remuneracao_visivel diz à tela se o valor nulo é "oculto" ou "não informado"
-- (Escalas não grava custo projetado calculado sobre remuneração oculta).
CREATE OR REPLACE FUNCTION public.rh_listar_colaboradores(p_incluir_inativos boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nome text,
  cpf text,
  telefone text,
  email text,
  cargo text,
  funcao text,
  setor text,
  data_admissao date,
  tipo_contrato text,
  status text,
  carga_horaria_semanal numeric,
  salario numeric,
  valor_hora numeric,
  created_at timestamptz,
  adicional_noturno_percent numeric,
  remuneracao_visivel boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_uid uuid := auth.uid();
  v_lista boolean;
  v_pessoais boolean;
  v_remuneracao boolean;
BEGIN
  v_lista := public.has_any_permission(v_uid, ARRAY[
    'rh:prontuario:view', 'rh:prontuario:manage', 'rh:escalas:view', 'rh:tarefas:view',
    'rh:onboarding:view', 'rh:treinamento:view', 'rh:ferias:view', 'rh:documentos:view',
    'rh:folha:view', 'rh:beneficios:view', 'rh:dashboard:view', 'rh:custos:view',
    'rh:sst:view', 'rh:disciplinar:view', 'rh:ponto:view', 'rh:banco-horas:view',
    'rh:read', 'rh:manage', 'system:global:manage'
  ]);
  v_pessoais := public.has_any_permission(v_uid, ARRAY[
    'rh:prontuario:view', 'rh:prontuario:manage', 'rh:read', 'rh:manage', 'system:global:manage'
  ]);
  v_remuneracao := v_pessoais OR public.has_any_permission(v_uid, ARRAY[
    'rh:folha:view', 'rh:folha:manage', 'rh:custos:view', 'rh:dashboard:view'
  ]);

  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.nome,
    CASE WHEN v_pessoais OR c.user_id = v_uid THEN c.cpf END,
    CASE WHEN v_pessoais OR c.user_id = v_uid THEN c.telefone END,
    CASE WHEN v_pessoais OR c.user_id = v_uid THEN c.email END,
    c.cargo,
    c.funcao,
    c.setor,
    c.data_admissao,
    c.tipo_contrato,
    c.status,
    c.carga_horaria_semanal,
    CASE WHEN v_remuneracao OR c.user_id = v_uid THEN c.salario END,
    CASE WHEN v_remuneracao OR c.user_id = v_uid THEN c.valor_hora END,
    c.created_at,
    CASE WHEN v_remuneracao OR c.user_id = v_uid THEN c.adicional_noturno_percent END,
    (v_remuneracao OR c.user_id = v_uid)
  FROM public.rh_colaboradores c
  WHERE c.company_id = v_company
    AND (p_incluir_inativos OR c.status = 'ativo')
    AND (v_lista OR c.user_id = v_uid)
  ORDER BY c.nome, c.id;
END;
$function$;

-- PL/pgSQL só confere o RETURN QUERY na 1ª chamada: confere aqui os tipos das
-- colunas lidas contra a RETURNS TABLE, para quebrar no deploy e não em produção.
DO $confere$
DECLARE v_divergente text;
BEGIN
  SELECT string_agg(e.col || ' esperado ' || e.tipo || ', encontrado ' || coalesce(format_type(a.atttypid, NULL), 'ausente'), '; ')
  INTO v_divergente
  FROM (VALUES
    ('id', 'uuid'), ('user_id', 'uuid'), ('nome', 'text'), ('cpf', 'text'), ('telefone', 'text'),
    ('email', 'text'), ('cargo', 'text'), ('funcao', 'text'), ('setor', 'text'),
    ('data_admissao', 'date'), ('tipo_contrato', 'text'), ('status', 'text'),
    ('carga_horaria_semanal', 'numeric'), ('salario', 'numeric'), ('valor_hora', 'numeric'),
    ('created_at', 'timestamp with time zone'), ('adicional_noturno_percent', 'numeric')
  ) AS e(col, tipo)
  LEFT JOIN pg_attribute a
    ON a.attrelid = 'public.rh_colaboradores'::regclass AND a.attname = e.col AND NOT a.attisdropped
  WHERE a.attname IS NULL OR format_type(a.atttypid, NULL) <> e.tipo;
  IF v_divergente IS NOT NULL THEN
    RAISE EXCEPTION 'rh_listar_colaboradores: coluna divergente de rh_colaboradores: %', v_divergente;
  END IF;
END
$confere$;

REVOKE ALL ON FUNCTION public.rh_listar_colaboradores(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_listar_colaboradores(boolean) TO authenticated, service_role;

-- ── C) parâmetros do Salmão ──
-- Uma linha por unidade. Limites do estoque (mínimos e lote parado): quem
-- acessa Salmão → Estoque ou administra Configurações; alertas de perda e
-- validade: só Configurações. Parâmetro nulo mantém o valor gravado, então
-- cada tela salva só os seus campos sem sobrescrever os da outra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_salmon_config_company ON public.salmon_config (company_id);

CREATE OR REPLACE FUNCTION public.salmon_salvar_config(
  p_min_gross_kg numeric DEFAULT NULL,
  p_min_clean_kg numeric DEFAULT NULL,
  p_stale_days_limit integer DEFAULT NULL,
  p_loss_percent_alert numeric DEFAULT NULL,
  p_loss_value_alert numeric DEFAULT NULL,
  p_expiration_days integer DEFAULT NULL,
  p_expiration_alert_days integer DEFAULT NULL
)
RETURNS public.salmon_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_uid uuid := auth.uid();
  v_estoque boolean := p_min_gross_kg IS NOT NULL OR p_min_clean_kg IS NOT NULL OR p_stale_days_limit IS NOT NULL;
  v_alertas boolean := p_loss_percent_alert IS NOT NULL OR p_loss_value_alert IS NOT NULL
    OR p_expiration_days IS NOT NULL OR p_expiration_alert_days IS NOT NULL;
  v_row public.salmon_config;
BEGIN
  IF NOT v_estoque AND NOT v_alertas THEN
    RAISE EXCEPTION 'NADA_A_SALVAR';
  END IF;
  IF v_estoque AND NOT public.has_any_permission(v_uid, ARRAY[
    'salmon:estoque:view', 'salmon:read', 'configuracoes:salmon:manage', 'configuracoes:geral:manage',
    'settings:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: salmon:estoque:view' USING ERRCODE = '42501';
  END IF;
  IF v_alertas AND NOT public.has_any_permission(v_uid, ARRAY[
    'configuracoes:salmon:manage', 'configuracoes:geral:manage', 'settings:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: configuracoes:salmon:manage' USING ERRCODE = '42501';
  END IF;
  -- least() ignora NULL: só confere os campos enviados.
  IF least(p_min_gross_kg, p_min_clean_kg, p_stale_days_limit, p_loss_percent_alert,
           p_loss_value_alert, p_expiration_days, p_expiration_alert_days) < 0 THEN
    RAISE EXCEPTION 'VALOR_INVALIDO: parâmetro negativo';
  END IF;

  INSERT INTO public.salmon_config (company_id) VALUES (v_company)
  ON CONFLICT (company_id) DO NOTHING;

  UPDATE public.salmon_config SET
    min_gross_kg = COALESCE(p_min_gross_kg, min_gross_kg),
    min_clean_kg = COALESCE(p_min_clean_kg, min_clean_kg),
    stale_days_limit = COALESCE(p_stale_days_limit, stale_days_limit),
    loss_percent_alert = COALESCE(p_loss_percent_alert, loss_percent_alert),
    loss_value_alert = COALESCE(p_loss_value_alert, loss_value_alert),
    expiration_days = COALESCE(p_expiration_days, expiration_days),
    expiration_alert_days = COALESCE(p_expiration_alert_days, expiration_alert_days)
  WHERE company_id = v_company
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.salmon_salvar_config(numeric, numeric, integer, numeric, numeric, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salmon_salvar_config(numeric, numeric, integer, numeric, numeric, integer, integer) TO authenticated, service_role;

-- Escrita direta pela tabela: troca a chave inexistente pelas de Configurações.
ALTER POLICY salmon_config_insert ON public.salmon_config
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'configuracoes:salmon:manage', 'configuracoes:geral:manage', 'settings:manage', 'system:global:manage'
    ]))
  );

ALTER POLICY salmon_config_update ON public.salmon_config
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'configuracoes:salmon:manage', 'configuracoes:geral:manage', 'settings:manage', 'system:global:manage'
    ]))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
  );

-- ── D) chave legada nas leituras do 20261007120000 ──
-- Mesmas chaves de lá, mais as legadas que abrem as mesmas telas.
ALTER POLICY "compras:fornecedores:view suppliers" ON public.suppliers
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'compras:fornecedores:view', 'compras:lista:view', 'compras:pedidos:view',
      'compras:cotacao:view', 'compras:cotacao:create', 'compras:calendario:view',
      'financeiro:cadastros:view', 'financeiro:pagar:view', 'financeiro:conciliacao:view', 'finance:read',
      'salmon:entradas:view', 'salmon:manipulacao:view', 'salmon:planejamento:view',
      'planning:simulador:view',
      'purchases:read', 'purchases:market:read', 'compras:read', 'salmon:read', 'planning:read',
      'system:global:manage'
    ]))
  );

ALTER POLICY salmon_config_select ON public.salmon_config
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY[
      'salmon:dashboard:view', 'salmon:manipulacao:view', 'salmon:entradas:view',
      'salmon:estoque:view', 'configuracoes:salmon:view',
      'salmon:read', 'settings:manage',
      'system:global:manage'
    ]))
  );
