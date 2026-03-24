-- 1) Add company_id to profiles + backfill + NOT NULL + FK
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id uuid;

-- Backfill all existing profiles to default company
UPDATE public.profiles 
SET company_id = '00000000-0000-0000-0000-000000000001' 
WHERE company_id IS NULL;

-- Make NOT NULL
ALTER TABLE public.profiles ALTER COLUMN company_id SET NOT NULL;

-- Set default for future inserts
ALTER TABLE public.profiles ALTER COLUMN company_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- FK constraint
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_company_fk 
FOREIGN KEY (company_id) REFERENCES public.companies(id);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, company_id)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'nome', ''), 
    COALESCE(NEW.email, ''),
    COALESCE(
      (NEW.raw_user_meta_data->>'company_id')::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid
    )
  );
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3) get_current_company_id() — DYNAMIC (fail-closed)
-- ============================================================