-- Grupo D — RPCs de Compras/RH presas a chave legada (mesmo bug de 20260912131731 /
-- 20260912164500 / 20260914120000, agora fora do Financeiro).
--
-- O frontend libera a tela por chave granular do registry (useCan), mas estas RPCs
-- SECURITY DEFINER checam só chave legada de 2 partes (purchases:*, suppliers:edit,
-- stock:edit, rh:manage, rh:admin, rh:read). O banco NÃO expande LEGACY_PERMISSION_MAP
-- (só o useCan do frontend expande) e Admin → Permissões grava DENY para toda chave
-- default do perfil que não está marcada na matriz — inclusive as legadas, que a matriz
-- nem renderiza. Resultado: tela abre, RPC nega.
--
-- Confirmado em produção (2026-09-14): o usuário 07849560-5fdd-4818-b685-c3a8330fd3e0
-- (empresa c064aa98-5120-4eaf-97a2-8dbc5cfbeee7) está ALLOW em compras:ranking:view,
-- compras:pedidos:view, compras:pedidos:delete, compras:fornecedores:edit,
-- estoque:movimentacoes:cancel, rh:ferias:approve e rh:beneficios:view — e DENY em
-- purchases:read, purchases:create, suppliers:edit, stock:edit, rh:manage e rh:read.
--
-- A mudança é ADITIVA: toda chave legada continua aceita (não quebra admin/diretor/
-- gerente_geral nem unidades legadas) e system:global:manage passa a valer onde faltava.
--
-- NÃO ALTERADO DE PROPÓSITO:
--   * rpc_create_company(text,text) — gate system:admin é intencional (criação de
--     empresa é super-admin); CLAUDE.md proíbe alargar system:admin/system:read para
--     algo alcançável por admin de unidade.
--   * get_beneficios_masked: a linha `v_is_admin := has_permission(auth.uid(),
--     'system:admin')` NÃO é gate de acesso — é o branch que desmascara o número do
--     cartão. Só o gate de acesso (rh:read) é tocado.
--
-- Reescrita via pg_get_functiondef + replace() sobre a definição VIVA: preserva owner,
-- grants, volatilidade, SET search_path e o corpo atual; aborta se o trecho esperado
-- não existir (DRIFT).

