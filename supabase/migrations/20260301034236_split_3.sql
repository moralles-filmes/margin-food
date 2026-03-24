DROP FUNCTION IF EXISTS public.delete_transfer CASCADE;
CREATE OR REPLACE FUNCTION public.delete_transfer(p_lancamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := assert_tenant();
  IF NOT (has_permission(auth.uid(), 'finance:manage') OR has_permission(auth.uid(), 'financeiro:lancamentos:delete')) THEN
    RAISE EXCEPTION 'Sem permissão (financeiro:lancamentos:delete)';
  END IF;
  DELETE FROM fin_lancamentos WHERE id = p_lancamento_id AND company_id = v_company AND tipo = 'TRANSFERENCIA';
  IF NOT FOUND THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  RETURN jsonb_build_object('ok', true);
END; $function$;