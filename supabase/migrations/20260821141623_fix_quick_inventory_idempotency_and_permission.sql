-- =========================================================================
-- P1: create_quick_inventory_atomic tinha duas falhas:
--
-- 1) Checava a permissão errada ('inventario:criar:create', do inventário
--    completo) em vez de 'inventario:rapido:create' — a chave que o próprio
--    registry (src/permissions/registry.ts) define para esta tela. Um
--    usuário com só 'inventario:rapido:create' (o que o admin concederia
--    seguindo a segmentação do próprio sistema) era barrado com "Forbidden".
--    Corrigido para aceitar as duas chaves (não quebra quem já depende da
--    antiga).
--
-- 2) A checagem de idempotência (`SELECT ... IF EXISTS` seguido de INSERT)
--    rodava sob READ COMMITTED sem nenhuma constraint por trás — duas
--    chamadas concorrentes com a mesma idempotency_key não se enxergavam
--    e ambas inseriam um inventário FINALIZADO com ajustes de estoque
--    duplicados. Adiciona UNIQUE (company_id, idempotency_key) parcial
--    (ignora NULL) para fechar a corrida no banco, com a função tratando
--    o unique_violation como "duplicado" em vez de estourar erro cru.
--    Client (QuickInventorySection.tsx) também corrigido para reusar a
--    mesma chave entre retries do mesmo envio, em vez de gerar uma nova
--    a cada clique (o que tornava a proteção de idempotência inerte).
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventarios_company_idempotency
ON public.inventarios (company_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_quick_inventory_atomic(p_items jsonb, p_observacao text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id       uuid;
    v_company_id     uuid;
    v_inv_id         uuid;
    v_item           jsonb;
    v_product        record;
    v_saldo          numeric;
    v_counted        numeric;
    v_diff           numeric;
    v_diff_pct       numeric;
    v_cost_base      numeric;
    v_impact         numeric;
    v_today          text;
    v_now            timestamptz;
    v_total_items    int := 0;
    v_adjusted       int := 0;
    v_total_impact   numeric := 0;
    v_acuracia_sum   numeric := 0;
    v_acuracia_count int := 0;
    v_turno_id       uuid;
BEGIN
    -- 1. Resolve actor & tenant
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'P0001';
    END IF;

    -- RBAC: require inventario:rapido:create (permissão específica desta tela,
    -- conforme registry) OU inventario:criar:create (compat com quem já tinha
    -- essa chave concedida)
    IF NOT has_any_permission(v_actor_id, ARRAY['inventario:rapido:create', 'inventario:criar:create', 'system:global:manage']) THEN
        RAISE EXCEPTION 'Forbidden: inventario:rapido:create required';
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.profiles
    WHERE id = v_actor_id;

    IF v_company_id IS NULL OR v_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
        RAISE EXCEPTION 'Tenant inválido' USING ERRCODE = 'P0001';
    END IF;

    -- Idempotency check (best-effort pre-check; a constraint UNIQUE abaixo
    -- é quem garante isso sob concorrência)
    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        IF EXISTS (
            SELECT 1 FROM public.inventarios
            WHERE company_id = v_company_id
              AND idempotency_key = p_idempotency_key
        ) THEN
            RETURN jsonb_build_object('success', false, 'reason', 'duplicate', 'message', 'Inventário rápido já registrado');
        END IF;
    END IF;

    -- Validate items array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Nenhum item informado para contagem';
    END IF;

    v_now := now();
    v_today := to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');

    -- Try to get a default turno
    SELECT id INTO v_turno_id
    FROM public.turnos
    WHERE company_id = v_company_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- 2. Create inventory header
    v_inv_id := gen_random_uuid();
    BEGIN
        INSERT INTO public.inventarios (
            id, company_id, tipo, status, data, hora,
            responsavel_user_id, observacao, idempotency_key, turno_id
        ) VALUES (
            v_inv_id, v_company_id, 'rapido', 'EM_CONTAGEM', v_today,
            to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS'),
            v_actor_id, COALESCE(p_observacao, 'Inventário Rápido'),
            COALESCE(NULLIF(p_idempotency_key, ''), gen_random_uuid()::text),
            v_turno_id
        );
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'reason', 'duplicate', 'message', 'Inventário rápido já registrado');
    END;

    -- 3. Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_counted := COALESCE((v_item->>'counted_quantity')::numeric, 0);
        IF v_counted < 0 THEN
            RAISE EXCEPTION 'Quantidade negativa não permitida para produto %', v_item->>'product_id';
        END IF;

        -- Lock & validate product
        SELECT * INTO v_product
        FROM public.produtos
        WHERE id = (v_item->>'product_id')::uuid
          AND company_id = v_company_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto não encontrado: %', v_item->>'product_id';
        END IF;
        IF NOT v_product.ativo THEN
            RAISE EXCEPTION 'Produto inativo: %', v_product.nome_produto;
        END IF;

        -- Compute current saldo (server-side)
        SELECT COALESCE(SUM(
            CASE WHEN direction = 'IN' THEN quantidade ELSE -quantidade END
        ), 0) INTO v_saldo
        FROM public.movimentacoes_estoque
        WHERE produto_id = v_product.id
          AND company_id = v_company_id
          AND status = 'ATIVO';

        -- Diffs
        v_diff := v_counted - v_saldo;
        v_diff_pct := CASE WHEN v_saldo > 0 THEN round((v_diff / v_saldo) * 100, 2) ELSE 0 END;

        -- Cost
        v_cost_base := COALESCE(NULLIF(v_product.avg30_cost_base_unit, 0),
                                NULLIF(v_product.last_cost_base_unit, 0),
                                NULLIF(v_product.default_cost_base_unit, 0), 0);
        v_impact := round(abs(v_diff) * v_cost_base, 2);

        -- Insert inventory item
        INSERT INTO public.inventario_itens (
            inventario_id, company_id, produto_id, tipo_item,
            saldo_teorico, contagem_fisica,
            diferenca_qtd, diferenca_percent,
            custo_snapshot, impacto_financeiro,
            classificacao, contado_por, contagem_inicio, contagem_fim
        ) VALUES (
            v_inv_id, v_company_id, v_product.id, 'geral',
            v_saldo, v_counted,
            v_diff, v_diff_pct,
            v_cost_base, v_impact,
            CASE
                WHEN abs(v_diff_pct) > 10 OR v_impact > 500 THEN 'CRITICO'
                WHEN abs(v_diff_pct) > 5 OR v_impact > 100 THEN 'ALERTA'
                ELSE 'NORMAL'
            END,
            v_actor_id, v_now, v_now
        );

        v_total_items := v_total_items + 1;
        v_total_impact := v_total_impact + v_impact;

        -- Accuracy calculation
        IF v_saldo > 0 THEN
            v_acuracia_sum := v_acuracia_sum + LEAST(v_counted / v_saldo, 1.0);
            v_acuracia_count := v_acuracia_count + 1;
        ELSIF v_counted = 0 THEN
            v_acuracia_sum := v_acuracia_sum + 1.0;
            v_acuracia_count := v_acuracia_count + 1;
        END IF;

        -- Generate stock adjustment if there's a difference
        IF v_diff <> 0 THEN
            INSERT INTO public.movimentacoes_estoque (
                produto_id, company_id, data, tipo, quantidade,
                custo_unitario, custo_total, origem, observacao,
                created_by, reference_type, reference_id,
                source_module, direction
            ) VALUES (
                v_product.id, v_company_id, v_today,
                CASE WHEN v_diff > 0 THEN 'ENTRADA' ELSE 'SAIDA' END,
                abs(v_diff),
                round(v_cost_base, 4),
                round(abs(v_diff) * v_cost_base, 2),
                'Inventário Rápido',
                format('Ajuste inventário rápido: %s (%s → %s %s)',
                    v_product.nome_produto,
                    round(v_saldo, 2)::text,
                    round(v_counted, 2)::text,
                    v_product.unidade_medida),
                v_actor_id,
                'QUICK_INVENTORY', v_inv_id::text,
                'inventario',
                CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END
            );
            v_adjusted := v_adjusted + 1;
        END IF;
    END LOOP;

    -- 4. Finalize inventory
    UPDATE public.inventarios
    SET status = 'FINALIZADO',
        finalizado_em = v_now,
        finalizado_por = v_actor_id,
        acuracia_percent = CASE WHEN v_acuracia_count > 0
            THEN round((v_acuracia_sum / v_acuracia_count) * 100, 2)
            ELSE 100 END,
        drift_total_valor = v_total_impact,
        updated_at = v_now
    WHERE id = v_inv_id;

    -- 5. Audit log
    INSERT INTO public.audit_logs (
        action, entity, entity_id, module, actor_user_id, company_id,
        severity, source, success, metadata
    ) VALUES (
        'QUICK_INVENTORY', 'inventarios', v_inv_id::text,
        'inventario', v_actor_id, v_company_id,
        CASE WHEN v_total_impact > 500 THEN 'warning' ELSE 'info' END,
        'rpc', true,
        jsonb_build_object(
            'total_items', v_total_items,
            'adjusted', v_adjusted,
            'total_impact', v_total_impact,
            'acuracia', CASE WHEN v_acuracia_count > 0
                THEN round((v_acuracia_sum / v_acuracia_count) * 100, 2)
                ELSE 100 END
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'inventory_id', v_inv_id,
        'total_items', v_total_items,
        'adjusted', v_adjusted,
        'total_impact', v_total_impact
    );
END;
$function$;
