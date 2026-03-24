
-- Apply FORCE ROW LEVEL SECURITY to all Batch 1 tenantized tables
-- Financeiro
ALTER TABLE public.fin_lancamentos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_contas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_contas_pagar FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_contas_receber FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_categorias FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_centros_custo FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_orcamentos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_plano_contas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_rateios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_lancamento_rateios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_regras_categorizacao FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_dre_linhas FORCE ROW LEVEL SECURITY;
-- Estoque core
ALTER TABLE public.produtos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_estoque FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventarios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_itens FORCE ROW LEVEL SECURITY;
-- Outros com company_id
ALTER TABLE public.financeiro_fechamento_caixa FORCE ROW LEVEL SECURITY;
-- profiles: skip FORCE — admin edge functions need unrestricted access via service role
