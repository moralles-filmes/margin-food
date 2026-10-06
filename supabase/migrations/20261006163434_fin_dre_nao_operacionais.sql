-- DRE: não operacionais fora dos totais e "sem categoria" visível — como o DFC já faz.
--
-- Dois defeitos antigos do get_fin_dre_summary (vinham de 20260901140000 e foram copiados adiante):
--   1. `categorias` não trazia excluir_dos_totais/system_key. O DemonstrativoTree separa as raízes
--      RECEITAS/DESPESAS NÃO OPERACIONAIS pelo excluir_dos_totais da raiz; sem o campo, tudo era
--      operacional e entrava no Total de Despesas/Receitas e no Resultado do Período (Ren Sushi,
--      2026: R$ 120.592,06 de despesa e R$ 312,08 de receita não operacionais somadas ao resultado).
--   2. Valor sem categoria ia para a chave 00000000-0000-0000-0000-000000000000, que não existe na
--      árvore: sumia do DRE e dos totais. Agora vai para "Sem categoria — Receitas/Despesas"
--      (ids …101/…102, pelo tipo), as mesmas linhas sintéticas do DFC.
--
-- Muda os totais do DRE de propósito (correção da regra "Categorias não operacionais" do CLAUDE.md).
-- Mesma assinatura, permissões e quebra por centro de custo de 20261006162551; DFC e Dashboard não
-- mudam. Reverter: reaplicar o get_fin_dre_summary de 20261006162551.

CREATE OR REPLACE FUNCTION public.get_fin_dre_summary(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:dre:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  WITH effective_values AS (
    -- 1. Lançamentos REALIZADO/CONCILIADO com rateio
    SELECT r.categoria_id, r.centro_custo_id, r.valor, l.tipo
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND l.data_competencia BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 2. Lançamentos REALIZADO/CONCILIADO sem rateio
    SELECT l.categoria_id, l.centro_custo_id, l.valor, l.tipo
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND l.data_competencia BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = l.id AND r.company_id = v_company_id
      )
    UNION ALL
    -- 3. Contas a PAGAR em aberto com rateio (split sob o id da CP)
    SELECT r.categoria_id, r.centro_custo_id, r.valor, 'DESPESA'::text
    FROM fin_lancamento_rateios r
    JOIN fin_contas_pagar cp ON cp.id = r.lancamento_id AND cp.company_id = v_company_id
    WHERE cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 4. Contas a PAGAR em aberto sem rateio
    SELECT cp.categoria_id, cp.centro_custo_id, cp.valor, 'DESPESA'::text
    FROM fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = cp.id AND r.company_id = v_company_id
      )
    UNION ALL
    -- 5. Contas a RECEBER em aberto com rateio (split sob o id da CR)
    SELECT r.categoria_id, r.centro_custo_id, r.valor, 'RECEITA'::text
    FROM fin_lancamento_rateios r
    JOIN fin_contas_receber cr ON cr.id = r.lancamento_id AND cr.company_id = v_company_id
    WHERE cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- 6. Contas a RECEBER em aberto sem rateio
    SELECT cr.categoria_id, cr.centro_custo_id, cr.valor, 'RECEITA'::text
    FROM fin_contas_receber cr
    WHERE cr.company_id = v_company_id
      AND cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = cr.id AND r.company_id = v_company_id
      )
  ),
  valores AS (
    -- Sem categoria vai para a linha sintética do tipo (…101 receita / …102 despesa), como no DFC.
    -- Centro só vale se for da própria empresa; o resto cai em 'sem_centro'.
    SELECT
      CASE
        WHEN ev.categoria_id IS NOT NULL THEN ev.categoria_id::text
        WHEN ev.tipo = 'RECEITA' THEN '00000000-0000-0000-0000-000000000101'
        ELSE '00000000-0000-0000-0000-000000000102'
      END AS cat_id,
      cc.id AS centro_custo_id,
      cc.nome AS centro_nome,
      ev.valor
    FROM effective_values ev
    LEFT JOIN fin_centros_custo cc ON cc.id = ev.centro_custo_id AND cc.company_id = v_company_id
  ),
  por_categoria AS (
    SELECT v.cat_id, SUM(v.valor) as total
    FROM valores v
    GROUP BY v.cat_id
  ),
  por_centro AS (
    SELECT COALESCE(v.centro_custo_id::text, 'sem_centro') AS centro_key, v.cat_id, SUM(v.valor) AS total
    FROM valores v
    WHERE EXISTS (SELECT 1 FROM valores x WHERE x.centro_custo_id IS NOT NULL)
    GROUP BY 1, 2
  ),
  categorias_resultado AS (
    -- excluir_dos_totais/system_key: o DemonstrativoTree tira as raízes não operacionais dos totais.
    SELECT c.id, c.nome, c.codigo, c.tipo, c.parent_id, c.ordem, c.ativo,
      c.grupo, c.centro_custo_padrao_id, c.system_key, c.excluir_dos_totais
    FROM fin_categorias c
    WHERE c.company_id = v_company_id AND c.ativo = true
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000101'::uuid, 'Sem categoria — Receitas', 'S/C-R',
      'receita', NULL::uuid, 9980, true, NULL, NULL::uuid, NULL, false
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000101')
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000102'::uuid, 'Sem categoria — Despesas', 'S/C-D',
      'despesa', NULL::uuid, 9981, true, NULL, NULL::uuid, NULL, false
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000102')
  )
  SELECT jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
    'categorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'codigo', c.codigo, 'tipo', c.tipo,
        'parent_id', c.parent_id, 'ordem', c.ordem, 'ativo', c.ativo,
        'grupo', c.grupo,
        'centro_custo_padrao_id', c.centro_custo_padrao_id,
        'system_key', c.system_key,
        'excluir_dos_totais', c.excluir_dos_totais
      ) ORDER BY c.ordem, c.codigo)
      FROM categorias_resultado c
    ), '[]'::jsonb),
    'valores_por_categoria', COALESCE((
      SELECT jsonb_object_agg(pc.cat_id, pc.total)
      FROM por_categoria pc
    ), '{}'::jsonb),
    'centros_custo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cc.id, 'nome', cc.nome) ORDER BY cc.nome, cc.id)
      FROM (SELECT DISTINCT v.centro_custo_id AS id, v.centro_nome AS nome FROM valores v WHERE v.centro_custo_id IS NOT NULL) cc
    ), '[]'::jsonb),
    'valores_por_centro_custo', COALESCE((
      SELECT jsonb_object_agg(g.centro_key, g.valores)
      FROM (
        SELECT pcc.centro_key, jsonb_object_agg(pcc.cat_id, pcc.total) AS valores
        FROM por_centro pcc
        GROUP BY pcc.centro_key
      ) g
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- Força a resolução das colunas usadas já no push (PL/pgSQL só valida colunas na 1ª execução).
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM c.system_key, c.excluir_dos_totais, c.grupo, c.centro_custo_padrao_id
  FROM public.fin_categorias c
  WHERE c.company_id = v_sentinel
  LIMIT 1;

  PERFORM l.tipo, l.centro_custo_id FROM public.fin_lancamentos l WHERE l.company_id = v_sentinel LIMIT 1;
END
$$;
