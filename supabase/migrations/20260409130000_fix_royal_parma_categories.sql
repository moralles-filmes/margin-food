-- =============================================================================
-- Fix: Produtos da Royal Parma vinculados a categorias da Moralles
--
-- Contexto: Antes do fix de isolamento RLS, produtos foram criados para
-- a Royal Parma mas vinculados a categoria (nome texto) de outra empresa.
-- Isso causava "0 itens encontrados" no catálogo após o fix de RLS.
--
-- Solução:
--   1. Criar categoria "Geral" na Royal Parma
--   2. Atualizar todos os produtos da Royal Parma cujo campo 'categoria'
--      não existe como stock_category da Royal Parma
-- =============================================================================

DO $$
DECLARE
  v_royal_parma_id uuid;
  v_nova_categoria_id uuid;
  v_nova_categoria_name text := 'Geral';
BEGIN
  -- 1. Encontrar Royal Parma pelo nome
  SELECT id INTO v_royal_parma_id
  FROM public.companies
  WHERE LOWER(nome) LIKE '%royal parma%'
  LIMIT 1;

  IF v_royal_parma_id IS NULL THEN
    RAISE NOTICE 'Empresa Royal Parma não encontrada, abortando.';
    RETURN;
  END IF;

  RAISE NOTICE 'Royal Parma company_id: %', v_royal_parma_id;

  -- Verificar quais colunas 'produtos' tem relacionadas a categoria
  RAISE NOTICE 'Colunas de produtos: %', (
    SELECT string_agg(column_name, ', ')
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'produtos'
      AND column_name ILIKE '%categ%'
  );

  -- 2. Criar categoria "Geral" para Royal Parma (se ainda não existir)
  INSERT INTO public.stock_categories (name, description, is_active, sort_order, company_id)
  VALUES (v_nova_categoria_name, 'Categoria geral criada automaticamente', true, 1, v_royal_parma_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_nova_categoria_id;

  -- Se já existia (ON CONFLICT ignorou), buscar o id existente
  IF v_nova_categoria_id IS NULL THEN
    SELECT id INTO v_nova_categoria_id
    FROM public.stock_categories
    WHERE company_id = v_royal_parma_id AND LOWER(name) = LOWER(v_nova_categoria_name)
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Categoria "%" criada/encontrada com id: %', v_nova_categoria_name, v_nova_categoria_id;

  -- 3. Atualizar produtos da Royal Parma: setar campo 'categoria' para "Geral"
  --    apenas nos produtos cujo valor atual de 'categoria' não pertence à Royal Parma
  UPDATE public.produtos p
  SET categoria = v_nova_categoria_name
  WHERE p.company_id = v_royal_parma_id
    AND (
      p.categoria IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.stock_categories sc
        WHERE sc.company_id = v_royal_parma_id
          AND LOWER(sc.name) = LOWER(p.categoria)
      )
    );

  RAISE NOTICE 'Produtos da Royal Parma agora com categoria "Geral": %', (
    SELECT COUNT(*) FROM public.produtos
    WHERE company_id = v_royal_parma_id AND categoria = v_nova_categoria_name
  );

END;
$$;
