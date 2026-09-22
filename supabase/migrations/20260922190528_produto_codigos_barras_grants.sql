-- ─────────────────────────────────────────────────────────────────────────────
-- Múltiplos códigos de barras — execução das RPCs
--
-- `op_list_produtos` foi recriada com DROP + CREATE (o retorno perdeu `barcode`,
-- e CREATE OR REPLACE não muda tipo de retorno), então o GRANT anterior caiu
-- junto e precisa ser refeito aqui.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.op_list_produtos(uuid, text, integer) from public;
revoke execute on function public.op_find_produto_por_barcode(text) from public;
revoke execute on function public.op_barcode_existe(text) from public;

grant execute on function public.op_list_produtos(uuid, text, integer) to authenticated;
grant execute on function public.op_find_produto_por_barcode(text) to authenticated;
grant execute on function public.op_barcode_existe(text) to authenticated;

grant execute on function public.op_list_produtos(uuid, text, integer) to service_role;
grant execute on function public.op_find_produto_por_barcode(text) to service_role;
grant execute on function public.op_barcode_existe(text) to service_role;
