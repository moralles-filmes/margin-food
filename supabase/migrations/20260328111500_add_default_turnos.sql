-- Migration to add default turnos (shifts) for the current company
-- This ensures that the inventory module has selectable shifts

DO $$
DECLARE
    v_company_id uuid;
BEGIN
    -- 1. Try to get the company_id from the first active profile
    SELECT company_id INTO v_company_id FROM public.profiles WHERE company_id IS NOT NULL LIMIT 1;

    -- Fallback to the known project company_id if not found (optional, but safer to use one from profiles)
    IF v_company_id IS NULL THEN
        -- Using a dummy UUID if no company exists yet, but normally profiles would have it.
        -- For this specific project, let's use the one from the environment if we were sure it's a UUID.
        -- But the safest is to fetch from profiles.
        RETURN;
    END IF;

    -- 2. Insert default turnos for this company using a safe check
    INSERT INTO public.turnos (company_id, nome, hora_inicio, hora_fim, ativo)
    SELECT v_company_id, t.nome, t.hora_inicio, t.hora_fim, true
    FROM (
        VALUES 
            ('Manhã', '07:00:00'::time, '15:00:00'::time),
            ('Tarde', '15:00:00'::time, '23:00:00'::time),
            ('Noite', '23:00:00'::time, '07:00:00'::time),
            ('Geral', '00:00:00'::time, '23:59:59'::time)
    ) AS t(nome, hora_inicio, hora_fim)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.turnos 
        WHERE company_id = v_company_id AND nome = t.nome
    );

END $$;
