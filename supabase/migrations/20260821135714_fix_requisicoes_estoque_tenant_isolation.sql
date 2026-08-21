-- =========================================================================
-- P0: requisicoes_estoque / requisicao_estoque_itens vazavam entre tenants.
--
-- A migration 20260409180000_fix_rls_requisicoes_permissions.sql substituiu
-- as policies antigas para corrigir um bug de mapeamento de permissão, mas
-- as novas policies (req_select/req_insert/req_update/req_delete e as
-- equivalentes req_itens_*) checam SOMENTE has_permission(...) — nenhuma
-- delas referencia company_id. Como as permissões RBAC são globais (não
-- por empresa), qualquer usuário autenticado com 'estoque:requisicoes:view'
-- podia ler requisições de QUALQUER empresa via REST direto, e um usuário
-- com 'estoque:requisicoes:approve' ou 'stock:requisitions:create' podia
-- até aprovar/negar/atualizar requisições de outra empresa. Confirmado
-- explorável: tabela já tem linhas de 2 company_id distintos.
--
-- As policies de auto-serviço do solicitante ("Solicitante can delete own
-- pending requisicao", "Authenticated can insert requisicoes", "Solicitantes
-- can read own requisicoes") também não continham company_id — o insert em
-- particular aceitava qualquer company_id enviado explicitamente no payload
-- pelo cliente (o DEFAULT get_current_company_id() só protege quando o
-- client omite a coluna). Mantido o modelo de acesso (permissão RBAC OU
-- solicitante dono do registro), apenas adicionado o filtro de tenant que
-- faltava em cada policy.
-- =========================================================================

-- ── requisicoes_estoque ──

ALTER POLICY "Authenticated can insert requisicoes" ON public.requisicoes_estoque
WITH CHECK (
  (solicitante_user_id = (SELECT auth.uid()))
  AND (company_id = (SELECT public.get_current_company_id()))
);

ALTER POLICY "Solicitante can delete own pending requisicao" ON public.requisicoes_estoque
USING (
  (solicitante_user_id = (SELECT auth.uid()))
  AND (status = 'SOLICITADA'::text)
  AND (company_id = (SELECT public.get_current_company_id()))
);

ALTER POLICY "Solicitantes can read own requisicoes" ON public.requisicoes_estoque
USING (
  (solicitante_user_id = (SELECT auth.uid()))
  AND (company_id = (SELECT public.get_current_company_id()))
);

ALTER POLICY "req_select" ON public.requisicoes_estoque
USING (
  (company_id = (SELECT public.get_current_company_id()))
  AND (
    (SELECT public.has_permission(auth.uid(), 'estoque:requisicoes:view'))
    OR (SELECT public.has_permission(auth.uid(), 'stock:requisitions:read'))
    OR (SELECT public.has_permission(auth.uid(), 'system:global:manage'))
  )
);

ALTER POLICY "req_insert" ON public.requisicoes_estoque
WITH CHECK (
  (company_id = (SELECT public.get_current_company_id()))
  AND (
    (SELECT public.has_permission(auth.uid(), 'estoque:requisicoes:create'))
    OR (SELECT public.has_permission(auth.uid(), 'stock:requisitions:create'))
    OR (SELECT public.has_permission(auth.uid(), 'system:global:manage'))
  )
);

ALTER POLICY "req_update" ON public.requisicoes_estoque
USING (
  (company_id = (SELECT public.get_current_company_id()))
  AND (
    (SELECT public.has_permission(auth.uid(), 'estoque:requisicoes:approve'))
    OR (SELECT public.has_permission(auth.uid(), 'stock:requisitions:create'))
    OR (SELECT public.has_permission(auth.uid(), 'system:global:manage'))
  )
)
WITH CHECK (
  (company_id = (SELECT public.get_current_company_id()))
  AND (
    (SELECT public.has_permission(auth.uid(), 'estoque:requisicoes:approve'))
    OR (SELECT public.has_permission(auth.uid(), 'stock:requisitions:create'))
    OR (SELECT public.has_permission(auth.uid(), 'system:global:manage'))
  )
);

ALTER POLICY "req_delete" ON public.requisicoes_estoque
USING (
  (company_id = (SELECT public.get_current_company_id()))
  AND (SELECT public.has_permission(auth.uid(), 'system:global:manage'))
);

-- ── requisicao_estoque_itens ──

ALTER POLICY "req_itens_select" ON public.requisicao_estoque_itens
USING (
  (company_id = (SELECT public.get_current_company_id()))
  AND (
    (SELECT public.has_permission(auth.uid(), 'estoque:requisicoes:view'))
    OR (SELECT public.has_permission(auth.uid(), 'stock:requisitions:read'))
    OR (SELECT public.has_permission(auth.uid(), 'system:global:manage'))
  )
);

ALTER POLICY "req_itens_insert" ON public.requisicao_estoque_itens
WITH CHECK (
  (company_id = (SELECT public.get_current_company_id()))
  AND (
    (SELECT public.has_permission(auth.uid(), 'estoque:requisicoes:create'))
    OR (SELECT public.has_permission(auth.uid(), 'stock:requisitions:create'))
    OR (SELECT public.has_permission(auth.uid(), 'system:global:manage'))
  )
);

ALTER POLICY "req_itens_update" ON public.requisicao_estoque_itens
USING (
  (company_id = (SELECT public.get_current_company_id()))
  AND (
    (SELECT public.has_permission(auth.uid(), 'estoque:requisicoes:approve'))
    OR (SELECT public.has_permission(auth.uid(), 'stock:requisitions:create'))
    OR (SELECT public.has_permission(auth.uid(), 'system:global:manage'))
  )
)
WITH CHECK (
  (company_id = (SELECT public.get_current_company_id()))
  AND (
    (SELECT public.has_permission(auth.uid(), 'estoque:requisicoes:approve'))
    OR (SELECT public.has_permission(auth.uid(), 'stock:requisitions:create'))
    OR (SELECT public.has_permission(auth.uid(), 'system:global:manage'))
  )
);
