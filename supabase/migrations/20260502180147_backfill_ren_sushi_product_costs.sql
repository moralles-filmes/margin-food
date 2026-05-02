
DO $$
DECLARE
  v_moralles_id  uuid := 'e6df6541-154e-4576-ad0c-86047bc57490';
  v_ren_sushi_id uuid := 'de57a3ff-10f9-4b98-b6be-7bdab791c3f3';
  v_updated      int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_moralles_id) THEN
    RAISE EXCEPTION 'Empresa Moralles % não encontrada', v_moralles_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_ren_sushi_id) THEN
    RAISE EXCEPTION 'Empresa Ren Sushi % não encontrada', v_ren_sushi_id;
  END IF;

  WITH src AS (
    SELECT
      sku,
      unidade_compra,
      fator_conversao_padrao,
      default_cost_purchase_unit,
      default_cost_base_unit
    FROM public.produtos
    WHERE company_id = v_moralles_id
      AND ativo = true
      AND default_cost_base_unit > 0
  )
  UPDATE public.produtos r
     SET unidade_compra             = src.unidade_compra,
         fator_conversao_padrao     = src.fator_conversao_padrao,
         default_cost_purchase_unit = src.default_cost_purchase_unit,
         default_cost_base_unit     = src.default_cost_base_unit
    FROM src
   WHERE r.company_id = v_ren_sushi_id
     AND r.ativo = true
     AND r.sku = src.sku
     AND r.default_cost_base_unit = 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Produtos da Ren Sushi com custos backfillados: %', v_updated;
END;
$$;
