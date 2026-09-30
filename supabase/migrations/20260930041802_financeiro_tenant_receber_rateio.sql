-- ─────────────────────────────────────────────────────────────────────────────
-- Financeiro — buscas por id sem company_id em funções SECURITY DEFINER.
--
-- 1. receive_conta_receber
--    Fazia `SELECT … FROM fin_contas_receber WHERE id = p_id FOR UPDATE` sem
--    assert_tenant() e adotava a empresa do próprio título
--    (`v_company_id := v_item.company_id`). Um usuário com financeiro:receber:edit
--    na empresa A conseguia baixar um título da empresa B conhecendo o id e o
--    updated_at: o espelho nascia na empresa B, lançado por ele. Alinhada a
--    pay_conta_pagar: empresa vem de assert_tenant() e filtra o SELECT e o
--    UPDATE. Id de outra empresa cai no mesmo "Conta não encontrada." de um id
--    inexistente — a tela mostra error.message cru, então as mensagens ficam.
--
-- 2. trg_validate_rateio_sum (varredura do catálogo vivo, mesmo padrão)
--    `fin_lancamento_rateios.lancamento_id` não tem FK (aponta para lançamento,
--    CP ou CR) e a RLS só confere o company_id da própria linha do rateio. O
--    trigger buscava o pai só por id: um rateio da empresa A apontando para um
--    lançamento da empresa B passava, e o erro de soma devolvia o valor do
--    lançamento de B. Agora o pai precisa ser da mesma empresa do rateio —
--    senão é "Lançamento não encontrado" (P0002), o mesmo caminho do órfão.
--    Conferido no banco vivo: nenhum rateio aponta para pai de outra empresa.
--
-- Demais SECURITY DEFINER do financeiro (133 no catálogo em 2026-09-30): as que
-- chamam assert_tenant()/get_current_company_id() validam o id com company_id
-- antes de atualizar por ele; as que não chamam são triggers ou só executáveis
-- por postgres/service_role.
--
-- Assinaturas inalteradas (CREATE OR REPLACE): compatível com o front em produção.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.receive_conta_receber(p_id uuid, p_expected_updated_at text, p_data_recebimento date default null::date)
 returns json
 language plpgsql
 security definer
 set search_path = 'public'
as $function$
DECLARE
  v_item RECORD;
  v_lanc_id uuid;
  v_company_id uuid;
  v_conta_exists boolean;
  v_rec date;
  v_comp date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:receber:edit', 'finance:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão para receber contas.';
  END IF;

  v_company_id := public.assert_tenant();

  SELECT * INTO v_item FROM fin_contas_receber
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF v_item.updated_at != p_expected_updated_at::timestamptz THEN
    RAISE EXCEPTION 'Registro alterado por outro usuário. Recarregue.';
  END IF;
  IF v_item.status != 'A_RECEBER' THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_item.status;
  END IF;

  v_rec := COALESCE(p_data_recebimento, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_comp := COALESCE(v_item.data_competencia, v_item.data_vencimento, v_rec);

  IF v_item.conta_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM fin_contas WHERE id = v_item.conta_id AND company_id = v_company_id) INTO v_conta_exists;
    IF NOT v_conta_exists THEN
      RAISE EXCEPTION 'Conta bancária não encontrada ou não pertence à empresa';
    END IF;
  END IF;

  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, created_by,
    referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'RECEITA', v_item.valor, v_comp, v_rec, v_item.descricao,
    v_item.categoria_id, v_item.centro_custo_id, v_item.conta_id,
    v_item.forma_pagamento, 'REALIZADO', auth.uid(),
    'contas_receber', p_id::text, v_company_id, 'espelho_cr'
  )
  RETURNING id INTO v_lanc_id;

  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lanc_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  UPDATE fin_contas_receber
  SET status = 'RECEBIDO', data_recebimento = v_rec, valor_recebido = v_item.valor, lancamento_id = v_lanc_id
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id)
  VALUES ('contas_receber', p_id, 'receber', auth.uid(), v_company_id);

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_contas_receber', p_id, 'RECEIVE',
    jsonb_build_object('status_anterior', v_item.status, 'valor', v_item.valor),
    jsonb_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO', 'data_recebimento', v_rec, 'data_competencia', v_comp));

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO');
END;
$function$;

-- Sem sessão (anon) a função já recusa em auth.uid(); tirar o EXECUTE de
-- PUBLIC/anon só fecha a porta antes de entrar nela.
revoke all on function public.receive_conta_receber(uuid, text, date) from public, anon;
grant execute on function public.receive_conta_receber(uuid, text, date) to authenticated;
grant execute on function public.receive_conta_receber(uuid, text, date) to service_role;

create or replace function public.trg_validate_rateio_sum()
 returns trigger
 language plpgsql
 security definer
 set search_path = 'public'
as $function$
DECLARE
  v_lancamento_id uuid;
  v_company_id uuid;
  v_lancamento_valor numeric;
  v_soma_rateios numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_lancamento_id := OLD.lancamento_id;
    v_company_id := OLD.company_id;
  ELSE
    v_lancamento_id := NEW.lancamento_id;
    v_company_id := NEW.company_id;
  END IF;

  -- O pai precisa ser da MESMA empresa do rateio: lancamento_id não tem FK e a
  -- RLS só confere o company_id da linha do rateio.

  -- Try fin_lancamentos first
  SELECT ABS(valor) INTO v_lancamento_valor
  FROM fin_lancamentos
  WHERE id = v_lancamento_id AND company_id = v_company_id
  FOR UPDATE;

  -- If not found, try fin_contas_pagar
  IF v_lancamento_valor IS NULL THEN
    SELECT ABS(valor) INTO v_lancamento_valor
    FROM fin_contas_pagar
    WHERE id = v_lancamento_id AND company_id = v_company_id
    FOR UPDATE;
  END IF;

  -- If not found, try fin_contas_receber
  IF v_lancamento_valor IS NULL THEN
    SELECT ABS(valor) INTO v_lancamento_valor
    FROM fin_contas_receber
    WHERE id = v_lancamento_id AND company_id = v_company_id
    FOR UPDATE;
  END IF;

  IF v_lancamento_valor IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado: %', v_lancamento_id
      USING ERRCODE = 'P0002';
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios
    FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND company_id = v_company_id AND id <> OLD.id;
  ELSE
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios
    FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND company_id = v_company_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    v_soma_rateios := v_soma_rateios + ABS(NEW.valor);
  END IF;

  IF v_soma_rateios > v_lancamento_valor + 0.01 THEN
    RAISE EXCEPTION 'Soma dos rateios (%) excede o valor do lançamento (%). Diferença: %',
      v_soma_rateios, v_lancamento_valor, v_soma_rateios - v_lancamento_valor
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Função de trigger: não é chamada por cliente nenhum.
revoke all on function public.trg_validate_rateio_sum() from public, anon, authenticated;

notify pgrst, 'reload schema';
