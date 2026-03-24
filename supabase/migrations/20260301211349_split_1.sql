CREATE OR REPLACE FUNCTION public.validate_salmon_manipulation()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.gross_out_kg <= 0 THEN RAISE EXCEPTION 'gross_out_kg deve ser > 0'; END IF;
  IF NEW.clean_in_kg < 0 THEN RAISE EXCEPTION 'clean_in_kg não pode ser negativo'; END IF;
  IF NEW.status NOT IN ('ACTIVE', 'CANCELLED') THEN RAISE EXCEPTION 'status inválido: %', NEW.status; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_salmon_manipulation BEFORE INSERT OR UPDATE ON public.salmon_manipulations
  FOR EACH ROW EXECUTE FUNCTION public.validate_salmon_manipulation();

-- 3) INDICES

CREATE INDEX IF NOT EXISTS idx_salmon_entries_date ON public.salmon_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_salmon_entries_status ON public.salmon_entries (status);
CREATE INDEX IF NOT EXISTS idx_salmon_entries_supplier ON public.salmon_entries (supplier_id);
CREATE INDEX IF NOT EXISTS idx_salmon_manipulations_date ON public.salmon_manipulations (manipulation_date DESC);
CREATE INDEX IF NOT EXISTS idx_salmon_manipulations_status ON public.salmon_manipulations (status);
CREATE INDEX IF NOT EXISTS idx_salmon_manipulations_entry ON public.salmon_manipulations (entry_id);
CREATE INDEX IF NOT EXISTS idx_salmon_daily_date ON public.salmon_daily_records (record_date DESC);
CREATE INDEX IF NOT EXISTS idx_salmon_targets_period ON public.salmon_purchase_targets (year_num, month_num);

-- 4) updated_at triggers

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_salmon_entries_updated') THEN
    CREATE TRIGGER trg_salmon_entries_updated BEFORE UPDATE ON public.salmon_entries
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_salmon_manipulations_updated') THEN
    CREATE TRIGGER trg_salmon_manipulations_updated BEFORE UPDATE ON public.salmon_manipulations
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_salmon_daily_updated') THEN
    CREATE TRIGGER trg_salmon_daily_updated BEFORE UPDATE ON public.salmon_daily_records
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_salmon_config_updated') THEN
    CREATE TRIGGER trg_salmon_config_updated BEFORE UPDATE ON public.salmon_config
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_salmon_targets_updated') THEN
    CREATE TRIGGER trg_salmon_targets_updated BEFORE UPDATE ON public.salmon_purchase_targets
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 5) RLS

ALTER TABLE public.salmon_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_manipulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_daily_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_purchase_targets ENABLE ROW LEVEL SECURITY;

-- SELECT policies
CREATE POLICY "salmon_entries_select" ON public.salmon_entries FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:read'));
CREATE POLICY "salmon_manipulations_select" ON public.salmon_manipulations FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:read'));
CREATE POLICY "salmon_daily_select" ON public.salmon_daily_records FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:read'));
CREATE POLICY "salmon_config_select" ON public.salmon_config FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:read'));
CREATE POLICY "salmon_targets_select" ON public.salmon_purchase_targets FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:read'));

-- INSERT policies
CREATE POLICY "salmon_entries_insert" ON public.salmon_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'salmon:entries:create'));
CREATE POLICY "salmon_manipulations_insert" ON public.salmon_manipulations FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'salmon:entries:create'));
CREATE POLICY "salmon_daily_insert" ON public.salmon_daily_records FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'salmon:entries:create'));
CREATE POLICY "salmon_config_insert" ON public.salmon_config FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'salmon:edit'));
CREATE POLICY "salmon_targets_insert" ON public.salmon_purchase_targets FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'salmon:entries:create'));

-- UPDATE policies
CREATE POLICY "salmon_entries_update" ON public.salmon_entries FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:edit'));
CREATE POLICY "salmon_manipulations_update" ON public.salmon_manipulations FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:edit'));
CREATE POLICY "salmon_daily_update" ON public.salmon_daily_records FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:edit'));
CREATE POLICY "salmon_config_update" ON public.salmon_config FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:edit'));
CREATE POLICY "salmon_targets_update" ON public.salmon_purchase_targets FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:edit'));

-- DELETE policies (soft delete preferred, but allow physical for admin cleanup)
CREATE POLICY "salmon_entries_delete" ON public.salmon_entries FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:delete'));
CREATE POLICY "salmon_manipulations_delete" ON public.salmon_manipulations FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:delete'));
CREATE POLICY "salmon_daily_delete" ON public.salmon_daily_records FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:delete'));
CREATE POLICY "salmon_targets_delete" ON public.salmon_purchase_targets FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'salmon:delete'));

-- 6) AUDIT TRIGGERS (using existing audit_trigger_fn)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_salmon_entries') THEN
    CREATE TRIGGER trg_audit_salmon_entries AFTER INSERT OR UPDATE OR DELETE ON public.salmon_entries
      FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('salmon', 'salmon_entries');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_salmon_manipulations') THEN
    CREATE TRIGGER trg_audit_salmon_manipulations AFTER INSERT OR UPDATE OR DELETE ON public.salmon_manipulations
      FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('salmon', 'salmon_manipulations');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_salmon_daily') THEN
    CREATE TRIGGER trg_audit_salmon_daily AFTER INSERT OR UPDATE OR DELETE ON public.salmon_daily_records
      FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('salmon', 'salmon_daily_records');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_salmon_config') THEN
    CREATE TRIGGER trg_audit_salmon_config AFTER INSERT OR UPDATE OR DELETE ON public.salmon_config
      FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('salmon', 'salmon_config');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_salmon_targets') THEN
    CREATE TRIGGER trg_audit_salmon_targets AFTER INSERT OR UPDATE OR DELETE ON public.salmon_purchase_targets
      FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn('salmon', 'salmon_purchase_targets');
  END IF;
END $$;

-- 7) Seed default config row
INSERT INTO public.salmon_config (id) 
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.salmon_config);

-- 8) Register salmon permissions in permissions table (if not exist)
INSERT INTO public.permissions (key, module, action, description) VALUES
  ('salmon:read', 'salmon', 'read', 'Visualizar módulo Salmão'),
  ('salmon:entries:create', 'salmon', 'create', 'Criar entradas e manipulações de salmão'),
  ('salmon:edit', 'salmon', 'edit', 'Editar registros de salmão'),
  ('salmon:delete', 'salmon', 'delete', 'Excluir registros de salmão')
ON CONFLICT (key) DO NOTHING;