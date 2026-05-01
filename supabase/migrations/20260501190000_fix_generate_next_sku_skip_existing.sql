-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: generate_next_sku retornava SKUs já existentes em produtos
--
-- Causa: stock_sku_counter ficou defasado em relação a produtos.sku porque
-- imports massivos (20260326000001_importacao_catalogo_produtos.sql usando
-- DISABLE TRIGGER USER) e o clone de catálogo Moralles→REN SUSHI inseriram
-- linhas em produtos com SKU MP-NNNN sem atualizar o counter por empresa.
-- Resultado: ao cadastrar um produto novo, generate_next_sku retornava
-- MP-0001 (ou similar já existente) → 23505 unique violation em
-- produtos_company_sku_unique → toast "Erro ao salvar produto".
--
-- Correção em duas camadas:
--   1) Backfill one-time: sincroniza next_value de cada (company_id, prefix)
--      com o maior número já presente em produtos.sku
--      (extraído por regex do padrão "PREFIX-NNNN").
--   2) Hardening da função: loop de retry que verifica colisão em produtos
--      antes de retornar — defesa em profundidade contra SKUs órfãos
--      (imports futuros, restores parciais, etc.).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) BACKFILL — alinhar counter com produtos existentes por empresa+prefixo
DO $$
DECLARE
  v_company_id uuid;
  v_prefix text;
  v_max_num bigint;
BEGIN
  FOR v_company_id, v_prefix IN
    SELECT DISTINCT
      p.company_id,
      split_part(p.sku, '-', 1) AS prefix
    FROM public.produtos p
    WHERE p.sku IS NOT NULL
      AND p.sku <> ''
      AND p.sku ~ '^[A-Z]+-[0-9]+$'
      AND p.company_id <> '00000000-0000-0000-0000-000000000001'::uuid
  LOOP
    SELECT COALESCE(
      MAX((regexp_replace(sku, '^[A-Z]+-', ''))::bigint),
      0
    )
    INTO v_max_num
    FROM public.produtos
    WHERE company_id = v_company_id
      AND sku ~ ('^' || v_prefix || '-[0-9]+$');

    INSERT INTO public.stock_sku_counter (company_id, prefix, next_value, pad_length, updated_at)
    VALUES (v_company_id, v_prefix, v_max_num, 4, now())
    ON CONFLICT (company_id, prefix) DO UPDATE
      SET next_value = GREATEST(public.stock_sku_counter.next_value, EXCLUDED.next_value),
          updated_at = now();
  END LOOP;
END $$;

-- 2) HARDENING — função com loop de retry contra colisões
CREATE OR REPLACE FUNCTION public.generate_next_sku(p_prefix text DEFAULT 'MP'::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_next bigint;
  v_pad integer;
  v_candidate text;
  v_attempts integer := 0;
  v_max_attempts integer := 1000;
BEGIN
  v_company_id := public.get_current_company_id();

  -- Garante que a linha do counter exista para esta (empresa, prefixo)
  INSERT INTO public.stock_sku_counter (company_id, prefix, next_value, pad_length, updated_at)
  VALUES (v_company_id, p_prefix, 0, 4, now())
  ON CONFLICT (company_id, prefix) DO NOTHING;

  -- Loop de retry: incrementa o counter até obter um SKU que NÃO exista
  -- em produtos. UPDATE pega lock implícito da linha → seguro contra
  -- concorrência entre transações simultâneas.
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > v_max_attempts THEN
      RAISE EXCEPTION
        'generate_next_sku: não foi possível gerar SKU único após % tentativas (company=%, prefix=%)',
        v_max_attempts, v_company_id, p_prefix;
    END IF;

    UPDATE public.stock_sku_counter
       SET next_value = next_value + 1,
           updated_at = now()
     WHERE company_id = v_company_id
       AND prefix = p_prefix
    RETURNING next_value, pad_length INTO v_next, v_pad;

    v_candidate := p_prefix || '-' || lpad(v_next::text, GREATEST(COALESCE(v_pad, 4), 1), '0');

    IF NOT EXISTS (
      SELECT 1
      FROM public.produtos
      WHERE company_id = v_company_id
        AND sku = v_candidate
    ) THEN
      RETURN v_candidate;
    END IF;
    -- senão, loop incrementa de novo
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_next_sku(text) IS
  'Gera o próximo SKU do prefixo informado (ex: MP-0001) escopo (company_id, prefix). '
  'Garante unicidade verificando produtos.sku antes de retornar. '
  'Endurecido em 2026-05-01 com loop de retry (até 1000 tentativas) '
  'após bug de defasagem do counter (produtos importados sem atualizar stock_sku_counter).';
