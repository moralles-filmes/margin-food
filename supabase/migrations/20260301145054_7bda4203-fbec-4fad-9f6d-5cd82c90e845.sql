
-- Synthetic test: create bad function, run lint, drop it
-- Step 1: Create function with single-arg has_permission (intentionally bad)
CREATE OR REPLACE FUNCTION public._tmp_bad_guard_test()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT has_permission('fake:perm:view') THEN
    RAISE EXCEPTION 'nope';
  END IF;
END;
$$;
