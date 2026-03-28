-- Migration: Cleanup Stale Companies
-- Description: Deletes all company records and associated data except for 'MarginPro Oficial' and the system placeholder.

DO $$ 
DECLARE 
    v_pilot_id uuid;
    v_placeholder_id uuid := '00000000-0000-0000-0000-000000000001';
    v_table_name text;
    v_count int;
BEGIN
    -- 1. Identificar o ID da empresa piloto
    SELECT id INTO v_pilot_id FROM public.companies WHERE nome = 'MarginPro Oficial' LIMIT 1;
    
    IF v_pilot_id IS NULL THEN
        RAISE EXCEPTION 'ERRO: Empresa "MarginPro Oficial" não encontrada. Verifique o nome na tabela public.companies.';
    END IF;

    RAISE NOTICE 'Iniciando limpeza. Mantendo empresas: % (Piloto) e % (Placeholder)', v_pilot_id, v_placeholder_id;

    -- 2. Limpar dados de todas as tabelas que possuem a coluna company_id
    -- Buscamos dinamicamente todas as tabelas no schema public com essa coluna
    FOR v_table_name IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND column_name = 'company_id'
        AND table_name != 'companies' -- Evitar deletar a própria tabela de empresas agora
    LOOP
        EXECUTE format('DELETE FROM public.%I WHERE company_id NOT IN (%L, %L)', v_table_name, v_pilot_id, v_placeholder_id);
    END LOOP;

    -- 3. Remover empresas excedentes da tabela principal
    DELETE FROM public.companies WHERE id NOT IN (v_pilot_id, v_placeholder_id);

    -- 4. Opcional: Limpar perfis de usuários que não pertencem às empresas mantidas
    -- Isso evita inconsistências no login, mas os usuários no auth.users permanecem.
    -- (Opcional, pois o loop acima já deve ter tratado a tabela 'profiles' se ela tiver 'company_id')

    RAISE NOTICE 'Limpeza finalizada com sucesso.';
END $$;
