
-- RPC to reorder a category within its sibling group (same parent_id + same tipo)
-- Swaps the ordem value of two adjacent siblings atomically
CREATE OR REPLACE FUNCTION public.reorder_fin_categoria(
  p_category_id uuid,
  p_direction text -- 'up' or 'down'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_cat RECORD;
  v_sibling RECORD;
BEGIN
  -- Resolve actor
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Get category with lock
  SELECT id, parent_id, tipo, ordem, company_id
  INTO v_cat
  FROM fin_categorias
  WHERE id = p_category_id AND ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada';
  END IF;

  v_company_id := v_cat.company_id;

  -- Verify tenant
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_user_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Find adjacent sibling
  IF p_direction = 'up' THEN
    SELECT id, ordem
    INTO v_sibling
    FROM fin_categorias
    WHERE company_id = v_company_id
      AND ativo = true
      AND tipo = v_cat.tipo
      AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000') = COALESCE(v_cat.parent_id, '00000000-0000-0000-0000-000000000000')
      AND (ordem < v_cat.ordem OR (ordem = v_cat.ordem AND id < p_category_id))
      AND id != p_category_id
    ORDER BY ordem DESC, id DESC
    LIMIT 1;
  ELSIF p_direction = 'down' THEN
    SELECT id, ordem
    INTO v_sibling
    FROM fin_categorias
    WHERE company_id = v_company_id
      AND ativo = true
      AND tipo = v_cat.tipo
      AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000') = COALESCE(v_cat.parent_id, '00000000-0000-0000-0000-000000000000')
      AND (ordem > v_cat.ordem OR (ordem = v_cat.ordem AND id > p_category_id))
      AND id != p_category_id
    ORDER BY ordem ASC, id ASC
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Direção inválida: use up ou down';
  END IF;

  IF v_sibling.id IS NULL THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Já está na posição limite');
  END IF;

  -- Swap ordem values
  UPDATE fin_categorias SET ordem = v_sibling.ordem, updated_at = now() WHERE id = p_category_id;
  UPDATE fin_categorias SET ordem = v_cat.ordem, updated_at = now() WHERE id = v_sibling.id;

  -- If both had the same ordem, assign distinct values
  IF v_cat.ordem = v_sibling.ordem THEN
    UPDATE fin_categorias SET ordem = v_cat.ordem + 1, updated_at = now()
    WHERE id = (CASE WHEN p_direction = 'up' THEN v_sibling.id ELSE p_category_id END);
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
