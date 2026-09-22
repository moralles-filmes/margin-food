-- ─────────────────────────────────────────────────────────────────────────────
-- Execução da RPC de gravação de códigos de barras
--
-- `op_list_produtos` foi recriada com CREATE OR REPLACE (mesmo tipo de retorno),
-- então os GRANTs dela sobreviveram e não precisam ser refeitos.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.catalogo_salvar_codigos_barras(uuid, uuid[], jsonb) from public;
grant execute on function public.catalogo_salvar_codigos_barras(uuid, uuid[], jsonb) to authenticated;
grant execute on function public.catalogo_salvar_codigos_barras(uuid, uuid[], jsonb) to service_role;
