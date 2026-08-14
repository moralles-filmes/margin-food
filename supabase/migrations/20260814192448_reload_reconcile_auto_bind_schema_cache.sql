-- A RPC foi criada em 20260814152733, mas a importação de extrato recebeu
-- PGRST202/404 porque o PostgREST ainda não tinha atualizado o schema cache.
-- Mantemos uma migration separada para não alterar o histórico já aplicado.
DO $$
BEGIN
  IF to_regprocedure('public.reconcile_auto_bind_transfer_counterparts(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_auto_bind_transfer_counterparts(uuid,jsonb) não existe';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
