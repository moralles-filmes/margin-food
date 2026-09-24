-- inventario_ajustar_contagem v2 — fecha os achados da auditoria do módulo.
--
-- 1) Desfazer e edição pela lista de um inventário 'codigo' exigem que o valor
--    atual ainda seja o que a tela mostrava (p_esperado). Sem isso, um
--    "desfazer" subtraía de um total já corrigido à mão na lista, e a lista
--    gravava por cima de leituras feitas depois que ela carregou — em ambos os
--    casos um número errado, sem erro na tela. Divergência não é exceção:
--    devolve conflito = true com o valor atual, para a tela se atualizar.
-- 2) Idempotência: reenvio da mesma leitura (resposta perdida na rede) somava
--    de novo. A chave vem derivada da operação no cliente e fica no audit log;
--    a checagem roda depois do FOR UPDATE do item, então chamadas simultâneas
--    com a mesma chave serializam — e o índice único é a garantia final.
-- 3) Defesa em profundidade: UPDATEs repetem company_id; item sumido entre as
--    leituras (soft-delete concorrente) vira erro em vez de gravação com NULL.
--
-- Assinatura muda -> DROP da antiga antes (senão o Postgres cria overload).
-- A v1 ainda não tinha consumidor publicado quando esta substituiu.

DROP FUNCTION IF EXISTS public.inventario_ajustar_contagem(uuid, numeric, boolean);

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_inv_contagem_chave
  ON public.audit_inventario_log (item_id, (depois ->> 'chave'))
  WHERE acao = 'CONTAGEM' AND (depois ->> 'chave') IS NOT NULL;

