
-- Enable RLS on backup tables (read-only safety snapshots)
ALTER TABLE public.produtos_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes_estoque_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_entries_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_manipulations_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_daily_records_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventarios_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_itens_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solic_compra_mercado_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimento_itens_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturamento_periodos_legacy_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_fechamento_caixa_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_lancamentos_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_contas_pagar_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_contas_receber_bkp_reset_20260301 ENABLE ROW LEVEL SECURITY;
