-- ─────────────────────────────────────────────────────────────────────────────
-- Folha de pagamento — transições de status no servidor.
--
-- Antes, "Calcular Folha" gravava cada colaborador com um UPDATE/INSERT solto
-- a partir da lista da tela, sem checar erro: o toast dizia "calculada" mesmo
-- com linhas recusadas, e o UPDATE regravava `status='CALCULADO'` em cima de
-- folha APROVADA ou PAGA — recalcular desfazia a aprovação e trocava os valores
-- de uma folha já paga. Aprovar e marcar paga faziam UPDATE só pelo id, sem
-- conferir o status de origem.
--
--   · `trg_rh_folha_transicao` (BEFORE INSERT/UPDATE): barreira para qualquer
--     caminho, inclusive o front em produção e PostgREST direto. Folha
--     APROVADO/PAGO não muda de valores nem volta de status; transições válidas:
--     RASCUNHO ⇄ CALCULADO → APROVADO → PAGO. A aprovação grava `aprovado_em` e
--     `aprovado_por` no servidor, e ninguém os reescreve depois.
--   · `rh_folha_salvar_calculo`: o cálculo do período numa transação. Upsert por
--     (colaborador, período) — o próprio índice único é a idempotência: recalcular
--     de novo produz o mesmo resultado. Folha fechada fica como está e volta na
--     resposta (`fechadas`), em vez de sumir num erro ignorado.
--   · `rh_folha_mudar_status`: aprovar/marcar paga com status de origem
--     conferido sob lock. Repetir (duplo clique) devolve `idempotente=true`.
--
-- Gate igual ao da tela (`rh:folha:manage` + legados que o frontend expande).
-- Compatível com o front em produção: o UPDATE direto que tentar reabrir uma
-- folha fechada passa a falhar (o front antigo ignora o erro — a folha fica
-- intacta, que é o objetivo). GRANTs no mesmo arquivo.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.rh_folha_guard_transicao()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  -- Tudo que não é cálculo: o resto da linha é o que foi pago.
  c_meta constant text[] := array['status', 'aprovado_em', 'aprovado_por', 'observacoes', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    if new.status not in ('RASCUNHO', 'CALCULADO') then
      raise exception 'FOLHA_STATUS_INICIAL_INVALIDO: %', new.status;
    end if;
    return new;
  end if;

  if old.status in ('APROVADO', 'PAGO') then
    if (to_jsonb(new) - c_meta) is distinct from (to_jsonb(old) - c_meta) then
      raise exception 'FOLHA_FECHADA: folha % não pode ser recalculada', old.status;
    end if;
    -- A aprovação é evidência: não se reescreve depois.
    new.aprovado_em := old.aprovado_em;
    new.aprovado_por := old.aprovado_por;
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'RASCUNHO'  and new.status = 'CALCULADO')
      or (old.status = 'CALCULADO' and new.status in ('RASCUNHO', 'APROVADO'))
      or (old.status = 'APROVADO'  and new.status = 'PAGO')
    ) then
      raise exception 'FOLHA_TRANSICAO_INVALIDA: % -> %', old.status, new.status;
    end if;

    if new.status = 'APROVADO' then
      new.aprovado_em := now();
      new.aprovado_por := coalesce(auth.uid(), new.aprovado_por);
    end if;
  end if;

  return new;
end;
$$;

comment on function public.rh_folha_guard_transicao() is
  'Folha APROVADO/PAGO não muda de valores nem volta de status. Transições: RASCUNHO ⇄ CALCULADO → APROVADO → PAGO.';

revoke all on function public.rh_folha_guard_transicao() from public, anon, authenticated;

drop trigger if exists trg_rh_folha_transicao on public.rh_folha_pagamento;
create trigger trg_rh_folha_transicao
  before insert or update on public.rh_folha_pagamento
  for each row execute function public.rh_folha_guard_transicao();

