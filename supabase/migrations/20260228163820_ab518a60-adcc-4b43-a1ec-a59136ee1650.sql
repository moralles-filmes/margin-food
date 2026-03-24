
-- ============================================================
-- A) TABELA GLOBAL DE AUDITORIA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid NULL,
  actor_email text NULL,
  actor_role text NULL,
  source text NOT NULL DEFAULT 'db',
  module text NOT NULL,
  entity text NOT NULL,
  entity_id uuid NULL,
  action text NOT NULL,
  before jsonb NULL,
  after jsonb NULL,
  metadata jsonb NULL,
  success boolean NOT NULL DEFAULT true
);

-- Índices
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_logs_module_entity ON public.audit_logs (module, entity, created_at DESC);
CREATE INDEX idx_audit_logs_entity_id ON public.audit_logs (entity_id, created_at DESC);

-- ============================================================
-- B) FUNÇÃO GENÉRICA DE TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_module text;
  v_entity text;
  v_action text;
  v_before jsonb;
  v_after jsonb;
  v_entity_id uuid;
  v_sensitive_keys text[] := ARRAY['cpf','senha','password','token','card_number','secret'];
  k text;
BEGIN
  v_module := TG_ARGV[0];
  v_entity := TG_ARGV[1];

  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_after := row_to_json(NEW)::jsonb;
    v_entity_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_before := row_to_json(OLD)::jsonb;
    v_after := row_to_json(NEW)::jsonb;
    v_entity_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_before := row_to_json(OLD)::jsonb;
    v_entity_id := OLD.id;
  END IF;

  -- Mask sensitive fields
  FOREACH k IN ARRAY v_sensitive_keys LOOP
    IF v_before IS NOT NULL AND v_before ? k THEN
      v_before := v_before || jsonb_build_object(k, '***');
    END IF;
    IF v_after IS NOT NULL AND v_after ? k THEN
      v_after := v_after || jsonb_build_object(k, '***');
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (actor_user_id, source, module, entity, entity_id, action, before, after)
  VALUES (auth.uid(), 'db', v_module, v_entity, v_entity_id, v_action, v_before, v_after);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ============================================================
-- TRIGGERS — FINANCEIRO
-- ============================================================
CREATE TRIGGER audit_fin_lancamentos AFTER INSERT OR UPDATE OR DELETE ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('financeiro', 'fin_lancamentos');

CREATE TRIGGER audit_fin_lancamento_rateios AFTER INSERT OR UPDATE OR DELETE ON public.fin_lancamento_rateios
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('financeiro', 'fin_lancamento_rateios');

CREATE TRIGGER audit_fin_contas AFTER INSERT OR UPDATE OR DELETE ON public.fin_contas
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('financeiro', 'fin_contas');

CREATE TRIGGER audit_fin_contas_pagar AFTER INSERT OR UPDATE OR DELETE ON public.fin_contas_pagar
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('financeiro', 'fin_contas_pagar');

CREATE TRIGGER audit_fin_contas_receber AFTER INSERT OR UPDATE OR DELETE ON public.fin_contas_receber
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('financeiro', 'fin_contas_receber');

-- COMPRAS
CREATE TRIGGER audit_purchase_orders AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('compras', 'purchase_orders');

CREATE TRIGGER audit_purchase_order_items AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('compras', 'purchase_order_items');

CREATE TRIGGER audit_solic_compra_mercado AFTER INSERT OR UPDATE OR DELETE ON public.solic_compra_mercado
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('compras', 'solic_compra_mercado');

CREATE TRIGGER audit_solic_compra_mercado_item AFTER INSERT OR UPDATE OR DELETE ON public.solic_compra_mercado_item
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('compras', 'solic_compra_mercado_item');

CREATE TRIGGER audit_recebimentos AFTER INSERT OR UPDATE OR DELETE ON public.recebimentos
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('compras', 'recebimentos');

CREATE TRIGGER audit_recebimento_itens AFTER INSERT OR UPDATE OR DELETE ON public.recebimento_itens
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('compras', 'recebimento_itens');

-- ESTOQUE / INVENTÁRIO
CREATE TRIGGER audit_produtos AFTER INSERT OR UPDATE OR DELETE ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('estoque', 'produtos');

CREATE TRIGGER audit_movimentacoes_estoque AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_estoque
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('estoque', 'movimentacoes_estoque');

CREATE TRIGGER audit_inventarios AFTER INSERT OR UPDATE OR DELETE ON public.inventarios
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('inventario', 'inventarios');

CREATE TRIGGER audit_inventario_itens AFTER INSERT OR UPDATE OR DELETE ON public.inventario_itens
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('inventario', 'inventario_itens');

-- ============================================================
-- D) RLS — IMUTÁVEL
-- ============================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: admin only
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
FOR SELECT USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'diretor') OR public.has_role(auth.uid(), 'gerente_geral')
);

-- INSERT: blocked for client (triggers/RPCs use SECURITY DEFINER)
-- No INSERT policy = blocked by default with RLS enabled

-- UPDATE: never
-- DELETE: never
-- (No policies = blocked)
