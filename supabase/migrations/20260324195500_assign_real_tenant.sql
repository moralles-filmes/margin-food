-- Ensure a real company exists (other than the placeholder)
DO $$
DECLARE
    v_co_id uuid;
BEGIN
    -- Check if a real company already exists
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

    -- Ensure 'admin' role has super-permission if it doesn't have it already
    INSERT INTO public.role_permissions (role, permission_key)
    VALUES ('admin', 'system:global:manage')
    ON CONFLICT (role, permission_key) DO NOTHING;

    RAISE NOTICE 'User morallesfilms@gmail.com assigned to company %', v_co_id;
END $$;
