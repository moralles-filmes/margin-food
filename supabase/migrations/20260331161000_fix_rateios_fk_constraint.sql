-- Fix: fin_lancamento_rateios.lancamento_id FK pointed only to fin_lancamentos(id).
-- Rateios from fin_contas_pagar/fin_contas_receber violated this constraint.
-- Drop the FK — referential integrity is enforced by trg_validate_rateio_sum
-- which already checks fin_lancamentos, fin_contas_pagar and fin_contas_receber.

ALTER TABLE public.fin_lancamento_rateios
  DROP CONSTRAINT IF EXISTS fin_lancamento_rateios_lancamento_id_fkey;