create or replace function public.rh_folha_salvar_calculo(
  p_periodo text,
  p_linhas  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  c_max_linhas constant int := 5000;
  c_uuid_re    constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_numericos  constant text[] := array[
    'salario_base', 'valor_hora', 'horas_normais', 'horas_extras_50', 'horas_extras_100',
    'adicional_noturno', 'adicional_insalubridade', 'adicional_periculosidade', 'gratificacoes',
    'total_proventos', 'desconto_inss', 'desconto_irrf', 'desconto_vale_transporte',
    'desconto_vale_refeicao', 'desconto_faltas', 'desconto_atrasos', 'outros_descontos',
    'total_descontos', 'salario_liquido', 'dias_trabalhados', 'faltas', 'atrasos_min'
  ];
  v_company     uuid := public.assert_tenant();
  v_uid         uuid := auth.uid();
  v_total       int;
  v_inseridas   int := 0;
  v_recalculadas int := 0;
  v_fechadas    jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_any_permission(v_uid, array[
    'rh:folha:manage', 'rh:manage', 'rh:admin', 'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: rh:folha:manage' using errcode = '42501';
  end if;

  if p_periodo is null or p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'PERIODO_INVALIDO: %', p_periodo;
  end if;

  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'LINHAS_INVALIDAS';
  end if;

  v_total := jsonb_array_length(p_linhas);
  if v_total = 0 or v_total > c_max_linhas then
    raise exception 'LINHAS_TAMANHO_INVALIDO: %', v_total;
  end if;

  -- Formato antes de qualquer escrita: valor não numérico não pode cair num
  -- erro de cast genérico no meio do upsert.
  if exists (
    select 1 from jsonb_array_elements(p_linhas) e
    where jsonb_typeof(e.value) is distinct from 'object'
       or coalesce(e.value->>'colaborador_id', '') !~* c_uuid_re
       or exists (
         select 1 from unnest(c_numericos) k
         where e.value ? k and jsonb_typeof(e.value->k) <> 'number'
       )
  ) then
    raise exception 'LINHA_INVALIDA';
  end if;

  if (select count(distinct e.value->>'colaborador_id') from jsonb_array_elements(p_linhas) e) <> v_total then
    raise exception 'COLABORADOR_REPETIDO';
  end if;

  -- SECURITY DEFINER: a RLS não filtra o colaborador, então o tenant é
  -- conferido aqui.
  if exists (
    select 1 from jsonb_array_elements(p_linhas) e
    where not exists (
      select 1 from public.rh_colaboradores c
      where c.id = (e.value->>'colaborador_id')::uuid and c.company_id = v_company
    )
  ) then
    raise exception 'COLABORADOR_FORA_DO_TENANT' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('colaborador_id', f.colaborador_id, 'status', f.status)
                  order by f.colaborador_id), '[]'::jsonb)
    into v_fechadas
  from public.rh_folha_pagamento f
  where f.company_id = v_company
    and f.periodo = p_periodo
    and f.status in ('APROVADO', 'PAGO')
    and f.colaborador_id in (
      select (e.value->>'colaborador_id')::uuid from jsonb_array_elements(p_linhas) e
    );

  with linhas as (
    select (e.value->>'colaborador_id')::uuid as colaborador_id, e.value as v
    from jsonb_array_elements(p_linhas) e
  ),
  gravadas as (
    insert into public.rh_folha_pagamento as f (
      company_id, colaborador_id, periodo,
      salario_base, valor_hora, horas_normais, horas_extras_50, horas_extras_100,
      adicional_noturno, adicional_insalubridade, adicional_periculosidade, gratificacoes,
      total_proventos, desconto_inss, desconto_irrf, desconto_vale_transporte,
      desconto_vale_refeicao, desconto_faltas, desconto_atrasos, outros_descontos,
      total_descontos, salario_liquido, dias_trabalhados, faltas, atrasos_min,
      status, calculado_em, calculado_por
    )
    select
      v_company, l.colaborador_id, p_periodo,
      coalesce((l.v->>'salario_base')::numeric, 0),
      coalesce((l.v->>'valor_hora')::numeric, 0),
      coalesce((l.v->>'horas_normais')::numeric, 0),
      coalesce((l.v->>'horas_extras_50')::numeric, 0),
      coalesce((l.v->>'horas_extras_100')::numeric, 0),
      coalesce((l.v->>'adicional_noturno')::numeric, 0),
      coalesce((l.v->>'adicional_insalubridade')::numeric, 0),
      coalesce((l.v->>'adicional_periculosidade')::numeric, 0),
      coalesce((l.v->>'gratificacoes')::numeric, 0),
      coalesce((l.v->>'total_proventos')::numeric, 0),
      coalesce((l.v->>'desconto_inss')::numeric, 0),
      coalesce((l.v->>'desconto_irrf')::numeric, 0),
      coalesce((l.v->>'desconto_vale_transporte')::numeric, 0),
      coalesce((l.v->>'desconto_vale_refeicao')::numeric, 0),
      coalesce((l.v->>'desconto_faltas')::numeric, 0),
      coalesce((l.v->>'desconto_atrasos')::numeric, 0),
      coalesce((l.v->>'outros_descontos')::numeric, 0),
      coalesce((l.v->>'total_descontos')::numeric, 0),
      coalesce((l.v->>'salario_liquido')::numeric, 0),
      coalesce(round((l.v->>'dias_trabalhados')::numeric)::int, 0),
      coalesce(round((l.v->>'faltas')::numeric)::int, 0),
      coalesce((l.v->>'atrasos_min')::numeric, 0),
      'CALCULADO', now(), v_uid
    from linhas l
    on conflict (colaborador_id, periodo) do update set
      salario_base             = excluded.salario_base,
      valor_hora               = excluded.valor_hora,
      horas_normais            = excluded.horas_normais,
      horas_extras_50          = excluded.horas_extras_50,
      horas_extras_100         = excluded.horas_extras_100,
      adicional_noturno        = excluded.adicional_noturno,
      adicional_insalubridade  = excluded.adicional_insalubridade,
      adicional_periculosidade = excluded.adicional_periculosidade,
      gratificacoes            = excluded.gratificacoes,
      total_proventos          = excluded.total_proventos,
      desconto_inss            = excluded.desconto_inss,
      desconto_irrf            = excluded.desconto_irrf,
      desconto_vale_transporte = excluded.desconto_vale_transporte,
      desconto_vale_refeicao   = excluded.desconto_vale_refeicao,
      desconto_faltas          = excluded.desconto_faltas,
      desconto_atrasos         = excluded.desconto_atrasos,
      outros_descontos         = excluded.outros_descontos,
      total_descontos          = excluded.total_descontos,
      salario_liquido          = excluded.salario_liquido,
      dias_trabalhados         = excluded.dias_trabalhados,
      faltas                   = excluded.faltas,
      atrasos_min              = excluded.atrasos_min,
      status                   = 'CALCULADO',
      calculado_em             = excluded.calculado_em,
      calculado_por            = excluded.calculado_por
    -- Folha fechada fica como está (e já foi listada em `fechadas`).
    where f.company_id = v_company
      and f.status in ('RASCUNHO', 'CALCULADO')
    returning (xmax = 0) as inserida
  )
  select count(*) filter (where inserida), count(*) filter (where not inserida)
    into v_inseridas, v_recalculadas
  from gravadas;

  return jsonb_build_object(
    'periodo', p_periodo,
    'inseridas', v_inseridas,
    'recalculadas', v_recalculadas,
    'fechadas', v_fechadas
  );
end;
$$;

comment on function public.rh_folha_salvar_calculo(text, jsonb) is
  'Grava o cálculo da folha do período numa transação (upsert por colaborador+período). Folha APROVADO/PAGO não é reaberta: volta em `fechadas`.';

revoke all on function public.rh_folha_salvar_calculo(text, jsonb) from public, anon;
grant execute on function public.rh_folha_salvar_calculo(text, jsonb) to authenticated;
grant execute on function public.rh_folha_salvar_calculo(text, jsonb) to service_role;

create or replace function public.rh_folha_mudar_status(
  p_id     uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company uuid := public.assert_tenant();
  v_uid     uuid := auth.uid();
  v_atual   text;
  v_origem  text;
  v_folha   public.rh_folha_pagamento%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_any_permission(v_uid, array[
    'rh:folha:manage', 'rh:manage', 'rh:admin', 'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: rh:folha:manage' using errcode = '42501';
  end if;

  v_origem := case p_status when 'APROVADO' then 'CALCULADO' when 'PAGO' then 'APROVADO' end;
  if v_origem is null then
    raise exception 'STATUS_INVALIDO: %', p_status;
  end if;

  select f.status into v_atual
  from public.rh_folha_pagamento f
  where f.id = p_id and f.company_id = v_company
  for update;

  if v_atual is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_atual = p_status then
    select * into v_folha from public.rh_folha_pagamento where id = p_id;
    return jsonb_build_object('id', p_id, 'status', v_folha.status,
      'aprovado_em', v_folha.aprovado_em, 'idempotente', true);
  end if;

  if v_atual <> v_origem then
    raise exception 'STATUS_INVALIDO: % -> %', v_atual, p_status;
  end if;

  update public.rh_folha_pagamento
     set status = p_status
   where id = p_id and company_id = v_company
  returning * into v_folha;

  return jsonb_build_object('id', p_id, 'status', v_folha.status,
    'aprovado_em', v_folha.aprovado_em, 'idempotente', false);
end;
$$;

comment on function public.rh_folha_mudar_status(uuid, text) is
  'Aprova (CALCULADO → APROVADO) ou marca paga (APROVADO → PAGO) conferindo o status de origem sob lock. Repetir devolve idempotente=true.';

revoke all on function public.rh_folha_mudar_status(uuid, text) from public, anon;
grant execute on function public.rh_folha_mudar_status(uuid, text) to authenticated;
grant execute on function public.rh_folha_mudar_status(uuid, text) to service_role;

notify pgrst, 'reload schema';
