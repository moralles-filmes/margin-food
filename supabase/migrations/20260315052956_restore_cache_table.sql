
-- 1) Create saldo cache table
CREATE TABLE IF NOT EXISTS public.fin_contas_saldo_cache (
  conta_id uuid PRIMARY KEY REFERENCES public.fin_contas(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  saldo numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fin_contas_saldo_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_contas_saldo_cache FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.fin_contas_saldo_cache
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 2) Function to refresh saldo cache for a given conta
CREATE OR REPLACE FUNCTION public.refresh_saldo_cache(p_conta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo numeric;
  v_company uuid;
  v_saldo_inicial numeric;
BEGIN
  SELECT company_id, saldo_inicial INTO v_company, v_saldo_inicial
  FROM fin_contas WHERE id = p_conta_id;

  IF v_company IS NULL THEN RETURN; END IF;

  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = p_conta_id THEN -l.valor
      ELSE 0
    END
  ), 0) INTO v_saldo
  FROM fin_lancamentos l
  WHERE l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.company_id = v_company
    AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id);

  INSERT INTO fin_contas_saldo_cache (conta_id, company_id, saldo, updated_at)
  VALUES (p_conta_id, v_company, v_saldo, now())
  ON CONFLICT (conta_id) DO UPDATE SET saldo = EXCLUDED.saldo, updated_at = now();
END;
$$;

-- 3) Trigger on fin_lancamentos to refresh cache
CREATE OR REPLACE FUNCTION public.trg_refresh_saldo_cache_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.conta_id IS NOT NULL THEN PERFORM refresh_saldo_cache(OLD.conta_id); END IF;
    IF OLD.conta_destino_id IS NOT NULL THEN PERFORM refresh_saldo_cache(OLD.conta_destino_id); END IF;
    RETURN OLD;
  END IF;

  IF NEW.conta_id IS NOT NULL THEN PERFORM refresh_saldo_cache(NEW.conta_id); END IF;
  IF NEW.conta_destino_id IS NOT NULL THEN PERFORM refresh_saldo_cache(NEW.conta_destino_id); END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.conta_id IS NOT NULL AND OLD.conta_id IS DISTINCT FROM NEW.conta_id THEN
      PERFORM refresh_saldo_cache(OLD.conta_id);
    END IF;
    IF OLD.conta_destino_id IS NOT NULL AND OLD.conta_destino_id IS DISTINCT FROM NEW.conta_destino_id THEN
      PERFORM refresh_saldo_cache(OLD.conta_destino_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saldo_cache_lancamento ON public.fin_lancamentos;
CREATE TRIGGER trg_saldo_cache_lancamento
AFTER INSERT OR UPDATE OR DELETE ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_saldo_cache_lancamento();

-- 4) Trigger on fin_contas to refresh cache on saldo_inicial change
CREATE OR REPLACE FUNCTION public.trg_refresh_saldo_cache_conta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM refresh_saldo_cache(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saldo_cache_conta ON public.fin_contas;
CREATE TRIGGER trg_saldo_cache_conta
AFTER INSERT OR UPDATE OF saldo_inicial ON public.fin_contas
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_saldo_cache_conta();

-- 5) Seed cache for all existing contas
INSERT INTO fin_contas_saldo_cache (conta_id, company_id, saldo, updated_at)
SELECT c.id, c.company_id,
  c.saldo_inicial + COALESCE((
    SELECT SUM(CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = c.id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = c.id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = c.id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = c.id THEN -l.valor
      ELSE 0 END)
    FROM fin_lancamentos l
    WHERE l.status IN ('REALIZADO','CONCILIADO') AND l.company_id = c.company_id
      AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
  ), 0),
  now()
FROM fin_contas c WHERE c.ativo = true
ON CONFLICT (conta_id) DO UPDATE SET saldo = EXCLUDED.saldo, updated_at = now();

-- 6) Recreate get_fin_alertas with RBAC + totals + cache + limits
CREATE OR REPLACE FUNCTION public.get_fin_alertas()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_today date;
  v_in7 date;
  v_month_start date;
  v_month_end date;
  _result json;
