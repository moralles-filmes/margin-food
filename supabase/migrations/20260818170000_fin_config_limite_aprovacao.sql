-- Parâmetros financeiros por empresa.
--
-- O limite que decide se uma conta a pagar nasce APROVADO ou AGUARDANDO_APROVACAO
-- era lido de `app_config` — tabela global (sem company_id), com policy
-- "Service role only", e que está vazia em produção. Na prática o valor nunca
-- saía do fallback de R$ 2.500 embutido no código e nenhuma empresa conseguia
-- ajustá-lo. `fin_config` é o equivalente multi-tenant, legível e editável pela
-- própria empresa.

CREATE TABLE IF NOT EXISTS public.fin_config (
  company_id  uuid        NOT NULL DEFAULT public.get_current_company_id(),
  key         text        NOT NULL,
  value       text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  PRIMARY KEY (company_id, key)
);

ALTER TABLE public.fin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_config FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.fin_config TO authenticated, service_role;

-- `(select ...)` obrigatório: sem isso o Postgres reavalia o resolver de tenant
-- e o has_any_permission linha a linha dentro do Filter.
DROP POLICY IF EXISTS fin_config_tenant_read ON public.fin_config;
CREATE POLICY fin_config_tenant_read ON public.fin_config
  FOR SELECT TO authenticated
  USING (company_id = (select public.get_current_company_id()));

DROP POLICY IF EXISTS fin_config_tenant_write ON public.fin_config;
CREATE POLICY fin_config_tenant_write ON public.fin_config
  FOR ALL TO authenticated
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:pagar:approve', 'finance:manage', 'system:global:manage'
    ]))
  )
  WITH CHECK (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:pagar:approve', 'finance:manage', 'system:global:manage'
    ]))
  );

COMMENT ON TABLE public.fin_config IS
  'Parâmetros do módulo Financeiro por empresa (chave/valor). Ver fin_get_limite_aprovacao().';

-- `fin_contas_pagar` estava sem FORCE RLS, ao contrário do resto do schema.
-- Isso é alinhamento de padrão, não a correção do vazamento: o owner (postgres)
-- tem BYPASSRLS, então FORCE não alcança as RPCs SECURITY DEFINER. O que fecha o
-- buraco é o filtro `company_id` explícito, adicionado em reconcile_pay_conta_pagar
-- e pay_conta_pagar na migration 20260818172000.
ALTER TABLE public.fin_contas_pagar FORCE ROW LEVEL SECURITY;

-- Colunas de busca para o seletor manual de boletos em aberto na conciliação.
ALTER TABLE public.fin_contas_pagar
  ADD COLUMN IF NOT EXISTS descricao_unaccent text
    GENERATED ALWAYS AS (lower(public.immutable_unaccent(descricao))) STORED;

ALTER TABLE public.fin_contas_pagar
  ADD COLUMN IF NOT EXISTS fornecedor_unaccent text
    GENERATED ALWAYS AS (lower(public.immutable_unaccent(fornecedor))) STORED;

CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_descricao_unaccent
  ON public.fin_contas_pagar USING gin (descricao_unaccent gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_fornecedor_unaccent
  ON public.fin_contas_pagar USING gin (fornecedor_unaccent gin_trgm_ops);

-- Boletos em aberto por empresa — caminho quente do seletor da conciliação.
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_abertos
  ON public.fin_contas_pagar (company_id, status, data_vencimento)
  WHERE status IN ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'VENCIDO');
