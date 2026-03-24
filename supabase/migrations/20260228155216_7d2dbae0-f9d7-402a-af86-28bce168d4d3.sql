
-- =============================================================
-- ULTRA HARDENING — FINANCEIRO: Constraints, FK, Indexes, Trigger
-- =============================================================

-- 1) FK lancamento_pai_id: change ON DELETE SET NULL → ON DELETE CASCADE
ALTER TABLE fin_lancamentos DROP CONSTRAINT fin_lancamentos_lancamento_pai_id_fkey;
ALTER TABLE fin_lancamentos ADD CONSTRAINT fin_lancamentos_lancamento_pai_id_fkey
  FOREIGN KEY (lancamento_pai_id) REFERENCES fin_lancamentos(id) ON DELETE CASCADE;

-- 2) CHECK: valor must be > 0
ALTER TABLE fin_lancamentos ADD CONSTRAINT chk_fin_lancamentos_valor_positivo
  CHECK (valor > 0);

-- 3) Validation trigger: block same-account transfers and enforce transfer rules
CREATE OR REPLACE FUNCTION public.validate_fin_lancamento()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Block same-account transfers
  IF NEW.tipo = 'TRANSFERENCIA' AND NEW.conta_id IS NOT NULL AND NEW.conta_destino_id IS NOT NULL
     AND NEW.conta_id = NEW.conta_destino_id THEN
    RAISE EXCEPTION 'Conta origem e destino devem ser diferentes em transferências';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_fin_lancamento
  BEFORE INSERT OR UPDATE ON fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION validate_fin_lancamento();

-- 4) Performance indexes
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_conta_id ON fin_lancamentos (conta_id);
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_tipo ON fin_lancamentos (tipo);
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_data_competencia ON fin_lancamentos (data_competencia);
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_lancamento_pai_id ON fin_lancamentos (lancamento_pai_id) WHERE lancamento_pai_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_status ON fin_lancamentos (status);
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_conta_status ON fin_lancamentos (conta_id, status);
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_created_by ON fin_lancamentos (created_by) WHERE created_by IS NOT NULL;

-- Indexes for fin_contas_pagar and fin_contas_receber
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_status ON fin_contas_pagar (status);
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_vencimento ON fin_contas_pagar (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_lancamento_id ON fin_contas_pagar (lancamento_id) WHERE lancamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_contas_receber_status ON fin_contas_receber (status);
CREATE INDEX IF NOT EXISTS idx_fin_contas_receber_vencimento ON fin_contas_receber (data_vencimento);

-- Index for fin_audit_logs
CREATE INDEX IF NOT EXISTS idx_fin_audit_logs_created_at ON fin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_logs_entidade ON fin_audit_logs (entidade);

-- 5) RLS policy alignment: add permission-based policies for fin_lancamentos
-- (Currently role-based only; add granular permission check as alternative)
CREATE POLICY "finance_read_lancamentos" ON fin_lancamentos
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));

CREATE POLICY "finance_manage_insert_lancamentos" ON fin_lancamentos
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "finance_manage_update_lancamentos" ON fin_lancamentos
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'))
  WITH CHECK (has_permission(auth.uid(), 'finance:manage'));

CREATE POLICY "finance_manage_delete_lancamentos" ON fin_lancamentos
  FOR DELETE TO authenticated
  USING (has_permission(auth.uid(), 'finance:manage'));

-- Same for fin_lancamento_rateios SELECT (currently missing read policy)
CREATE POLICY "finance_read_rateios_lancamento" ON fin_lancamento_rateios
  FOR SELECT TO authenticated
  USING (has_permission(auth.uid(), 'finance:read'));
