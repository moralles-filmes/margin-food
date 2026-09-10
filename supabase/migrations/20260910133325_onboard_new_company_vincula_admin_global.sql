-- O admin global que cria a empresa (system:global:manage, checado no início da
-- função) precisa de vínculo próprio em company_memberships para poder
-- administrá-la depois: essa permissão não concede acesso implícito a
-- nenhuma unidade (get_current_company_id/assert_tenant exigem membership
-- ativo). Sem isso, toda loja nova reproduz o mesmo COMPANY_ACCESS_DENIED que
-- a Royal Parma Bauru teve, até alguém conceder o vínculo manualmente.
CREATE OR REPLACE FUNCTION public.onboard_new_company(p_company_name text, p_cnpj text DEFAULT NULL::text, p_admin_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_new_company_id uuid;
  v_result jsonb;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION '403: Não autenticado';
  END IF;

  IF NOT has_permission(v_caller_uid, 'system:global:manage') THEN
    RAISE EXCEPTION '403: Sem permissão (system:global:manage)';
  END IF;

  IF p_company_name IS NULL OR trim(p_company_name) = '' THEN
    RAISE EXCEPTION '400: Nome da empresa é obrigatório';
  END IF;

  IF p_cnpj IS NOT NULL AND trim(p_cnpj) <> '' THEN
    IF EXISTS (SELECT 1 FROM companies WHERE cnpj = trim(p_cnpj)) THEN
      RAISE EXCEPTION '409: CNPJ já cadastrado';
    END IF;
  END IF;

  INSERT INTO companies (nome, cnpj, ativo)
  VALUES (trim(p_company_name), NULLIF(trim(p_cnpj), ''), true)
  RETURNING id INTO v_new_company_id;

  INSERT INTO public.turnos (company_id, nome, hora_inicio, hora_fim, ativo)
  VALUES
    (v_new_company_id, 'Manhã', '07:00:00'::time, '15:00:00'::time, true),
    (v_new_company_id, 'Tarde', '15:00:00'::time, '23:00:00'::time, true),
    (v_new_company_id, 'Noite', '23:00:00'::time, '07:00:00'::time, true),
    (v_new_company_id, 'Geral', '00:00:00'::time, '23:59:59'::time, true);

  INSERT INTO public.company_memberships(user_id, company_id) VALUES(v_caller_uid, v_new_company_id)
    ON CONFLICT(user_id, company_id) DO UPDATE SET status='active', updated_at=now();

  INSERT INTO user_roles (user_id, company_id, role)
  VALUES (v_caller_uid, v_new_company_id, 'admin')
  ON CONFLICT (user_id, company_id, role) DO NOTHING;

  IF p_admin_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_admin_user_id) THEN
      RAISE EXCEPTION '404: Usuário admin não encontrado';
    END IF;

    INSERT INTO public.company_memberships(user_id,company_id) VALUES(p_admin_user_id,v_new_company_id) ON CONFLICT(user_id,company_id) DO UPDATE SET status='active',updated_at=now();

    INSERT INTO user_roles (user_id, company_id, role)
    VALUES (p_admin_user_id, v_new_company_id, 'admin')
    ON CONFLICT (user_id, company_id, role) DO NOTHING;
  END IF;

  INSERT INTO job_roles (company_id, nome, descricao)
  VALUES
    (v_new_company_id, 'Gerente Geral', 'Responsável geral pela operação'),
    (v_new_company_id, 'Chef de Cozinha', 'Responsável pela cozinha e fichas técnicas'),
    (v_new_company_id, 'Estoquista', 'Responsável pelo controle de estoque'),
    (v_new_company_id, 'Comprador', 'Responsável pelas compras e fornecedores'),
    (v_new_company_id, 'Financeiro', 'Responsável pelo módulo financeiro'),
    (v_new_company_id, 'Operador', 'Operação geral do dia a dia')
  ON CONFLICT (company_id, nome) DO NOTHING;

  INSERT INTO admin_actions_log (actor_user_id, company_id, action, details)
  VALUES (
    v_caller_uid,
    v_new_company_id,
    'COMPANY_CREATED',
    jsonb_build_object(
      'company_name', trim(p_company_name),
      'cnpj', p_cnpj,
      'admin_user_id', p_admin_user_id
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'company_id', v_new_company_id,
    'company_name', trim(p_company_name)
  );

  RETURN v_result;
END;
$function$;
