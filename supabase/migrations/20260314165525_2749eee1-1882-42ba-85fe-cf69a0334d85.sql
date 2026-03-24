
-- Add hierarchy support to fin_categorias
ALTER TABLE public.fin_categorias
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.fin_categorias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS codigo text DEFAULT '',
  ADD COLUMN IF NOT EXISTS ordem integer DEFAULT 0;

-- Index for tree queries
CREATE INDEX IF NOT EXISTS idx_fin_categorias_parent_id ON public.fin_categorias(parent_id);
CREATE INDEX IF NOT EXISTS idx_fin_categorias_company_ordem ON public.fin_categorias(company_id, ordem);

-- Seed default categories if no categories exist for the tenant
-- This will be handled in the frontend with a "seed defaults" button
