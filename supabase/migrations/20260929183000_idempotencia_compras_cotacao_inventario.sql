-- Idempotência dos envios de Compras, Cotação e criação de Inventário.
--
-- Mesmo padrão de op_registrar_movimentacao: a chave é DERIVADA da operação no
-- cliente (semente + conteúdo), o índice único parcial com company_id é a
-- garantia real, unique_violation é tratado como reenvio (devolve o registro
-- existente) e conteúdo divergente com a mesma chave levanta
-- REQUEST_ID_REUTILIZADO.
--
-- 1. create_purchase_order_atomic: compara a impressão digital do pedido no
--    replay e trata unique_violation. Assinatura e retorno inalterados; o
--    replay passa a informar se o pedido já foi excluído (`deleted`).
-- 2. create_cotacao_atomic: ganha p_idempotency_key (DEFAULT NULL — o front em
--    produção continua chamando com 7 parâmetros) e deixa de gerar COT-000N+1
--    num reenvio.
-- 3. create_inventory_atomic: o replay filtra company_id, trata 23505 e devolve
--    {inventario_id, idempotent}. A Edge `inventario` publicada já lê esse
--    formato (`rpcResult.inventario_id` / `rpcResult.idempotent`), então não
--    precisa ser republicada.
-- 4. cotacao_whatsapp_logs: chave única por tentativa e status UNKNOWN (a
--    Z-API não aceita id de deduplicação; a tentativa é registrada antes do
--    envio pela Edge send-whatsapp-zapi).
--
-- Corpos copiados do banco vivo (pg_get_functiondef) em 2026-09-29. O
-- search_path passa a terminar em pg_temp nas três funções.

-- ─────────────────────────────────────────────────────────────────────────────
-- Colunas e índices
-- ─────────────────────────────────────────────────────────────────────────────

-- Impressão digital do pedido (identidade: título, tipo, fornecedor,
-- responsável e itens+quantidades; preço fica de fora porque o gerador do
-- calendário relê o preço do catálogo a cada clique). NULL em pedidos antigos
-- e nos da conversão de cotação: o replay só compara quando existe.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text;

ALTER TABLE public.cotacoes
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text;

ALTER TABLE public.cotacao_whatsapp_logs
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Colunas novas nascem vazias, então não há duplicata a contar; a checagem
-- fica aqui para o caso de a migration ser reaplicada sobre dados existentes.
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cotacoes WHERE idempotency_key IS NOT NULL
    GROUP BY company_id, idempotency_key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'cotacoes: chave de idempotência duplicada — resolver antes do índice único';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cotacao_whatsapp_logs WHERE idempotency_key IS NOT NULL
    GROUP BY company_id, idempotency_key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'cotacao_whatsapp_logs: chave de idempotência duplicada — resolver antes do índice único';
  END IF;
