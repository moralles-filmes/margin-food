-- Finaliza o alinhamento de RBAC do Financeiro entre frontend (chaves granulares do
-- registry) e banco (RPCs/policies ainda presas a chave legada ou a chave fantasma).
--
-- Mesmo bug de 20260912131731/20260912164500: usuário com ALLOW na chave granular e
-- DENY na legada (padrão gravado por Admin → Permissões) tem a tela liberada e a RPC
-- nega. Caso real: Royal Parma Bauru — conciliacao:reconcile=ALLOW mas
-- conciliacao:manage=DENY bloqueava "Conciliar em lote"/"Desconciliar".
--
-- 1. RPCs que só aceitavam finance:read/finance:manage passam a aceitar a chave
--    granular que a tela usa como gate (legado continua como fallback).
-- 2. financeiro:conciliacao:manage (fantasma) → financeiro:conciliacao:reconcile.
--    Todos os perfis/usuários com manage também têm reconcile (conferido em produção).
-- 3. financeiro:relatorios:view e financeiro:auditoria:write (fantasmas, sem nenhuma
--    concessão em produção) são removidos dos arrays — sempre coexistiam com chave válida.
-- 4. financeiro:fechamento:delete passa a ser registrada no registry (já concedida aos
--    perfis admin/diretor/gerente_geral e usada pela UI) — sem mudança no banco.
-- 5. fin_lancamentos: writes aceitam lancamentos:create/edit/delete (a Conciliação faz
--    UPDATE direto após criar o lançamento, então update aceita conciliacao:reconcile).
--
-- Reescrita via pg_get_functiondef + replace() sobre a definição VIVA: preserva owner,
-- grants, SET search_path e o corpo atual; aborta se o trecho esperado não existir.

DO $rpcs$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.get_fin_counts_by_status(date,date)',
       $a$public.has_permission(auth.uid(), 'finance:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:pagar:view', 'financeiro:receber:view', 'finance:read', 'system:global:manage'])$b$),
      ('public.list_fin_contas_pagar_cursor(text,text,text,integer,date,uuid,date,date,uuid,uuid,boolean)',
       $a$public.has_permission(auth.uid(), 'finance:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:pagar:view', 'finance:read', 'system:global:manage'])$b$),
      ('public.list_fin_contas_receber_cursor(text,text,text,integer,date,uuid,date,date,uuid,uuid,boolean)',
       $a$public.has_permission(auth.uid(), 'finance:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:receber:view', 'finance:read', 'system:global:manage'])$b$),
      ('public.list_fin_lancamentos_cursor(date,date,text,text,uuid,text,integer,date,uuid)',
       $a$public.has_permission(auth.uid(), 'finance:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage'])$b$),
      ('public.list_fin_lancamentos_cursor(date,date,text,text,uuid,text,integer,date,uuid,text,uuid,boolean)',
       $a$public.has_permission(auth.uid(), 'finance:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage'])$b$),
      ('public.get_fin_lancamentos_totais(date,date,text,uuid,text,uuid,boolean)',
       $a$public.has_permission(auth.uid(), 'finance:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage'])$b$),
      ('public.get_fin_saldo_atual(uuid,date)',
       $a$public.has_permission(auth.uid(), 'finance:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage'])$b$),
      ('public.get_fin_kpis(date,date)',
       $a$public.has_permission(auth.uid(), 'finance:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:kpis:view', 'finance:read', 'system:global:manage'])$b$),
      ('public.pay_conta_pagar(uuid,text,date,uuid)',
       $a$public.has_permission(auth.uid(), 'finance:manage')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:pagar:edit', 'financeiro:pagar:approve', 'finance:manage', 'system:global:manage'])$b$),
      ('public.receive_conta_receber(uuid,text,date)',
       $a$public.has_permission(auth.uid(), 'finance:manage')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['financeiro:receber:edit', 'finance:manage', 'system:global:manage'])$b$),
      ('public.rpc_upsert_fechamento_caixa(date,numeric,numeric,numeric,text)',
       $a$has_permission(auth.uid(), 'finance:manage')$a$,
       $b$has_any_permission(auth.uid(), ARRAY['financeiro:fechamento:create', 'financeiro:fechamento:edit', 'finance:manage', 'system:global:manage'])$b$),
      ('public.unreconcile_lancamento(uuid)',
       $a$ARRAY['financeiro:conciliacao:manage', 'system:global:manage']$a$,
       $b$ARRAY['financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']$b$),
      ('public.unreconcile_lancamento(uuid)',
       $a$financeiro:conciliacao:manage necessário$a$,
       $b$financeiro:conciliacao:reconcile necessário$b$),
      ('public.reconcile_batch_lancamentos(uuid[])',
       $a$ARRAY['financeiro:conciliacao:manage', 'system:global:manage']$a$,
       $b$ARRAY['financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']$b$),
      ('public.reconcile_batch_lancamentos(uuid[])',
       $a$financeiro:conciliacao:manage necessário$a$,
       $b$financeiro:conciliacao:reconcile necessário$b$)
    ) AS t(sig, old_text, new_text)
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    IF position(r.old_text IN v_def) = 0 THEN
      RAISE EXCEPTION 'DRIFT: trecho esperado não encontrado em %: %', r.sig, r.old_text;
    END IF;
    EXECUTE replace(v_def, r.old_text, r.new_text);
  END LOOP;
