
DROP FUNCTION IF EXISTS public.get_inactive_stock_items();

CREATE OR REPLACE FUNCTION public.get_inactive_stock_items()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_company uuid;
BEGIN
  v_company := assert_tenant();
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
    FROM (
      SELECT p.id, p.nome_produto, p.categoria, p.unidade_medida, MAX(m.data) AS ultima_saida
      FROM produtos p
      LEFT JOIN movimentacoes_estoque m ON m.produto_id = p.id AND m.status = 'ATIVO' AND m.direction = 'OUT' AND m.company_id = v_company
      WHERE p.ativo AND p.company_id = v_company
      GROUP BY p.id, p.nome_produto, p.categoria, p.unidade_medida
      HAVING MAX(m.data) IS NULL OR MAX(m.data) < (CURRENT_DATE - interval '30 days')
      ORDER BY ultima_saida NULLS FIRST LIMIT 20
    ) sub
  );
END;
$function$;
