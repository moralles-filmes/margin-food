-- consolidated fix for tenant and profiles
-- 1) REPAIR PROFILES SCHEMA
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS job_role_id UUID REFERENCES public.job_roles(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sector TEXT;

-- 2) ENSURE REAL COMPANY AND ASSIGN USER
DO $$
DECLARE
    v_co_id uuid;
BEGIN
    -- Check if a real company already exists (other than the placeholder)
    SELECT id INTO v_co_id FROM public.companies WHERE id != '00000000-0000-0000-0000-000000000001' LIMIT 1;
    
    IF v_co_id IS NULL THEN
        -- Create a default real company
        INSERT INTO public.companies (nome) VALUES ('MarginPro Oficial') RETURNING id INTO v_co_id;
    END IF;

    -- Update the user's profile to this real company
    UPDATE public.profiles 
    SET company_id = v_co_id 
    WHERE email = 'morallesfilms@gmail.com';

    -- Ensure the user has the 'admin' role
    INSERT INTO public.user_roles (user_id, role)
    SELECT id, 'admin'::public.app_role
    FROM public.profiles
    WHERE email = 'morallesfilms@gmail.com'
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Ensure 'admin' role has super-permission
    INSERT INTO public.role_permissions (role, permission_key)
    VALUES ('admin', 'system:global:manage')
    ON CONFLICT (role, permission_key) DO NOTHING;

    RAISE NOTICE 'User assigned to company %', v_co_id;
END $$;

-- 3) RELOAD CACHE
NOTIFY pgrst, 'reload schema';