-- p_origem:
--   'leitura'  — soma da contagem via código (p_delta > 0).
--   'desfazer' — subtrai uma leitura (p_delta < 0); só se o atual = p_esperado.
--   'lista'    — edição pela lista de um inventário 'codigo': p_delta = novo - p_esperado,
--                só se o atual = p_esperado (NULL = ainda não contado).
CREATE OR REPLACE FUNCTION public.inventario_ajustar_contagem(
  p_item_id uuid,
  p_delta numeric,
  p_origem text DEFAULT 'leitura',
  p_chave text DEFAULT NULL,
  p_esperado numeric DEFAULT NULL,
  p_restaurar_nao_contado boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid := public.assert_tenant();
  v_user_id uuid := auth.uid();
  v_inventario_id uuid;
  v_inv record;
  v_item record;
  v_prev record;
  v_status_anterior text;
  v_nova numeric;
  v_nao_contado boolean;
  v_dif numeric := 0;
  v_pct numeric := 0;
  v_impacto numeric := 0;
  v_class text := 'NORMAL';
  v_role text;
  v_ip text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_permission(v_user_id, ARRAY['inventario:detalhe:edit', 'inventory:count', 'inventory:edit', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: inventario:detalhe:edit' USING ERRCODE = '42501';
  END IF;
  -- abs() >= 1e12 também barra NaN e Infinity (maiores que qualquer número no Postgres).
  IF p_delta IS NULL OR abs(p_delta) >= 1e12
     OR p_origem IS NULL OR p_origem NOT IN ('leitura', 'desfazer', 'lista')
     OR (p_origem = 'leitura' AND p_delta <= 0)
     OR (p_origem = 'desfazer' AND (p_delta >= 0 OR p_esperado IS NULL))
     OR length(p_chave) > 200 THEN
    RAISE EXCEPTION 'QUANTIDADE_INVALIDA' USING ERRCODE = '22023';
  END IF;

  SELECT ii.inventario_id INTO v_inventario_id
  FROM public.inventario_itens ii
  WHERE ii.id = p_item_id AND ii.company_id = v_company_id AND ii.deleted_at IS NULL;
  IF v_inventario_id IS NULL THEN
    RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  -- Mesma ordem de lock do finalize_inventory_atomic: inventário, depois item.
  -- A transição só acontece uma vez: leituras concorrentes esperam este UPDATE
  -- e reavaliam status = 'RASCUNHO' como falso.
  UPDATE public.inventarios
     SET status = 'EM_CONTAGEM'
   WHERE id = v_inventario_id AND company_id = v_company_id AND deleted_at IS NULL
     AND status = 'RASCUNHO' AND metodo_contagem = 'codigo'
  RETURNING 'RASCUNHO'::text INTO v_status_anterior;

  -- FOR SHARE: leituras paralelas não se bloqueiam entre si, mas um finalizar
  -- (FOR UPDATE) espera, e a checagem de status abaixo não fica velha.
  SELECT i.status INTO v_inv
  FROM public.inventarios i
  WHERE i.id = v_inventario_id AND i.company_id = v_company_id AND i.deleted_at IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.status = 'FINALIZADO' THEN
    RAISE EXCEPTION 'INVENTARIO_FINALIZADO' USING ERRCODE = 'P0001';
  ELSIF v_inv.status = 'SOB_ANALISE' THEN
    RAISE EXCEPTION 'INVENTARIO_SOB_ANALISE' USING ERRCODE = 'P0001';
  ELSIF v_inv.status = 'RASCUNHO' THEN
    RAISE EXCEPTION 'INVENTARIO_RASCUNHO' USING ERRCODE = 'P0001';
  END IF;

  SELECT ii.id, ii.saldo_teorico, ii.custo_snapshot, ii.contagem_fisica,
         ii.diferenca_qtd, ii.diferenca_percent, ii.impacto_financeiro, ii.classificacao
  INTO v_item
  FROM public.inventario_itens ii
  WHERE ii.id = p_item_id AND ii.company_id = v_company_id AND ii.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  -- Reenvio da mesma operação: devolve o que já foi gravado, sem somar de novo.
  IF p_chave IS NOT NULL THEN
    SELECT a.antes, a.depois INTO v_prev
    FROM public.audit_inventario_log a
    WHERE a.item_id = p_item_id AND a.acao = 'CONTAGEM' AND (a.depois ->> 'chave') = p_chave
      AND a.company_id = v_company_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'item_id', p_item_id,
        'idempotente', true,
        'conflito', false,
        'contagem_anterior', (v_prev.antes ->> 'contagem_fisica')::numeric,
        'contagem_apos', (v_prev.depois ->> 'contagem_fisica')::numeric,
        'contagem_fisica', v_item.contagem_fisica,
        'diferenca_qtd', v_item.diferenca_qtd,
        'diferenca_percent', v_item.diferenca_percent,
        'impacto_financeiro', v_item.impacto_financeiro,
        'classificacao', v_item.classificacao,
        'status_inventario', v_inv.status
      );
    END IF;
  END IF;

  IF p_origem IN ('desfazer', 'lista') AND v_item.contagem_fisica IS DISTINCT FROM p_esperado THEN
    RETURN jsonb_build_object(
      'item_id', p_item_id,
      'idempotente', false,
      'conflito', true,
      'contagem_anterior', v_item.contagem_fisica,
      'contagem_apos', v_item.contagem_fisica,
      'contagem_fisica', v_item.contagem_fisica,
      'diferenca_qtd', v_item.diferenca_qtd,
      'diferenca_percent', v_item.diferenca_percent,
      'impacto_financeiro', v_item.impacto_financeiro,
      'classificacao', v_item.classificacao,
      'status_inventario', v_inv.status
    );
  END IF;

  v_nova := COALESCE(v_item.contagem_fisica, 0) + p_delta;
  IF v_nova < 0 THEN
    RAISE EXCEPTION 'CONTAGEM_NEGATIVA' USING ERRCODE = '22023';
  END IF;
  -- Desfazer a primeira leitura volta para "não contado" (NULL), não 0:
  -- finalize_inventory_atomic só ajusta itens com contagem_fisica NOT NULL, e
  -- um 0 esquecido zeraria o saldo do produto na finalização.
  v_nao_contado := p_origem = 'desfazer' AND p_restaurar_nao_contado AND v_nova = 0;

  IF v_nao_contado THEN
    UPDATE public.inventario_itens
       SET contagem_fisica = NULL, diferenca_qtd = 0, diferenca_percent = 0,
           impacto_financeiro = 0, classificacao = 'NORMAL',
           contado_por = NULL, contagem_inicio = NULL, contagem_fim = NULL
     WHERE id = p_item_id AND company_id = v_company_id;
  ELSE
    -- Mesma fórmula do update_contagem da Edge Function (fluxo Lista).
    v_dif := v_nova - v_item.saldo_teorico;
    v_pct := CASE
      WHEN v_item.saldo_teorico <> 0 THEN (v_dif / v_item.saldo_teorico) * 100
      WHEN v_nova > 0 THEN 100
      ELSE 0
    END;
    v_impacto := v_dif * v_item.custo_snapshot;
    v_class := CASE WHEN abs(v_pct) > 6 THEN 'CRITICO' WHEN abs(v_pct) > 2 THEN 'ALERTA' ELSE 'NORMAL' END;

    UPDATE public.inventario_itens
       SET contagem_fisica = v_nova, diferenca_qtd = v_dif, diferenca_percent = v_pct,
           impacto_financeiro = v_impacto, classificacao = v_class,
           contado_por = v_user_id, contagem_fim = now(),
           contagem_inicio = COALESCE(contagem_inicio, now())
     WHERE id = p_item_id AND company_id = v_company_id;
  END IF;

  v_role := COALESCE(
    (SELECT string_agg(role::text, ',') FROM public.user_roles WHERE user_id = v_user_id AND company_id = v_company_id),
    'viewer'
  );
  v_ip := COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', '');

  IF v_status_anterior IS NOT NULL THEN
    INSERT INTO public.audit_inventario_log (company_id, inventario_id, user_id, user_role, acao, antes, depois, ip_address)
    VALUES (v_company_id, v_inventario_id, v_user_id, v_role, 'MUDANCA_STATUS',
      jsonb_build_object('status', v_status_anterior),
      jsonb_build_object('status', 'EM_CONTAGEM', 'origem', 'primeira_leitura_codigo'), v_ip);
  END IF;

  INSERT INTO public.audit_inventario_log (company_id, inventario_id, item_id, user_id, user_role, acao, antes, depois, ip_address)
  VALUES (v_company_id, v_inventario_id, p_item_id, v_user_id, v_role, 'CONTAGEM',
    jsonb_build_object('contagem_fisica', v_item.contagem_fisica),
    jsonb_build_object(
      'contagem_fisica', CASE WHEN v_nao_contado THEN NULL ELSE v_nova END,
      'diferenca_qtd', v_dif, 'classificacao', v_class,
      'delta', p_delta, 'origem', p_origem, 'chave', p_chave
    ), v_ip);

  RETURN jsonb_build_object(
    'item_id', p_item_id,
    'idempotente', false,
    'conflito', false,
    'contagem_anterior', v_item.contagem_fisica,
    'contagem_apos', CASE WHEN v_nao_contado THEN NULL ELSE v_nova END,
    'contagem_fisica', CASE WHEN v_nao_contado THEN NULL ELSE v_nova END,
    'diferenca_qtd', v_dif,
    'diferenca_percent', v_pct,
    'impacto_financeiro', v_impacto,
    'classificacao', v_class,
    'status_inventario', v_inv.status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.inventario_ajustar_contagem(uuid, numeric, text, text, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventario_ajustar_contagem(uuid, numeric, text, text, numeric, boolean) TO authenticated;
