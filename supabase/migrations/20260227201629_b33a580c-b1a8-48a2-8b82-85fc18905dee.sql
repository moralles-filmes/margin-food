
-- Add status and reversal tracking to movimentacoes_estoque
ALTER TABLE public.movimentacoes_estoque
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS estorno_de_id UUID REFERENCES public.movimentacoes_estoque(id),
  ADD COLUMN IF NOT EXISTS justificativa_cancelamento TEXT,
  ADD COLUMN IF NOT EXISTS cancelado_por UUID,
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS editado_por UUID,
  ADD COLUMN IF NOT EXISTS editado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS justificativa_edicao TEXT;

-- Add permissions for stock movement editing and cancellation
INSERT INTO public.permissions (key, module, submodule, action, description) VALUES
  ('stock:movements:edit', 'stock', 'movements', 'edit', 'Editar movimentações de estoque'),
  ('stock:movements:cancel', 'stock', 'movements', 'cancel', 'Cancelar/estornar movimentações de estoque')
ON CONFLICT (key) DO NOTHING;

-- Grant these permissions to authorized roles
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('admin', 'stock:movements:edit'),
  ('admin', 'stock:movements:cancel'),
  ('diretor', 'stock:movements:edit'),
  ('diretor', 'stock:movements:cancel'),
  ('gerente_geral', 'stock:movements:edit'),
  ('gerente_geral', 'stock:movements:cancel'),
  ('compras', 'stock:movements:edit')
ON CONFLICT DO NOTHING;
