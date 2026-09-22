-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação Operacional — idempotência atômica
--
-- Achado da auditoria do módulo (P3, mas da mesma classe que já causou
-- lançamento duplicado no Financeiro).
--
-- A idempotência de `op_registrar_movimentacao` era check-then-insert: o SELECT
-- do `client_request_id` acontecia ANTES do `FOR UPDATE` do produto. Duas
-- chamadas simultâneas com o mesmo id passavam as duas pela checagem,
-- serializavam no lock e a segunda gravava uma movimentação duplicada — o lock
-- protegia o saldo, não a chave de idempotência.
--
-- A garantia passa a ser do banco: índice único parcial. O SELECT prévio
-- continua como caminho rápido, e a violação de unicidade é tratada como
-- reenvio em vez de erro.
--
-- O predicado inclui `status = 'ATIVO'` de propósito: movimentação cancelada
-- libera a chave, para permitir relançar depois de um estorno.
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists uq_mov_operacional_request
  on public.movimentacoes_estoque (company_id, reference_id)
  where reference_type = 'OPERACIONAL' and status = 'ATIVO';

create or replace function public.op_registrar_movimentacao(
  p_produto_id        uuid,
  p_setor_id          uuid,
  p_tipo              text,
  p_quantidade        numeric,
  p_observacao        text default null,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company     uuid := public.assert_tenant();
  v_setor_nome  text;
  v_produto     record;
  v_saldo       numeric;
  v_custo_unit  numeric;
  v_novo_id     uuid;
  v_novo_saldo  numeric;
  v_existente   uuid;
  v_tem_vinculo boolean;
  v_request_id  text := nullif(btrim(coalesce(p_client_request_id, '')), '');
begin
  if not public.has_any_permission(auth.uid(), array[
    'operacional:movimentacao:create', 'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: operacional:movimentacao:create' using errcode = '42501';
  end if;

  if p_tipo not in ('ENTRADA', 'SAIDA') then
    raise exception 'TIPO_INVALIDO: %', p_tipo;
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'QUANTIDADE_INVALIDA';
  end if;

  -- Setor: autorização + nome canônico gravado na coluna `setor` (texto), para
  -- os filtros do admin e o CMV por setor continuarem funcionando.
  select s.name into v_setor_nome
  from public.stock_sectors s
  where s.id = p_setor_id and s.company_id = v_company and s.is_active;

  if v_setor_nome is null
     or not public.op_setor_autorizado(v_company, auth.uid(), p_setor_id) then
    raise exception 'SETOR_NAO_AUTORIZADO' using errcode = '42501';
  end if;

  -- Caminho rápido: reenvio já resolvido antes de tocar no produto.
  if v_request_id is not null then
    select m.id into v_existente
    from public.movimentacoes_estoque m
    where m.company_id = v_company
      and m.reference_type = 'OPERACIONAL'
      and m.reference_id = v_request_id
      and m.status = 'ATIVO'
    limit 1;

    if v_existente is not null then
      select round(coalesce(p.saldo_atual, 0), 3) into v_novo_saldo
      from public.produtos p where p.id = p_produto_id and p.company_id = v_company;

      return jsonb_build_object(
        'success', true, 'id', v_existente, 'idempotente', true,
        'saldo_novo', v_novo_saldo
      );
    end if;
  end if;

  -- Trava a linha do produto: duas saídas simultâneas do mesmo item serializam
  -- aqui, então a segunda enxerga o saldo já debitado pela primeira.
  select p.id, p.nome_produto, p.unidade_medida, p.saldo_atual,
         p.avg30_cost_base_unit, p.last_cost_base_unit, p.default_cost_base_unit,
         p.custo_padrao, p.fator_conversao_padrao
    into v_produto
  from public.produtos p
  where p.id = p_produto_id and p.company_id = v_company and p.ativo
  for update;

  if not found then
    raise exception 'PRODUTO_NAO_ENCONTRADO';
  end if;

  -- Produto precisa pertencer ao setor quando o setor já tem vínculo montado.
  select exists (
    select 1 from public.estoque_setor_produtos v
    where v.company_id = v_company and v.setor_id = p_setor_id
  ) into v_tem_vinculo;

  if v_tem_vinculo and not exists (
    select 1 from public.estoque_setor_produtos v
    where v.company_id = v_company
      and v.setor_id = p_setor_id
      and v.produto_id = p_produto_id
  ) then
    raise exception 'PRODUTO_FORA_DO_SETOR';
  end if;

  v_saldo := round(coalesce(v_produto.saldo_atual, 0), 3);

  if p_tipo = 'SAIDA' and v_saldo < p_quantidade then
    raise exception 'SALDO_INSUFICIENTE: disponivel=%, solicitado=%', v_saldo, p_quantidade;
  end if;

  -- Custo resolvido no servidor, na mesma ordem de precedência que a tela
  -- administrativa usa para exibir o custo ativo do item.
  v_custo_unit := coalesce(
    nullif(v_produto.avg30_cost_base_unit, 0),
    nullif(v_produto.last_cost_base_unit, 0),
    nullif(v_produto.default_cost_base_unit, 0),
    case when coalesce(v_produto.fator_conversao_padrao, 1) > 0
         then coalesce(v_produto.custo_padrao, 0) / coalesce(v_produto.fator_conversao_padrao, 1)
         else 0 end,
    0
  );

  -- Mesma regra do módulo administrativo: saída de item sem custo é recusada,
  -- senão o CMV recebe consumo a custo zero.
  if p_tipo = 'SAIDA' and v_custo_unit <= 0 then
    raise exception 'PRODUTO_SEM_CUSTO';
  end if;

  begin
    insert into public.movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, referencia_id, observacao, created_by, company_id, setor,
      status, reference_type, reference_id, source_module
    ) values (
      p_produto_id, current_date, p_tipo, p_quantidade,
      round(v_custo_unit, 2), round(p_quantidade * v_custo_unit, 2),
      'OPERACIONAL', null, nullif(btrim(coalesce(p_observacao, '')), ''),
      auth.uid(), v_company, v_setor_nome, 'ATIVO',
      case when v_request_id is not null then 'OPERACIONAL' else null end,
      v_request_id,
      'operacional'
    )
    returning id into v_novo_id;
  exception when unique_violation then
    -- Outra transação gravou o mesmo client_request_id entre o caminho rápido e
    -- este INSERT. É reenvio, não lançamento novo: devolve o original.
    select m.id into v_existente
    from public.movimentacoes_estoque m
    where m.company_id = v_company
      and m.reference_type = 'OPERACIONAL'
      and m.reference_id = v_request_id
      and m.status = 'ATIVO'
    limit 1;

    select round(coalesce(p.saldo_atual, 0), 3) into v_novo_saldo
    from public.produtos p where p.id = p_produto_id and p.company_id = v_company;

    return jsonb_build_object(
      'success', true, 'id', v_existente, 'idempotente', true,
      'saldo_novo', v_novo_saldo
    );
  end;

  -- O trigger fn_update_product_stock já recomputou o cache.
  select round(coalesce(p.saldo_atual, 0), 3) into v_novo_saldo
  from public.produtos p where p.id = p_produto_id and p.company_id = v_company;

  return jsonb_build_object(
    'success', true,
    'id', v_novo_id,
    'idempotente', false,
    'produto_nome', v_produto.nome_produto,
    'unidade_medida', v_produto.unidade_medida,
    'setor', v_setor_nome,
    'tipo', p_tipo,
    'quantidade', p_quantidade,
    'saldo_anterior', v_saldo,
    'saldo_novo', v_novo_saldo
  );
end;
$$;
