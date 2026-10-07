-- ── Prontuário: edição que confirmava sem gravar ──
-- A tela libera "Editar" com rh:prontuario:edit ou :manage, mas a policy de
-- UPDATE de rh_colaboradores só aceitava :manage. Para quem tinha só :edit o
-- PATCH voltava 0 linhas sem erro e a tela dizia "Colaborador atualizado!".
-- A edição passa a ser uma RPC que acusa erro em vez de 0 linhas; o status
-- (desativar/reativar) continua pela tabela, só com :manage.

-- ── A) RPC de edição ──
-- Edita quem tem :edit E vê o Prontuário: o formulário mostra e reenvia CPF,
-- contato e remuneração, que rh_listar_colaboradores só entrega a quem vê.
-- Remuneração e usuário vinculado continuam de :manage (era o que valia na
-- prática, já que o UPDATE de :edit nunca gravou): o vínculo abre ao usuário as
-- telas "minhas" do RH — holerite, férias, documentos, ponto (policies
-- *_select_own e rh_registrar_ponto) — e salário alimenta a folha.
-- Não toca status, company_id, foto, observações nem funções habilitadas; os
-- triggers da tabela (updated_at, validação numérica) continuam valendo.
CREATE OR REPLACE FUNCTION public.rh_atualizar_colaborador(
  p_id uuid,
  p_nome text,
  p_email text,
  p_telefone text,
  p_cpf text,
  p_cargo text,
  p_funcao text,
  p_setor text,
  p_tipo_contrato text,
  p_carga_horaria_semanal numeric,
  p_salario numeric,
  p_valor_hora numeric,
  p_data_admissao date,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_uid uuid := auth.uid();
  v_manage boolean;
  v_antes public.rh_colaboradores;
  v_depois public.rh_colaboradores;
  v_mudou_antes jsonb;
  v_mudou_depois jsonb;
BEGIN
  IF NOT public.has_any_permission(v_uid, ARRAY[
       'rh:prontuario:edit', 'rh:prontuario:manage', 'rh:write', 'rh:admin', 'rh:manage', 'system:global:manage'
     ])
     OR NOT public.has_any_permission(v_uid, ARRAY[
       'rh:prontuario:view', 'rh:prontuario:manage', 'rh:read', 'rh:manage', 'system:global:manage'
     ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: rh:prontuario:edit' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_nome), '') IS NULL THEN
    RAISE EXCEPTION 'NOME_OBRIGATORIO';
  END IF;

  SELECT * INTO v_antes
  FROM public.rh_colaboradores c
  WHERE c.id = p_id AND c.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_manage := public.has_any_permission(v_uid, ARRAY['rh:prontuario:manage', 'rh:manage', 'system:global:manage']);
  IF NOT v_manage AND (
       p_user_id IS DISTINCT FROM v_antes.user_id
    OR p_salario IS DISTINCT FROM v_antes.salario
    OR p_valor_hora IS DISTINCT FROM v_antes.valor_hora
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: rh:prontuario:manage' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_antes.user_id THEN
    IF NOT public.is_company_member(p_user_id, v_company) THEN
      RAISE EXCEPTION 'USUARIO_FORA_DA_UNIDADE';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.rh_colaboradores o
      WHERE o.company_id = v_company AND o.user_id = p_user_id AND o.id <> p_id
    ) THEN
      RAISE EXCEPTION 'USUARIO_JA_VINCULADO';
    END IF;
  END IF;

  UPDATE public.rh_colaboradores SET
    nome = btrim(p_nome),
    email = p_email,
    telefone = p_telefone,
    cpf = p_cpf,
    cargo = p_cargo,
    funcao = p_funcao,
    setor = p_setor,
    tipo_contrato = p_tipo_contrato,
    carga_horaria_semanal = p_carga_horaria_semanal,
    salario = p_salario,
    valor_hora = p_valor_hora,
    data_admissao = p_data_admissao,
    user_id = p_user_id
  WHERE id = p_id AND company_id = v_company
  RETURNING * INTO v_depois;

  -- Trilha só dos campos alterados; rh_audit_log é lida só por :manage.
  SELECT jsonb_object_agg(a.key, a.value), jsonb_object_agg(d.key, d.value)
  INTO v_mudou_antes, v_mudou_depois
  FROM jsonb_each(to_jsonb(v_antes)) a
  JOIN jsonb_each(to_jsonb(v_depois)) d ON d.key = a.key
  WHERE a.key <> 'updated_at' AND a.value IS DISTINCT FROM d.value;

  IF v_mudou_depois IS NOT NULL THEN
    INSERT INTO public.rh_audit_log (acao, entidade, entidade_id, company_id, user_id, antes, depois)
    VALUES ('editar_colaborador', 'rh_colaboradores', p_id, v_company, v_uid, v_mudou_antes, v_mudou_depois);
  END IF;

  RETURN p_id;
END;
$function$;

-- PL/pgSQL só confere colunas na 1ª execução: confere aqui as colunas usadas.
DO $confere$
DECLARE v_ausentes text;
BEGIN
  SELECT string_agg(e.tab || '.' || e.col, ', ')
  INTO v_ausentes
  FROM (VALUES
    ('rh_colaboradores', 'nome'), ('rh_colaboradores', 'email'), ('rh_colaboradores', 'telefone'),
    ('rh_colaboradores', 'cpf'), ('rh_colaboradores', 'cargo'), ('rh_colaboradores', 'funcao'),
    ('rh_colaboradores', 'setor'), ('rh_colaboradores', 'tipo_contrato'),
    ('rh_colaboradores', 'carga_horaria_semanal'), ('rh_colaboradores', 'salario'),
    ('rh_colaboradores', 'valor_hora'), ('rh_colaboradores', 'data_admissao'),
    ('rh_colaboradores', 'user_id'), ('rh_colaboradores', 'company_id'), ('rh_colaboradores', 'updated_at'),
    ('rh_audit_log', 'acao'), ('rh_audit_log', 'entidade'), ('rh_audit_log', 'entidade_id'),
    ('rh_audit_log', 'company_id'), ('rh_audit_log', 'user_id'), ('rh_audit_log', 'antes'),
    ('rh_audit_log', 'depois')
  ) AS e(tab, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = ('public.' || e.tab)::regclass AND a.attname = e.col AND NOT a.attisdropped
  );
  IF v_ausentes IS NOT NULL THEN
    RAISE EXCEPTION 'rh_atualizar_colaborador: colunas ausentes: %', v_ausentes;
  END IF;
END
$confere$;

REVOKE ALL ON FUNCTION public.rh_atualizar_colaborador(uuid, text, text, text, text, text, text, text, text, numeric, numeric, numeric, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_atualizar_colaborador(uuid, text, text, text, text, text, text, text, text, numeric, numeric, numeric, date, uuid) TO authenticated, service_role;

-- ── B) um colaborador por usuário na unidade ──
-- O EXISTS da RPC dá a mensagem; o índice garante sob concorrência (dois gestores
-- vinculando o mesmo usuário) e vale também para o INSERT. rh_registrar_ponto
-- resolve o colaborador pelo usuário e supõe um só.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_colaboradores_company_user
  ON public.rh_colaboradores (company_id, user_id) WHERE user_id IS NOT NULL;

-- ── C) chave legada nas policies da tabela ──
-- O banco não expande LEGACY_PERMISSION_MAP: quem só tinha a legada via o botão
-- (o useCan expande) e o UPDATE descartava em silêncio. O SELECT entra junto:
-- UPDATE com WHERE só alcança linha que passa na policy de leitura. rh:read já
-- recebe a linha completa pela rh_listar_colaboradores.
ALTER POLICY rh_colaboradores_select ON public.rh_colaboradores
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'rh:prontuario:view', 'rh:prontuario:manage', 'rh:read', 'rh:manage', 'system:global:manage'
    ]))
  );

ALTER POLICY rh_colaboradores_update ON public.rh_colaboradores
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'rh:prontuario:manage', 'rh:manage', 'system:global:manage'
    ]))
  );

ALTER POLICY rh_colaboradores_insert_hr ON public.rh_colaboradores
  WITH CHECK (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'rh:prontuario:create', 'rh:prontuario:manage', 'rh:write', 'rh:admin', 'rh:manage', 'system:global:manage'
    ]))
  );