BEGIN
  v_company := public.assert_tenant();

  -- RBAC check
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:alertas:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_in7 := v_today + 7;
  v_month_start := date_trunc('month', v_today)::date;
  v_month_end := (date_trunc('month', v_today) + interval '1 month')::date;

  SELECT json_build_object(
    'cp_vencidas', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento
        FROM fin_contas_pagar
        WHERE company_id = v_company
          AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
          AND data_vencimento < v_today
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cp_vencidas_total', (
      SELECT COUNT(*)::int FROM fin_contas_pagar
      WHERE company_id = v_company
        AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
        AND data_vencimento < v_today
    ),
    'cp_vencer', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento
        FROM fin_contas_pagar
        WHERE company_id = v_company
          AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
          AND data_vencimento >= v_today
          AND data_vencimento <= v_in7
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cp_vencer_total', (
      SELECT COUNT(*)::int FROM fin_contas_pagar
      WHERE company_id = v_company
        AND status IN ('APROVADO','AGUARDANDO_APROVACAO')
        AND data_vencimento >= v_today
        AND data_vencimento <= v_in7
    ),
    'cr_atrasadas', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text, 'cliente', COALESCE(cliente, 'N/A')
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento, cliente
        FROM fin_contas_receber
        WHERE company_id = v_company
          AND status = 'A_RECEBER'
          AND data_vencimento < v_today
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cr_atrasadas_total', (
      SELECT COUNT(*)::int FROM fin_contas_receber
      WHERE company_id = v_company
        AND status = 'A_RECEBER'
        AND data_vencimento < v_today
    ),
    'cr_vencer', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', descricao, 'valor', valor, 'data_vencimento', data_vencimento::text, 'cliente', COALESCE(cliente, 'N/A')
      )), '[]'::json)
      FROM (
        SELECT descricao, valor, data_vencimento, cliente
        FROM fin_contas_receber
        WHERE company_id = v_company
          AND status = 'A_RECEBER'
          AND data_vencimento >= v_today
          AND data_vencimento <= v_in7
        ORDER BY data_vencimento ASC
        LIMIT 200
      ) sub
    ),
    'cr_vencer_total', (
      SELECT COUNT(*)::int FROM fin_contas_receber
      WHERE company_id = v_company
        AND status = 'A_RECEBER'
        AND data_vencimento >= v_today
        AND data_vencimento <= v_in7
    ),
    'contas_saldo_negativo', (
      SELECT COALESCE(json_agg(json_build_object('nome', c.nome, 'saldo', sc.saldo)), '[]'::json)
      FROM fin_contas c
      JOIN fin_contas_saldo_cache sc ON sc.conta_id = c.id
      WHERE c.company_id = v_company AND c.ativo = true AND sc.saldo < 0
    ),
    'lancamentos_sem_categoria', (
      SELECT COUNT(*)::int FROM fin_lancamentos
      WHERE company_id = v_company AND status IN ('REALIZADO','CONCILIADO') AND categoria_id IS NULL
    ),
    'lancamentos_sem_conta', (
      SELECT COUNT(*)::int FROM fin_lancamentos
      WHERE company_id = v_company AND status IN ('REALIZADO','CONCILIADO') AND conta_id IS NULL AND tipo != 'TRANSFERENCIA'
    ),
    'recorrencias_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'livro_razao'
      )), '[]'::json)
      FROM (
        SELECT descricao, valor FROM fin_lancamentos p
        WHERE p.company_id = v_company AND p.recorrente = true AND p.lancamento_pai_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fin_lancamentos ch
            WHERE ch.lancamento_pai_id = p.id
              AND ch.data_competencia >= v_month_start AND ch.data_competencia < v_month_end
          )
        LIMIT 200
      ) p
    ),
    'recorrencias_cp_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'contas_pagar'
      )), '[]'::json)
      FROM (
        SELECT descricao, valor FROM fin_contas_pagar p
        WHERE p.company_id = v_company AND p.recorrente = true AND p.lancamento_pai_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fin_contas_pagar ch
            WHERE ch.lancamento_pai_id = p.id
              AND ch.data_vencimento >= v_month_start AND ch.data_vencimento < v_month_end
          )
        LIMIT 200
      ) p
    ),
    'recorrencias_cr_pendentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'descricao', p.descricao, 'valor', p.valor, 'origem', 'contas_receber'
      )), '[]'::json)
      FROM (
        SELECT descricao, valor FROM fin_contas_receber p
        WHERE p.company_id = v_company AND p.recorrente = true AND p.lancamento_pai_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM fin_contas_receber ch
            WHERE ch.lancamento_pai_id = p.id
              AND ch.data_vencimento >= v_month_start AND ch.data_vencimento < v_month_end
          )
        LIMIT 200
      ) p
    )
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_fin_alertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_alertas() TO authenticated;
