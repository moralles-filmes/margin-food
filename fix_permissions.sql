-- 1. REGISTRAR PERMISSÕES MESTRAS (caso não existam)
INSERT INTO public.permissions (key, description, module, action)
VALUES ('system:global:manage', 'Acesso Total', 'system', 'manage')
ON CONFLICT (key) DO NOTHING;

-- 2. GARANTIR QUE O PAPEL ADMIN TENHA ACESSO TOTAL
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', key FROM public.permissions
ON CONFLICT (role, permission_key) DO NOTHING;

-- 3. FORÇAR PERMISSÃO MESTRE DIRETAMENTE PARA O USUÁRIO
DO $$
DECLARE
    v_uid uuid;
    v_co_id uuid;
BEGIN
    SELECT id INTO v_uid FROM auth.users WHERE email = 'morallesfilms@gmail.com' LIMIT 1;
    SELECT id INTO v_co_id FROM public.companies WHERE nome = 'MarginPro Oficial' LIMIT 1;
    
    IF v_uid IS NOT NULL THEN
        -- Garantir papel admin
        INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin') ON CONFLICT DO NOTHING;
        
        -- Inserir permissão mestre direta (bypass de role)
        INSERT INTO public.user_permissions (user_id, permission_key, effect)
        VALUES (v_uid, 'system:global:manage', 'ALLOW')
        ON CONFLICT (user_id, permission_key) DO UPDATE SET effect = 'ALLOW';
        
        -- Garantir vínculo com a empresa
        UPDATE public.profiles SET company_id = v_co_id WHERE id = v_uid;
        
        RAISE NOTICE 'Permissões mestras liberadas para %', v_uid;
    END IF;
END $$;

-- 4. RECARREGAR API
NOTIFY pgrst, 'reload schema';