END;
$rpcs$;

-- Chaves fantasma restantes em qualquer função: conciliacao:manage sai (ou vira
-- reconcile quando a função não aceita reconcile) e relatorios:view sai do array.
DO $phantoms$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ '''financeiro:(conciliacao:manage|relatorios:view)'''
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;
    IF position('''financeiro:conciliacao:reconcile''' IN v_new) > 0 THEN
      v_new := regexp_replace(v_new, '''financeiro:conciliacao:manage''(::text)?\s*,\s*', '', 'g');
    ELSE
      v_new := replace(v_new, '''financeiro:conciliacao:manage''', '''financeiro:conciliacao:reconcile''');
    END IF;
    v_new := regexp_replace(v_new, '''financeiro:relatorios:view''(::text)?\s*,\s*', '', 'g');

    IF v_new ~ '''financeiro:(conciliacao:manage|relatorios:view)''' THEN
      RAISE EXCEPTION 'DRIFT: chave fantasma em posição inesperada em %', r.sig;
    END IF;
    EXECUTE v_new;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ '''financeiro:(conciliacao:manage|relatorios:view)'''
  ) THEN
    RAISE EXCEPTION 'Chave fantasma do Financeiro ainda presente em função pública';
  END IF;
END;
$phantoms$;

ALTER POLICY "insert_fin_audit_logs_tenant" ON public.fin_audit_logs
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:create', 'financeiro:pagar:create', 'financeiro:receber:create', 'financeiro:conciliacao:reconcile', 'system:global:manage']))
  );

ALTER POLICY "fin_conciliacao_ignoradas_tenant_select" ON public.fin_conciliacao_ignoradas
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission((SELECT auth.uid()), ARRAY['financeiro:conciliacao:view', 'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']))
  );

ALTER POLICY "tenant_read" ON public.fin_lancamentos
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:view', 'finance:read', 'system:global:manage']))
  );

ALTER POLICY "tenant_insert" ON public.fin_lancamentos
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:create', 'finance:manage', 'system:global:manage']))
  );

ALTER POLICY "tenant_update" ON public.fin_lancamentos
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:edit', 'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']))
  )
  WITH CHECK (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:edit', 'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']))
  );

ALTER POLICY "tenant_delete" ON public.fin_lancamentos
  USING (
    company_id = (SELECT get_current_company_id())
    AND (SELECT has_any_permission(auth.uid(), ARRAY['financeiro:lancamentos:delete', 'finance:manage', 'system:global:manage']))
  );
