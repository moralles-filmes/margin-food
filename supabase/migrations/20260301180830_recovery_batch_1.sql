
-- ============================================================
-- RECOVERY MIGRATION: Batch 1 Foundations
-- Restoring tables that were lost during migration splitting
-- ============================================================

-- 1) Create suppliers table (if missing)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  contact_info JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) SALMON MODULE TABLES

CREATE TABLE IF NOT EXISTS public.salmon_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  lot text NOT NULL DEFAULT '',
  sif text NOT NULL DEFAULT '',
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL DEFAULT '',
  boxes int NOT NULL DEFAULT 0,
  units int NOT NULL DEFAULT 0,
  gross_kg numeric NOT NULL,
  total_value numeric NOT NULL DEFAULT 0,
  unit_cost numeric GENERATED ALWAYS AS (CASE WHEN gross_kg > 0 THEN ROUND(total_value / gross_kg, 4) ELSE 0 END) STORED,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.salmon_manipulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.salmon_entries(id) ON DELETE RESTRICT,
  manipulation_date date NOT NULL DEFAULT CURRENT_DATE,
  lot text NOT NULL DEFAULT '',
  sif text NOT NULL DEFAULT '',
  supplier_name text NOT NULL DEFAULT '',
  fish_count int NOT NULL DEFAULT 0,
  gross_out_kg numeric NOT NULL,
  clean_in_kg numeric NOT NULL DEFAULT 0,
  leftover_kg numeric NOT NULL DEFAULT 0,
  leftover_recorded boolean NOT NULL DEFAULT false,
  waste_kg numeric GENERATED ALWAYS AS (GREATEST(gross_out_kg - clean_in_kg, 0)) STORED,
  yield_percent numeric GENERATED ALWAYS AS (CASE WHEN gross_out_kg > 0 THEN ROUND(clean_in_kg / gross_out_kg * 100, 2) ELSE 0 END) STORED,
  loss_percent numeric GENERATED ALWAYS AS (CASE WHEN gross_out_kg > 0 THEN ROUND((gross_out_kg - clean_in_kg) / gross_out_kg * 100, 2) ELSE 0 END) STORED,
  cost_per_kg_gross numeric NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.salmon_daily_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_date date NOT NULL,
  clients_count int NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_date)
);

CREATE TABLE IF NOT EXISTS public.salmon_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_gross_kg numeric NOT NULL DEFAULT 50,
  min_clean_kg numeric NOT NULL DEFAULT 30,
  stale_days_limit int NOT NULL DEFAULT 7,
  loss_percent_alert numeric NOT NULL DEFAULT 15,
  loss_value_alert numeric NOT NULL DEFAULT 500,
  expiration_days int NOT NULL DEFAULT 2,
  expiration_alert_days int NOT NULL DEFAULT 1,
  target_g_per_client numeric NOT NULL DEFAULT 0,
  fifo_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.salmon_purchase_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_num int NOT NULL,
  month_num int NOT NULL,
  category text NOT NULL DEFAULT 'salmon',
  target_kg numeric NOT NULL DEFAULT 0,
  target_value numeric NOT NULL DEFAULT 0,
  alert_yellow_pct numeric NOT NULL DEFAULT 80,
  alert_red_pct numeric NOT NULL DEFAULT 100,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year_num, month_num, category)
);

-- Basic Indigo indices and triggers
CREATE INDEX IF NOT EXISTS idx_salmon_entries_date ON public.salmon_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_salmon_manipulations_date ON public.salmon_manipulations (manipulation_date DESC);

-- Ensure RLS is enabled
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_manipulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_daily_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_purchase_targets ENABLE ROW LEVEL SECURITY;

-- 3) LEGACY RENAMES
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'faturamento_periodos')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'faturamento_periodos_legacy') THEN
    ALTER TABLE public.faturamento_periodos RENAME TO faturamento_periodos_legacy;
  END IF;
END $$;

-- Ensure faturamento_periodos_legacy exists (even if empty) for the next migration
CREATE TABLE IF NOT EXISTS public.faturamento_periodos_legacy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  observacao text DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure RLS and basic policies for legacy table
ALTER TABLE public.faturamento_periodos_legacy ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'faturamento_periodos_legacy' AND policyname = 'legacy_select_all') THEN
    CREATE POLICY "legacy_select_all" ON public.faturamento_periodos_legacy FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
