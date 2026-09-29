-- ═══════════════════════════════════════════════════════════════════════════
-- Listas fixas de requisição: só o colaborador selecionado vê a lista
-- ═══════════════════════════════════════════════════════════════════════════
-- Inverte a regra de 20260929150000: lista SEM colaborador vinculado deixa de
-- aparecer para todos e passa a ser vista só por quem gerencia requisições
-- (estoque:requisicoes:manage / system:global:manage). O colaborador vê apenas
-- as listas em que foi selecionado.
--
-- Com a regra nova, a visibilidade depende só do vínculo do PRÓPRIO usuário,
-- que a policy de SELECT de listas_fixas_setor_usuarios já libera a ele
-- (user_id = auth.uid()). A consulta vira um EXISTS comum sob a RLS do
-- chamador e o helper SECURITY DEFINER lista_fixa_visivel_ao_usuario() — que
-- só existia para enxergar vínculos alheios e ficava exposto em /rpc — sai.

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
    and tablename in ('listas_fixas_setor', 'listas_fixas_setor_itens', 'listas_fixas_setor_usuarios')
    and cmd in ('SELECT', 'ALL')
    and permissive = 'PERMISSIVE'
    and policyname not in (
      'listas_fixas_setor_select',
      'listas_fixas_setor_itens_select',
      'listas_fixas_setor_usuarios_select'
    );

  if v_extra is not null then
    raise exception 'LISTAS_FIXAS_POLICY_DRIFT: policies de leitura inesperadas (%)', v_extra;
  end if;
end
$preflight$;

comment on table public.listas_fixas_setor_usuarios is
  'Colaboradores que veem cada lista fixa de requisição. Lista sem nenhuma linha aqui só aparece para quem tem estoque:requisicoes:manage ou system:global:manage, que veem todas.';

-- ─── Leitura das listas e dos itens: só gerente ou colaborador vinculado ────
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
      or exists (
        select 1
        from public.listas_fixas_setor_usuarios v
        where v.lista_fixa_id = listas_fixas_setor.id
          and v.user_id = (select auth.uid())
      )
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
      or exists (
        select 1
        from public.listas_fixas_setor_usuarios v
        where v.lista_fixa_id = listas_fixas_setor_itens.lista_fixa_id
          and v.user_id = (select auth.uid())
      )
    )
  );

-- As policies acima já não referenciam o helper; sem dependente, o DROP passa.
drop function if exists public.lista_fixa_visivel_ao_usuario(uuid);
