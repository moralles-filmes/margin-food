-- canary migration
CREATE TABLE public.z_canary_test (
  id SERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ DEFAULT now()
);
