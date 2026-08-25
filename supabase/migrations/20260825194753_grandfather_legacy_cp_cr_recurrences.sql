-- Registros recorrentes criados antes da adoção dos limites permanecem válidos
-- em UPDATE/baixa. Toda recorrência nova continua obrigada a respeitar a regra.

ALTER TABLE public.fin_contas_pagar
  DROP CONSTRAINT fin_contas_pagar_recorrencia_config_valida;

ALTER TABLE public.fin_contas_pagar
  ADD CONSTRAINT fin_contas_pagar_recorrencia_config_valida
  CHECK (
    NOT recorrente
    OR created_at < TIMESTAMPTZ '2026-08-25 19:44:25+00'
    OR public.fin_recorrencia_config_valida(recorrencia_config)
  )
  NOT VALID;

ALTER TABLE public.fin_contas_pagar
  VALIDATE CONSTRAINT fin_contas_pagar_recorrencia_config_valida;

ALTER TABLE public.fin_contas_receber
  DROP CONSTRAINT fin_contas_receber_recorrencia_config_valida;

ALTER TABLE public.fin_contas_receber
  ADD CONSTRAINT fin_contas_receber_recorrencia_config_valida
  CHECK (
    NOT recorrente
    OR created_at < TIMESTAMPTZ '2026-08-25 19:44:25+00'
    OR public.fin_recorrencia_config_valida(recorrencia_config)
  )
  NOT VALID;

ALTER TABLE public.fin_contas_receber
  VALIDATE CONSTRAINT fin_contas_receber_recorrencia_config_valida;