DO $rpcs$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- ===== Compras =====
      -- upsert_supplier: chamado em RankingFornecedoresView (modal "Adicionar preço"),
      -- que grava fornecedor por nome. Chave granular real do CRUD de fornecedores.
      ('public.upsert_supplier(text)',
       $a$IF NOT has_permission(auth.uid(), 'purchases:edit') AND NOT has_permission(auth.uid(), 'suppliers:edit') THEN$a$,
       $b$IF NOT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:create', 'compras:fornecedores:edit', 'purchases:edit', 'suppliers:edit', 'system:global:manage']) THEN$b$),

      -- get_supplier_ranking: RankingFornecedoresView é gated por compras:ranking:view
      -- (`if (!canViewRbac) return null`).
      ('public.get_supplier_ranking(uuid,text,integer,integer,text)',
       $a$IF NOT has_permission(auth.uid(), 'purchases:read') THEN
    RAISE EXCEPTION 'Sem permissão (purchases:read).';$a$,
       $b$IF NOT has_any_permission(auth.uid(), ARRAY['compras:ranking:view', 'purchases:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (compras:ranking:view).';$b$),

      -- list_solic_compra_mercado_cursor: solicitações de compra/mercado → submódulo
      -- "Pedidos & Mercado" do registry.
      ('public.list_solic_compra_mercado_cursor(integer,timestamp with time zone,uuid,text,text,uuid,text,date,date)',
       $a$IF NOT has_permission(auth.uid(), 'purchases:read') THEN
    RAISE EXCEPTION 'Sem permissão (purchases:read).';$a$,
       $b$IF NOT has_any_permission(auth.uid(), ARRAY['compras:pedidos:view', 'purchases:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (compras:pedidos:view).';$b$),

      -- storno_purchase_order_stock: só é chamada por usePurchaseOrdersStore.deleteOrder,
      -- cujo botão em PedidosComprasMercadoView é gated por compras:pedidos:delete.
      -- O segundo ramo legado (stock:edit) cobre o lado estoque: a operação cancela
      -- movimentações e cria ENTRADA_ESTORNO → chave granular equivalente é
      -- estoque:movimentacoes:cancel (quem já pode cancelar movimentação na tela de
      -- Movimentações não ganha capacidade nova aqui).
      ('public.storno_purchase_order_stock(uuid)',
       $a$IF NOT public.has_permission(v_user, 'purchases:create') AND NOT public.has_permission(v_user, 'stock:edit') THEN$a$,
       $b$IF NOT public.has_any_permission(v_user, ARRAY['compras:pedidos:delete', 'estoque:movimentacoes:cancel', 'purchases:create', 'stock:edit', 'system:global:manage']) THEN$b$),

      -- ===== RH =====
      -- aprovar_ferias: FeriasAfastamentosSection; submódulo rh:ferias tem a ação approve.
      ('public.aprovar_ferias(uuid,uuid)',
       $a$IF NOT public.has_permission(auth.uid(), 'rh:manage') AND NOT public.has_permission(auth.uid(), 'rh:admin') THEN$a$,
       $b$IF NOT public.has_any_permission(auth.uid(), ARRAY['rh:ferias:approve', 'rh:manage', 'rh:admin', 'system:global:manage']) THEN$b$),

      -- get_beneficios_masked: gate de ACESSO (rh:read) → rh:beneficios:view.
      -- A linha v_is_admin (system:admin) NÃO é tocada: é o branch de desmascaramento
      -- do número do cartão, não um gate de acesso.
      ('public.get_beneficios_masked(uuid)',
       $a$IF NOT has_permission(auth.uid(), 'rh:read') THEN
    RAISE EXCEPTION 'Permissão negada: rh:read';$a$,
       $b$IF NOT has_any_permission(auth.uid(), ARRAY['rh:beneficios:view', 'rh:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Permissão negada: rh:beneficios:view';$b$)
    ) AS t(sig, old_text, new_text)
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    IF position(r.old_text IN v_def) = 0 THEN
      RAISE EXCEPTION 'DRIFT: trecho esperado não encontrado em %: %', r.sig, r.old_text;
    END IF;
    EXECUTE replace(v_def, r.old_text, r.new_text);
  END LOOP;
END;
$rpcs$;

-- Guarda pós-condição: nenhuma das 6 RPCs pode continuar decidindo acesso só por
-- has_permission de chave legada, e o branch system:admin de get_beneficios_masked
-- tem que continuar intacto.
DO $verify$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.upsert_supplier(text)', 'compras:fornecedores:edit'),
      ('public.get_supplier_ranking(uuid,text,integer,integer,text)', 'compras:ranking:view'),
      ('public.list_solic_compra_mercado_cursor(integer,timestamp with time zone,uuid,text,text,uuid,text,date,date)', 'compras:pedidos:view'),
      ('public.storno_purchase_order_stock(uuid)', 'compras:pedidos:delete'),
      ('public.aprovar_ferias(uuid,uuid)', 'rh:ferias:approve'),
      ('public.get_beneficios_masked(uuid)', 'rh:beneficios:view')
    ) AS t(sig, expected_key)
  LOOP
    IF position(r.expected_key IN pg_get_functiondef(r.sig::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'VERIFY: chave granular % ausente em %', r.expected_key, r.sig;
    END IF;
  END LOOP;

  IF position($chk$v_is_admin := has_permission(auth.uid(), 'system:admin')$chk$
              IN pg_get_functiondef('public.get_beneficios_masked(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'VERIFY: branch de desmascaramento (system:admin) de get_beneficios_masked foi alterado';
  END IF;

  IF position($chk$has_permission(auth.uid(), 'system:admin')$chk$
              IN pg_get_functiondef('public.rpc_create_company(text,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'VERIFY: rpc_create_company deveria continuar gated por system:admin';
  END IF;
END;
$verify$;
