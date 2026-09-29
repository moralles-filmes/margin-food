-- ═══════════════════════════════════════════════════════════════════════════
-- Listas fixas de requisição: colaboradores que veem cada lista
-- ═══════════════════════════════════════════════════════════════════════════
-- O administrador escolhe quais colaboradores veem cada lista fixa (uma por
-- setor): o usuário da cozinha abre "Requisição por Lista Fixa" e só encontra a
-- lista da cozinha.
--
-- Regras:
--   * Lista SEM colaborador vinculado continua visível para todos que fazem
--     requisição — é o comportamento anterior, e a restrição entra aos poucos.
--   * Lista COM colaboradores vinculados só aparece para eles.
--   * Quem gerencia requisições (estoque:requisicoes:manage) ou tem
--     system:global:manage vê todas — é quem monta as listas.
--
-- O filtro mora na RLS de SELECT de listas_fixas_setor e
-- listas_fixas_setor_itens, não só na tela: a própria consulta devolve apenas
-- o que vale para o usuário. É conveniência de navegação, não barreira: a
-- requisição manual continua aceitando qualquer setor.
--
-- Também libera list_profiles_minimal para estoque:requisicoes:manage (seção
-- 5), que a tela de colaboradores usa para listar os usuários da unidade.

-- ─── Preflight ──────────────────────────────────────────────────────────────
-- Policies permissivas são combinadas por OR: uma policy de leitura extra nas
-- tabelas da lista anularia o filtro por colaborador sem erro nenhum.
do $preflight$
declare
  v_extra text;
begin
  select string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname)
    into v_extra
  from pg_policies
  where schemaname = 'public'
    and tablename in ('listas_fixas_setor', 'listas_fixas_setor_itens')
    and cmd in ('SELECT', 'ALL')
    and permissive = 'PERMISSIVE'
    and policyname not in ('listas_fixas_setor_select', 'listas_fixas_setor_itens_select');

  if v_extra is not null then
    raise exception 'LISTAS_FIXAS_POLICY_DRIFT: policies de leitura inesperadas (%)', v_extra;
  end if;
end
$preflight$;

-- ─── 1. Chave (company_id, id) para a FK composta anti-cross-tenant ─────────
create unique index if not exists listas_fixas_setor_company_id_id_key
  on public.listas_fixas_setor (company_id, id);

-- ─── 2. Vínculo lista ↔ colaborador ─────────────────────────────────────────
create table if not exists public.listas_fixas_setor_usuarios (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  lista_fixa_id uuid not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  -- FK composta: o vínculo só aponta para lista da MESMA empresa. Sem ela, um
  -- vínculo gravado com a lista de outra unidade esconderia essa lista de
  -- todos os colaboradores de lá.
  constraint listas_fixas_setor_usuarios_lista_fk
    foreign key (company_id, lista_fixa_id)
    references public.listas_fixas_setor (company_id, id) on delete cascade,
  constraint listas_fixas_setor_usuarios_unico unique (lista_fixa_id, user_id)
);

comment on table public.listas_fixas_setor_usuarios is
  'Colaboradores que veem cada lista fixa de requisição. Lista sem nenhuma linha aqui aparece para todos que fazem requisição; quem tem estoque:requisicoes:manage ou system:global:manage vê todas.';

alter table public.listas_fixas_setor_usuarios enable row level security;
alter table public.listas_fixas_setor_usuarios force row level security;

-- Vínculo não se edita: troca de colaborador é DELETE + INSERT.
revoke all on public.listas_fixas_setor_usuarios from public, anon, authenticated;
grant select, insert, delete on public.listas_fixas_setor_usuarios to authenticated;
grant all on public.listas_fixas_setor_usuarios to service_role;

drop policy if exists listas_fixas_setor_usuarios_select on public.listas_fixas_setor_usuarios;
create policy listas_fixas_setor_usuarios_select on public.listas_fixas_setor_usuarios
  for select to authenticated
  using (
    company_id = (select public.get_current_company_id())
    and (
      user_id = (select auth.uid())
      or (select public.has_any_permission(auth.uid(), array[
        'estoque:requisicoes:manage', 'system:global:manage'
      ]))
    )
  );

drop policy if exists listas_fixas_setor_usuarios_insert on public.listas_fixas_setor_usuarios;
create policy listas_fixas_setor_usuarios_insert on public.listas_fixas_setor_usuarios
  for insert to authenticated
  with check (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:requisicoes:manage', 'system:global:manage'
    ]))
  );

