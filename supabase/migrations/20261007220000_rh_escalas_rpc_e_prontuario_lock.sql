-- ── Escalas (RH): chaves do registry, escrita só por RPC, custo no servidor ──
-- Antes: a escrita em rh_escalas/rh_escala_slots exigia rh:escalas:manage, chave
-- fora do registry (Admin → Permissões grava DENY nela e a tela usava o gate do
-- Prontuário); o DELETE de turno era false para todos; rh_trocas_turno aceitava
-- leitura e escrita de qualquer membro da unidade; custo_projetado era gravado
-- pelo navegador e lido por rh:escalas:view — com um colaborador só na escala, o
-- custo revela o valor-hora dele.
-- Agora: leitura com rh:escalas:view; criar a semana com :create; turnos,
-- publicação e trocas com :edit (sempre junto com :view, como a tela); tudo pelas
-- RPCs abaixo, que conferem o rascunho sob lock. custo_projetado é calculado na
-- publicação e fica fora do SELECT do cliente. Conferido em produção: nenhum
-- membro perde leitura ou escrita.

-- ── A) criar a escala da semana ──
-- Uma escala por semana e setor (phase7_rh_escalas_tenant_key): o reenvio devolve a mesma.
CREATE OR REPLACE FUNCTION public.rh_escala_criar(p_semana_inicio date, p_setor text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF NOT public.has_any_permission(v_uid, ARRAY[
       'rh:escalas:create', 'rh:write', 'rh:admin', 'system:global:manage'
     ])
     OR NOT public.has_any_permission(v_uid, ARRAY[
       'rh:escalas:view', 'rh:read', 'system:global:manage'
     ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: rh:escalas:create' USING ERRCODE = '42501';
  END IF;
  -- A tela monta a semana de segunda a domingo; os turnos são conferidos contra ela.
  IF p_semana_inicio IS NULL OR extract(isodow FROM p_semana_inicio) <> 1 THEN
    RAISE EXCEPTION 'SEMANA_INVALIDA';
  END IF;
  IF nullif(btrim(p_setor), '') IS NULL THEN
    RAISE EXCEPTION 'SETOR_OBRIGATORIO';
  END IF;

  INSERT INTO public.rh_escalas (company_id, semana_inicio, setor, created_by)
  VALUES (v_company, p_semana_inicio, btrim(p_setor), v_uid)
  ON CONFLICT (company_id, semana_inicio, setor) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT e.id INTO v_id
    FROM public.rh_escalas e
    WHERE e.company_id = v_company AND e.semana_inicio = p_semana_inicio AND e.setor = btrim(p_setor);
  END IF;
  RETURN v_id;
END;
$function$;

-- ── B) turno no rascunho ──
-- A escala travada serializa as mudanças de turno e a publicação. O reenvio do mesmo
-- turno (resposta perdida) devolve o que já foi gravado; outro turno no mesmo início é recusado.
CREATE OR REPLACE FUNCTION public.rh_escala_adicionar_turno(
  p_escala_id uuid,
  p_colaborador_id uuid,
  p_dia date,
  p_hora_inicio time,
  p_hora_fim time,
  p_funcao text,
  p_tipo text,
  p_observacao text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_escala public.rh_escalas;
  v_existente public.rh_escala_slots;
  v_funcao text := coalesce(nullif(btrim(p_funcao), ''), 'Geral');
  v_id uuid;
BEGIN
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
       'rh:escalas:edit', 'rh:write', 'rh:manage', 'system:global:manage'
     ])
     OR NOT public.has_any_permission(auth.uid(), ARRAY[
       'rh:escalas:view', 'rh:read', 'system:global:manage'
     ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: rh:escalas:edit' USING ERRCODE = '42501';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('TRABALHO', 'FOLGA', 'FERIAS') THEN
    RAISE EXCEPTION 'TIPO_INVALIDO';
  END IF;
  IF p_hora_inicio IS NULL OR p_hora_fim IS NULL THEN
    RAISE EXCEPTION 'HORARIO_OBRIGATORIO';
  END IF;
  IF p_tipo = 'TRABALHO' AND p_hora_inicio = p_hora_fim THEN
    RAISE EXCEPTION 'HORARIO_INVALIDO';
  END IF;

  SELECT * INTO v_escala
  FROM public.rh_escalas e
  WHERE e.id = p_escala_id AND e.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_escala.status <> 'RASCUNHO' THEN
    RAISE EXCEPTION 'ESCALA_PUBLICADA';
  END IF;
  IF p_dia IS NULL OR p_dia < v_escala.semana_inicio OR p_dia > v_escala.semana_inicio + 6 THEN
    RAISE EXCEPTION 'DIA_FORA_DA_SEMANA';
  END IF;
  SELECT * INTO v_existente
  FROM public.rh_escala_slots s
  WHERE s.escala_id = p_escala_id AND s.company_id = v_company
    AND s.colaborador_id = p_colaborador_id AND s.dia = p_dia AND s.hora_inicio = p_hora_inicio;
  IF FOUND THEN
    IF (v_existente.hora_fim, v_existente.tipo, v_existente.funcao, v_existente.observacao)
       IS NOT DISTINCT FROM (p_hora_fim, p_tipo, v_funcao, coalesce(p_observacao, '')) THEN
      RETURN v_existente.id;
    END IF;
    RAISE EXCEPTION 'TURNO_DUPLICADO';
  END IF;
  -- Turno novo só para ativo da unidade (a FK sozinha aceita colaborador de outra empresa).
  IF NOT EXISTS (
    SELECT 1 FROM public.rh_colaboradores c
    WHERE c.id = p_colaborador_id AND c.company_id = v_company AND c.status = 'ativo'
  ) THEN
    RAISE EXCEPTION 'COLABORADOR_INVALIDO';
  END IF;

  INSERT INTO public.rh_escala_slots (
    company_id, escala_id, colaborador_id, dia, hora_inicio, hora_fim, funcao, tipo, observacao
  ) VALUES (
    v_company, p_escala_id, p_colaborador_id, p_dia, p_hora_inicio, p_hora_fim,
    v_funcao, p_tipo, coalesce(p_observacao, '')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- Remover o que já não existe é sucesso: o reenvio depois de resposta perdida não vira erro.
CREATE OR REPLACE FUNCTION public.rh_escala_remover_turno(p_slot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_escala_id uuid;
  v_status text;
BEGIN
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
       'rh:escalas:edit', 'rh:write', 'rh:manage', 'system:global:manage'
     ])
     OR NOT public.has_any_permission(auth.uid(), ARRAY[
       'rh:escalas:view', 'rh:read', 'system:global:manage'
     ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: rh:escalas:edit' USING ERRCODE = '42501';
  END IF;

  SELECT s.escala_id INTO v_escala_id
  FROM public.rh_escala_slots s
  WHERE s.id = p_slot_id AND s.company_id = v_company;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT e.status INTO v_status
  FROM public.rh_escalas e
  WHERE e.id = v_escala_id AND e.company_id = v_company
  FOR UPDATE;
  IF v_status IS DISTINCT FROM 'RASCUNHO' THEN
    RAISE EXCEPTION 'ESCALA_PUBLICADA';
  END IF;

  DELETE FROM public.rh_escala_slots
  WHERE id = p_slot_id AND company_id = v_company;
END;
$function$;

-- ── C) publicar: o custo é calculado aqui, nunca recebido do navegador ──
-- Publicar não tem volta: a tela manda os turnos que o gestor revisou e, se outra
-- pessoa mexeu no meio, a publicação é recusada. Soma horas × valor-hora de todos os
-- turnos de trabalho, inclusive de colaborador já desativado; sem valor-hora, salário/220
-- (como Folha e Custos); turno que passa da meia-noite ganha 24h (mesma regra de
-- src/domain/rh/custoEscala.ts). Não devolve o custo: quem publica pode não ver remuneração.
CREATE OR REPLACE FUNCTION public.rh_escala_publicar(p_escala_id uuid, p_turnos_vistos uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_uid uuid := auth.uid();
  v_escala public.rh_escalas;
  v_turnos uuid[];
  v_custo numeric;
BEGIN
  IF NOT public.has_any_permission(v_uid, ARRAY[
       'rh:escalas:edit', 'rh:write', 'rh:manage', 'system:global:manage'
     ])
     OR NOT public.has_any_permission(v_uid, ARRAY[
       'rh:escalas:view', 'rh:read', 'system:global:manage'
     ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: rh:escalas:edit' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_escala
  FROM public.rh_escalas e
  WHERE e.id = p_escala_id AND e.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_escala.status = 'PUBLICADA' THEN
    RETURN;
  END IF;
  IF v_escala.status <> 'RASCUNHO' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_escala.status;
  END IF;

  SELECT coalesce(array_agg(s.id ORDER BY s.id), '{}')
  INTO v_turnos
  FROM public.rh_escala_slots s
  WHERE s.escala_id = p_escala_id AND s.company_id = v_company;
  IF cardinality(v_turnos) = 0 THEN
    RAISE EXCEPTION 'ESCALA_VAZIA';
  END IF;
  IF v_turnos IS DISTINCT FROM (
    SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}') FROM unnest(p_turnos_vistos) AS t
  ) THEN
    RAISE EXCEPTION 'ESCALA_ALTERADA';
  END IF;

  SELECT coalesce(round(sum(
           (extract(epoch FROM (s.hora_fim - s.hora_inicio)) / 3600.0
             + CASE WHEN s.hora_fim < s.hora_inicio THEN 24 ELSE 0 END)
           * coalesce(nullif(c.valor_hora, 0), coalesce(c.salario, 0) / 220.0)
         ), 2), 0)
  INTO v_custo
  FROM public.rh_escala_slots s
  JOIN public.rh_colaboradores c ON c.id = s.colaborador_id AND c.company_id = v_company
  WHERE s.escala_id = p_escala_id AND s.company_id = v_company AND s.tipo = 'TRABALHO';

  UPDATE public.rh_escalas SET
    status = 'PUBLICADA',
    publicada_em = now(),
    publicada_por = v_uid,
    custo_projetado = v_custo
  WHERE id = p_escala_id AND company_id = v_company;

  -- rh_audit_log é lida só por quem gerencia o Prontuário, que já vê a remuneração.
  INSERT INTO public.rh_audit_log (acao, entidade, entidade_id, company_id, user_id, antes, depois)
  VALUES ('publicar_escala', 'rh_escalas', p_escala_id, v_company, v_uid,
          jsonb_build_object('status', v_escala.status, 'custo_projetado', v_escala.custo_projetado),
          jsonb_build_object('status', 'PUBLICADA', 'custo_projetado', v_custo));
END;
$function$;

-- ── D) decidir troca de turno ──
-- Repetir a mesma decisão é reenvio; trocar uma decisão já tomada é recusado.
CREATE OR REPLACE FUNCTION public.rh_escala_decidir_troca(p_troca_id uuid, p_aprovar boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_uid uuid := auth.uid();
  v_troca public.rh_trocas_turno;
  v_novo text;
BEGIN
  IF NOT public.has_any_permission(v_uid, ARRAY[
       'rh:escalas:edit', 'rh:write', 'rh:manage', 'system:global:manage'
     ])
     OR NOT public.has_any_permission(v_uid, ARRAY[
       'rh:escalas:view', 'rh:read', 'system:global:manage'
     ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: rh:escalas:edit' USING ERRCODE = '42501';
  END IF;
  IF p_aprovar IS NULL THEN
    RAISE EXCEPTION 'DECISAO_OBRIGATORIA';
  END IF;
  v_novo := CASE WHEN p_aprovar THEN 'APROVADA' ELSE 'REJEITADA' END;

  SELECT * INTO v_troca
  FROM public.rh_trocas_turno t
  WHERE t.id = p_troca_id AND t.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_troca.status = v_novo THEN
    RETURN;
  END IF;
  IF v_troca.status <> 'PENDENTE' THEN
    RAISE EXCEPTION 'TROCA_JA_DECIDIDA';
  END IF;

  UPDATE public.rh_trocas_turno SET
    status = v_novo,
    aprovado_por = v_uid,
    aprovado_em = now()
  WHERE id = p_troca_id AND company_id = v_company;

  INSERT INTO public.rh_audit_log (acao, entidade, entidade_id, company_id, user_id, antes, depois)
  VALUES ('decidir_troca_turno', 'rh_trocas_turno', p_troca_id, v_company, v_uid,
          jsonb_build_object('status', v_troca.status), jsonb_build_object('status', v_novo));
END;
$function$;

-- ── E) Prontuário: lock otimista e vínculo próprio na edição ──
-- A tela lê a linha ao abrir o formulário e devolve o updated_at; outra gravação no
-- meio acusa conflito em vez de ser sobrescrita — salvo quando a linha já está como o
-- pedido a deixaria (reenvio depois de resposta perdida). Parâmetro com DEFAULT: a aba
-- antiga, que ainda não o envia, continua gravando. Assinatura nova exige DROP da
-- antiga (CREATE OR REPLACE criaria um overload).
-- Ninguém vincula o próprio usuário: o vínculo abre holerite, férias, documentos e
-- ponto do colaborador, e um gestor se ligaria à ficha de outra pessoa. Outro gestor faz.
DROP FUNCTION IF EXISTS public.rh_atualizar_colaborador(uuid, text, text, text, text, text, text, text, text, numeric, numeric, numeric, date, uuid);

CREATE FUNCTION public.rh_atualizar_colaborador(
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
  p_user_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
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
  IF p_expected_updated_at IS NOT NULL AND v_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    IF (v_antes.nome, v_antes.email, v_antes.telefone, v_antes.cpf, v_antes.cargo, v_antes.funcao,
        v_antes.setor, v_antes.tipo_contrato, v_antes.carga_horaria_semanal, v_antes.salario,
        v_antes.valor_hora, v_antes.data_admissao, v_antes.user_id)
       IS NOT DISTINCT FROM
       (btrim(p_nome), p_email, p_telefone, p_cpf, p_cargo, p_funcao,
        p_setor, p_tipo_contrato, p_carga_horaria_semanal, p_salario,
        p_valor_hora, p_data_admissao, p_user_id) THEN
      RETURN p_id;
    END IF;
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
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
    IF p_user_id = v_uid THEN
      RAISE EXCEPTION 'VINCULO_PROPRIO' USING ERRCODE = '42501';
    END IF;
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
    ('rh_escalas', 'company_id'), ('rh_escalas', 'semana_inicio'), ('rh_escalas', 'setor'),
    ('rh_escalas', 'status'), ('rh_escalas', 'created_by'), ('rh_escalas', 'publicada_em'),
    ('rh_escalas', 'publicada_por'), ('rh_escalas', 'custo_projetado'),
    ('rh_escala_slots', 'company_id'), ('rh_escala_slots', 'escala_id'), ('rh_escala_slots', 'colaborador_id'),
    ('rh_escala_slots', 'dia'), ('rh_escala_slots', 'hora_inicio'), ('rh_escala_slots', 'hora_fim'),
    ('rh_escala_slots', 'funcao'), ('rh_escala_slots', 'tipo'), ('rh_escala_slots', 'observacao'),
    ('rh_trocas_turno', 'company_id'), ('rh_trocas_turno', 'status'),
    ('rh_trocas_turno', 'aprovado_por'), ('rh_trocas_turno', 'aprovado_em'),
    ('rh_colaboradores', 'company_id'), ('rh_colaboradores', 'status'), ('rh_colaboradores', 'valor_hora'),
    ('rh_colaboradores', 'user_id'), ('rh_colaboradores', 'salario'), ('rh_colaboradores', 'updated_at'),
    ('rh_colaboradores', 'nome'), ('rh_colaboradores', 'email'), ('rh_colaboradores', 'telefone'),
    ('rh_colaboradores', 'cpf'), ('rh_colaboradores', 'cargo'), ('rh_colaboradores', 'funcao'),
    ('rh_colaboradores', 'setor'), ('rh_colaboradores', 'tipo_contrato'),
    ('rh_colaboradores', 'carga_horaria_semanal'), ('rh_colaboradores', 'data_admissao'),
    ('rh_audit_log', 'acao'), ('rh_audit_log', 'entidade'), ('rh_audit_log', 'entidade_id'),
    ('rh_audit_log', 'company_id'), ('rh_audit_log', 'user_id'), ('rh_audit_log', 'antes'),
    ('rh_audit_log', 'depois')
  ) AS e(tab, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = ('public.' || e.tab)::regclass AND a.attname = e.col AND NOT a.attisdropped
  );
  IF v_ausentes IS NOT NULL THEN
    RAISE EXCEPTION 'rh escalas/prontuário: colunas ausentes: %', v_ausentes;
  END IF;
END
$confere$;

REVOKE ALL ON FUNCTION public.rh_escala_criar(date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rh_escala_adicionar_turno(uuid, uuid, date, time, time, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rh_escala_remover_turno(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rh_escala_publicar(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rh_escala_decidir_troca(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rh_atualizar_colaborador(uuid, text, text, text, text, text, text, text, text, numeric, numeric, numeric, date, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_escala_criar(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rh_escala_adicionar_turno(uuid, uuid, date, time, time, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rh_escala_remover_turno(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rh_escala_publicar(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rh_escala_decidir_troca(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rh_atualizar_colaborador(uuid, text, text, text, text, text, text, text, text, numeric, numeric, numeric, date, uuid, timestamptz) TO authenticated, service_role;

-- ── F) leitura com rh:escalas:view; escrita direta fechada ──
ALTER POLICY rh_escalas_select ON public.rh_escalas
  TO authenticated
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'rh:escalas:view', 'rh:read', 'system:global:manage'
    ]))
  );

ALTER POLICY rh_escala_slots_select ON public.rh_escala_slots
  TO authenticated
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'rh:escalas:view', 'rh:read', 'system:global:manage'
    ]))
  );

ALTER POLICY rh_trocas_select ON public.rh_trocas_turno
  TO authenticated
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'rh:escalas:view', 'rh:read', 'system:global:manage'
    ]))
  );

-- Nenhuma tela pede troca de turno: o pedido do colaborador volta como RPC quando existir.
DROP POLICY IF EXISTS rh_escalas_insert ON public.rh_escalas;
DROP POLICY IF EXISTS rh_escalas_update ON public.rh_escalas;
DROP POLICY IF EXISTS rh_escalas_delete ON public.rh_escalas;
DROP POLICY IF EXISTS rh_escala_slots_insert ON public.rh_escala_slots;
DROP POLICY IF EXISTS rh_escala_slots_update ON public.rh_escala_slots;
DROP POLICY IF EXISTS rh_escala_slots_delete ON public.rh_escala_slots;
DROP POLICY IF EXISTS "Colaborador can insert own trocas" ON public.rh_trocas_turno;
DROP POLICY IF EXISTS rh_trocas_insert ON public.rh_trocas_turno;
DROP POLICY IF EXISTS rh_trocas_update ON public.rh_trocas_turno;
DROP POLICY IF EXISTS rh_trocas_delete ON public.rh_trocas_turno;
DROP POLICY IF EXISTS rh_trocas_turno_delete ON public.rh_trocas_turno;

-- Sem privilégio de escrita o PostgREST responde erro, não 0 linhas.
REVOKE INSERT, UPDATE, DELETE ON public.rh_escalas, public.rh_escala_slots, public.rh_trocas_turno FROM authenticated, anon;

-- custo_projetado fora do SELECT do cliente (REVOKE na tabela leva junto os GRANTs por coluna).
REVOKE SELECT ON public.rh_escalas FROM authenticated, anon;
GRANT SELECT (
  id, company_id, semana_inicio, setor, status, publicada_em, publicada_por,
  observacoes, created_at, updated_at, created_by
) ON public.rh_escalas TO authenticated;

-- ── G) colaborador: remuneração e vínculo só com :manage em todo caminho ──
-- Criar: quem tem só :create cadastra sem salário, valor-hora nem usuário vinculado (na
-- edição isso já era de :manage). O vínculo abre ao usuário as telas "minhas" do RH,
-- exige membro da unidade e nunca o próprio usuário de quem cria (como na edição); o
-- índice uq_rh_colaboradores_company_user barra o 2º vínculo.
ALTER POLICY rh_colaboradores_insert_hr ON public.rh_colaboradores
  WITH CHECK (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'rh:prontuario:create', 'rh:prontuario:manage', 'rh:write', 'rh:admin', 'rh:manage', 'system:global:manage'
    ]))
    AND (
      (coalesce(salario, 0) = 0 AND coalesce(valor_hora, 0) = 0 AND user_id IS NULL)
      OR (
        (SELECT public.has_any_permission(auth.uid(), ARRAY[
          'rh:prontuario:manage', 'rh:manage', 'system:global:manage'
        ]))
        AND (
          user_id IS NULL
          OR (user_id <> (SELECT auth.uid()) AND public.is_company_member(user_id, company_id))
        )
      )
    )
  );

-- Editar: o UPDATE direto da tabela fica só com o status (desativar/reativar, :manage).
-- Vínculo, salário e o resto passam pela rh_atualizar_colaborador, que confere
-- membership e grava a trilha; pela tabela um PATCH trocava user_id sem nenhum dos dois.
REVOKE UPDATE ON public.rh_colaboradores FROM authenticated, anon;
GRANT UPDATE (status) ON public.rh_colaboradores TO authenticated;

-- ── H) confere privilégios e policies ──
DO $privilegios$
BEGIN
  IF has_table_privilege('authenticated', 'public.rh_escalas', 'INSERT')
     OR has_table_privilege('authenticated', 'public.rh_escalas', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.rh_escalas', 'DELETE')
     OR has_table_privilege('authenticated', 'public.rh_escala_slots', 'INSERT')
     OR has_table_privilege('authenticated', 'public.rh_escala_slots', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.rh_escala_slots', 'DELETE')
     OR has_table_privilege('authenticated', 'public.rh_trocas_turno', 'INSERT')
     OR has_table_privilege('authenticated', 'public.rh_trocas_turno', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.rh_trocas_turno', 'DELETE')
     OR has_column_privilege('authenticated', 'public.rh_escalas', 'custo_projetado', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.rh_escalas', 'status', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.rh_escala_slots', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.rh_trocas_turno', 'SELECT')
     OR has_table_privilege('authenticated', 'public.rh_colaboradores', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.rh_colaboradores', 'user_id', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.rh_colaboradores', 'status', 'UPDATE') THEN
    RAISE EXCEPTION 'rh escalas: privilégios de authenticated fora do esperado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN ('rh_escalas', 'rh_escala_slots', 'rh_trocas_turno')
      AND p.cmd <> 'SELECT' AND p.policyname <> 'multiunit_scope_boundary'
  ) THEN
    RAISE EXCEPTION 'rh escalas: sobrou policy de escrita';
  END IF;
  -- Policy SELECT permissiva a mais faria OR com a nova e reabriria a leitura.
  IF EXISTS (
    SELECT 1 FROM (VALUES ('rh_escalas'), ('rh_escala_slots'), ('rh_trocas_turno')) AS t(tab)
    WHERE (SELECT count(*) FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = t.tab AND p.cmd = 'SELECT') <> 1
  ) THEN
    RAISE EXCEPTION 'rh escalas: esperada uma única policy de SELECT por tabela';
  END IF;
END
$privilegios$;
