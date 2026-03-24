
-- 1) Add leftover columns
ALTER TABLE public.salmon_daily_records
  ADD COLUMN IF NOT EXISTS leftover_kg numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leftover_note text;

-- 2) Fix UNIQUE: drop old constraint, add tenant-scoped one
ALTER TABLE public.salmon_daily_records
  DROP CONSTRAINT IF EXISTS salmon_daily_records_record_date_key;
ALTER TABLE public.salmon_daily_records
  ADD CONSTRAINT salmon_daily_records_company_date_uq UNIQUE (company_id, record_date);

-- 3) RPC
CREATE OR REPLACE FUNCTION public.upsert_salmon_leftover_atomic(
  p_record_date date,
  p_leftover_kg numeric,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_result     jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id    := auth.uid();

  IF NOT has_any_permission(v_user_id, ARRAY[
    'salmon:dashboard:view',
    'salmon:manipulacao:create',
    'salmon:manipulacao:edit',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO salmon_daily_records (company_id, record_date, leftover_kg, leftover_note, created_by, updated_at)
  VALUES (v_company_id, p_record_date, p_leftover_kg, COALESCE(p_note, ''), v_user_id, now())
  ON CONFLICT (company_id, record_date)
  DO UPDATE SET
    leftover_kg   = EXCLUDED.leftover_kg,
    leftover_note = EXCLUDED.leftover_note,
    updated_at    = now();

  SELECT jsonb_build_object(
    'success', true,
    'id', id,
    'record_date', record_date,
    'leftover_kg', leftover_kg,
    'leftover_note', leftover_note
  ) INTO v_result
  FROM salmon_daily_records
  WHERE company_id = v_company_id AND record_date = p_record_date;

  RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Row not found after upsert'));

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'upsert_salmon_leftover_atomic error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
