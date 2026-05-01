-- =============================================================================
-- BUSCA ACCENT-INSENSITIVE: COLUNAS GERADAS + ÍNDICES TRIGRAM
-- =============================================================================
--
-- Problema:
--   PostgREST `.ilike()` é case-insensitive mas NÃO accent-insensitive.
--   Buscar "salmao" não encontra "Salmão", "acucar" não encontra "Açúcar", etc.
--   Frontend já tem helper `includesNormalized()` para filtros client-side, mas
--   buscas server-side em `produtos` (Catálogo de Estoque + Inventário Rápido)
--   e `audit_logs` (Auditoria Global) usavam ILIKE direto na coluna acentuada.
--
-- Solução:
--   1. Wrapper IMMUTABLE de `unaccent` (a função base é STABLE, não pode ser
--      usada em coluna GENERATED).
--   2. Coluna gerada `*_unaccent` STORED com `lower(immutable_unaccent(...))`
--      em `produtos.nome_produto`, `produtos.sku` e `audit_logs.entity`.
--   3. Índices GIN trigram (`gin_trgm_ops`) para ILIKE com substring rápido.
--
-- Frontend deve normalizar o termo cliente-side com `normalizeSearchText()`
-- antes de enviar para `.ilike(*_unaccent, '%termo%')`.
--
-- Idempotente: pode ser reaplicada sem efeito colateral.
-- =============================================================================

-- ─── Extensões necessárias ───
CREATE EXTENSION IF NOT EXISTS unaccent  WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm   WITH SCHEMA public;

-- ─── Wrapper IMMUTABLE para uso em GENERATED columns / índices expressionais ───
-- A função `unaccent(text)` da extensão é STABLE (porque depende de configuração
-- do dicionário). Para usar em GENERATED STORED ou em índices expressionais
-- precisamos de uma versão IMMUTABLE — usamos a forma de 2 argumentos com
-- regdictionary fixa, que torna a referência ao dicionário constante.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1);
$$;

COMMENT ON FUNCTION public.immutable_unaccent(text)
  IS 'Wrapper IMMUTABLE de unaccent() para uso em colunas geradas e índices.';

-- ─── produtos: nome_produto_unaccent + sku_unaccent ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='produtos' AND column_name='nome_produto_unaccent'
  ) THEN
    ALTER TABLE public.produtos
      ADD COLUMN nome_produto_unaccent text
      GENERATED ALWAYS AS (lower(public.immutable_unaccent(nome_produto))) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='produtos' AND column_name='sku_unaccent'
  ) THEN
    ALTER TABLE public.produtos
      ADD COLUMN sku_unaccent text
      GENERATED ALWAYS AS (lower(public.immutable_unaccent(sku))) STORED;
  END IF;
END $$;

-- Índices GIN trigram para busca por substring rápida
CREATE INDEX IF NOT EXISTS idx_produtos_nome_unaccent_trgm
  ON public.produtos USING gin (nome_produto_unaccent public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_produtos_sku_unaccent_trgm
  ON public.produtos USING gin (sku_unaccent public.gin_trgm_ops);

-- ─── audit_logs: entity_unaccent ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_logs' AND column_name='entity_unaccent'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD COLUMN entity_unaccent text
      GENERATED ALWAYS AS (lower(public.immutable_unaccent(entity))) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_unaccent_trgm
  ON public.audit_logs USING gin (entity_unaccent public.gin_trgm_ops);

-- ─── Smoke test (no-op em produção, falha cedo se algo deu errado) ───
DO $$
BEGIN
  PERFORM 1
  FROM information_schema.columns
  WHERE table_name='produtos'
    AND column_name IN ('nome_produto_unaccent','sku_unaccent')
  HAVING count(*) = 2;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unaccent migration: colunas geradas não foram criadas em produtos';
  END IF;

  PERFORM 1
  FROM information_schema.columns
  WHERE table_name='audit_logs' AND column_name='entity_unaccent'
  HAVING count(*) = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unaccent migration: coluna entity_unaccent não foi criada em audit_logs';
  END IF;
END $$;
