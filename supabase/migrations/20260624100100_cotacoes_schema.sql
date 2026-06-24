-- ════════════════════════════════════════════════════════════════════════════
-- Cotação (RFQ) — Fase 1: schema base (7 tabelas multi-tenant)
-- ════════════════════════════════════════════════════════════════════════════
-- Padrão do projeto: company_id NOT NULL + FORCE RLS + trigger force_company_id
-- + trigger updated_at + soft delete (na cotação) + índices em company_id
-- + colunas geradas *_unaccent (busca acento-insensível).
--
-- Escritas críticas (criar cotação, salvar respostas, converter em pedido) passam
-- por RPCs SECURITY DEFINER (próxima migration). As políticas abaixo protegem o
-- acesso direto via PostgREST do cliente. Funções SECURITY DEFINER (owner postgres,
-- BYPASSRLS) contornam a RLS e setam company_id explicitamente.

-- ─────────────────────────────────────────────────────────────────────────────
-- Função compartilhada force_company_id (genérica — só toca NEW.company_id)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cotacao_force_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.company_id := public.get_current_company_id();
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.company_id := OLD.company_id;  -- imutável
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) cotacoes (cabeçalho) — soft delete + busca unaccent
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cotacoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo            text NOT NULL,
  titulo            text NOT NULL,
  status            text NOT NULL DEFAULT 'RASCUNHO'
                      CHECK (status IN ('RASCUNHO','EM_COTACAO','RESPONDIDA','EM_ANALISE','NEGOCIANDO','ENCERRADA','CONVERTIDA','CANCELADA')),
  data_envio        timestamptz,
  data_validade     date,
  observacao        text,
  origin_type       text CHECK (origin_type IN ('MANUAL','ALERTA','REQUISICAO') OR origin_type IS NULL),
  origin_ref        uuid,
  total_estimado    numeric NOT NULL DEFAULT 0,
  economia_estimada numeric NOT NULL DEFAULT 0,
  created_by        uuid NOT NULL DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  deleted_by        uuid,
  codigo_unaccent   text GENERATED ALWAYS AS (lower(public.immutable_unaccent(codigo))) STORED,
  titulo_unaccent   text GENERATED ALWAYS AS (lower(public.immutable_unaccent(titulo))) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cotacoes_company_codigo
  ON public.cotacoes (company_id, codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cotacoes_company_status
  ON public.cotacoes (company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cotacoes_company_created
  ON public.cotacoes (company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cotacoes_titulo_unaccent
  ON public.cotacoes USING gin (titulo_unaccent public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cotacoes_codigo_unaccent
  ON public.cotacoes USING gin (codigo_unaccent public.gin_trgm_ops);

ALTER TABLE public.cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cotacoes_select ON public.cotacoes;
CREATE POLICY cotacoes_select ON public.cotacoes FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:view','system:global:manage']));
DROP POLICY IF EXISTS cotacoes_insert ON public.cotacoes;
CREATE POLICY cotacoes_insert ON public.cotacoes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:create','system:global:manage']));
DROP POLICY IF EXISTS cotacoes_update ON public.cotacoes;
CREATE POLICY cotacoes_update ON public.cotacoes FOR UPDATE TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:edit','compras:cotacao:approve','compras:cotacao:close','compras:cotacao:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id());
DROP POLICY IF EXISTS cotacoes_delete ON public.cotacoes;
CREATE POLICY cotacoes_delete ON public.cotacoes FOR DELETE TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:delete','system:global:manage']));

DROP TRIGGER IF EXISTS trg_cotacoes_force_company ON public.cotacoes;
CREATE TRIGGER trg_cotacoes_force_company BEFORE INSERT OR UPDATE ON public.cotacoes
  FOR EACH ROW EXECUTE FUNCTION public.cotacao_force_company_id();
DROP TRIGGER IF EXISTS trg_cotacoes_updated_at ON public.cotacoes;
CREATE TRIGGER trg_cotacoes_updated_at BEFORE UPDATE ON public.cotacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) cotacao_itens
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cotacao_itens (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id             uuid NOT NULL REFERENCES public.cotacoes(id) ON DELETE CASCADE,
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  produto_id             uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  produto_nome_snapshot  text NOT NULL,
  unidade_snapshot       text,
  purchase_unit_snapshot text,
  quantidade             numeric NOT NULL DEFAULT 0,
  observacao             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_itens_cotacao ON public.cotacao_itens (company_id, cotacao_id);

ALTER TABLE public.cotacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_itens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cotacao_itens_select ON public.cotacao_itens;
CREATE POLICY cotacao_itens_select ON public.cotacao_itens FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:view','compras:cotacao:edit','compras:cotacao:manage','system:global:manage']));
DROP POLICY IF EXISTS cotacao_itens_write ON public.cotacao_itens;
CREATE POLICY cotacao_itens_write ON public.cotacao_itens FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:create','compras:cotacao:edit','compras:cotacao:delete','compras:cotacao:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:create','compras:cotacao:edit','compras:cotacao:delete','compras:cotacao:manage','system:global:manage']));

DROP TRIGGER IF EXISTS trg_cotacao_itens_force_company ON public.cotacao_itens;
CREATE TRIGGER trg_cotacao_itens_force_company BEFORE INSERT OR UPDATE ON public.cotacao_itens
  FOR EACH ROW EXECUTE FUNCTION public.cotacao_force_company_id();
DROP TRIGGER IF EXISTS trg_cotacao_itens_updated_at ON public.cotacao_itens;
CREATE TRIGGER trg_cotacao_itens_updated_at BEFORE UPDATE ON public.cotacao_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) cotacao_fornecedores
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cotacao_fornecedores (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id              uuid NOT NULL REFERENCES public.cotacoes(id) ON DELETE CASCADE,
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id             uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_nome_snapshot  text NOT NULL,
  whatsapp_snapshot       text,
  pedido_minimo_snapshot  numeric NOT NULL DEFAULT 0,
  status                  text NOT NULL DEFAULT 'AGUARDANDO'
                            CHECK (status IN ('AGUARDANDO','ENVIADO','RESPONDIDO','RECUSADO','NEGOCIANDO','FECHADO')),
  prazo_entrega_dias      integer,
  condicao_pagamento      text,
  frete                   numeric NOT NULL DEFAULT 0,
  observacao              text,
  mensagem_enviada_em     timestamptz,
  respondido_em           timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_fornecedores_cotacao ON public.cotacao_fornecedores (company_id, cotacao_id);

ALTER TABLE public.cotacao_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_fornecedores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cotacao_fornecedores_select ON public.cotacao_fornecedores;
CREATE POLICY cotacao_fornecedores_select ON public.cotacao_fornecedores FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:view','compras:cotacao:edit','compras:cotacao:manage','system:global:manage']));
DROP POLICY IF EXISTS cotacao_fornecedores_write ON public.cotacao_fornecedores;
CREATE POLICY cotacao_fornecedores_write ON public.cotacao_fornecedores FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:create','compras:cotacao:edit','compras:cotacao:delete','compras:cotacao:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:create','compras:cotacao:edit','compras:cotacao:delete','compras:cotacao:manage','system:global:manage']));

DROP TRIGGER IF EXISTS trg_cotacao_fornecedores_force_company ON public.cotacao_fornecedores;
CREATE TRIGGER trg_cotacao_fornecedores_force_company BEFORE INSERT OR UPDATE ON public.cotacao_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.cotacao_force_company_id();
DROP TRIGGER IF EXISTS trg_cotacao_fornecedores_updated_at ON public.cotacao_fornecedores;
CREATE TRIGGER trg_cotacao_fornecedores_updated_at BEFORE UPDATE ON public.cotacao_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═════════════════════════════════════════════════════════════════════════════
-- 4) cotacao_respostas (matriz de preços: 1 linha por fornecedor×item)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cotacao_respostas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_fornecedor_id uuid NOT NULL REFERENCES public.cotacao_fornecedores(id) ON DELETE CASCADE,
  cotacao_item_id       uuid NOT NULL REFERENCES public.cotacao_itens(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  preco_unitario        numeric,
  quantidade_disponivel numeric,
  disponivel            boolean NOT NULL DEFAULT true,
  observacao            text,
  selecionado           boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cotacao_resposta UNIQUE (cotacao_fornecedor_id, cotacao_item_id)
);
CREATE INDEX IF NOT EXISTS idx_cotacao_respostas_forn ON public.cotacao_respostas (company_id, cotacao_fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_cotacao_respostas_item ON public.cotacao_respostas (company_id, cotacao_item_id);

ALTER TABLE public.cotacao_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_respostas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cotacao_respostas_select ON public.cotacao_respostas;
CREATE POLICY cotacao_respostas_select ON public.cotacao_respostas FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:view','compras:cotacao:edit','compras:cotacao:manage','system:global:manage']));
DROP POLICY IF EXISTS cotacao_respostas_write ON public.cotacao_respostas;
CREATE POLICY cotacao_respostas_write ON public.cotacao_respostas FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:create','compras:cotacao:edit','compras:cotacao:delete','compras:cotacao:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:create','compras:cotacao:edit','compras:cotacao:delete','compras:cotacao:manage','system:global:manage']));

DROP TRIGGER IF EXISTS trg_cotacao_respostas_force_company ON public.cotacao_respostas;
CREATE TRIGGER trg_cotacao_respostas_force_company BEFORE INSERT OR UPDATE ON public.cotacao_respostas
  FOR EACH ROW EXECUTE FUNCTION public.cotacao_force_company_id();
DROP TRIGGER IF EXISTS trg_cotacao_respostas_updated_at ON public.cotacao_respostas;
CREATE TRIGGER trg_cotacao_respostas_updated_at BEFORE UPDATE ON public.cotacao_respostas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═════════════════════════════════════════════════════════════════════════════
-- 5) cotacao_sugestoes (recomendação persistida — append)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cotacao_sugestoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id        uuid NOT NULL REFERENCES public.cotacoes(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo              text NOT NULL
                      CHECK (tipo IN ('MENOR_PRECO','OTIMIZADA_PEDIDO_MINIMO','MENOS_FORNECEDORES','CUSTO_BENEFICIO','IA','MANUAL')),
  total_estimado    numeric NOT NULL DEFAULT 0,
  economia_estimada numeric NOT NULL DEFAULT 0,
  dados_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        uuid NOT NULL DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_sugestoes_cotacao ON public.cotacao_sugestoes (company_id, cotacao_id, created_at DESC);

ALTER TABLE public.cotacao_sugestoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_sugestoes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cotacao_sugestoes_select ON public.cotacao_sugestoes;
CREATE POLICY cotacao_sugestoes_select ON public.cotacao_sugestoes FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:view','compras:cotacao:edit','compras:cotacao:manage','system:global:manage']));
DROP POLICY IF EXISTS cotacao_sugestoes_write ON public.cotacao_sugestoes;
CREATE POLICY cotacao_sugestoes_write ON public.cotacao_sugestoes FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:create','compras:cotacao:edit','compras:cotacao:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:create','compras:cotacao:edit','compras:cotacao:manage','system:global:manage']));

DROP TRIGGER IF EXISTS trg_cotacao_sugestoes_force_company ON public.cotacao_sugestoes;
CREATE TRIGGER trg_cotacao_sugestoes_force_company BEFORE INSERT OR UPDATE ON public.cotacao_sugestoes
  FOR EACH ROW EXECUTE FUNCTION public.cotacao_force_company_id();

-- ═════════════════════════════════════════════════════════════════════════════
-- 6) cotacao_whatsapp_logs (log de envios Z-API — append)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cotacao_whatsapp_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id            uuid NOT NULL REFERENCES public.cotacoes(id) ON DELETE CASCADE,
  cotacao_fornecedor_id uuid REFERENCES public.cotacao_fornecedores(id) ON DELETE SET NULL,
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo                  text NOT NULL
                          CHECK (tipo IN ('SOLICITACAO_COTACAO','COBRANCA_RESPOSTA','NEGOCIACAO','FECHAMENTO_PEDIDO','CONFIRMACAO_PRAZO')),
  phone                 text,
  message               text,
  zapi_response         jsonb,
  status                text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','ERROR')),
  sent_at               timestamptz,
  created_by            uuid NOT NULL DEFAULT auth.uid(),
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacao_wa_logs_cotacao ON public.cotacao_whatsapp_logs (company_id, cotacao_id, created_at DESC);

ALTER TABLE public.cotacao_whatsapp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_whatsapp_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cotacao_wa_logs_select ON public.cotacao_whatsapp_logs;
CREATE POLICY cotacao_wa_logs_select ON public.cotacao_whatsapp_logs FOR SELECT TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:view','compras:cotacao:manage','system:global:manage']));
-- INSERT direto pelo cliente também é coberto (o envio real ocorre na Edge Function via service-role).
DROP POLICY IF EXISTS cotacao_wa_logs_write ON public.cotacao_whatsapp_logs;
CREATE POLICY cotacao_wa_logs_write ON public.cotacao_whatsapp_logs FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage','system:global:manage']));

DROP TRIGGER IF EXISTS trg_cotacao_wa_logs_force_company ON public.cotacao_whatsapp_logs;
CREATE TRIGGER trg_cotacao_wa_logs_force_company BEFORE INSERT OR UPDATE ON public.cotacao_whatsapp_logs
  FOR EACH ROW EXECUTE FUNCTION public.cotacao_force_company_id();

-- ═════════════════════════════════════════════════════════════════════════════
-- 7) cotacao_zapi_config (credenciais Z-API por empresa — 1 linha/empresa)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cotacao_zapi_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_id   text,
  token         text,
  client_token  text,
  base_url      text NOT NULL DEFAULT 'https://api.z-api.io',
  default_phone text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cotacao_zapi_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_zapi_config FORCE ROW LEVEL SECURITY;
-- Config é sensível (token): só quem tem 'manage' (ou super-admin) lê/escreve.
DROP POLICY IF EXISTS cotacao_zapi_config_all ON public.cotacao_zapi_config;
CREATE POLICY cotacao_zapi_config_all ON public.cotacao_zapi_config FOR ALL TO authenticated
  USING (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage','system:global:manage']))
  WITH CHECK (company_id = public.get_current_company_id()
         AND public.has_any_permission(auth.uid(), ARRAY['compras:cotacao:manage','system:global:manage']));

DROP TRIGGER IF EXISTS trg_cotacao_zapi_config_force_company ON public.cotacao_zapi_config;
CREATE TRIGGER trg_cotacao_zapi_config_force_company BEFORE INSERT OR UPDATE ON public.cotacao_zapi_config
  FOR EACH ROW EXECUTE FUNCTION public.cotacao_force_company_id();
DROP TRIGGER IF EXISTS trg_cotacao_zapi_config_updated_at ON public.cotacao_zapi_config;
CREATE TRIGGER trg_cotacao_zapi_config_updated_at BEFORE UPDATE ON public.cotacao_zapi_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.cotacoes              IS 'Cotação (RFQ): cabeçalho da cotação de compras.';
COMMENT ON TABLE public.cotacao_itens         IS 'Cotação: itens a cotar (snapshot de produto/unidade).';
COMMENT ON TABLE public.cotacao_fornecedores  IS 'Cotação: fornecedores participantes (snapshot de nome/whatsapp/pedido mínimo).';
COMMENT ON TABLE public.cotacao_respostas     IS 'Cotação: matriz de preços (fornecedor × item).';
COMMENT ON TABLE public.cotacao_sugestoes     IS 'Cotação: recomendação de compra gerada (optimizer/IA/manual).';
COMMENT ON TABLE public.cotacao_whatsapp_logs IS 'Cotação: log de mensagens WhatsApp enviadas via Z-API.';
COMMENT ON TABLE public.cotacao_zapi_config   IS 'Cotação: credenciais Z-API por empresa (lidas pela Edge Function via service-role).';
