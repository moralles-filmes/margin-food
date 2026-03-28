-- Migration: Link Orphaned Records to Pilot Tenant
-- Description: Updates all records with NULL company_id to the pilot company 'MarginPro Oficial'.

DO $$ 
DECLARE 
    v_pilot_id uuid;
    v_table_name text;
    v_updated_count int;
BEGIN
    -- 1. Identificar o ID da empresa piloto
    SELECT id INTO v_pilot_id FROM public.companies WHERE nome = 'MarginPro Oficial' LIMIT 1;
    
    IF v_pilot_id IS NULL THEN
        RAISE EXCEPTION 'ERRO: Empresa "MarginPro Oficial" não encontrada.';
    END IF;

    RAISE NOTICE 'Iniciando vinculação de órfãos para a empresa piloto: %', v_pilot_id;

    -- 2. Atualizar todos os registros que possuem a coluna company_id e estão como NULL
    FOR v_table_name IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND column_name = 'company_id'
        AND table_name != 'companies'
    LOOP
        EXECUTE format('UPDATE public.%I SET company_id = %L WHERE company_id IS NULL', v_table_name, v_pilot_id);
        GET DIAGNOSTICS v_updated_count = ROW_COUNT;
        IF v_updated_count > 0 THEN
            RAISE NOTICE 'Tabela %: % registros vinculados.', v_table_name, v_updated_count;
        END IF;
    END LOOP;

    RAISE NOTICE 'Vinculação de registros órfãos finalizada.';
END $$;
