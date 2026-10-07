-- Conciliação: vincular lançamento manual do Livro Razão à linha do extrato.
--
-- Até aqui `reconcile_link_existing_lancamento` só atendia às baixas de CP/CR
-- (espelhos). O lançamento manual seguia por `reconcile_batch_lancamentos` +
-- `reconcile_bind_extrato`, em duas chamadas: o lote marcava `conciliado` sem
-- olhar a conta e, quando o vínculo do FITID recusava por conta divergente, o
-- lançamento ficava conciliado sem vínculo e fora do saldo da conta do extrato.
-- A tela passa a mandar todo vínculo com lançamento existente para esta RPC,
-- numa transação só:
--   * PREVISTO vira REALIZADO com `data_pagamento` = data da linha do extrato
--     (a nota foi lançada e ninguém marcou como paga);
--   * conta nula recebe a conta do extrato (como já era);
--   * conta diferente só muda com `p_mover_conta = true` — a tela pede
--     confirmação — e exige também permissão de edição de lançamento;
--   * lançamento manual com valor diferente do extrato é recusado: vincular
--     mantinha o valor do lançamento e a diferença sumia do saldo sem aviso.
--     Espelho de CP/CR fica fora: a diferença dele já virou lançamento de ajuste;
--   * um lançamento cobre uma única linha (FITID) por conta.
-- Previsto que pertence a título de CP/CR é recusado: a baixa é feita no título.
-- Baixa de título, ajuste, transferência e lançamento nascido de extrato nunca
-- mudam de conta por aqui, nem lançamento já conciliado no extrato da origem.

DROP FUNCTION IF EXISTS public.reconcile_link_existing_lancamento(uuid, uuid, text, text, date);