END $check$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cotacoes_company_idempotency
  ON public.cotacoes (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cotacao_wa_logs_company_idempotency
  ON public.cotacao_whatsapp_logs (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- UNKNOWN = a Edge não conseguiu saber se a Z-API enviou (timeout, queda de
-- conexão, 5xx). PENDING = tentativa registrada, ainda sem desfecho.
ALTER TABLE public.cotacao_whatsapp_logs
  DROP CONSTRAINT IF EXISTS cotacao_whatsapp_logs_status_check;
ALTER TABLE public.cotacao_whatsapp_logs
  ADD CONSTRAINT cotacao_whatsapp_logs_status_check
  CHECK (status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'ERROR'::text, 'UNKNOWN'::text]));

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. create_purchase_order_atomic (assinatura inalterada → CREATE OR REPLACE)
-- ─────────────────────────────────────────────────────────────────────────────
-- O índice uq_po_company_idempotency NÃO muda: create_purchase_orders_from_cotacao_atomic
-- usa ON CONFLICT (company_id,idempotency_key) WHERE idempotency_key IS NOT NULL,
-- que depende desse predicado exato.
CREATE OR REPLACE FUNCTION public.create_purchase_order_atomic(p_payload jsonb, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid := public.assert_tenant();
  v_order_id uuid;
  v_title text;
  v_type text;
  v_status text;
  v_total numeric := 0;
  v_item jsonb;
  v_is_mercado boolean;
  v_shopping_status text;
  v_responsible uuid;
  v_sender_name text;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_existing_deleted boolean;
  v_constraint text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF NOT public.has_any_permission(v_user,ARRAY[
    'compras:pedidos:create','compras:lista:create','purchases:create',
    'compras:write','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:pedidos:create' USING ERRCODE='42501';
  END IF;

  -- Identidade da operação: o que distingue um pedido de outro. Preço fica de
  -- fora (o calendário relê o preço do catálogo a cada clique e a chave dele é
  -- lembrete+dia); a quantidade entra como jsonb para não quebrar o cast antes
  -- da validação.
  v_fingerprint := md5(jsonb_build_object(
    'title', btrim(coalesce(p_payload->>'title','')),
    'type', coalesce(p_payload->>'type',''),
    'supplier_name', coalesce(p_payload->>'supplier_name',''),
    'responsible_user_id', coalesce(p_payload->>'responsible_user_id',''),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_array(
        coalesce(nullif(t.e->>'stock_item_id',''), t.e->>'name_snapshot'),
        t.e->'qty_requested') ORDER BY t.ord)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_payload->'items')='array' THEN p_payload->'items' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS t(e, ord)
    ), '[]'::jsonb)
  )::text);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company::text||':'||p_idempotency_key::text,0));
  SELECT id, idempotency_fingerprint, deleted_at IS NOT NULL
    INTO v_order_id, v_existing_fingerprint, v_existing_deleted
  FROM public.purchase_orders
  WHERE company_id=v_company AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_fingerprint IS NOT NULL AND v_existing_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO: a chave pertence a outro pedido' USING ERRCODE='P0001';
    END IF;
    RETURN jsonb_build_object('status','idempotent','order_id',v_order_id,'deleted',v_existing_deleted);
  END IF;

  v_title := btrim(p_payload->>'title');
  v_type := p_payload->>'type';
  IF v_title='' OR v_type NOT IN ('FORNECEDOR','MERCADO','SAZONAL')
     OR jsonb_typeof(p_payload->'items') <> 'array'
     OR jsonb_array_length(p_payload->'items')=0 THEN
    RAISE EXCEPTION 'INVALID_PURCHASE_ORDER';
  END IF;
  v_is_mercado := v_type IN ('MERCADO','SAZONAL');
  v_status := CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OPEN' END;
  v_shopping_status := CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OK' END;
  v_responsible := nullif(p_payload->>'responsible_user_id','')::uuid;
  IF v_responsible IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_memberships
    WHERE user_id=v_responsible AND company_id=v_company AND status='active'
  ) THEN
    RAISE EXCEPTION 'RESPONSIBLE_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items')
  LOOP
    IF coalesce((v_item->>'qty_requested')::numeric,0) <= 0
       OR coalesce((v_item->>'estimated_unit_value')::numeric,0) < 0 THEN
      RAISE EXCEPTION 'INVALID_PURCHASE_ORDER_ITEM';
    END IF;
    IF nullif(v_item->>'stock_item_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.produtos
      WHERE id=(v_item->>'stock_item_id')::uuid AND company_id=v_company AND ativo=true
    ) THEN
      RAISE EXCEPTION 'PRODUCT_TENANT_MISMATCH' USING ERRCODE='42501';
    END IF;
    v_total := v_total+(v_item->>'qty_requested')::numeric*(v_item->>'estimated_unit_value')::numeric;
  END LOOP;

  -- O advisory lock já serializa a mesma chave; o índice único continua sendo
  -- a garantia, e a violação dele é um reenvio, não um erro.
  BEGIN
    INSERT INTO public.purchase_orders(
      title,type,priority,category,supplier_name,payment_type,need_by_date,
      delivery_forecast_date,responsible_user_id,notes,status,total_estimated,
      created_by,company_id,idempotency_key,idempotency_fingerprint,origin,origin_ref
    ) VALUES (
      v_title,v_type,coalesce(p_payload->>'priority','MEDIA'),coalesce(p_payload->>'category',''),
      nullif(p_payload->>'supplier_name',''),nullif(p_payload->>'payment_type',''),
      nullif(p_payload->>'need_by_date','')::date,nullif(p_payload->>'delivery_forecast_date','')::date,
      v_responsible,coalesce(p_payload->>'notes',''),
      v_status,v_total,v_user,v_company,p_idempotency_key,v_fingerprint,
      coalesce(nullif(p_payload->>'origin',''),'MANUAL'),nullif(p_payload->>'origin_ref','')
    ) RETURNING id INTO v_order_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'uq_po_company_idempotency' THEN RAISE; END IF;
    SELECT id, idempotency_fingerprint, deleted_at IS NOT NULL
      INTO v_order_id, v_existing_fingerprint, v_existing_deleted
    FROM public.purchase_orders
    WHERE company_id=v_company AND idempotency_key=p_idempotency_key;
    IF v_existing_fingerprint IS NOT NULL AND v_existing_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO: a chave pertence a outro pedido' USING ERRCODE='P0001';
    END IF;
    RETURN jsonb_build_object('status','idempotent','order_id',v_order_id,'deleted',v_existing_deleted);
  END;

  INSERT INTO public.purchase_order_items(
    order_id,stock_item_id,name_snapshot,unit_snapshot,estimated_unit_value,
    qty_requested,purchase_unit_snapshot,purchase_unit_cost_snapshot,
    conversion_factor_snapshot,shopping_status,company_id
  )
  SELECT v_order_id,nullif(item->>'stock_item_id','')::uuid,item->>'name_snapshot',
    item->>'unit_snapshot',(item->>'estimated_unit_value')::numeric,
    (item->>'qty_requested')::numeric,
    coalesce(nullif(item->>'purchase_unit_snapshot',''),item->>'unit_snapshot'),
    coalesce((item->>'purchase_unit_cost_snapshot')::numeric,(item->>'estimated_unit_value')::numeric),
    coalesce((item->>'conversion_factor_snapshot')::numeric,1),v_shopping_status,v_company
  FROM jsonb_array_elements(p_payload->'items') item;

  IF v_responsible IS NOT NULL AND v_responsible<>v_user THEN
    SELECT coalesce(nullif(nome,''),'Alguém') INTO v_sender_name
    FROM public.profiles WHERE id=v_user;
    INSERT INTO public.notifications(
      recipient_user_id,type,module,title,message,entity_type,entity_id,
      link_path,created_by,company_id
    ) VALUES (
      v_responsible,'MENTION','purchases',
      CASE WHEN v_is_mercado THEN 'Checklist de compra atribuído a você'
           ELSE 'Você foi mencionado em um pedido/compra' END,
      '@'||coalesce(v_sender_name,'Alguém')||' atribuiu você como responsável: "'||v_title||'"',
      'purchase_order',v_order_id,
      '/compras?subtab=pedidos-compras&order='||v_order_id::text,v_user,v_company
    );
  END IF;

  PERFORM public.log_audit('rpc','purchases','purchase_orders',v_order_id,
    'CREATE',NULL,jsonb_build_object('total_estimated',v_total,'idempotency_key',p_idempotency_key));
  RETURN jsonb_build_object('status','created','order_id',v_order_id);
