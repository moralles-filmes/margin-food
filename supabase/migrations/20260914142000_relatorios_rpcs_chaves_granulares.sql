-- Grupo C — Relatórios: alinha as RPCs às chaves granulares do registry.
--
-- Mesmo bug de 20260912164500 / 20260914120000 (Financeiro): a tela é liberada pela
-- chave granular (`relatorios:<subtab>:view`, via `useCan`/`useModuleAccess`) mas a RPC
-- checa só a chave legada (`reports:read` / `stock:read`). Admin → Permissões grava DENY
-- para toda chave default do perfil que não aparece na matriz — e as legadas não aparecem.
-- Resultado: aba abre, RPC devolve "Sem permissão".
--
-- Em produção (2026-09-14): `reports:read` tem 1 DENY explícito e `stock:read` tem 6 DENY,
-- contra 0 DENY em qualquer chave granular de Relatórios. O bug já está armado.
--
-- Cadeia real de chamada (o frontend NUNCA chama get_relatorios_* direto):
--   useRelatoriosData.ts → _relatorios_<x>_guarded(text,text)  [checa a chave granular, OK]
--                        → get_relatorios_<x>(date,date)       [checa reports:read, BUG]
-- Por isso o alvo é a sobrecarga (date,date). A sobrecarga (text,text) de
-- get_relatorios_* / simulate_relatorios_score é código morto QUEBRADO (delega a
-- public._get_relatorios_*_impl, que não existe no banco — erro 42883 em qualquer
-- chamada) e fica intocada de propósito.
--
-- Correção ADITIVA: a chave legada continua aceita; a granular passa a ser aceita também.
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
      -- ── Relatórios → CMV + Estoque (KPIs) ──
      ('public.get_relatorios_kpis(date,date)',
       $a$has_permission(auth.uid(), 'reports:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['relatorios:cmv:view', 'relatorios:estoque:view', 'reports:read', 'system:global:manage'])$b$),
      ('public.get_relatorios_kpis(date,date)',
       $a$'Sem permissão (reports:read).'$a$,
       $b$'Sem permissão (relatorios:cmv:view ou relatorios:estoque:view).'$b$),

      -- ── Relatórios → Tendência ──
      ('public.get_relatorios_tendencia(date,date)',
       $a$has_permission(auth.uid(), 'reports:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['relatorios:tendencia:view', 'reports:read', 'system:global:manage'])$b$),
      ('public.get_relatorios_tendencia(date,date)',
       $a$'Sem permissão (reports:read).'$a$,
       $b$'Sem permissão (relatorios:tendencia:view).'$b$),

      -- ── Relatórios → Compras ──
      ('public.get_relatorios_compras(date,date)',
       $a$has_permission(auth.uid(), 'reports:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['relatorios:compras:view', 'reports:read', 'system:global:manage'])$b$),
      ('public.get_relatorios_compras(date,date)',
       $a$'Sem permissão (reports:read).'$a$,
       $b$'Sem permissão (relatorios:compras:view).'$b$),

      -- ── Relatórios → Score ──
      ('public.get_relatorios_score(date,date)',
       $a$has_permission(auth.uid(), 'reports:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['relatorios:score:view', 'reports:read', 'system:global:manage'])$b$),
      ('public.get_relatorios_score(date,date)',
       $a$'Sem permissão (reports:read).'$a$,
       $b$'Sem permissão (relatorios:score:view).'$b$),

      -- ── Relatórios → Score → Simulador ──
      ('public.simulate_relatorios_score(date,date,jsonb)',
       $a$has_permission(auth.uid(), 'reports:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['relatorios:score:simulate', 'reports:read', 'system:global:manage'])$b$),
      ('public.simulate_relatorios_score(date,date,jsonb)',
       $a$'Sem permissão (reports:read).'$a$,
       $b$'Sem permissão (relatorios:score:simulate).'$b$),

      -- ── Relatórios → Itens (AnaliseItemView) ──
      ('public.get_report_items_summary(date,date)',
       $a$has_permission(auth.uid(), 'reports:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['relatorios:itens:view', 'reports:read', 'system:global:manage'])$b$),
      ('public.get_report_items_summary(date,date)',
       $a$'Sem permissão (reports:read).'$a$,
       $b$'Sem permissão (relatorios:itens:view).'$b$),

      ('public.list_report_items_cursor(date,date,integer,timestamptz,uuid,text,text,text,boolean)',
       $a$has_permission(auth.uid(), 'reports:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['relatorios:itens:view', 'reports:read', 'system:global:manage'])$b$),
      ('public.list_report_items_cursor(date,date,integer,timestamptz,uuid,text,text,text,boolean)',
       $a$'Sem permissão (reports:read).'$a$,
       $b$'Sem permissão (relatorios:itens:view).'$b$),

      ('public.get_report_item_detail(uuid,date,date)',
       $a$has_permission(auth.uid(), 'reports:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['relatorios:itens:view', 'reports:read', 'system:global:manage'])$b$),
      ('public.get_report_item_detail(uuid,date,date)',
       $a$'Sem permissão (reports:read).'$a$,
       $b$'Sem permissão (relatorios:itens:view).'$b$),

      -- ── Relatórios → Estoque → Gastos por Setor ──
      -- Renderizado dentro da aba `relatorios:estoque`, mas a RPC só aceitava stock:read.
      ('public.get_spend_by_sector(date,date,boolean)',
       $a$public.has_permission(auth.uid(), 'stock:read')$a$,
       $b$public.has_any_permission(auth.uid(), ARRAY['relatorios:estoque:view', 'stock:read', 'system:global:manage'])$b$),
      ('public.get_spend_by_sector(date,date,boolean)',
       $a$RAISE EXCEPTION 'Insufficient permissions';$a$,
       $b$RAISE EXCEPTION 'Sem permissão (relatorios:estoque:view).';$b$)
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

-- Guarda final: nenhuma das RPCs de Relatórios pode continuar presa só à chave legada.
DO $verify$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.oid::regprocedure::text IN (
        'get_relatorios_kpis(date,date)',
        'get_relatorios_tendencia(date,date)',
        'get_relatorios_compras(date,date)',
        'get_relatorios_score(date,date)',
        'simulate_relatorios_score(date,date,jsonb)',
        'get_report_items_summary(date,date)',
        'get_report_item_detail(uuid,date,date)',
        'get_spend_by_sector(date,date,boolean)',
        'list_report_items_cursor(date,date,integer,timestamp with time zone,uuid,text,text,text,boolean)'
      )
  LOOP
    IF r.def ~ $re$has_permission\(auth\.uid\(\), '(reports:read|stock:read)'\)$re$ THEN
      RAISE EXCEPTION 'Chave legada isolada ainda presente em %', r.sig;
    END IF;
    IF r.def !~ 'has_any_permission' THEN
      RAISE EXCEPTION 'Checagem de permissão sumiu de %', r.sig;
    END IF;
  END LOOP;
END;
$verify$;
