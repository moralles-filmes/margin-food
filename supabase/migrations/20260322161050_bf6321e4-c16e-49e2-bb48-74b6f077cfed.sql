
-- RPC to batch-update ordem for multiple categories atomically
-- Used by drag-and-drop reordering
CREATE OR REPLACE FUNCTION public.batch_reorder_fin_categorias(
  p_items jsonb -- array of {"id": uuid, "ordem": int}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_item jsonb;
  v_cat_id uuid;
  v_ordem int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Resolve company
  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;

  -- Validate all categories belong to same company and are active
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS item
    LEFT JOIN fin_categorias fc ON fc.id = (item->>'id')::uuid
    WHERE fc.id IS NULL OR fc.company_id != v_company_id OR fc.ativo = false
  ) THEN
    RAISE EXCEPTION 'Uma ou mais categorias inválidas ou de outro tenant';
  END IF;

  -- Validate all categories share same parent_id and tipo
  IF (
    SELECT COUNT(DISTINCT COALESCE(fc.parent_id, '00000000-0000-0000-0000-000000000000') || '|' || fc.tipo)
    FROM jsonb_array_elements(p_items) AS item
    JOIN fin_categorias fc ON fc.id = (item->>'id')::uuid
  ) > 1 THEN
    RAISE EXCEPTION 'Todas as categorias devem ter o mesmo parent_id e tipo';
  END IF;

  -- Apply updates with lock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_cat_id := (v_item->>'id')::uuid;
    v_ordem := (v_item->>'ordem')::int;

    UPDATE fin_categorias
    SET ordem = v_ordem, updated_at = now()
    WHERE id = v_cat_id AND company_id = v_company_id;
  END LOOP;

  RETURN jsonb_build_object('status', 'ok', 'updated', jsonb_array_length(p_items));
END;
$$;
