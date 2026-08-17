-- reconcile_create_transfer não tinha nenhuma checagem de duplicidade: cada
-- chamada inseria um novo fin_lancamentos, mesmo que já existisse uma
-- transferência idêntica (mesmo par de contas, mesmo valor, mesma janela de
-- data). Combinado com o bug de reconhecimento de contrapartida (o matcher
-- genérico de linhas de extrato nunca considera lançamentos tipo=TRANSFERENCIA
-- como candidato — comparação `ex.tipo !== linha.tipo` sempre falha, pois uma
-- linha de extrato só é RECEITA/DESPESA), o usuário acabava marcando a mesma
-- transferência real como "nova" em cada extrato importado, duplicando (e no
-- caso confirmado em produção, triplicando) o lançamento.
--
-- Esta migration corrige a ponta do banco: antes de inserir, procura uma
-- transferência REALIZADA idêntica (mesmas contas na mesma direção, mesmo
-- valor, janela de 3 dias). Se houver exatamente 1 candidata inequívoca,
-- reaproveita em vez de criar outra. Ambíguo (>1 candidata) não reaproveita —
-- cai no INSERT normal, mesma cautela já usada em
-- reconcile_auto_bind_transfer_counterparts (só reconhece automaticamente
-- quando há um único melhor candidato).
--
-- O reconhecimento de contrapartida por valor/data no cliente (matchTransferCandidate,
-- em src/lib/conciliacaoTransferMatch.ts) é a correção complementar: evita que o
-- usuário sequer chegue a chamar esta RPC de novo para a mesma transferência.

CREATE OR REPLACE FUNCTION public.reconcile_create_transfer(
  p_data date,
  p_valor numeric,
  p_descricao text,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_lancamento_id uuid;
  v_nome_origem text;
  v_nome_destino text;
  v_existing_id uuid;
  v_existing_count integer;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: valor deve ser maior que zero';
  END IF;

  IF p_conta_origem_id = p_conta_destino_id THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: contas de origem e destino devem ser diferentes';
  END IF;

  SELECT c.nome INTO v_nome_origem
  FROM public.fin_contas c
  WHERE c.id = p_conta_origem_id AND c.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta de origem';
  END IF;

  SELECT c.nome INTO v_nome_destino
  FROM public.fin_contas c
  WHERE c.id = p_conta_destino_id AND c.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta de destino';
  END IF;

  -- Serializa por par de contas (ordem-independente) para impedir que duas
  -- conciliações concorrentes — uma em cada extremidade da transferência —
  -- criem duplicidade em corrida entre a checagem abaixo e o INSERT.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_company::text || ':transfer:' ||
      least(p_conta_origem_id::text, p_conta_destino_id::text) || ':' ||
      greatest(p_conta_origem_id::text, p_conta_destino_id::text),
      0
    )
  );

  WITH candidates AS (
    SELECT l.id, abs(l.data_competencia - p_data) AS date_distance
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.tipo = 'TRANSFERENCIA'
      AND l.status = 'REALIZADO'
      AND l.conta_id = p_conta_origem_id
      AND l.conta_destino_id = p_conta_destino_id
      AND l.valor = p_valor
      AND l.data_competencia BETWEEN (p_data - 3) AND (p_data + 3)
  ), nearest AS (
    SELECT c.id
    FROM candidates c
    WHERE c.date_distance = (SELECT min(c2.date_distance) FROM candidates c2)
  )
  SELECT count(*)::integer, min(n.id)
  INTO v_existing_count, v_existing_id
  FROM nearest n;

  IF v_existing_count = 1 AND v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'existing', 'lancamento_id', v_existing_id);
  END IF;

  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento,
    descricao, conta_id, conta_destino_id,
    status, forma_pagamento, conciliado, conciliado_em, conciliado_por,
    created_by, company_id, origem
  )
  VALUES (
    'TRANSFERENCIA', p_valor, p_data, p_data,
    COALESCE(NULLIF(btrim(p_descricao), ''), format('Transferência: %s → %s', v_nome_origem, v_nome_destino)),
    p_conta_origem_id, p_conta_destino_id,
    'REALIZADO', 'TRANSFERENCIA', true, now(), v_uid,
    v_uid, v_company, 'transferencia'
  )
  RETURNING id INTO v_lancamento_id;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, user_id, company_id, depois
  )
  VALUES (
    'transferencia', v_lancamento_id, 'reconcile_transfer', v_uid, v_company,
    jsonb_build_object(
      'lancamento_id', v_lancamento_id,
      'origem', p_conta_origem_id,
      'destino', p_conta_destino_id,
      'valor', p_valor,
      'data', p_data,
      'modelo', 'registro_unico'
    )
  );

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$$;

-- Força a resolução das colunas durante o db push.
DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM l.id, l.tipo, l.valor, l.conta_id, l.conta_destino_id,
          l.company_id, l.status, l.data_competencia
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_sentinel;
END $$;
