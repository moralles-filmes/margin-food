
-- Add data_vencimento to fin_lancamentos (nullable, optional)
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS data_vencimento date;

-- Add data_competencia to fin_contas_pagar (nullable, optional)
ALTER TABLE public.fin_contas_pagar ADD COLUMN IF NOT EXISTS data_competencia date;

-- Add data_competencia to fin_contas_receber (nullable, optional)
ALTER TABLE public.fin_contas_receber ADD COLUMN IF NOT EXISTS data_competencia date;

-- Add supplier_id FK to fin_contas_pagar (nullable, references suppliers)
ALTER TABLE public.fin_contas_pagar ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id);

-- Add supplier_id FK to fin_contas_receber (nullable, references suppliers)
ALTER TABLE public.fin_contas_receber ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id);
