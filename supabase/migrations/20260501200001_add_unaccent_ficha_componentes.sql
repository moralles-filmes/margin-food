-- =============================================================================
-- Estende busca accent-insensitive para ficha_componentes
-- =============================================================================
--
-- Edge Function `ficha-tecnica` action `list_componentes` usa ILIKE direto em
-- `nome` (linha 609). Usuário busca "salmao" → não acha "Salmão".
-- Mesma estratégia da migration 20260501200000: coluna gerada + GIN trigram.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ficha_componentes' AND column_name='nome_unaccent'
  ) THEN
    ALTER TABLE public.ficha_componentes
      ADD COLUMN nome_unaccent text
      GENERATED ALWAYS AS (lower(public.immutable_unaccent(nome))) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ficha_componentes_nome_unaccent_trgm
  ON public.ficha_componentes USING gin (nome_unaccent public.gin_trgm_ops);

DO $$
BEGIN
  PERFORM 1
  FROM information_schema.columns
  WHERE table_name='ficha_componentes' AND column_name='nome_unaccent'
  HAVING count(*) = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unaccent migration ficha_componentes: coluna nao foi criada';
  END IF;
END $$;
