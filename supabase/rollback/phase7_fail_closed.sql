-- Contenção operacional: mantém dados, FKs, índices e guards; não restaura exposição antiga.
BEGIN;
SET LOCAL lock_timeout='5s';
REVOKE INSERT, UPDATE, DELETE ON public.stock_categories, public.stock_locations, public.stock_sectors, public.turnos,
 public.planning_metas_compra, public.rh_custos_mensais, public.rh_escalas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_purchase_order_atomic(jsonb,uuid), public.edit_purchase_order_atomic(uuid,jsonb),
 public.ficha_salvar_componente_itens_atomic(uuid,jsonb), public.batch_reorder_fin_categorias(jsonb), public.reorder_fin_categoria(uuid,text),
 public.fin_audit_integrity_check(), public.get_saldo_produto(uuid), public._planning_upsert_meta_guarded(integer,integer,text,numeric,numeric,numeric),
 public.get_stock_dashboard(integer), public.get_stock_predictive_analysis_v2(text,uuid,integer,boolean,boolean),
 public.get_stock_losses_report(date,date,text,uuid,text,text,text), public.get_stock_top_consumed(date,date,text,integer,text),
 public.get_inactive_stock_items(), public.get_all_saldos_contas(), public.mark_all_notifications_read() FROM PUBLIC, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
