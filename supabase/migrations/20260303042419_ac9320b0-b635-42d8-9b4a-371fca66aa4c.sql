
-- =====================================================
-- FICHA TÉCNICA P2 — ENTERPRISE FREEZE FIX
-- W1: Add trg_set_updated_at triggers (remove need for client-side timestamps)
-- W2: Block hard deletes on critical tables
-- W3: Add cache invalidation trigger for BOM item changes
-- =====================================================

-- ─── W1: ADD updated_at TRIGGERS ───

-- ficha_componentes
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.ficha_componentes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_updated_at();

-- canais_venda
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.canais_venda
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_updated_at();

-- precificacao_canal
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.precificacao_canal
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_updated_at();

-- config_precificacao
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.config_precificacao
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_updated_at();

-- ─── W2: BLOCK HARD DELETES ───

-- ficha_componentes: soft delete only
DROP POLICY IF EXISTS ficha_comp_delete ON public.ficha_componentes;
CREATE POLICY ficha_comp_delete ON public.ficha_componentes
  FOR DELETE TO authenticated
  USING (false);

-- ficha_componente_itens: managed by SECURITY DEFINER RPC only
DROP POLICY IF EXISTS ficha_itens_delete ON public.ficha_componente_itens;
CREATE POLICY ficha_itens_delete ON public.ficha_componente_itens
  FOR DELETE TO authenticated
  USING (false);

-- canais_venda: soft delete only
DROP POLICY IF EXISTS canais_delete ON public.canais_venda;
CREATE POLICY canais_delete ON public.canais_venda
  FOR DELETE TO authenticated
  USING (false);

-- cenarios_simulacao: keep for audit trail
DROP POLICY IF EXISTS cenarios_delete ON public.cenarios_simulacao;
CREATE POLICY cenarios_delete ON public.cenarios_simulacao
  FOR DELETE TO authenticated
  USING (false);

-- ─── W3: CACHE INVALIDATION TRIGGER ───
-- When BOM items change, bump parent component updated_at to signal stale cost
CREATE OR REPLACE FUNCTION public.trg_ficha_itens_invalidate_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_id uuid;
BEGIN
  -- Determine the parent component id
  IF TG_OP = 'DELETE' THEN
    _parent_id := OLD.componente_pai_id;
  ELSE
    _parent_id := NEW.componente_pai_id;
  END IF;

  -- Bump updated_at on parent to signal stale cost
  UPDATE ficha_componentes
  SET updated_at = now()
  WHERE id = _parent_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ficha_itens_invalidate_parent
  AFTER INSERT OR UPDATE OR DELETE ON public.ficha_componente_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ficha_itens_invalidate_parent();
