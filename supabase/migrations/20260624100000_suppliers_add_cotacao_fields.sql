-- ════════════════════════════════════════════════════════════════════════════
-- Cotação (RFQ) — Fase 1: campos estruturados de fornecedor
-- ════════════════════════════════════════════════════════════════════════════
-- Adiciona colunas dedicadas (queryáveis em SQL) usadas pela lógica de pedido
-- mínimo e pelo envio de WhatsApp/Z-API. Aditivo e não-destrutivo: linhas
-- existentes recebem default/NULL e o INSERT atual de fornecedor
-- (useSalmonStore.addSupplier, que só toca name/is_active/contact_info) continua
-- funcionando sem alteração.
--
-- IMPORTANTE: 'suppliers' não tem trigger force_company_id (só 'produtos' tem).
-- Estas colunas não mudam esse comportamento — são apenas atributos adicionais.

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS minimum_order_value     numeric NOT NULL DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS minimum_order_quantity  numeric NOT NULL DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS delivery_days           integer;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payment_terms           text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS whatsapp_number         text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS categories_served       text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS cotacao_notes           text;

COMMENT ON COLUMN public.suppliers.minimum_order_value    IS 'Cotação: valor mínimo de pedido (R$). Usado na otimização de pedido mínimo.';
COMMENT ON COLUMN public.suppliers.minimum_order_quantity IS 'Cotação: quantidade mínima de pedido (opcional).';
COMMENT ON COLUMN public.suppliers.delivery_days          IS 'Cotação: prazo de entrega padrão em dias.';
COMMENT ON COLUMN public.suppliers.payment_terms          IS 'Cotação: condição de pagamento padrão (texto livre).';
COMMENT ON COLUMN public.suppliers.whatsapp_number        IS 'Cotação: número WhatsApp (E.164 ou dígitos) para envio via Z-API.';
COMMENT ON COLUMN public.suppliers.categories_served      IS 'Cotação: categorias atendidas pelo fornecedor.';
COMMENT ON COLUMN public.suppliers.cotacao_notes          IS 'Cotação: observações específicas de cotação.';