END $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. create_cotacao_atomic (+ p_idempotency_key) — DROP da assinatura antiga
--    para não criar overload (PostgREST não escolheria entre as duas com 7 args)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_cotacao_atomic(text, text, date, text, uuid, jsonb, jsonb);

CREATE FUNCTION public.create_cotacao_atomic(
  p_titulo text,
  p_observacao text DEFAULT NULL::text,
  p_data_validade date DEFAULT NULL::date,
  p_origin_type text DEFAULT 'MANUAL'::text,
  p_origin_ref uuid DEFAULT NULL::uuid,
  p_itens jsonb DEFAULT '[]'::jsonb,
  p_fornecedores jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_company uuid;
  v_user    uuid;
  v_id      uuid;
  v_codigo  text;
  v_base    int;
  v_elem    jsonb;
  i         int;
  v_key     text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_fingerprint text;
  v_existing_fingerprint text;
  v_constraint text;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'PERMISSION_DENIED: não autenticado'; END IF;

  IF NOT public.has_any_permission(v_user, ARRAY['compras:cotacao:create','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:cotacao:create';
  END IF;

  IF p_titulo IS NULL OR length(btrim(p_titulo)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION: título obrigatório';
  END IF;
  IF p_origin_type IS NOT NULL AND p_origin_type NOT IN ('MANUAL','ALERTA','REQUISICAO') THEN
    RAISE EXCEPTION 'VALIDATION: origin_type inválido';
  END IF;

  IF v_key IS NOT NULL THEN
    IF length(v_key) > 128 THEN
      RAISE EXCEPTION 'VALIDATION: chave de idempotência inválida';
    END IF;
    -- A chave do cliente já é derivada do conteúdo; a impressão digital é a
    -- defesa do servidor contra a mesma chave chegando com outra cotação.
    v_fingerprint := md5(jsonb_build_object(
      'titulo', btrim(p_titulo),
      'observacao', NULLIF(btrim(coalesce(p_observacao,'')),''),
      'data_validade', p_data_validade,
      'origin_type', coalesce(p_origin_type,'MANUAL'),
      'origin_ref', p_origin_ref,
      'itens', coalesce(p_itens, '[]'::jsonb),
      'fornecedores', coalesce(p_fornecedores, '[]'::jsonb)
    )::text);

    PERFORM pg_advisory_xact_lock(hashtextextended('cotacao:'||v_company::text||':'||v_key, 0));
    SELECT id, codigo, idempotency_fingerprint INTO v_id, v_codigo, v_existing_fingerprint
    FROM public.cotacoes
    WHERE company_id = v_company AND idempotency_key = v_key;
    IF FOUND THEN
      IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO: a chave pertence a outra cotação';
      END IF;
      RETURN jsonb_build_object('success', true, 'id', v_id, 'codigo', v_codigo, 'idempotent', true);
    END IF;
  END IF;

  v_base := (SELECT count(*) FROM public.cotacoes WHERE company_id = v_company);
  FOR i IN 1..15 LOOP
    v_codigo := 'COT-' || lpad((v_base + i)::text, 5, '0');
    BEGIN
      INSERT INTO public.cotacoes (company_id, codigo, titulo, observacao, data_validade, origin_type, origin_ref, status, created_by,
                                   idempotency_key, idempotency_fingerprint)
      VALUES (v_company, v_codigo, btrim(p_titulo), NULLIF(btrim(coalesce(p_observacao,'')),''), p_data_validade,
              coalesce(p_origin_type,'MANUAL'), p_origin_ref, 'RASCUNHO', v_user,
              v_key, v_fingerprint)
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      -- Colisão da chave de idempotência é um reenvio (o advisory lock já
      -- serializa a mesma chave; isto é a garantia do índice). Colisão de
      -- código continua tentando o próximo número.
      IF v_constraint = 'uq_cotacoes_company_idempotency' THEN
        SELECT id, codigo, idempotency_fingerprint INTO v_id, v_codigo, v_existing_fingerprint
        FROM public.cotacoes
        WHERE company_id = v_company AND idempotency_key = v_key;
        IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
          RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO: a chave pertence a outra cotação';
        END IF;
        RETURN jsonb_build_object('success', true, 'id', v_id, 'codigo', v_codigo, 'idempotent', true);
      END IF;
      v_id := NULL;
    END;
  END LOOP;
  IF v_id IS NULL THEN RAISE EXCEPTION 'VALIDATION: falha ao gerar código da cotação'; END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) LOOP
    INSERT INTO public.cotacao_itens
      (cotacao_id, company_id, produto_id, produto_nome_snapshot, unidade_snapshot,
       purchase_unit_snapshot, conversion_factor_snapshot, quantidade, observacao)
    VALUES (
      v_id, v_company,
      NULLIF(v_elem->>'produto_id','')::uuid,
      coalesce(NULLIF(btrim(v_elem->>'produto_nome_snapshot'),''), 'Item'),
      NULLIF(v_elem->>'unidade_snapshot',''),
      NULLIF(v_elem->>'purchase_unit_snapshot',''),
      coalesce((v_elem->>'conversion_factor_snapshot')::numeric, 1),
      coalesce((v_elem->>'quantidade')::numeric, 0),
      NULLIF(v_elem->>'observacao','')
    );
  END LOOP;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(coalesce(p_fornecedores, '[]'::jsonb)) LOOP
    INSERT INTO public.cotacao_fornecedores
      (cotacao_id, company_id, supplier_id, supplier_nome_snapshot, whatsapp_snapshot, pedido_minimo_snapshot, status)
    VALUES (
      v_id, v_company,
      NULLIF(v_elem->>'supplier_id','')::uuid,
      coalesce(NULLIF(btrim(v_elem->>'supplier_nome_snapshot'),''), 'Fornecedor'),
      NULLIF(v_elem->>'whatsapp_snapshot',''),
      coalesce((v_elem->>'pedido_minimo_snapshot')::numeric, 0),
      'AGUARDANDO'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'codigo', v_codigo, 'idempotent', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_cotacao_atomic(text, text, date, text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cotacao_atomic(text, text, date, text, uuid, jsonb, jsonb, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. create_inventory_atomic (RETURNS uuid → jsonb) — o tipo de retorno não
--    muda com CREATE OR REPLACE, então DROP + CREATE com os mesmos argumentos
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_inventory_atomic(text, date, text, uuid, text[], text, text, text);

CREATE FUNCTION public.create_inventory_atomic(
  p_tipo text,
  p_data date,
  p_hora text,
  p_turno_id uuid,
  p_categorias text[] DEFAULT '{}'::text[],
  p_observacao text DEFAULT ''::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_metodo_contagem text DEFAULT 'lista'::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_tenant uuid;
  v_user_id uuid;
  v_inv_id uuid;
  v_itens_count int := 0;
  v_metodo text := CASE WHEN p_metodo_contagem IN ('lista', 'codigo') THEN p_metodo_contagem ELSE 'lista' END;
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing record;
  v_constraint text;
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

  -- Caminho rápido do reenvio. O SELECT é só atalho: a garantia é o índice
  -- uq_inventarios_company_idempotency, tratado no INSERT abaixo.
  IF v_key IS NOT NULL THEN
    SELECT id, tipo, data, hora, turno_id, categorias, metodo_contagem INTO v_existing
    FROM inventarios
    WHERE company_id = v_tenant AND idempotency_key = v_key;
    IF FOUND THEN
      IF v_existing.tipo IS DISTINCT FROM p_tipo
         OR v_existing.data IS DISTINCT FROM p_data
         OR v_existing.hora IS DISTINCT FROM p_hora::time
         OR v_existing.turno_id IS DISTINCT FROM p_turno_id
         OR v_existing.categorias IS DISTINCT FROM COALESCE(p_categorias, '{}')
         OR v_existing.metodo_contagem IS DISTINCT FROM v_metodo THEN
        RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO: a chave pertence a outro inventário';
      END IF;
      RETURN jsonb_build_object('inventario_id', v_existing.id, 'idempotent', true);
    END IF;
  END IF;

  BEGIN
    INSERT INTO inventarios (
      company_id, tipo, data, hora, turno_id, categorias,
      responsavel_user_id, observacao, status, idempotency_key, metodo_contagem
    ) VALUES (
      v_tenant, p_tipo, p_data, p_hora::time, p_turno_id, COALESCE(p_categorias, '{}'),
      v_user_id, COALESCE(p_observacao, ''), 'RASCUNHO', v_key, v_metodo
    ) RETURNING id INTO v_inv_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'uq_inventarios_company_idempotency' THEN RAISE; END IF;
    -- Outra chamada com a mesma chave gravou primeiro: é reenvio.
    SELECT id, tipo, data, hora, turno_id, categorias, metodo_contagem INTO v_existing
    FROM inventarios
    WHERE company_id = v_tenant AND idempotency_key = v_key;
    IF v_existing.tipo IS DISTINCT FROM p_tipo
       OR v_existing.data IS DISTINCT FROM p_data
       OR v_existing.hora IS DISTINCT FROM p_hora::time
       OR v_existing.turno_id IS DISTINCT FROM p_turno_id
       OR v_existing.categorias IS DISTINCT FROM COALESCE(p_categorias, '{}')
       OR v_existing.metodo_contagem IS DISTINCT FROM v_metodo THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO: a chave pertence a outro inventário';
    END IF;
    RETURN jsonb_build_object('inventario_id', v_existing.id, 'idempotent', true);
  END;

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

  RETURN jsonb_build_object('inventario_id', v_inv_id, 'idempotent', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_inventory_atomic(text, date, text, uuid, text[], text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_atomic(text, date, text, uuid, text[], text, text, text) TO authenticated, service_role;

-- PL/pgSQL só resolve colunas na 1ª execução: toca as colunas novas agora para
-- a migration falhar aqui, e não na primeira chamada em produção.
DO $check$
BEGIN
  PERFORM 1 FROM public.purchase_orders WHERE idempotency_fingerprint IS NOT NULL LIMIT 1;
  PERFORM 1 FROM public.cotacoes WHERE idempotency_key IS NOT NULL AND idempotency_fingerprint IS NOT NULL LIMIT 1;
  PERFORM 1 FROM public.cotacao_whatsapp_logs WHERE idempotency_key IS NOT NULL LIMIT 1;
  PERFORM 1 FROM public.inventarios WHERE idempotency_key IS NOT NULL AND metodo_contagem IS NOT NULL LIMIT 1;
END $check$;
