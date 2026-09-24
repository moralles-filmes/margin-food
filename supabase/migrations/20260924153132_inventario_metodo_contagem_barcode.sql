-- Contagem de inventário via código de barras: novo método de contagem +
-- RPC de busca de item por barcode, escopada ao inventário aberto (não ao
-- setor operacional — op_find_produto_por_barcode é de outro domínio de
-- permissão e não é reaproveitada aqui).

ALTER TABLE public.inventarios
  ADD COLUMN IF NOT EXISTS metodo_contagem text NOT NULL DEFAULT 'lista';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventarios_metodo_contagem_check'
  ) THEN
    ALTER TABLE public.inventarios
      ADD CONSTRAINT inventarios_metodo_contagem_check CHECK (metodo_contagem IN ('lista', 'codigo'));
  END IF;
END $$;

-- create_inventory_atomic ganha p_metodo_contagem (DEFAULT 'lista' preserva
-- todo caller existente, inclusive o Edge Function 'create' antes do Task 2).
-- Assinatura muda -> precisa DROP da antiga antes do CREATE OR REPLACE, senão
-- o Postgres cria um overload em vez de substituir.
DROP FUNCTION IF EXISTS public.create_inventory_atomic(text, date, text, uuid, text[], text, text);

CREATE OR REPLACE FUNCTION public.create_inventory_atomic(
  p_tipo text,
  p_data date,
  p_hora text,
  p_turno_id uuid,
  p_categorias text[] DEFAULT '{}'::text[],
  p_observacao text DEFAULT ''::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_metodo_contagem text DEFAULT 'lista'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_user_id uuid;
  v_inv_id uuid;
  v_itens_count int := 0;
  v_metodo text := CASE WHEN p_metodo_contagem IN ('lista', 'codigo') THEN p_metodo_contagem ELSE 'lista' END;
BEGIN
  BEGIN
    v_tenant := assert_tenant();
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro de Tenant: %', SQLERRM;
  END;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF NOT has_any_permission(v_user_id, ARRAY['inventario:criar:create', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Permissão negada: inventario:criar:create necessário';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_inv_id FROM inventarios WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_inv_id; END IF;
  END IF;

  INSERT INTO inventarios (
    company_id, tipo, data, hora, turno_id, categorias,
    responsavel_user_id, observacao, status, idempotency_key, metodo_contagem
  ) VALUES (
    v_tenant, p_tipo, p_data, p_hora::time, p_turno_id, COALESCE(p_categorias, '{}'),
    v_user_id, COALESCE(p_observacao, ''), 'RASCUNHO', p_idempotency_key, v_metodo
  ) RETURNING id INTO v_inv_id;

  IF p_tipo = 'completo' THEN
    INSERT INTO inventario_itens (company_id, inventario_id, produto_id, tipo_item, saldo_teorico, custo_snapshot)
    SELECT
      v_tenant, v_inv_id, p.id, 'geral',
      GREATEST(0, COALESCE(p.saldo_atual, 0)),
      COALESCE(
        NULLIF(p.default_cost_base_unit, 0),
        CASE
          WHEN COALESCE(p.fator_conversao_padrao, 0) > 0
            THEN p.custo_padrao / p.fator_conversao_padrao
          ELSE p.custo_padrao
        END,
        0
      )
    FROM produtos p
    WHERE p.ativo = true AND p.company_id = v_tenant;

    GET DIAGNOSTICS v_itens_count = ROW_COUNT;
  END IF;

  INSERT INTO audit_inventario_log (company_id, inventario_id, user_id, user_role, acao, depois)
  VALUES (
    v_tenant, v_inv_id, v_user_id,
    COALESCE((SELECT string_agg(role::text, ',') FROM user_roles WHERE user_id = v_user_id AND company_id = public.assert_tenant()), 'unknown'),
    'CRIACAO',
    jsonb_build_object('tipo', p_tipo, 'turno_id', p_turno_id, 'itens_count', v_itens_count, 'metodo_contagem', v_metodo)
  );

  RETURN v_inv_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_inventory_atomic(text, date, text, uuid, text[], text, text, text) TO authenticated;

-- Busca de item do inventário por código de barras — escopada ao inventário
-- aberto. Reaproveita produto_codigos_barras, mas com o gate de permissão do
-- módulo Inventário (inventario:detalhe:edit), diferente do domínio
-- operacional (operacional:movimentacao:* + setor).
CREATE OR REPLACE FUNCTION public.inventario_find_item_por_barcode(
  p_inventario_id uuid,
  p_barcode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid := public.assert_tenant();
  v_codigo text := nullif(regexp_replace(btrim(coalesce(p_barcode, '')), '[[:cntrl:]]', '', 'g'), '');
  v_item record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_permission(auth.uid(), ARRAY['inventario:detalhe:edit', 'inventario:criar:create', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: inventario:detalhe:edit' USING ERRCODE = '42501';
  END IF;
  IF v_codigo IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT
    ii.id AS item_id, ii.produto_id, p.nome_produto, coalesce(p.sku, '') AS sku,
    p.unidade_medida, coalesce(p.unidade_compra, p.unidade_medida) AS unidade_compra,
    coalesce(nullif(p.fator_conversao_padrao, 0), 1) AS fator_conversao_padrao,
    ii.saldo_teorico, ii.contagem_fisica, ii.classificacao
  INTO v_item
  FROM public.produto_codigos_barras pcb
  JOIN public.produtos p ON p.id = pcb.produto_id AND p.company_id = pcb.company_id
  JOIN public.inventario_itens ii ON ii.produto_id = p.id
    AND ii.inventario_id = p_inventario_id AND ii.company_id = pcb.company_id
  WHERE pcb.company_id = v_company_id AND pcb.codigo = v_codigo AND ii.deleted_at IS NULL
  LIMIT 1;

  IF v_item.item_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.produto_codigos_barras WHERE company_id = v_company_id AND codigo = v_codigo) THEN
      RETURN jsonb_build_object('status', 'not_in_inventory', 'barcode', v_codigo);
    END IF;
    RETURN jsonb_build_object('status', 'not_found', 'barcode', v_codigo);
  END IF;

  RETURN jsonb_build_object(
    'status', 'found',
    'item_id', v_item.item_id,
    'produto_id', v_item.produto_id,
    'nome_produto', v_item.nome_produto,
    'sku', v_item.sku,
    'barcode', v_codigo,
    'unidade_medida', v_item.unidade_medida,
    'unidade_compra', v_item.unidade_compra,
    'fator_conversao_padrao', v_item.fator_conversao_padrao,
    'saldo_teorico', v_item.saldo_teorico,
    'contagem_fisica', v_item.contagem_fisica,
    'classificacao', v_item.classificacao
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.inventario_find_item_por_barcode(uuid, text) TO authenticated;
