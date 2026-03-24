
-- Snapshot de segurança antes do reset total
-- Sufixo: _bkp_reset_20260301

CREATE TABLE IF NOT EXISTS public.produtos_bkp_reset_20260301 AS SELECT * FROM public.produtos;
CREATE TABLE IF NOT EXISTS public.suppliers_bkp_reset_20260301 AS SELECT * FROM public.suppliers;
CREATE TABLE IF NOT EXISTS public.movimentacoes_estoque_bkp_reset_20260301 AS SELECT * FROM public.movimentacoes_estoque;
CREATE TABLE IF NOT EXISTS public.purchase_orders_bkp_reset_20260301 AS SELECT * FROM public.purchase_orders;
CREATE TABLE IF NOT EXISTS public.purchase_order_items_bkp_reset_20260301 AS SELECT * FROM public.purchase_order_items;
CREATE TABLE IF NOT EXISTS public.salmon_entries_bkp_reset_20260301 AS SELECT * FROM public.salmon_entries;
CREATE TABLE IF NOT EXISTS public.salmon_manipulations_bkp_reset_20260301 AS SELECT * FROM public.salmon_manipulations;
CREATE TABLE IF NOT EXISTS public.salmon_daily_records_bkp_reset_20260301 AS SELECT * FROM public.salmon_daily_records;
CREATE TABLE IF NOT EXISTS public.inventarios_bkp_reset_20260301 AS SELECT * FROM public.inventarios;
CREATE TABLE IF NOT EXISTS public.inventario_itens_bkp_reset_20260301 AS SELECT * FROM public.inventario_itens;
CREATE TABLE IF NOT EXISTS public.solic_compra_mercado_bkp_reset_20260301 AS SELECT * FROM public.solic_compra_mercado;
CREATE TABLE IF NOT EXISTS public.recebimentos_bkp_reset_20260301 AS SELECT * FROM public.recebimentos;
CREATE TABLE IF NOT EXISTS public.recebimento_itens_bkp_reset_20260301 AS SELECT * FROM public.recebimento_itens;
CREATE TABLE IF NOT EXISTS public.faturamento_periodos_legacy_bkp_reset_20260301 AS SELECT * FROM public.faturamento_periodos_legacy;
CREATE TABLE IF NOT EXISTS public.financeiro_fechamento_caixa_bkp_reset_20260301 AS SELECT * FROM public.financeiro_fechamento_caixa;
CREATE TABLE IF NOT EXISTS public.fin_lancamentos_bkp_reset_20260301 AS SELECT * FROM public.fin_lancamentos;
CREATE TABLE IF NOT EXISTS public.fin_contas_pagar_bkp_reset_20260301 AS SELECT * FROM public.fin_contas_pagar;
CREATE TABLE IF NOT EXISTS public.fin_contas_receber_bkp_reset_20260301 AS SELECT * FROM public.fin_contas_receber;
