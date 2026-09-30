-- ─────────────────────────────────────────────────────────────────────────────
-- Financeiro — execução das RPCs recriadas em 20260929183200.
--
-- DROP + CREATE descarta os grants antigos, e SECURITY DEFINER nasce com EXECUTE
-- para PUBLIC (o que inclui `anon`). _guarded_upsert_lancamento e create_transfer
-- estavam com PUBLIC; ficam só com authenticated e service_role, como as demais.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamp with time zone, text, text) from public, anon;
grant execute on function public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamp with time zone, text, text) to authenticated, service_role;

revoke execute on function public.create_transfer(uuid, uuid, numeric, date, text, uuid, text) from public, anon;
grant execute on function public.create_transfer(uuid, uuid, numeric, date, text, uuid, text) to authenticated, service_role;

revoke execute on function public._guarded_create_conta_pagar(text, numeric, text, uuid, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public._guarded_create_conta_pagar(text, numeric, text, uuid, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, text) to authenticated, service_role;

revoke execute on function public._guarded_create_conta_receber(text, text, numeric, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, uuid, text) from public, anon;
grant execute on function public._guarded_create_conta_receber(text, text, numeric, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, uuid, text) to authenticated, service_role;

revoke execute on function public.reconcile_create_titulo_from_extrato(uuid, text, text, date, date, date, uuid, uuid, text, text) from public, anon;
grant execute on function public.reconcile_create_titulo_from_extrato(uuid, text, text, date, date, date, uuid, uuid, text, text) to authenticated, service_role;

revoke execute on function public.gerar_parcela_recorrente(uuid, integer) from public, anon;
grant execute on function public.gerar_parcela_recorrente(uuid, integer) to authenticated, service_role;

-- reconcile_import_lancamento manteve a assinatura (CREATE OR REPLACE preserva
-- os grants); o revoke só garante o estado caso alguém a tenha recriado antes.
revoke execute on function public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer) from public, anon;

notify pgrst, 'reload schema';
