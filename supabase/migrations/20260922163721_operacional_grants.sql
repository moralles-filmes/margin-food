-- ─────────────────────────────────────────────────────────────────────────────
-- Movimentação Operacional — Fase 1: execução das RPCs
--
-- Arquivo separado do CREATE FUNCTION de propósito: o CLI do Supabase já quebrou
-- migrations que misturam `CREATE FUNCTION` com outro statement no mesmo arquivo.
--
-- Funções SECURITY DEFINER nascem com EXECUTE para PUBLIC (o que inclui `anon`).
-- Aqui isso é revogado e concedido só a quem tem sessão autenticada.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.op_pode_todos_setores(uuid) from public;
revoke execute on function public.op_setor_autorizado(uuid, uuid, uuid) from public;
revoke execute on function public.op_list_setores() from public;
revoke execute on function public.op_list_produtos(uuid, text, integer) from public;
revoke execute on function public.op_registrar_movimentacao(uuid, uuid, text, numeric, text, text) from public;
revoke execute on function public.op_list_historico(integer) from public;

grant execute on function public.op_list_setores() to authenticated;
grant execute on function public.op_list_produtos(uuid, text, integer) to authenticated;
grant execute on function public.op_registrar_movimentacao(uuid, uuid, text, numeric, text, text) to authenticated;
grant execute on function public.op_list_historico(integer) to authenticated;

grant execute on function public.op_pode_todos_setores(uuid) to service_role;
grant execute on function public.op_setor_autorizado(uuid, uuid, uuid) to service_role;
grant execute on function public.op_list_setores() to service_role;
grant execute on function public.op_list_produtos(uuid, text, integer) to service_role;
grant execute on function public.op_registrar_movimentacao(uuid, uuid, text, numeric, text, text) to service_role;
grant execute on function public.op_list_historico(integer) to service_role;