CREATE OR REPLACE FUNCTION public.reconcile_link_existing_lancamento(
  p_conta_id uuid,
  p_lancamento_id uuid,
  p_external_id text DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_data_extrato date DEFAULT NULL,
  p_mover_conta boolean DEFAULT false,
  p_valor_extrato numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_lanc record;
  v_external_id text := NULLIF(btrim(p_external_id), '');
  v_conta_ajustada boolean := false;
  v_conta_movida boolean := false;
  v_realizar boolean := false;
  v_conta_anterior_nome text;
  v_justificativa text;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  -- `:manage` acompanha `reconcile_bind_extrato` e o lote que este caminho substitui.
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária';
  END IF;

  SELECT * INTO v_lanc FROM public.fin_lancamentos
  WHERE id = p_lancamento_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: lançamento'; END IF;

  IF v_lanc.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: lançamento cancelado não pode ser conciliado';
  END IF;
  IF v_lanc.status IS DISTINCT FROM 'REALIZADO' AND v_lanc.status IS DISTINCT FROM 'PREVISTO' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: lançamento com status % não pode ser conciliado', v_lanc.status;
  END IF;

  -- A linha do extrato é receita ou despesa; transferência tem fluxo próprio.
  IF p_tipo IS NOT NULL AND v_lanc.tipo <> 'TRANSFERENCIA' AND v_lanc.tipo IS DISTINCT FROM p_tipo THEN
    RAISE EXCEPTION 'TIPO_DIVERGENTE: o lançamento é % e a linha do extrato é %', v_lanc.tipo, p_tipo;
  END IF;

  IF v_lanc.status = 'PREVISTO' THEN
    IF v_lanc.tipo = 'TRANSFERENCIA' THEN
      RAISE EXCEPTION 'STATUS_INVALIDO: transferência prevista não é conciliada por aqui';
    END IF;
    -- `referencia_modulo` tem DEFAULT '': vínculo se testa com NULLIF, nunca IS NULL.
    IF NULLIF(btrim(v_lanc.referencia_modulo), '') IS NOT NULL THEN
      RAISE EXCEPTION 'LANCAMENTO_PREVISTO_VINCULADO: este lançamento pertence a um título de Contas a Pagar/Receber — dê baixa pelo título';
    END IF;
    -- Realizar é dizer que o dinheiro saiu: só com a linha do extrato que prova isso.
    IF p_tipo IS NULL OR p_tipo NOT IN ('RECEITA', 'DESPESA') OR p_data_extrato IS NULL THEN
      RAISE EXCEPTION 'LINHA_EXTRATO_OBRIGATORIA: informe o tipo e a data da linha do extrato';
    END IF;
    IF p_data_extrato > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'DATA_EXTRATO_FUTURA: a linha do extrato tem data futura (%)', to_char(p_data_extrato, 'DD/MM/YYYY');
    END IF;
    v_realizar := true;
  END IF;

  -- O vínculo mantém o valor do lançamento. Espelho de CP/CR, ajuste e
  -- transferência ficam fora: o espelho guarda o valor do título e a diferença
  -- para o extrato já nasceu como lançamento de ajuste.
  IF p_valor_extrato IS NOT NULL
     AND v_lanc.tipo <> 'TRANSFERENCIA'
     AND COALESCE(v_lanc.origem, '') NOT IN ('espelho_cp', 'espelho_cr', 'ajuste_pagamento', 'transferencia')
     AND abs(v_lanc.valor - p_valor_extrato) >= 0.01 THEN
    RAISE EXCEPTION 'VALOR_DIVERGENTE: o lançamento é de % e a linha do extrato de % — corrija o valor no Livro Razão antes de conciliar',
      to_char(v_lanc.valor, 'FM999999990.00'), to_char(p_valor_extrato, 'FM999999990.00');
  END IF;

  -- Um lançamento cobre uma linha do extrato por conta: um 2º FITID apontando
  -- para ele esconderia uma movimentação real (duas vendas iguais no mesmo dia).
  -- O reenvio do mesmo FITID continua idempotente.
  IF v_external_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.fin_conciliacao_vinculos v
    WHERE v.company_id = v_company
      AND v.conta_id = p_conta_id
      AND v.lancamento_id = p_lancamento_id
      AND (v.external_id, v.tipo) IS DISTINCT FROM (v_external_id, p_tipo)
  ) THEN
    RAISE EXCEPTION 'LANCAMENTO_JA_VINCULADO: este lançamento já está vinculado a outra linha do extrato desta conta';
  END IF;

  IF v_lanc.conta_id IS NULL THEN
    v_conta_ajustada := true;
  ELSIF v_lanc.conta_id <> p_conta_id
     AND COALESCE(v_lanc.conta_destino_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_conta_id THEN
    IF NOT COALESCE(p_mover_conta, false) THEN
      RAISE EXCEPTION 'CONTA_DIVERGENTE: o lançamento pertence a outra conta bancária';
    END IF;
    -- Mudar de conta é editar o lançamento: o valor sai do saldo de uma conta e
    -- entra no da outra. Além da conciliação, exige a permissão de edição.
    IF NOT public.has_any_permission(v_uid, ARRAY[
      'financeiro:lancamentos:edit',
      'finance:manage',
      'system:global:manage'
    ]) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:edit necessário para trazer o lançamento de outra conta';
    END IF;
    IF v_lanc.tipo = 'TRANSFERENCIA'
       OR v_lanc.origem IN ('espelho_cp', 'espelho_cr', 'ajuste_pagamento', 'transferencia', 'conciliacao')
       OR NULLIF(btrim(v_lanc.referencia_modulo), '') IS NOT NULL THEN
      RAISE EXCEPTION 'CONTA_DIVERGENTE: baixa de título, transferência e lançamento vindo de extrato não mudam de conta pela conciliação';
    END IF;
    -- Conciliado no extrato da conta de origem: tirá-lo de lá abriria um buraco
    -- no saldo conferido daquela conta.
    IF v_lanc.conciliado IS TRUE
       OR EXISTS (
         SELECT 1 FROM public.fin_conciliacao_vinculos v
         WHERE v.company_id = v_company
           AND v.lancamento_id = p_lancamento_id
           AND v.conta_id <> p_conta_id
       ) THEN
      RAISE EXCEPTION 'JA_CONCILIADO_OUTRA_CONTA: desconcilie o lançamento na conta de origem antes de trazê-lo para esta';
    END IF;
    SELECT c.nome INTO v_conta_anterior_nome
    FROM public.fin_contas c
    WHERE c.id = v_lanc.conta_id AND c.company_id = v_company;
    v_conta_movida := true;
  END IF;

  IF v_lanc.tipo <> 'TRANSFERENCIA'
     AND NOT public.fin_entity_has_category(v_lanc.id, v_lanc.categoria_id, v_lanc.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'CATEGORY_REQUIRED: o lançamento está sem categoria — corrija antes de conciliar';
  END IF;

  -- `trg_validate_fin_lancamento_update` exige justificativa ao mudar a conta de
  -- lançamento REALIZADO; fica registrada também quando o previsto vira realizado.
  v_justificativa := NULLIF(concat_ws('; ',
    CASE WHEN v_realizar
      THEN format('Pagamento confirmado pelo extrato em %s', to_char(p_data_extrato, 'DD/MM/YYYY')) END,
    CASE WHEN v_conta_ajustada
      THEN 'Conta bancária definida na conciliação do extrato' END,
    CASE WHEN v_conta_movida
      THEN format('Conta bancária corrigida na conciliação do extrato (antes: %s)',
                  COALESCE(v_conta_anterior_nome, v_lanc.conta_id::text)) END
  ), '');

  IF v_realizar OR v_conta_ajustada OR v_conta_movida OR v_lanc.conciliado IS DISTINCT FROM true THEN
    UPDATE public.fin_lancamentos
    SET conta_id = CASE WHEN v_conta_ajustada OR v_conta_movida THEN p_conta_id ELSE conta_id END,
        status = CASE WHEN v_realizar THEN 'REALIZADO' ELSE status END,
        data_pagamento = CASE WHEN v_realizar THEN p_data_extrato ELSE data_pagamento END,
        conciliado = true,
        conciliado_em = CASE WHEN conciliado IS TRUE THEN conciliado_em ELSE now() END,
        conciliado_por = CASE WHEN conciliado IS TRUE THEN conciliado_por ELSE v_uid END,
        justificativa_edicao = COALESCE(v_justificativa, justificativa_edicao),
        updated_at = now()
    WHERE id = p_lancamento_id AND company_id = v_company;
  END IF;

  IF v_external_id IS NOT NULL AND p_tipo IN ('RECEITA', 'DESPESA') THEN
    PERFORM public.reconcile_bind_extrato(p_conta_id, v_external_id, p_tipo, p_lancamento_id);
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes, depois)
  VALUES ('lancamentos', p_lancamento_id, 'reconcile_link_existing', v_uid, v_company,
    jsonb_build_object(
      'status', v_lanc.status,
      'conta_id', v_lanc.conta_id,
      'conciliado', v_lanc.conciliado,
      'data_pagamento', v_lanc.data_pagamento
    ),
    jsonb_build_object(
      'conta_id', p_conta_id, 'external_id', v_external_id,
      'origem_lancamento', v_lanc.origem, 'conta_ajustada', v_conta_ajustada,
      'conta_movida', v_conta_movida, 'realizado', v_realizar,
      'data_extrato', p_data_extrato, 'valor_extrato', p_valor_extrato));

  RETURN jsonb_build_object(
    'status', 'ok',
    'lancamento_id', p_lancamento_id,
    'origem', v_lanc.origem,
    'conta_ajustada', v_conta_ajustada,
    'conta_movida', v_conta_movida,
    'realizado', v_realizar
  );
END;
$$;

COMMENT ON FUNCTION public.reconcile_link_existing_lancamento(uuid, uuid, text, text, date, boolean, numeric) IS
  'Vincula a linha do extrato a um lançamento já existente (baixa de CP/CR ou lançamento manual): concilia, grava o FITID, realiza o PREVISTO com a data do extrato e ajusta a conta (nula sempre; diferente só com p_mover_conta). Lançamento manual exige o mesmo valor do extrato.';

REVOKE ALL ON FUNCTION public.reconcile_link_existing_lancamento(uuid, uuid, text, text, date, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_link_existing_lancamento(uuid, uuid, text, text, date, boolean, numeric) TO authenticated, service_role;

-- PL/pgSQL só resolve colunas na 1ª execução: confere aqui, no deploy, a
-- assinatura, as funções chamadas e as colunas que a função usa.
DO $$
BEGIN
  IF to_regprocedure('public.reconcile_link_existing_lancamento(uuid,uuid,text,text,date,boolean,numeric)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_link_existing_lancamento: assinatura nova não encontrada';
  END IF;
  IF to_regprocedure('public.reconcile_link_existing_lancamento(uuid,uuid,text,text,date)') IS NOT NULL THEN
    RAISE EXCEPTION 'reconcile_link_existing_lancamento: assinatura antiga ainda existe (overload)';
  END IF;
  IF to_regprocedure('public.assert_tenant()') IS NULL
     OR to_regprocedure('public.has_any_permission(uuid,text[])') IS NULL
     OR to_regprocedure('public.fin_entity_has_category(uuid,uuid,uuid)') IS NULL
     OR to_regprocedure('public.reconcile_bind_extrato(uuid,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_link_existing_lancamento: função dependente ausente';
  END IF;
  PERFORM l.id, l.company_id, l.status, l.tipo, l.valor, l.conta_id, l.conta_destino_id, l.origem,
          l.referencia_modulo, l.categoria_id, l.conciliado, l.conciliado_em, l.conciliado_por,
          l.data_pagamento, l.justificativa_edicao, l.updated_at
  FROM public.fin_lancamentos l LIMIT 0;
  PERFORM v.lancamento_id, v.conta_id, v.company_id, v.external_id, v.tipo
  FROM public.fin_conciliacao_vinculos v LIMIT 0;
  PERFORM c.id, c.nome, c.company_id FROM public.fin_contas c LIMIT 0;
  PERFORM a.entidade, a.entidade_id, a.acao, a.user_id, a.company_id, a.antes, a.depois
  FROM public.fin_audit_logs a LIMIT 0;
END $$;

NOTIFY pgrst, 'reload schema';
