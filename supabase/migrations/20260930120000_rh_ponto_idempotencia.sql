-- ─────────────────────────────────────────────────────────────────────────────
-- Registro de ponto — idempotente.
--
-- Antes, a tela gravava a batida com INSERT direto via PostgREST, sem chave de
-- reenvio. Duplo clique, Enter + clique ou retry depois de a resposta se perder
-- gravavam a batida duas vezes, e a duplicata entra no banco de horas (os
-- intervalos são pareados por posição: um INICIO_INTERVALO a mais desalinha os
-- pares e muda as horas trabalhadas). `validate_ponto_registro` só barra
-- ENTRADA repetida, e por check-then-insert: duas transações simultâneas passam.
--
--   · `client_request_id` é a chave DERIVADA da batida no cliente (semente +
--     colaborador + tipo + dia). O índice único parcial
--     `uq_rh_ponto_client_request` é a garantia; o SELECT prévio é só o caminho
--     rápido. `unique_violation` da própria chave é tratado como reenvio.
--   · Reenvio só é reenvio se descrever a MESMA batida (colaborador e tipo).
--     Chave igual com conteúdo diferente → REQUEST_ID_REUTILIZADO.
--   · Hora e dia vêm do servidor (`now()`, dia de negócio em São Paulo), não do
--     relógio do aparelho.
--   · SECURITY INVOKER: grava sob a mesma RLS do INSERT direto de hoje. A função
--     ainda exige que o colaborador seja do próprio usuário na unidade atual e o
--     gate `rh:ponto:create` (legado `rh:ponto`) que a tela usa.
--
-- Compatível com o front em produção: coluna nova é nula e o INSERT direto
-- continua funcionando até o merge. GRANTs no mesmo arquivo.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.rh_ponto_registros
  add column if not exists client_request_id text;

alter table public.rh_ponto_registros
  drop constraint if exists rh_ponto_registros_client_request_id_len;
alter table public.rh_ponto_registros
  add constraint rh_ponto_registros_client_request_id_len
  check (client_request_id is null or char_length(client_request_id) between 1 and 200);

-- Preflight: a coluna acabou de nascer, mas a migration pode ser reaplicada.
do $preflight$
begin
  if exists (
    select 1 from public.rh_ponto_registros
    where client_request_id is not null
    group by company_id, client_request_id
    having count(*) > 1
  ) then
    raise exception 'RH_PONTO_CLIENT_REQUEST_DUPLICADO: resolva as duplicatas antes do índice único';
  end if;
end
$preflight$;

create unique index if not exists uq_rh_ponto_client_request
  on public.rh_ponto_registros (company_id, client_request_id)
  where client_request_id is not null;

create or replace function public.rh_registrar_ponto(
  p_colaborador_id    uuid,
  p_tipo              text,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  c_tipos      constant text[] := array['ENTRADA', 'SAIDA', 'INICIO_INTERVALO', 'FIM_INTERVALO'];
  v_company    uuid := public.assert_tenant();
  v_uid        uuid := auth.uid();
  v_key        text := nullif(btrim(coalesce(p_client_request_id, '')), '');
  v_reg        public.rh_ponto_registros%rowtype;
  v_nova       boolean := false;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not public.has_any_permission(v_uid, array[
    'rh:ponto:create', 'rh:ponto', 'system:global:manage'
  ]) then
    raise exception 'PERMISSION_DENIED: rh:ponto:create' using errcode = '42501';
  end if;

  if p_tipo is null or not (p_tipo = any (c_tipos)) then
    raise exception 'TIPO_INVALIDO: %', p_tipo;
  end if;

  if v_key is not null and char_length(v_key) > 200 then
    raise exception 'REQUEST_ID_INVALIDO';
  end if;

  -- A batida é do próprio usuário: nunca de outro colaborador da unidade.
  if not exists (
    select 1 from public.rh_colaboradores c
    where c.id = p_colaborador_id
      and c.company_id = v_company
      and c.user_id = v_uid
  ) then
    raise exception 'COLABORADOR_NAO_E_DO_USUARIO' using errcode = '42501';
  end if;

  -- Caminho rápido: reenvio já resolvido.
  if v_key is not null then
    select * into v_reg
    from public.rh_ponto_registros r
    where r.company_id = v_company and r.client_request_id = v_key;
  end if;

  if v_reg.id is null then
    begin
      insert into public.rh_ponto_registros (
        colaborador_id, tipo, data, hora, metodo, created_by, company_id, client_request_id
      ) values (
        p_colaborador_id, p_tipo, (now() at time zone 'America/Sao_Paulo')::date, now(),
        'app', v_uid, v_company, v_key
      )
      returning * into v_reg;
      v_nova := true;
    exception when unique_violation then
      -- Só a violação da própria chave é reenvio (outra transação gravou a
      -- mesma batida entre o caminho rápido e o INSERT).
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'uq_rh_ponto_client_request' then
        raise;
      end if;
      select * into v_reg
      from public.rh_ponto_registros r
      where r.company_id = v_company and r.client_request_id = v_key;
      if v_reg.id is null then
        raise;
      end if;
    end;
  end if;

  if not v_nova
     and (v_reg.colaborador_id is distinct from p_colaborador_id
          or v_reg.tipo is distinct from p_tipo) then
    raise exception 'REQUEST_ID_REUTILIZADO';
  end if;

  return jsonb_build_object(
    'id', v_reg.id,
    'colaborador_id', v_reg.colaborador_id,
    'tipo', v_reg.tipo,
    'data', v_reg.data,
    'hora', v_reg.hora,
    'idempotente', not v_nova
  );
end;
$$;

comment on function public.rh_registrar_ponto(uuid, text, text) is
  'Registra a batida de ponto do próprio usuário (hora do servidor). client_request_id = chave derivada da batida; reenvio devolve o registro existente (idempotente=true), conteúdo divergente → REQUEST_ID_REUTILIZADO.';

revoke all on function public.rh_registrar_ponto(uuid, text, text) from public, anon;
grant execute on function public.rh_registrar_ponto(uuid, text, text) to authenticated;
grant execute on function public.rh_registrar_ponto(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
