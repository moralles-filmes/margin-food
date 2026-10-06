-- Contas bancárias: gate das RPCs alinhado ao registry, auditoria do saldo e
-- ajuste do saldo inicial pela conferência do extrato com recheque no servidor.
--
-- 1) _guarded_update_conta / _guarded_delete_conta checavam só a chave granular
--    (has_permission). O banco não expande o LEGACY_PERMISSION_MAP: quem tem a
--    permissão pelo legado (finance:manage / finance:delete) ou é super-admin
--    (system:global:manage) via o botão liberado pelo useCan e recebia a recusa da RPC.
-- 2) _guarded_update_conta não gravava o saldo novo em fin_audit_logs.depois.
-- 3) _guarded_ajustar_saldo_inicial_conta: usada pela confirmação de saldo do extrato.
--    O saldo de toda a conta é saldo_inicial + TODOS os lançamentos (nenhum cálculo lê
--    data_saldo_inicial), então só é seguro trocar o saldo inicial pelo saldo do banco
--    na véspera do período quando a conta não tem lançamento até a véspera nem depois
--    do período. O cliente checa antes de oferecer; aqui a checagem é refeita sob lock,
--    porque um lançamento novo não muda fin_contas.updated_at e o lock otimista da conta
--    não o percebe.

-- ── 1+2) _guarded_update_conta ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._guarded_update_conta(
  p_id uuid,
  p_nome text,
  p_tipo text,
  p_banco text DEFAULT ''::text,
  p_agencia text DEFAULT ''::text,
  p_numero_conta text DEFAULT ''::text,
  p_saldo_inicial numeric DEFAULT 0,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
  v_updated_at timestamptz;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();

  IF NOT has_any_permission(v_user_id, ARRAY['financeiro:contas:edit', 'finance:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- FOR UPDATE: sem ele, duas edições com o mesmo updated_at passavam as duas pelo lock otimista.
  SELECT jsonb_build_object('nome', nome, 'saldo', saldo_inicial), updated_at
  INTO v_old_data, v_updated_at
  FROM fin_contas
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict';
  END IF;

  UPDATE fin_contas SET
    nome = p_nome,
    tipo = p_tipo,
    banco = p_banco,
    agencia = p_agencia,
    numero_conta = p_numero_conta,
    saldo_inicial = p_saldo_inicial,
    updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_bancarias', p_id, 'editar', v_old_data,
    jsonb_build_object('nome', p_nome, 'saldo', p_saldo_inicial), v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'updated_at', now());
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_update_conta(uuid, text, text, text, text, text, numeric, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_conta(uuid, text, text, text, text, text, numeric, timestamptz) TO authenticated, service_role;

-- ── 1) _guarded_delete_conta ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._guarded_delete_conta(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF NOT has_any_permission(v_user_id, ARRAY['financeiro:contas:delete', 'finance:delete', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT jsonb_build_object('nome', nome) INTO v_old_data
  FROM fin_contas WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;
  -- Sem isto, id inexistente (ou de outra unidade) gravava auditoria de "remover" e devolvia deleted:true.
  IF v_old_data IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;

  UPDATE fin_contas SET ativo = false, updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('contas_bancarias', p_id, 'remover', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_delete_conta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_delete_conta(uuid) TO authenticated, service_role;

-- ── 3) _guarded_ajustar_saldo_inicial_conta ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public._guarded_ajustar_saldo_inicial_conta(
  p_conta_id uuid,
  p_saldo_inicial numeric,
  p_ate date,
  p_periodo_fim date,
  p_expected_updated_at timestamptz,
  p_contexto jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_saldo_atual numeric;
  v_updated_at timestamptz;
  v_contexto jsonb := COALESCE(p_contexto, '{}'::jsonb);
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();

  IF NOT public.has_any_permission(v_user, ARRAY['financeiro:contas:edit', 'finance:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:contas:edit';
  END IF;

  IF p_conta_id IS NULL OR p_saldo_inicial IS NULL OR p_ate IS NULL OR p_periodo_fim IS NULL
     OR p_periodo_fim <= p_ate THEN
    RAISE EXCEPTION 'PARAMETRO_INVALIDO';
  END IF;

  SELECT c.saldo_inicial, c.updated_at INTO v_saldo_atual, v_updated_at
  FROM public.fin_contas c
  WHERE c.id = p_conta_id AND c.company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Reenvio depois de resposta perdida: o valor já está gravado e o updated_at que o
  -- cliente tem ficou velho. Não é conflito, e nada é gravado de novo.
  IF round(v_saldo_atual, 2) = round(p_saldo_inicial, 2) THEN
    RETURN jsonb_build_object('status', 'unchanged', 'id', p_conta_id, 'updated_at', v_updated_at);
  END IF;

  IF p_expected_updated_at IS NULL OR v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  -- Serialização com quem grava lançamento na conta: o FOR UPDATE da conta acima conflita
  -- com o FOR KEY SHARE que o INSERT em fin_lancamentos toma pelas FKs conta_id/
  -- conta_destino_id, então um INSERT em andamento faz esta RPC esperar (e vice-versa).
  -- UPDATE de lançamento existente não passa pela FK, mas o gatilho de saldo atualiza a
  -- linha do cache na mesma transação — travá-la cobre esse caso. Depois da espera, os
  -- EXISTS abaixo (snapshot novo por comando) enxergam o que foi commitado.
  PERFORM 1 FROM public.fin_contas_saldo_cache s WHERE s.conta_id = p_conta_id FOR UPDATE;

  -- Mesma data efetiva de get_fin_saldo_conta_em.
  IF EXISTS (
    SELECT 1 FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
      AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) <= p_ate
  ) THEN
    RAISE EXCEPTION 'LANCAMENTO_ANTERIOR';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
      AND COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia) > p_periodo_fim
  ) THEN
    RAISE EXCEPTION 'LANCAMENTO_POSTERIOR';
  END IF;

  UPDATE public.fin_contas
  SET saldo_inicial = p_saldo_inicial, updated_at = now()
  WHERE id = p_conta_id AND company_id = v_company;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
  VALUES (
    'contas_bancarias', p_conta_id, 'ajustar_saldo_inicial',
    jsonb_build_object('saldo', v_saldo_atual),
    jsonb_build_object(
      'saldo', p_saldo_inicial,
      'origem', 'conciliacao_extrato',
      'saldo_ate', p_ate,
      'periodo_fim', p_periodo_fim,
      'arquivo', left(v_contexto->>'arquivo', 200),
      'saldo_informado', CASE WHEN jsonb_typeof(v_contexto->'saldo_informado') = 'number' THEN v_contexto->'saldo_informado' END,
      'data_saldo', left(v_contexto->>'data_saldo', 10)
    ),
    'Saldo inicial ajustado pela conferência do saldo do extrato',
    v_user, v_company
  );

  RETURN jsonb_build_object('status', 'adjusted', 'id', p_conta_id, 'updated_at', now());
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_ajustar_saldo_inicial_conta(uuid, numeric, date, date, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_ajustar_saldo_inicial_conta(uuid, numeric, date, date, timestamptz, jsonb) TO authenticated, service_role;

-- Força resolução de colunas sem ler dados nem contornar o guard das RPCs.
DO $$ BEGIN
  PERFORM c.saldo_inicial, c.updated_at, c.nome, c.tipo, c.banco, c.agencia, c.numero_conta, c.ativo,
    s.conta_id, l.data_pagamento, l.conciliado_em, l.data_competencia, l.conta_destino_id, l.status
  FROM public.fin_contas c
  LEFT JOIN public.fin_contas_saldo_cache s ON s.conta_id = c.id
  LEFT JOIN public.fin_lancamentos l ON l.conta_id = c.id AND l.company_id = c.company_id
  WHERE false;
  PERFORM a.entidade, a.entidade_id, a.acao, a.antes, a.depois, a.justificativa, a.user_id, a.company_id
  FROM public.fin_audit_logs a WHERE false;
END $$;

NOTIFY pgrst, 'reload schema';
