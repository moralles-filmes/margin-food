-- Blindagem contra ano com mais de 4 dígitos nas datas financeiras.
-- ------------------------------------------------------------------
-- Contexto: um boleto foi cadastrado com data_competencia = '20026-07-15'
-- (ano 20026, dígito a mais). `<input type="date">` nativo aceita anos de 5+
-- dígitos, e o tipo `date` do Postgres também (vai até o ano 5874897).
--
-- Estas CHECK constraints são o backstop FINAL: nenhum caminho (formulário,
-- conciliação bancária, importação de extrato, RPC ou API direta) consegue
-- gravar uma data com ano fora de 1000..9999. O frontend (componente DateInput)
-- já limita o campo de ano do seletor a 4 dígitos — isto garante no banco.
--
-- DDL puro (sem CREATE FUNCTION) — seguro para `supabase db push`.
-- Idempotente (DROP IF EXISTS + ADD). Não há linha existente violando (verificado).

ALTER TABLE public.fin_contas_pagar DROP CONSTRAINT IF EXISTS chk_fin_contas_pagar_datas_ano;
ALTER TABLE public.fin_contas_pagar ADD CONSTRAINT chk_fin_contas_pagar_datas_ano CHECK (
  (data_competencia IS NULL OR data_competencia BETWEEN DATE '1000-01-01' AND DATE '9999-12-31')
  AND (data_vencimento IS NULL OR data_vencimento BETWEEN DATE '1000-01-01' AND DATE '9999-12-31')
  AND (data_pagamento IS NULL OR data_pagamento BETWEEN DATE '1000-01-01' AND DATE '9999-12-31')
);

ALTER TABLE public.fin_contas_receber DROP CONSTRAINT IF EXISTS chk_fin_contas_receber_datas_ano;
ALTER TABLE public.fin_contas_receber ADD CONSTRAINT chk_fin_contas_receber_datas_ano CHECK (
  (data_competencia IS NULL OR data_competencia BETWEEN DATE '1000-01-01' AND DATE '9999-12-31')
  AND (data_vencimento IS NULL OR data_vencimento BETWEEN DATE '1000-01-01' AND DATE '9999-12-31')
  AND (data_recebimento IS NULL OR data_recebimento BETWEEN DATE '1000-01-01' AND DATE '9999-12-31')
);

ALTER TABLE public.fin_lancamentos DROP CONSTRAINT IF EXISTS chk_fin_lancamentos_datas_ano;
ALTER TABLE public.fin_lancamentos ADD CONSTRAINT chk_fin_lancamentos_datas_ano CHECK (
  (data_competencia IS NULL OR data_competencia BETWEEN DATE '1000-01-01' AND DATE '9999-12-31')
  AND (data_vencimento IS NULL OR data_vencimento BETWEEN DATE '1000-01-01' AND DATE '9999-12-31')
  AND (data_pagamento IS NULL OR data_pagamento BETWEEN DATE '1000-01-01' AND DATE '9999-12-31')
);
