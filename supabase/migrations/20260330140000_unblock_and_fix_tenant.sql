-- UNBLOCK TENANT AND FIX ARCHITECTURE
-- This migration ensures a real company exists, moves users off the placeholder,
-- and updates utility functions to avoid the blocked placeholder UUID.

DO $$
DECLARE
  v_new_co_id uuid := gen_random_uuid();
  v_placeholder_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- 1. Create a real company if only the placeholder exists
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id <> v_placeholder_id) THEN
    INSERT INTO companies (id, nome, ativo)
    VALUES (v_new_co_id, 'Moralles Pro', true);
  ELSE
    SELECT id INTO v_new_co_id FROM companies WHERE id <> v_placeholder_id LIMIT 1;
  END IF;

  -- 2. Move all profiles from placeholder to the real company
  UPDATE profiles 
  SET company_id = v_new_co_id 
  WHERE company_id = v_placeholder_id OR company_id IS NULL;

  -- 3. Update any other critical data that might be stuck on placeholder (if any)
  -- Note: existing records in salmon_entries etc will stay on placeholder but new ones will use the real ID.
  -- To keep it clean, we could update everything, but let's focus on unblocking new work first.
END $$;

-- 4. Update get_current_company_id to be dynamic
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid;
  v_co uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT company_id INTO v_co FROM profiles WHERE id = v_uid;
    -- Return if it's a valid non-placeholder ID
    IF v_co IS NOT NULL AND v_co <> '00000000-0000-0000-0000-000000000001'::uuid THEN
      RETURN v_co;
    END IF;
  END IF;
  
  -- Fallback: return the first active non-placeholder company
  SELECT id INTO v_co FROM companies 
  WHERE id <> '00000000-0000-0000-0000-000000000001'::uuid 
  AND ativo = true 
  LIMIT 1;
  
  RETURN v_co;
END;
$$;

-- 5. Update assert_tenant to be the strict gatekeeper
CREATE OR REPLACE FUNCTION public.assert_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid;
  v_co_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '403: Usuário não autenticado';
  END IF;

  SELECT company_id INTO v_co_id
  FROM public.profiles WHERE id = v_uid;

  IF v_co_id IS NULL THEN
    RAISE EXCEPTION '403: Tenant inválido — perfil sem empresa vinculada.';
  END IF;

  IF v_co_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION '403: Tenant inválido (placeholder) — empresa não configurada.';
  END IF;

  RETURN v_co_id;
END;
$$;

-- 6. Grant permissions to ensure RPCs can see these functions
GRANT EXECUTE ON FUNCTION public.get_current_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_tenant() TO authenticated;

-- Notify change
NOTIFY pgrst, 'reload schema';
