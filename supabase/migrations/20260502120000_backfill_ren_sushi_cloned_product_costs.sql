-- =============================================================================
-- Backfill custos dos produtos clonados Moralles → Ren Sushi
--
-- A migração 20260409150000_clone_catalog_moralles_to_ren_sushi.sql copiou
-- apenas um subconjunto de colunas, deixando 231 produtos da Ren Sushi sem
-- default_cost_purchase_unit / default_cost_base_unit (ficaram em 0 — default
-- da coluna). Resultado: ao tentar dar Saída no Estoque, o sistema mostrava
-- "Item sem custo cadastrado" mesmo com custo_padrao preenchido.
--
-- Esta migração faz JOIN por SKU (validado: 0 duplicatas em ambas empresas)
-- e copia da Moralles para a Ren Sushi:
--   - unidade_compra
--   - fator_conversao_padrao
--   - default_cost_purchase_unit
--   - default_cost_base_unit
--
-- Idempotente: só atualiza linhas onde default_cost_base_unit = 0 na Ren Sushi
-- (preserva os 10 produtos cadastrados pós-clone via UI, que já têm custo OK).
-- =============================================================================

-- Triggers da tabela produtos (analisados):
--   - produtos_force_company_id: em UPDATE só faz NEW.company_id := OLD.company_id (OK)
--   - trg_block_placeholder_company: bloqueia placeholder UUID; Ren Sushi não é (OK)
--   - audit_trigger_fn: registra em audit_logs com actor_user_id=auth.uid() (OK, aceita NULL)
-- Não há necessidade de DISABLE TRIGGER USER.

DO $$
DECLARE
  v_moralles_id  uuid := 'e6df6541-154e-4576-ad0c-86047bc57490';
  v_ren_sushi_id uuid := 'de57a3ff-10f9-4b98-b6be-7bdab791c3f3';
  v_updated      int;
BEGIN
  -- Sanidade: empresas existem
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_moralles_id) THEN
    RAISE EXCEPTION 'Empresa Moralles % não encontrada', v_moralles_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_ren_sushi_id) THEN
    RAISE EXCEPTION 'Empresa Ren Sushi % não encontrada', v_ren_sushi_id;
  END IF;

  -- Backfill via SKU match (Moralles → Ren Sushi)
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
     AND r.default_cost_base_unit = 0;  -- idempotente: não sobrescreve já-corrigidos

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Produtos da Ren Sushi com custos backfillados: %', v_updated;
END;
$$;
