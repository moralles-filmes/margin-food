-- Migration: Auxiliary Financial CRUD Hardening (REVISED)
-- Adds guarded RPCs for Update and Delete of Categorias, Centros de Custo, Contas and Plano de Contas

-- 1. Plano de Contas: Update
CREATE OR REPLACE FUNCTION public._guarded_update_plano_contas(
  p_id uuid,
  p_codigo text,
  p_nome text,
  p_tipo text,
  p_natureza text,
  p_linha_dre text DEFAULT '',
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
  v_updated_at timestamptz;
  r record;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();

  IF NOT has_permission('financeiro:cadastros:edit') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:cadastros:edit';
  END IF;

  SELECT jsonb_build_object('codigo', codigo, 'nome', nome), updated_at
  INTO v_old_data, v_updated_at
  FROM fin_plano_contas
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict: Registro alterado por outro usuário.';
  END IF;

  UPDATE fin_plano_contas SET
    codigo = p_codigo,
    nome = p_nome,
    tipo = p_tipo,
    natureza = p_natureza,
    linha_dre = p_linha_dre,
    updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('plano_contas', p_id::text, 'editar', v_old_data, 
    jsonb_build_object('codigo', p_codigo, 'nome', p_nome), v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'updated_at', now());
END;
$$;

-- 2. Plano de Contas: Delete
CREATE OR REPLACE FUNCTION public._guarded_delete_plano_contas(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF NOT has_permission('financeiro:cadastros:delete') THEN RAISE EXCEPTION 'Denied'; END IF;

  SELECT jsonb_build_object('codigo', codigo, 'nome', nome) INTO v_old_data
  FROM fin_plano_contas WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;

  UPDATE fin_plano_contas SET ativo = false, updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('plano_contas', p_id::text, 'remover', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

-- 3. Categorias: Update
CREATE OR REPLACE FUNCTION public._guarded_update_categoria(
  p_id uuid,
  p_nome text,
  p_tipo text,
  p_grupo text DEFAULT '',
  p_linha_dre text DEFAULT '',
  p_centro_custo_padrao_id uuid DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
  v_updated_at timestamptz;
  r record;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();

  IF NOT has_permission('financeiro:cadastros:edit') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:cadastros:edit';
  END IF;

  SELECT jsonb_build_object('nome', nome, 'tipo', tipo), updated_at
  INTO v_old_data, v_updated_at
  FROM fin_categorias
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict: Registro alterado por outro usuário.';
  END IF;

  UPDATE fin_categorias SET
    nome = p_nome,
    tipo = p_tipo,
    grupo = p_grupo,
    linha_dre = p_linha_dre,
    centro_custo_padrao_id = p_centro_custo_padrao_id,
    updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('categorias', p_id::text, 'editar', v_old_data, 
    jsonb_build_object('nome', p_nome, 'tipo', p_tipo), v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'updated_at', now());
END;
$$;

-- 4. Categorias: Delete
CREATE OR REPLACE FUNCTION public._guarded_delete_categoria(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF NOT has_permission('financeiro:cadastros:delete') THEN RAISE EXCEPTION 'Denied'; END IF;

  SELECT jsonb_build_object('nome', nome) INTO v_old_data
  FROM fin_categorias WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;

  UPDATE fin_categorias SET ativo = false, updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('categorias', p_id::text, 'remover', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

-- 5. Centros de Custo: Update
CREATE OR REPLACE FUNCTION public._guarded_update_centro_custo(
  p_id uuid,
  p_nome text,
  p_descricao text DEFAULT '',
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
  v_updated_at timestamptz;
  r record;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();

  IF NOT has_permission('financeiro:cadastros:edit') THEN
    RAISE EXCEPTION 'Permission denied: financeiro:cadastros:edit';
  END IF;

  SELECT jsonb_build_object('nome', nome), updated_at
  INTO v_old_data, v_updated_at
  FROM fin_centros_custo
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado'; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict';
  END IF;

  UPDATE fin_centros_custo SET
    nome = p_nome,
    descricao = p_descricao,
    updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('centros_custo', p_id::text, 'editar', v_old_data, 
    jsonb_build_object('nome', p_nome), v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'updated_at', now());
END;
$$;

-- 6. Centros de Custo: Delete
CREATE OR REPLACE FUNCTION public._guarded_delete_centro_custo(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF NOT has_permission('financeiro:cadastros:delete') THEN RAISE EXCEPTION 'Denied'; END IF;

  SELECT jsonb_build_object('nome', nome) INTO v_old_data
  FROM fin_centros_custo WHERE id = p_id AND company_id = v_company_id;

  UPDATE fin_centros_custo SET ativo = false, updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('centros_custo', p_id::text, 'remover', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;

-- 7. Contas: Update
CREATE OR REPLACE FUNCTION public._guarded_update_conta(
  p_id uuid,
  p_nome text,
  p_tipo text,
  p_banco text DEFAULT '',
  p_agencia text DEFAULT '',
  p_numero_conta text DEFAULT '',
  p_saldo_inicial numeric DEFAULT 0,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
  v_updated_at timestamptz;
  r record;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();

  IF NOT has_permission('financeiro:contas:edit') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT jsonb_build_object('nome', nome, 'saldo', saldo_inicial), updated_at
  INTO v_old_data, v_updated_at
  FROM fin_contas
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'Conflict';
  END IF;

  UPDATE fin_contas SET
    nome = p_nome,
    tipo = p_tipo,
    banco = p_banco,
    agencia = p_agencia,
    numero_conta = p_numero_conta,
    saldo_inicial = p_saldo_inicial,
    updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
  VALUES ('contas_bancarias', p_id::text, 'editar', v_old_data, 
    jsonb_build_object('nome', p_nome), v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'updated_at', now());
END;
$$;

-- 8. Contas: Delete (Logical)
CREATE OR REPLACE FUNCTION public._guarded_delete_conta(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_old_data jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id := auth.uid();
  IF NOT has_permission('financeiro:contas:delete') THEN RAISE EXCEPTION 'Denied'; END IF;

  SELECT jsonb_build_object('nome', nome) INTO v_old_data
  FROM fin_contas WHERE id = p_id AND company_id = v_company_id;

  UPDATE fin_contas SET ativo = false, updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('contas_bancarias', p_id::text, 'remover', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;
