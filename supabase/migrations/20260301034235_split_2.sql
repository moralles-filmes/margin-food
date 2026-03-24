DROP FUNCTION IF EXISTS public.create_transfer CASCADE;
CREATE OR REPLACE FUNCTION public.create_transfer(p_conta_origem uuid, p_conta_destino uuid, p_valor numeric, p_data date, p_descricao text, p_created_by uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_company uuid;
BEGIN
  v_company := assert_tenant();
  IF NOT (has_permission(auth.uid(), 'finance:manage') OR has_permission(auth.uid(), 'financeiro:lancamentos:create')) THEN
    RAISE EXCEPTION 'Sem permissão (financeiro:lancamentos:create)';
  END IF;
  IF p_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM fin_contas WHERE id = p_conta_origem AND company_id = v_company) THEN RAISE EXCEPTION 'Conta origem não encontrada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM fin_contas WHERE id = p_conta_destino AND company_id = v_company) THEN RAISE EXCEPTION 'Conta destino não encontrada'; END IF;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, descricao, conta_id, conta_destino_id, status, created_by, company_id)
  VALUES ('TRANSFERENCIA', p_valor, p_data, COALESCE(p_descricao,'Transferência'), p_conta_origem, p_conta_destino, 'REALIZADO', COALESCE(p_created_by, auth.uid()), v_company)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END; $function$;

-- delete_transfer: accept finance:manage OR financeiro:lancamentos:delete