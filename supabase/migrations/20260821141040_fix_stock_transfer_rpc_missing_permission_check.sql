-- =========================================================================
-- P1: stock_transfer_between_locations / list_stock_transfers nunca checavam
-- RBAC — só resolviam auth.uid()/company_id. O registry (src/permissions/
-- registry.ts) define 'estoque:transferencias:view' e
-- 'estoque:transferencias:create' como permissões distintas, mas nenhuma das
-- duas RPCs as verificava: qualquer usuário autenticado do tenant (mesmo sem
-- a permissão de escrita) podia mover estoque real entre locais chamando a
-- RPC diretamente via PostgREST, contornando a UI. Não é vazamento
-- cross-tenant (company_id continua resolvido corretamente), é escalação de
-- privilégio dentro do próprio tenant. Adiciona a checagem que faltava,
-- mesmo padrão has_any_permission(...) + fallback system:global:manage já
-- usado em finalize_inventory_atomic/reopen_inventory/soft_delete_inventory.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.stock_transfer_between_locations(p_product_id uuid, p_from_location text, p_to_location text, p_quantity numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id uuid;
    v_company_id uuid;
    v_product record;
    v_saldo numeric;
    v_cost_base numeric;
    v_transfer_group uuid;
    v_mov_out_id uuid;
    v_mov_in_id uuid;
    v_today text;
BEGIN
    -- 1. Resolve actor & tenant
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'P0001';
    END IF;

    SELECT company_id INTO v_company_id
    FROM public.profiles
    WHERE id = v_actor_id;

    IF v_company_id IS NULL OR v_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
        RAISE EXCEPTION 'Tenant inválido' USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.has_any_permission(v_actor_id, ARRAY['estoque:transferencias:create', 'system:global:manage']) THEN
        RAISE EXCEPTION 'Permissão negada: estoque:transferencias:create necessário' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Validate inputs
    IF p_from_location IS NULL OR trim(p_from_location) = '' THEN
        RAISE EXCEPTION 'Local de origem é obrigatório';
    END IF;
    IF p_to_location IS NULL OR trim(p_to_location) = '' THEN
        RAISE EXCEPTION 'Local de destino é obrigatório';
    END IF;
    IF trim(lower(p_from_location)) = trim(lower(p_to_location)) THEN
        RAISE EXCEPTION 'Local de origem e destino devem ser diferentes';
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantidade deve ser maior que zero';
    END IF;

    -- 3. Lock product row
    SELECT * INTO v_product
    FROM public.produtos
    WHERE id = p_product_id AND company_id = v_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado';
    END IF;
    IF NOT v_product.ativo THEN
        RAISE EXCEPTION 'Produto inativo';
    END IF;

    -- 4. Check global saldo (server-side)
    SELECT COALESCE(SUM(
        CASE WHEN direction = 'IN' THEN quantidade ELSE -quantidade END
    ), 0) INTO v_saldo
    FROM public.movimentacoes_estoque
    WHERE produto_id = p_product_id
      AND company_id = v_company_id
      AND status = 'ATIVO';

    IF v_saldo < p_quantity THEN
        RAISE EXCEPTION 'Saldo insuficiente. Disponível: % %', round(v_saldo, 2), v_product.unidade_medida;
    END IF;

    -- 5. Determine cost (avg30 → last → default)
    v_cost_base := COALESCE(NULLIF(v_product.avg30_cost_base_unit, 0),
                            NULLIF(v_product.last_cost_base_unit, 0),
                            NULLIF(v_product.default_cost_base_unit, 0),
                            0);

    -- 6. Generate transfer group ID and today
    v_transfer_group := gen_random_uuid();
    v_today := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');

    -- 7. Insert OUT movement (from origin)
    INSERT INTO public.movimentacoes_estoque (
        produto_id, company_id, data, tipo, quantidade,
        custo_unitario, custo_total, origem, observacao,
        created_by, setor, reference_type, reference_id,
        internal_transfer, source_module, direction
    ) VALUES (
        p_product_id, v_company_id, v_today, 'SAIDA', p_quantity,
        round(v_cost_base, 4), round(p_quantity * v_cost_base, 2),
        'Transferência Interna',
        format('Transferência: %s → %s. %s', trim(p_from_location), trim(p_to_location), COALESCE(p_reason, '')),
        v_actor_id, trim(p_from_location), 'INTERNAL_TRANSFER', v_transfer_group::text,
        true, 'estoque', 'OUT'
    )
    RETURNING id INTO v_mov_out_id;

    -- 8. Insert IN movement (to destination)
    INSERT INTO public.movimentacoes_estoque (
        produto_id, company_id, data, tipo, quantidade,
        custo_unitario, custo_total, origem, observacao,
        created_by, setor, reference_type, reference_id,
        internal_transfer, source_module, direction
    ) VALUES (
        p_product_id, v_company_id, v_today, 'ENTRADA', p_quantity,
        round(v_cost_base, 4), round(p_quantity * v_cost_base, 2),
        'Transferência Interna',
        format('Transferência: %s → %s. %s', trim(p_from_location), trim(p_to_location), COALESCE(p_reason, '')),
        v_actor_id, trim(p_to_location), 'INTERNAL_TRANSFER', v_transfer_group::text,
        true, 'estoque', 'IN'
    )
    RETURNING id INTO v_mov_in_id;

    -- 9. Audit log
    INSERT INTO public.audit_logs (
        action, entity, entity_id, module, actor_user_id, company_id,
        severity, source, success, metadata
    ) VALUES (
        'STOCK_TRANSFER', 'movimentacoes_estoque', v_transfer_group::text,
        'estoque', v_actor_id, v_company_id,
        'info', 'rpc', true,
        jsonb_build_object(
            'product_id', p_product_id,
            'product_name', v_product.nome_produto,
            'from_location', trim(p_from_location),
            'to_location', trim(p_to_location),
            'quantity', p_quantity,
            'unit', v_product.unidade_medida,
            'cost_unit', round(v_cost_base, 4),
            'cost_total', round(p_quantity * v_cost_base, 2),
            'reason', COALESCE(p_reason, ''),
            'mov_out_id', v_mov_out_id,
            'mov_in_id', v_mov_in_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'transfer_group_id', v_transfer_group,
        'mov_out_id', v_mov_out_id,
        'mov_in_id', v_mov_in_id,
        'quantity', p_quantity,
        'from_location', trim(p_from_location),
        'to_location', trim(p_to_location),
        'cost_total', round(p_quantity * v_cost_base, 2)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_stock_transfers(p_start_date date DEFAULT ((now() - '30 days'::interval))::date, p_end_date date DEFAULT (now())::date, p_product_id uuid DEFAULT NULL::uuid, p_location text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company_id uuid;
    v_transfers jsonb;
    v_total bigint;
BEGIN
    SELECT company_id INTO v_company_id
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Tenant inválido';
    END IF;

    IF NOT public.has_any_permission(auth.uid(), ARRAY['estoque:transferencias:view', 'system:global:manage']) THEN
        RAISE EXCEPTION 'Permissão negada: estoque:transferencias:view necessário';
    END IF;

    SELECT count(DISTINCT reference_id) INTO v_total
    FROM public.movimentacoes_estoque
    WHERE company_id = v_company_id
      AND reference_type = 'INTERNAL_TRANSFER'
      AND internal_transfer = true
      AND direction = 'OUT'
      AND status = 'ATIVO'
      AND data >= p_start_date
      AND data <= p_end_date
      AND (p_product_id IS NULL OR produto_id = p_product_id)
      AND (p_location IS NULL OR setor ILIKE '%' || p_location || '%');

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_transfers
    FROM (
        SELECT
            m_out.reference_id AS transfer_group_id,
            m_out.produto_id,
            p.nome_produto,
            p.unidade_medida,
            p.categoria,
            m_out.quantidade,
            m_out.custo_unitario,
            m_out.custo_total,
            m_out.setor AS from_location,
            m_in.setor AS to_location,
            m_out.observacao,
            m_out.created_by,
            m_out.created_at,
            m_out.data,
            pr.email AS actor_email
        FROM public.movimentacoes_estoque m_out
        JOIN public.produtos p ON p.id = m_out.produto_id
        LEFT JOIN public.movimentacoes_estoque m_in
            ON m_in.reference_id = m_out.reference_id
            AND m_in.reference_type = 'INTERNAL_TRANSFER'
            AND m_in.direction = 'IN'
            AND m_in.company_id = v_company_id
            AND m_in.status = 'ATIVO'
        LEFT JOIN public.profiles pr ON pr.id = m_out.created_by
        WHERE m_out.company_id = v_company_id
          AND m_out.reference_type = 'INTERNAL_TRANSFER'
          AND m_out.internal_transfer = true
          AND m_out.direction = 'OUT'
          AND m_out.status = 'ATIVO'
          AND m_out.data >= p_start_date
          AND m_out.data <= p_end_date
          AND (p_product_id IS NULL OR m_out.produto_id = p_product_id)
          AND (p_location IS NULL OR m_out.setor ILIKE '%' || p_location || '%' OR m_in.setor ILIKE '%' || p_location || '%')
        ORDER BY m_out.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) t;

    RETURN jsonb_build_object(
        'transfers', v_transfers,
        'total', v_total
    );
END;
$function$;
