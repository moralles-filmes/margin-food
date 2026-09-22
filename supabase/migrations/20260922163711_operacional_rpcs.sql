-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação Operacional — Fase 1: RPCs
--
-- O usuário operacional NÃO recebe permissão de tabela nenhuma. Tudo que ele lê
-- e grava passa por estas funções SECURITY DEFINER, que devolvem exclusivamente
-- colunas operacionais. Motivo: `produtos_select` e `movimentacoes_select`
-- entregam a linha inteira via PostgREST — custo_padrao, custo_medio_30d,
-- avg30_*, last_supplier, custo_unitario, custo_total. Conceder aquelas policies
-- ao operador vazaria custo no Network mesmo com a tela escondendo o campo.
--
-- Saldo: estas RPCs leem `produtos.saldo_atual` (fonte única da verdade) sob
-- `FOR UPDATE`, nunca recalculam sobre o ledger.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Helper: o ator alcança todos os setores ativos? ───

create or replace function public.op_pode_todos_setores(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select public.has_any_permission(p_user_id, array[
    'operacional:setores:manage',
    'estoque:cadastros:manage',
    'estoque:movimentacoes:create',
    'system:global:manage'
  ]);
$$;

comment on function public.op_pode_todos_setores(uuid) is
  'Quem administra estoque ou setores movimenta qualquer setor ativo sem precisar de linha em estoque_usuario_setores.';

-- ─── Helper: o usuário pode movimentar este setor? ───

create or replace function public.op_setor_autorizado(
  p_company  uuid,
  p_user_id  uuid,
  p_setor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.stock_sectors s
    where s.id = p_setor_id
      and s.company_id = p_company
      and s.is_active
      and (
        public.op_pode_todos_setores(p_user_id)
        or exists (
          select 1 from public.estoque_usuario_setores us
          where us.company_id = p_company
            and us.user_id = p_user_id
            and us.setor_id = s.id
        )
      )
  );
$$;

-- ─── Setores que o usuário pode movimentar ───

create or replace function public.op_list_setores()
returns table (setor_id uuid, nome text)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_company uuid := public.assert_tenant();
begin
  if not public.has_any_permission(auth.uid(), array[
    'operacional:movimentacao:view', 'operacional:movimentacao:create',
    'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: operacional:movimentacao:view' using errcode = '42501';
  end if;

  return query
  select s.id, s.name
  from public.stock_sectors s
  where s.company_id = v_company
    and s.is_active
    and (
      public.op_pode_todos_setores(auth.uid())
      or exists (
        select 1 from public.estoque_usuario_setores us
        where us.company_id = v_company
          and us.user_id = auth.uid()
          and us.setor_id = s.id
      )
    )
  order by s.sort_order nulls last, s.name;
end;
$$;

-- ─── Produtos movimentáveis dentro de um setor ───
--
-- Setor sem nenhum vínculo em estoque_setor_produtos devolve o catálogo ativo
-- inteiro (migração gradual). Nenhuma coluna de custo é projetada.

create or replace function public.op_list_produtos(
  p_setor_id uuid,
  p_search   text default null,
  p_limit    integer default 50
)
returns table (
  produto_id     uuid,
  nome           text,
  sku            text,
  unidade_medida text,
  saldo          numeric,
  vinculado      boolean
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_company  uuid := public.assert_tenant();
  v_limit    integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_term     text;
  v_tem_vinculo boolean;
begin
  if not public.has_any_permission(auth.uid(), array[
    'operacional:movimentacao:view', 'operacional:movimentacao:create',
    'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: operacional:movimentacao:view' using errcode = '42501';
  end if;

  if not public.op_setor_autorizado(v_company, auth.uid(), p_setor_id) then
    raise exception 'SETOR_NAO_AUTORIZADO' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.estoque_setor_produtos v
    where v.company_id = v_company and v.setor_id = p_setor_id
  ) into v_tem_vinculo;

  v_term := nullif(btrim(coalesce(p_search, '')), '');
  if v_term is not null then
    v_term := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  return query
  select p.id,
         p.nome_produto,
         coalesce(p.sku, ''),
         p.unidade_medida,
         round(coalesce(p.saldo_atual, 0), 3),
         v_tem_vinculo
  from public.produtos p
  where p.company_id = v_company
    and p.ativo
    and (
      not v_tem_vinculo
      or exists (
        select 1 from public.estoque_setor_produtos v
        where v.company_id = v_company
          and v.setor_id = p_setor_id
          and v.produto_id = p.id
      )
    )
    and (
      v_term is null
      or p.nome_produto_unaccent ilike '%' || v_term || '%'
      or p.sku_unaccent ilike '%' || v_term || '%'
    )
  order by p.nome_produto
  limit v_limit;
end;
$$;

-- ─── Registrar entrada ou saída ───
--
-- Mesma tabela, mesmos triggers e mesmo cache de saldo do módulo administrativo.
-- Diferenças deliberadas em relação ao fluxo admin:
--   · o custo NÃO vem do cliente — é resolvido aqui a partir do cadastro;
--   · a saída acima do saldo é recusada no banco (o admin só barra no cliente);
--   · `setor` é gravado também nas entradas (coluna nullable, aditivo);
--   · `source_module = 'operacional'` identifica a origem sem mexer no legado.

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
  v_direction   text;
  v_saldo       numeric;
  v_custo_unit  numeric;
  v_novo_id     uuid;
  v_novo_saldo  numeric;
  v_existente   uuid;
  v_tem_vinculo boolean;
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

  v_direction := case when p_tipo = 'ENTRADA' then 'IN' else 'OUT' end;

  -- Setor: autorização + nome canônico gravado na coluna `setor` (texto),
  -- para os filtros do admin e o CMV por setor continuarem funcionando.
  select s.name into v_setor_nome
  from public.stock_sectors s
  where s.id = p_setor_id and s.company_id = v_company and s.is_active;

  if v_setor_nome is null
     or not public.op_setor_autorizado(v_company, auth.uid(), p_setor_id) then
    raise exception 'SETOR_NAO_AUTORIZADO' using errcode = '42501';
  end if;

  -- Idempotência: reenvio da mesma confirmação devolve a movimentação original
  -- em vez de duplicar (proteção contra clique duplo e retry de rede).
  if p_client_request_id is not null and btrim(p_client_request_id) <> '' then
    select m.id into v_existente
    from public.movimentacoes_estoque m
    where m.company_id = v_company
      and m.reference_type = 'OPERACIONAL'
      and m.reference_id = p_client_request_id
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

  insert into public.movimentacoes_estoque (
    produto_id, data, tipo, quantidade, custo_unitario, custo_total,
    origem, referencia_id, observacao, created_by, company_id, setor,
    status, reference_type, reference_id, source_module
  ) values (
    p_produto_id, current_date, p_tipo, p_quantidade,
    round(v_custo_unit, 2), round(p_quantidade * v_custo_unit, 2),
    'OPERACIONAL', null, nullif(btrim(coalesce(p_observacao, '')), ''),
    auth.uid(), v_company, v_setor_nome, 'ATIVO',
    case when nullif(btrim(coalesce(p_client_request_id, '')), '') is not null
         then 'OPERACIONAL' else null end,
    nullif(btrim(coalesce(p_client_request_id, '')), ''),
    'operacional'
  )
  returning id into v_novo_id;

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

-- ─── Últimas movimentações operacionais (sem valores) ───

create or replace function public.op_list_historico(p_limit integer default 20)
returns table (
  id             uuid,
  criado_em      timestamptz,
  produto_nome   text,
  unidade_medida text,
  tipo           text,
  quantidade     numeric,
  setor          text,
  responsavel    text
)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_company uuid := public.assert_tenant();
  v_limit   integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if not public.has_any_permission(auth.uid(), array[
    'operacional:historico:view', 'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: operacional:historico:view' using errcode = '42501';
  end if;

  return query
  select m.id,
         m.created_at,
         p.nome_produto,
         p.unidade_medida,
         m.tipo,
         m.quantidade,
         coalesce(m.setor, ''),
         coalesce(pr.nome, '')
  from public.movimentacoes_estoque m
  join public.produtos p
    on p.id = m.produto_id and p.company_id = m.company_id
  left join public.profiles pr on pr.id = m.created_by
  where m.company_id = v_company
    and m.status = 'ATIVO'
    and m.source_module = 'operacional'
    -- O operador só enxerga o histórico dos setores que ele mesmo movimenta.
    and (
      public.op_pode_todos_setores(auth.uid())
      or m.setor in (
        select s.name from public.stock_sectors s
        join public.estoque_usuario_setores us
          on us.setor_id = s.id and us.company_id = s.company_id
        where s.company_id = v_company and us.user_id = auth.uid()
      )
    )
  order by m.created_at desc
  limit v_limit;
end;
$$;
