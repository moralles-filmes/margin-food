
-- ============================================================
-- RECOVERY MIGRATION: Faturamento Legacy
-- Ensure faturamento_periodos_legacy exists before tenantization
-- ============================================================

-- 1) Rename if exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'faturamento_periodos')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'faturamento_periodos_legacy') THEN
    ALTER TABLE public.faturamento_periodos RENAME TO faturamento_periodos_legacy;
  END IF;
END $$;

-- 2) Create if missing
CREATE TABLE IF NOT EXISTS public.faturamento_periodos_legacy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  observacao text DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Ensure RLS
ALTER TABLE public.faturamento_periodos_legacy ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'faturamento_periodos_legacy' AND policyname = 'legacy_select_all') THEN
    CREATE POLICY "legacy_select_all" ON public.faturamento_periodos_legacy FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
