-- Notificação só nasce no servidor: Edge Functions com service_role e RPCs
-- SECURITY DEFINER (todas de owner postgres). A policy de INSERT exigia apenas
-- created_by = auth.uid(), então qualquer membro da unidade criava aviso para um
-- colega com título, texto e link livres — inclusive o modal bloqueante de
-- requisição encerrada, cujo índice único (entity_id) ainda barraria o aviso
-- verdadeiro. O UPDATE sem restrição de coluna permitia o mesmo por edição de um
-- aviso próprio. Nenhum código do cliente insere, apaga ou edita além de read_at.

DROP POLICY IF EXISTS "Users can insert notifications as themselves" ON public.notifications;

REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated, anon;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.notifications', 'INSERT')
     OR has_table_privilege('authenticated', 'public.notifications', 'DELETE')
     OR has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.notifications', 'SELECT') THEN
    RAISE EXCEPTION 'notifications: privilégios de authenticated fora do esperado';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND cmd = 'INSERT') THEN
    RAISE EXCEPTION 'notifications: ainda existe policy de INSERT';
  END IF;
END $$;
