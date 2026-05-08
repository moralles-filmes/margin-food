-- A) Colunas de confirmação de leitura pelo solicitante
ALTER TABLE public.requisicoes_estoque
  ADD COLUMN IF NOT EXISTS confirmado_pelo_solicitante_em timestamptz,
  ADD COLUMN IF NOT EXISTS confirmado_pelo_solicitante_por uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- B) Garante idempotência: apenas 1 notificação por requisição encerrada
--    ON CONFLICT DO NOTHING na edge function usa este índice
CREATE UNIQUE INDEX IF NOT EXISTS notifications_requisicao_encerrada_uniq
  ON public.notifications (entity_id)
  WHERE entity_type = 'requisicao_estoque' AND type = 'REQUISICAO_ENCERRADA';

-- C) Índice para queries de badge "aguardando confirmação" (admin lista pendentes de ack)
CREATE INDEX IF NOT EXISTS idx_requisicoes_aguardando_ack
  ON public.requisicoes_estoque (company_id, atendido_em)
  WHERE confirmado_pelo_solicitante_em IS NULL
    AND status IN ('ATENDIDA', 'PARCIALMENTE_ATENDIDA', 'NEGADA');
