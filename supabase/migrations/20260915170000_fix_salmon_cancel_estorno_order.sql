-- Bug: cancel_salmon_entry_atomic e cancel_salmon_manipulation_atomic marcavam a
-- movimentação original como CANCELADO e só DEPOIS inseriam a movimentação de
-- estorno referenciando-a (estorno_de_id = v_mov.id). O trigger trg_validate_estorno
-- (migration 20260309150114) bloqueia qualquer INSERT de estorno cujo original já
-- esteja CANCELADO — e como o UPDATE roda na mesma transação, o próprio SELECT do
-- trigger já enxerga o status recém-alterado. Resultado: TODA exclusão de entrada/
-- manipulação de salmão com movimentação de estoque vinculada falhava com
-- "409: Movimentação original já foi cancelada. Estorno duplicado bloqueado."
-- e a transação inteira dava rollback — inclusive o UPDATE do status ACTIVE→CANCELLED,
-- então o saldo em Controle de Estoque nunca era corrigido e a manipulação nunca saía
-- da lista de "ativas" (bloqueando também a exclusão da entrada, que exige nenhuma
-- manipulação ACTIVE vinculada).
--
-- Fix: inserir a movimentação de estorno ENQUANTO o original ainda está ATIVO, e só
-- então marcá-lo como CANCELADO. O índice único uq_movimentacoes_estorno_de_id_ativo
-- (migration 20260821144721) já impede um segundo estorno ativo para o mesmo original,
-- então a garantia contra duplicidade não depende da ordem antiga.

CREATE OR REPLACE FUNCTION public.cancel_salmon_entry_atomic(p_entry_id uuid, p_reason text DEFAULT 'Cancelamento de entrada')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_entry RECORD;
  v_mov RECORD;
  v_estorno_id uuid;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  SELECT * INTO v_entry FROM salmon_entries
  WHERE id = p_entry_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada não encontrada ou sem permissão.'; END IF;
  IF v_entry.status = 'CANCELLED' THEN RAISE EXCEPTION 'Entrada já cancelada.'; END IF;

  IF EXISTS (SELECT 1 FROM salmon_manipulations
             WHERE entry_id = p_entry_id AND status = 'ACTIVE' AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'Existem manipulações ativas vinculadas. Cancele-as primeiro.';
  END IF;

  UPDATE salmon_entries SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_entry_id AND company_id = v_company_id;

  SELECT * INTO v_mov FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_ENTRY' AND reference_id = p_entry_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov.id IS NOT NULL THEN
    -- Insere o estorno ANTES de cancelar o original (trg_validate_estorno recusa
    -- estorno_de_id que já esteja CANCELADO).
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, company_id
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'ENTRADA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno — ' || p_reason, v_caller, 'ATIVO', v_mov.id,
      'SALMON_ENTRY', v_mov.reference_id || '_ESTORNO', false, 'salmon', v_mov.salmon_lot_id, v_company_id
    ) RETURNING id INTO v_estorno_id;

    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id AND company_id = v_company_id;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_entries', p_entry_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_kg', v_entry.gross_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'entry_id', p_entry_id, 'estorno_id', v_estorno_id, 'company_id', v_company_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_salmon_manipulation_atomic(p_manip_id uuid, p_reason text DEFAULT 'Cancelamento de manipulação')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_manip RECORD;
  v_mov RECORD;
  v_estorno_id uuid;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  SELECT * INTO v_manip FROM salmon_manipulations
  WHERE id = p_manip_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Manipulação não encontrada ou sem permissão.'; END IF;
  IF v_manip.status = 'CANCELLED' THEN RAISE EXCEPTION 'Manipulação já cancelada.'; END IF;

  UPDATE salmon_manipulations SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_manip_id AND company_id = v_company_id;

  SELECT * INTO v_mov FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_MANIPULATION' AND reference_id = p_manip_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov.id IS NOT NULL THEN
    -- Insere o estorno ANTES de cancelar o original (trg_validate_estorno recusa
    -- estorno_de_id que já esteja CANCELADO).
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor, company_id
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'SAIDA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno — ' || p_reason, v_caller, 'ATIVO', v_mov.id,
      'SALMON_MANIPULATION', v_mov.reference_id || '_ESTORNO', true, 'salmon', v_mov.salmon_lot_id, v_mov.setor, v_company_id
    ) RETURNING id INTO v_estorno_id;

    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id AND company_id = v_company_id;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_manipulations', p_manip_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_out_kg', v_manip.gross_out_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'manipulation_id', p_manip_id, 'estorno_id', v_estorno_id, 'company_id', v_company_id);
END;
$function$;
