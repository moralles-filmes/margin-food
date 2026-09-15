BEGIN TRANSACTION READ ONLY;
WITH resources AS (SELECT 'alertas_falta_estoque'::text entity,id,company_id FROM public.alertas_falta_estoque
UNION ALL
SELECT 'fin_contas'::text entity,id,company_id FROM public.fin_contas
UNION ALL
SELECT 'fin_contas_pagar'::text entity,id,company_id FROM public.fin_contas_pagar
UNION ALL
SELECT 'fin_lancamento_rateios'::text entity,id,company_id FROM public.fin_lancamento_rateios
UNION ALL
SELECT 'fin_lancamentos'::text entity,id,company_id FROM public.fin_lancamentos
UNION ALL
SELECT 'inventario_itens'::text entity,id,company_id FROM public.inventario_itens
UNION ALL
SELECT 'inventarios'::text entity,id,company_id FROM public.inventarios
UNION ALL
SELECT 'movimentacoes_estoque'::text entity,id,company_id FROM public.movimentacoes_estoque
UNION ALL
SELECT 'notifications'::text entity,id,company_id FROM public.notifications
UNION ALL
SELECT 'produtos'::text entity,id,company_id FROM public.produtos
UNION ALL
SELECT 'purchase_order_items'::text entity,id,company_id FROM public.purchase_order_items
UNION ALL
SELECT 'purchase_orders'::text entity,id,company_id FROM public.purchase_orders
UNION ALL
SELECT 'requisicao_estoque_itens'::text entity,id,company_id FROM public.requisicao_estoque_itens
UNION ALL
SELECT 'requisicoes_estoque'::text entity,id,company_id FROM public.requisicoes_estoque
UNION ALL
SELECT 'salmon_config'::text entity,id,company_id FROM public.salmon_config
UNION ALL
SELECT 'salmon_entries'::text entity,id,company_id FROM public.salmon_entries
UNION ALL
SELECT 'salmon_manipulations'::text entity,id,company_id FROM public.salmon_manipulations
UNION ALL
SELECT 'stock_locations'::text entity,id,company_id FROM public.stock_locations
UNION ALL
SELECT 'stock_sectors'::text entity,id,company_id FROM public.stock_sectors
UNION ALL
SELECT 'stock_categories'::text entity,id,company_id FROM public.stock_categories),
logs AS (
 SELECT 'audit_logs'::text log_table,id,entity,entity_id,company_id,before,after,metadata FROM public.audit_logs
 UNION ALL SELECT 'audit_log',id,tabela,registro_id,NULL::uuid,NULL::jsonb,NULL::jsonb,NULL::jsonb FROM public.audit_log
), classified AS (
 SELECT l.log_table, CASE
 WHEN l.entity IN ('auth.users','profiles','user_roles','company_memberships','companies') THEN 'identity_or_global_unproven'
 WHEN l.entity_id IS NULL THEN 'invalid_or_missing_resource_id'
 WHEN r.id IS NULL THEN 'resource_absent_or_unsupported'
 WHEN r.company_id IS NULL OR r.company_id='00000000-0000-0000-0000-000000000001'::uuid OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=r.company_id) THEN 'invalid_resource_company'
 WHEN EXISTS(SELECT 1 FROM unnest(ARRAY[l.company_id::text,l.before->>'company_id',l.after->>'company_id',l.metadata->>'company_id']) h WHERE h IS NOT NULL AND h !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN 'invalid_company_hint'
 WHEN EXISTS(SELECT 1 FROM unnest(ARRAY[l.company_id::text,l.before->>'company_id',l.after->>'company_id',l.metadata->>'company_id']) h WHERE h IS NOT NULL AND lower(h)<>r.company_id::text) THEN 'conflicting_company_hint'
 WHEN EXISTS(SELECT 1 FROM unnest(ARRAY[l.before->>'id',l.after->>'id']) h WHERE h IS NOT NULL AND lower(h)<>l.entity_id::text) THEN 'conflicting_resource_hint'
 ELSE 'legacy_resource_correlated' END reason
 FROM logs l LEFT JOIN resources r ON r.entity=l.entity AND r.id=l.entity_id
)
SELECT log_table,reason,count(*) records FROM classified GROUP BY log_table,reason ORDER BY log_table,reason;
COMMIT;