drop policy if exists listas_fixas_setor_usuarios_delete on public.listas_fixas_setor_usuarios;
create policy listas_fixas_setor_usuarios_delete on public.listas_fixas_setor_usuarios
  for delete to authenticated
  using (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:requisicoes:manage', 'system:global:manage'
    ]))
  );

-- ─── 3. Visibilidade da lista para o usuário atual ──────────────────────────
-- SECURITY DEFINER porque o "ninguém vinculado" precisa enxergar os vínculos
-- dos OUTROS colaboradores, que a RLS acima esconde de quem não gerencia —
-- avaliado com a RLS do chamador, todo NOT EXISTS daria verdadeiro e a
-- restrição nunca valeria. Devolve só um boolean sobre a lista pedida.
--
-- O GRANT a authenticated (exigido para a policy avaliar a função) também a
-- expõe em /rpc: sem o escopo de empresa, qualquer usuário responderia "esta
-- lista é restrita?" para uma lista de OUTRA unidade. Lista fora da empresa
-- corrente devolve sempre false.
create or replace function public.lista_fixa_visivel_ao_usuario(p_lista_fixa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1
           from public.listas_fixas_setor l
           where l.id = p_lista_fixa_id
             and l.company_id = public.get_current_company_id()
         )
     and (
           not exists (
             select 1
             from public.listas_fixas_setor_usuarios v
             where v.lista_fixa_id = p_lista_fixa_id
           )
        or exists (
             select 1
             from public.listas_fixas_setor_usuarios v
             where v.lista_fixa_id = p_lista_fixa_id
               and v.user_id = auth.uid()
           )
     );
$$;

comment on function public.lista_fixa_visivel_ao_usuario(uuid) is
  'true quando a lista fixa é da empresa corrente e não tem colaborador vinculado, ou tem o usuário atual vinculado. Usada nas policies de SELECT de listas_fixas_setor/_itens.';

revoke all on function public.lista_fixa_visivel_ao_usuario(uuid) from public, anon;
grant execute on function public.lista_fixa_visivel_ao_usuario(uuid) to authenticated, service_role;

-- ─── 4. Leitura das listas e dos itens passa a respeitar o vínculo ──────────
alter policy listas_fixas_setor_select on public.listas_fixas_setor
  using (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:requisicoes:view', 'estoque:requisicoes:create',
      'estoque:requisicoes:manage', 'system:global:manage'
    ]))
    and (
      (select public.has_any_permission(auth.uid(), array[
        'estoque:requisicoes:manage', 'system:global:manage'
      ]))
      or public.lista_fixa_visivel_ao_usuario(id)
    )
  );

alter policy listas_fixas_setor_itens_select on public.listas_fixas_setor_itens
  using (
    company_id = (select public.get_current_company_id())
    and (select public.has_any_permission(auth.uid(), array[
      'estoque:requisicoes:view', 'estoque:requisicoes:create',
      'estoque:requisicoes:manage', 'system:global:manage'
    ]))
    and (
      (select public.has_any_permission(auth.uid(), array[
        'estoque:requisicoes:manage', 'system:global:manage'
      ]))
      or public.lista_fixa_visivel_ao_usuario(lista_fixa_id)
    )
  );

-- ─── 5. Quem gerencia as listas precisa listar os usuários da unidade ───────
-- A tela de colaboradores usa list_profiles_minimal, que aceitava
-- estoque:requisicoes:view mas não :manage — e Admin → Permissões grava DENY
-- para a chave desmarcada, então um perfil só com :manage abria a tela e
-- recebia PERMISSION_DENIED. Reescrita sobre a definição VIVA (preserva owner,
-- grants, assert_tenant() e o JOIN em company_memberships); idempotente e
-- aborta se o trecho esperado não existir.
do $list_profiles$
declare
  v_def text := pg_get_functiondef('public.list_profiles_minimal(text,integer)'::regprocedure);
begin
  if v_def ~ '''estoque:requisicoes:manage''' then
    return;
  end if;
  if v_def !~ '''estoque:requisicoes:view''' then
    raise exception 'DRIFT: estoque:requisicoes:view não encontrado em list_profiles_minimal';
  end if;
  execute regexp_replace(
    v_def,
    '''estoque:requisicoes:view''',
    '''estoque:requisicoes:view'',''estoque:requisicoes:manage'''
  );
end
$list_profiles$;
