-- Migration: Fix Inventory State after Consolidation
-- Description: Synchronizes profiles, roles, and shifts with the 'MarginPro Oficial' pilot company.

DO $$ 
DECLARE 
    v_pilot_id uuid;
    v_placeholder_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
    -- 1. Identificar o ID da empresa piloto
    SELECT id INTO v_pilot_id FROM public.companies WHERE nome = 'MarginPro Oficial' LIMIT 1;
    
    IF v_pilot_id IS NULL THEN
        RAISE NOTICE 'ERRO: Empresa "MarginPro Oficial" não encontrada. Pulando fix de tenant.';
    ELSE
        -- 2. Garantir que todos os perfis ativos (exceto o placeholder) estejam vinculados à empresa piloto
        UPDATE public.profiles 
        SET company_id = v_pilot_id 
        WHERE company_id IS NULL OR (company_id != v_pilot_id AND company_id != v_placeholder_id);

        -- 3. Garantir que os turnos (shifts) estejam vinculados à empresa piloto
        UPDATE public.turnos 
        SET company_id = v_pilot_id 
        WHERE company_id IS NULL OR (company_id != v_pilot_id AND company_id != v_placeholder_id);

        RAISE NOTICE 'Sincronização de Tenant concluída para Perfis e Turnos (Empresa: %)', v_pilot_id;
    END IF;

    -- 4. Garantir que o admin atual tenha permissões completas (caso tenham sido afetadas)
    -- O script assume que o usuário autenticado que está rodando a migração é o admin (ou pelo menos um deles)
    -- Mas como não sabemos o ID do usuário agora, vamos garantir que role_permissions esteja íntegro.
    
    -- Recria permissões básicas se estiverem faltando (exemplo simplificado)
    -- O sistema de RBAC usa role_permissions. Certifique-se de que o papel 'admin' tenha 'inventario:criar:create'.
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'role_permissions') THEN
        INSERT INTO public.role_permissions (role, permission_key)
        VALUES ('admin', 'inventario:criar:create')
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE 'Limpeza e sincronização de Tenant finalizada.';
END $$;
