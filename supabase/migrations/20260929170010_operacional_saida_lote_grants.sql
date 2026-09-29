-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação Operacional — execução da RPC de saída em lote.
--
-- Arquivo separado do CREATE FUNCTION de propósito: o CLI do Supabase já quebrou
-- migrations que misturam `CREATE FUNCTION` com outro statement no mesmo arquivo.
--
-- Funções SECURITY DEFINER nascem com EXECUTE para PUBLIC (o que inclui `anon`).
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.op_registrar_saidas_lote(jsonb, text) from public;

grant execute on function public.op_registrar_saidas_lote(jsonb, text) to authenticated;
grant execute on function public.op_registrar_saidas_lote(jsonb, text) to service_role;
