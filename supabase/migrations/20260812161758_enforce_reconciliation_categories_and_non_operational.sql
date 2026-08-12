-- Conciliação bancária: categoria obrigatória e auditável.
-- Categorias não operacionais: aparecem no DRE/DFC, mas ficam fora dos totais
-- e dos demais relatórios financeiros. O saldo bancário real continua íntegro.

ALTER TABLE public.fin_categorias
  ADD COLUMN IF NOT EXISTS system_key text,
  ADD COLUMN IF NOT EXISTS excluir_dos_totais boolean NOT NULL DEFAULT false;

ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS excluir_dos_relatorios boolean NOT NULL DEFAULT false;
ALTER TABLE public.fin_contas_pagar
  ADD COLUMN IF NOT EXISTS excluir_dos_relatorios boolean NOT NULL DEFAULT false;
ALTER TABLE public.fin_contas_receber
  ADD COLUMN IF NOT EXISTS excluir_dos_relatorios boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS fin_categorias_company_system_key_uidx
  ON public.fin_categorias (company_id, system_key)
  WHERE system_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_lancamentos_report_exclusion_idx
  ON public.fin_lancamentos (company_id, excluir_dos_relatorios, data_competencia);
CREATE INDEX IF NOT EXISTS fin_contas_pagar_report_exclusion_idx
  ON public.fin_contas_pagar (company_id, excluir_dos_relatorios, data_vencimento);
CREATE INDEX IF NOT EXISTS fin_contas_receber_report_exclusion_idx
  ON public.fin_contas_receber (company_id, excluir_dos_relatorios, data_vencimento);

CREATE OR REPLACE FUNCTION public.fin_prepare_category_reporting_class()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent public.fin_categorias%ROWTYPE;
BEGIN
  IF NEW.system_key IS NOT NULL THEN
    IF NEW.system_key = 'receitas_nao_operacionais' THEN
      NEW.nome := 'RECEITAS NÃO OPERACIONAIS';
      NEW.codigo := 'NO-R';
      NEW.tipo := 'receita';
    ELSIF NEW.system_key = 'despesas_nao_operacionais' THEN
      NEW.nome := 'DESPESAS NÃO OPERACIONAIS';
      NEW.codigo := 'NO-D';
      NEW.tipo := 'despesa';
    ELSE
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SYSTEM_CATEGORY_INVALID';
    END IF;
    NEW.parent_id := NULL;
    NEW.ativo := true;
    NEW.excluir_dos_totais := true;
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NULL THEN
    NEW.excluir_dos_totais := false;
    RETURN NEW;
  END IF;

  SELECT * INTO v_parent
  FROM public.fin_categorias
  WHERE id = NEW.parent_id AND company_id = NEW.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CATEGORY_PARENT_INVALID';
  END IF;
  NEW.excluir_dos_totais := v_parent.excluir_dos_totais;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_prepare_category_reporting_class ON public.fin_categorias;
CREATE TRIGGER trg_fin_prepare_category_reporting_class
BEFORE INSERT OR UPDATE OF parent_id, company_id, system_key, nome, codigo, tipo, ativo, excluir_dos_totais
ON public.fin_categorias
FOR EACH ROW EXECUTE FUNCTION public.fin_prepare_category_reporting_class();

CREATE OR REPLACE FUNCTION public.fin_protect_system_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.system_key IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SYSTEM_CATEGORY_IMMUTABLE';
    END IF;
    IF NEW.system_key IS DISTINCT FROM OLD.system_key
      OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
      OR NEW.nome IS DISTINCT FROM OLD.nome
      OR NEW.codigo IS DISTINCT FROM OLD.codigo
      OR NEW.tipo IS DISTINCT FROM OLD.tipo
      OR NEW.ordem IS DISTINCT FROM OLD.ordem
      OR NEW.ativo IS DISTINCT FROM OLD.ativo
      OR NEW.excluir_dos_totais IS DISTINCT FROM OLD.excluir_dos_totais THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SYSTEM_CATEGORY_IMMUTABLE';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_protect_system_category ON public.fin_categorias;
CREATE TRIGGER trg_fin_protect_system_category
BEFORE UPDATE OR DELETE ON public.fin_categorias
FOR EACH ROW EXECUTE FUNCTION public.fin_protect_system_category();

CREATE OR REPLACE FUNCTION public.fin_ensure_non_operational_categories(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_company_id IS NULL OR p_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RETURN;
  END IF;

  INSERT INTO public.fin_categorias
    (company_id, nome, codigo, tipo, parent_id, ordem, ativo, system_key, excluir_dos_totais)
  VALUES
    (p_company_id, 'RECEITAS NÃO OPERACIONAIS', 'NO-R', 'receita', NULL, 9990, true, 'receitas_nao_operacionais', true),
    (p_company_id, 'DESPESAS NÃO OPERACIONAIS', 'NO-D', 'despesa', NULL, 9991, true, 'despesas_nao_operacionais', true)
  ON CONFLICT (company_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fin_ensure_non_operational_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.fin_ensure_non_operational_categories(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_ensure_non_operational_categories ON public.companies;
CREATE TRIGGER trg_fin_ensure_non_operational_categories
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.trg_fin_ensure_non_operational_categories();

SELECT public.fin_ensure_non_operational_categories(id)
FROM public.companies;

-- As categorias fixas não impedem o carregamento posterior do Modelo Padrão.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.seed_default_categories()'::regprocedure) INTO v_def;
  IF position('WHERE company_id = _company_id AND ativo = true;' IN v_def) = 0 THEN
    RAISE EXCEPTION 'seed_default_categories definition changed; migration requires review';
  END IF;
  v_def := replace(
    v_def,
    'WHERE company_id = _company_id AND ativo = true;',
    'WHERE company_id = _company_id AND ativo = true AND system_key IS NULL;'
  );
  EXECUTE v_def;
END;
$$;

-- DRE: mantém as categorias não operacionais e as linhas sem categoria visíveis,
-- deixando para a árvore separar as seções que não compõem os totais.
CREATE OR REPLACE FUNCTION public.get_fin_dre_summary(p_mes text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_inicio date;
  v_fim date;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();
  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:dre:view', 'financeiro:relatorios:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  v_inicio := (p_mes || '-01')::date;
  v_fim := (v_inicio + interval '1 month' - interval '1 day')::date;

  WITH effective_values AS (
    SELECT r.categoria_id, r.valor, l.tipo
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo != 'TRANSFERENCIA'
      AND l.data_competencia BETWEEN v_inicio AND v_fim
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND r.company_id = v_company_id
    UNION ALL
    SELECT l.categoria_id, l.valor, l.tipo
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA' AND l.data_competencia BETWEEN v_inicio AND v_fim
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND NOT EXISTS (SELECT 1 FROM fin_lancamento_rateios r WHERE r.lancamento_id = l.id AND r.company_id = v_company_id)
    UNION ALL
    SELECT r.categoria_id, r.valor, 'DESPESA'
    FROM fin_lancamento_rateios r
    JOIN fin_contas_pagar cp ON cp.id = r.lancamento_id AND cp.company_id = v_company_id
    WHERE cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN v_inicio AND v_fim
      AND r.company_id = v_company_id
    UNION ALL
    SELECT cp.categoria_id, cp.valor, 'DESPESA'
    FROM fin_contas_pagar cp
    WHERE cp.company_id = v_company_id AND cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN v_inicio AND v_fim
      AND NOT EXISTS (SELECT 1 FROM fin_lancamento_rateios r WHERE r.lancamento_id = cp.id AND r.company_id = v_company_id)
    UNION ALL
    SELECT r.categoria_id, r.valor, 'RECEITA'
    FROM fin_lancamento_rateios r
    JOIN fin_contas_receber cr ON cr.id = r.lancamento_id AND cr.company_id = v_company_id
    WHERE cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN v_inicio AND v_fim
      AND r.company_id = v_company_id
    UNION ALL
    SELECT cr.categoria_id, cr.valor, 'RECEITA'
    FROM fin_contas_receber cr
    WHERE cr.company_id = v_company_id AND cr.status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(cr.data_competencia, cr.data_vencimento) BETWEEN v_inicio AND v_fim
      AND NOT EXISTS (SELECT 1 FROM fin_lancamento_rateios r WHERE r.lancamento_id = cr.id AND r.company_id = v_company_id)
  ), por_categoria AS (
    SELECT CASE
      WHEN categoria_id IS NOT NULL THEN categoria_id::text
      WHEN tipo = 'RECEITA' THEN '00000000-0000-0000-0000-000000000101'
      ELSE '00000000-0000-0000-0000-000000000102'
    END cat_id, SUM(valor) total
    FROM effective_values GROUP BY 1
  ), categorias_resultado AS (
    SELECT c.id, c.nome, c.codigo, c.tipo, c.parent_id, c.ordem, c.ativo,
      c.grupo, c.linha_dre, c.centro_custo_padrao_id, c.system_key,
      c.excluir_dos_totais, c.updated_at
    FROM fin_categorias c WHERE c.company_id = v_company_id AND c.ativo = true
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000101'::uuid, 'Sem categoria — Receitas', 'S/C-R',
      'receita', NULL::uuid, 9980, true, NULL, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000101')
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000102'::uuid, 'Sem categoria — Despesas', 'S/C-D',
      'despesa', NULL::uuid, 9981, true, NULL, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000102')
  )
  SELECT jsonb_build_object(
    'mes', p_mes,
    'categorias', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.ordem, c.codigo) FROM categorias_resultado c), '[]'::jsonb),
    'valores_por_categoria', COALESCE((SELECT jsonb_object_agg(cat_id, total) FROM por_categoria), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- DFC: mesma separação, por data efetiva de caixa.
CREATE OR REPLACE FUNCTION public.get_fin_dfc_summary(p_inicio date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_saldo_inicial numeric;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();
  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fluxo:view', 'financeiro:relatorios:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial
  FROM fin_contas WHERE company_id = v_company_id AND ativo = true;
  v_saldo_inicial := v_saldo_inicial + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE -valor END)
    FROM fin_lancamentos
    WHERE company_id = v_company_id AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_inicio
  ), 0);

  WITH effective_values AS (
    SELECT r.categoria_id, r.valor, l.tipo
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    SELECT l.categoria_id, l.valor, l.tipo
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (SELECT 1 FROM fin_lancamento_rateios r WHERE r.lancamento_id = l.id AND r.company_id = v_company_id)
  ), por_categoria AS (
    SELECT CASE
      WHEN categoria_id IS NOT NULL THEN categoria_id::text
      WHEN tipo = 'RECEITA' THEN '00000000-0000-0000-0000-000000000101'
      ELSE '00000000-0000-0000-0000-000000000102'
    END cat_id, SUM(valor) total
    FROM effective_values GROUP BY 1
  ), categorias_resultado AS (
    SELECT c.id, c.nome, c.codigo, c.tipo, c.parent_id, c.ordem, c.ativo,
      c.grupo, c.linha_dre, c.centro_custo_padrao_id, c.system_key,
      c.excluir_dos_totais, c.updated_at
    FROM fin_categorias c WHERE c.company_id = v_company_id AND c.ativo = true
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000101'::uuid, 'Sem categoria — Receitas', 'S/C-R',
      'receita', NULL::uuid, 9980, true, NULL, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000101')
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000102'::uuid, 'Sem categoria — Despesas', 'S/C-D',
      'despesa', NULL::uuid, 9981, true, NULL, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000102')
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_saldo_inicial,
    'categorias', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.ordem, c.codigo) FROM categorias_resultado c), '[]'::jsonb),
    'valores_por_categoria', COALESCE((SELECT jsonb_object_agg(cat_id, total) FROM por_categoria), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_category_is_excluded(
  p_category_id uuid,
  p_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT c.excluir_dos_totais
    FROM public.fin_categorias c
    WHERE c.id = p_category_id AND c.company_id = p_company_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.fin_entity_has_category(
  p_entity_id uuid,
  p_direct_category_id uuid,
  p_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_direct_category_id IS NOT NULL OR EXISTS (
    SELECT 1
    FROM public.fin_lancamento_rateios r
    WHERE r.lancamento_id = p_entity_id
      AND r.company_id = p_company_id
      AND r.categoria_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.fin_set_entity_report_exclusion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.excluir_dos_relatorios := public.fin_category_is_excluded(NEW.categoria_id, NEW.company_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_ensure_non_operational_categories(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_category_is_excluded(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_entity_has_category(uuid, uuid, uuid) FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_fin_lancamentos_report_exclusion ON public.fin_lancamentos;
CREATE TRIGGER trg_fin_lancamentos_report_exclusion
BEFORE INSERT OR UPDATE OF categoria_id, company_id ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.fin_set_entity_report_exclusion();
DROP TRIGGER IF EXISTS trg_fin_contas_pagar_report_exclusion ON public.fin_contas_pagar;
CREATE TRIGGER trg_fin_contas_pagar_report_exclusion
BEFORE INSERT OR UPDATE OF categoria_id, company_id ON public.fin_contas_pagar
FOR EACH ROW EXECUTE FUNCTION public.fin_set_entity_report_exclusion();
DROP TRIGGER IF EXISTS trg_fin_contas_receber_report_exclusion ON public.fin_contas_receber;
CREATE TRIGGER trg_fin_contas_receber_report_exclusion
BEFORE INSERT OR UPDATE OF categoria_id, company_id ON public.fin_contas_receber
FOR EACH ROW EXECUTE FUNCTION public.fin_set_entity_report_exclusion();

CREATE OR REPLACE FUNCTION public.fin_recompute_entity_report_exclusion(
  p_entity_id uuid,
  p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_min boolean;
  v_max boolean;
  v_excluded boolean;
BEGIN
  SELECT min(c.excluir_dos_totais::int) = 1,
         max(c.excluir_dos_totais::int) = 1
  INTO v_min, v_max
  FROM public.fin_lancamento_rateios r
  JOIN public.fin_categorias c
    ON c.id = r.categoria_id AND c.company_id = p_company_id
  WHERE r.lancamento_id = p_entity_id AND r.company_id = p_company_id;

  IF v_min IS DISTINCT FROM v_max THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RATEIO_MIXED_REPORTING_CLASS';
  END IF;

  IF v_min IS NOT NULL THEN
    v_excluded := v_min;
  ELSE
    SELECT public.fin_category_is_excluded(x.categoria_id, p_company_id)
    INTO v_excluded
    FROM (
      SELECT categoria_id FROM public.fin_lancamentos WHERE id = p_entity_id AND company_id = p_company_id
      UNION ALL
      SELECT categoria_id FROM public.fin_contas_pagar WHERE id = p_entity_id AND company_id = p_company_id
      UNION ALL
      SELECT categoria_id FROM public.fin_contas_receber WHERE id = p_entity_id AND company_id = p_company_id
      LIMIT 1
    ) x;
  END IF;
  v_excluded := COALESCE(v_excluded, false);

  UPDATE public.fin_lancamentos
  SET excluir_dos_relatorios = v_excluded
  WHERE id = p_entity_id AND company_id = p_company_id
    AND excluir_dos_relatorios IS DISTINCT FROM v_excluded;
  UPDATE public.fin_contas_pagar
  SET excluir_dos_relatorios = v_excluded
  WHERE id = p_entity_id AND company_id = p_company_id
    AND excluir_dos_relatorios IS DISTINCT FROM v_excluded;
  UPDATE public.fin_contas_receber
  SET excluir_dos_relatorios = v_excluded
  WHERE id = p_entity_id AND company_id = p_company_id
    AND excluir_dos_relatorios IS DISTINCT FROM v_excluded;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fin_rateio_report_exclusion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.fin_recompute_entity_report_exclusion(OLD.lancamento_id, OLD.company_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.fin_recompute_entity_report_exclusion(NEW.lancamento_id, NEW.company_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_rateio_report_exclusion ON public.fin_lancamento_rateios;
CREATE TRIGGER trg_fin_rateio_report_exclusion
AFTER INSERT OR UPDATE OR DELETE ON public.fin_lancamento_rateios
FOR EACH ROW EXECUTE FUNCTION public.trg_fin_rateio_report_exclusion();

CREATE OR REPLACE FUNCTION public.trg_fin_category_propagate_reporting_class()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    WITH RECURSIVE descendants AS (
      SELECT id FROM public.fin_categorias WHERE parent_id = NEW.id AND company_id = NEW.company_id
      UNION ALL
      SELECT c.id
      FROM public.fin_categorias c
      JOIN descendants d ON c.parent_id = d.id
      WHERE c.company_id = NEW.company_id
    )
    UPDATE public.fin_categorias c
    SET excluir_dos_totais = NEW.excluir_dos_totais
    WHERE c.id IN (SELECT id FROM descendants)
      AND c.excluir_dos_totais IS DISTINCT FROM NEW.excluir_dos_totais;
  END IF;

  PERFORM public.fin_recompute_entity_report_exclusion(x.entity_id, NEW.company_id)
  FROM (
    SELECT id AS entity_id FROM public.fin_lancamentos WHERE company_id = NEW.company_id AND categoria_id = NEW.id
    UNION
    SELECT id FROM public.fin_contas_pagar WHERE company_id = NEW.company_id AND categoria_id = NEW.id
    UNION
    SELECT id FROM public.fin_contas_receber WHERE company_id = NEW.company_id AND categoria_id = NEW.id
    UNION
    SELECT lancamento_id FROM public.fin_lancamento_rateios WHERE company_id = NEW.company_id AND categoria_id = NEW.id
  ) x;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_category_propagate_reporting_class ON public.fin_categorias;
CREATE TRIGGER trg_fin_category_propagate_reporting_class
AFTER INSERT OR UPDATE OF parent_id, excluir_dos_totais ON public.fin_categorias
FOR EACH ROW EXECUTE FUNCTION public.trg_fin_category_propagate_reporting_class();

-- Backfill dos marcadores materializados usados pelos agregados.
UPDATE public.fin_lancamentos l
SET excluir_dos_relatorios = public.fin_category_is_excluded(l.categoria_id, l.company_id)
WHERE l.excluir_dos_relatorios IS DISTINCT FROM public.fin_category_is_excluded(l.categoria_id, l.company_id);
UPDATE public.fin_contas_pagar cp
SET excluir_dos_relatorios = public.fin_category_is_excluded(cp.categoria_id, cp.company_id)
WHERE cp.excluir_dos_relatorios IS DISTINCT FROM public.fin_category_is_excluded(cp.categoria_id, cp.company_id);
UPDATE public.fin_contas_receber cr
SET excluir_dos_relatorios = public.fin_category_is_excluded(cr.categoria_id, cr.company_id)
WHERE cr.excluir_dos_relatorios IS DISTINCT FROM public.fin_category_is_excluded(cr.categoria_id, cr.company_id);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT lancamento_id, company_id FROM public.fin_lancamento_rateios LOOP
    PERFORM public.fin_recompute_entity_report_exclusion(r.lancamento_id, r.company_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fin_require_category_on_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'fin_lancamentos' THEN
    IF NEW.conciliado IS TRUE
      AND OLD.conciliado IS DISTINCT FROM true
      AND NEW.tipo <> 'TRANSFERENCIA'
      AND NOT public.fin_entity_has_category(NEW.id, NEW.categoria_id, NEW.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: selecione uma categoria antes de conciliar';
    END IF;
  ELSIF TG_TABLE_NAME = 'fin_contas_pagar' THEN
    IF NEW.status = 'PAGO' AND OLD.status IS DISTINCT FROM 'PAGO'
      AND NOT public.fin_entity_has_category(NEW.id, NEW.categoria_id, NEW.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: selecione uma categoria antes de conciliar';
    END IF;
  ELSIF TG_TABLE_NAME = 'fin_contas_receber' THEN
    IF NEW.status = 'RECEBIDO' AND OLD.status IS DISTINCT FROM 'RECEBIDO'
      AND NOT public.fin_entity_has_category(NEW.id, NEW.categoria_id, NEW.company_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: selecione uma categoria antes de conciliar';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_require_category_on_reconciliation ON public.fin_lancamentos;
CREATE TRIGGER trg_fin_require_category_on_reconciliation
BEFORE UPDATE OF conciliado ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.trg_fin_require_category_on_reconciliation();
DROP TRIGGER IF EXISTS trg_fin_require_category_on_reconciliation ON public.fin_contas_pagar;
CREATE TRIGGER trg_fin_require_category_on_reconciliation
BEFORE UPDATE OF status ON public.fin_contas_pagar
FOR EACH ROW EXECUTE FUNCTION public.trg_fin_require_category_on_reconciliation();
DROP TRIGGER IF EXISTS trg_fin_require_category_on_reconciliation ON public.fin_contas_receber;
CREATE TRIGGER trg_fin_require_category_on_reconciliation
BEFORE UPDATE OF status ON public.fin_contas_receber
FOR EACH ROW EXECUTE FUNCTION public.trg_fin_require_category_on_reconciliation();

CREATE OR REPLACE FUNCTION public.reconcile_batch_lancamentos(p_lancamento_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_count int;
  v_missing int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED: Usuário não autenticado'; END IF;
  v_company_id := public.assert_tenant();
  IF NOT public.has_any_permission(v_user_id, ARRAY['financeiro:conciliacao:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:manage necessário';
  END IF;

  SELECT count(*) INTO v_missing
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND l.id = ANY(p_lancamento_ids)
    AND l.tipo <> 'TRANSFERENCIA'
    AND NOT public.fin_entity_has_category(l.id, l.categoria_id, l.company_id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format('CATEGORY_REQUIRED: %s lançamento(s) sem categoria', v_missing);
  END IF;

  UPDATE public.fin_lancamentos
  SET conciliado = true, conciliado_em = now(), conciliado_por = v_user_id
  WHERE company_id = v_company_id AND id = ANY(p_lancamento_ids)
    AND conciliado IS DISTINCT FROM true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO public.fin_audit_logs (entidade, acao, user_id, company_id, depois)
    VALUES ('lancamentos', 'reconcile_batch', v_user_id, v_company_id,
      jsonb_build_object('count', v_count, 'ids', p_lancamento_ids, 'category_validation', 'passed'));
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'reconciled_count', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_batch_lancamentos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_batch_lancamentos(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(
  p_data date, p_descricao text, p_valor numeric, p_tipo text,
  p_conta_id uuid, p_user_id uuid, p_rateio_linhas jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lancamento_id uuid;
  v_idem_key text;
  v_company uuid;
  v_uid uuid;
  v_rateio_item jsonb;
  v_cat_id uuid;
  v_cc_id uuid;
  v_invalid_categories int;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(v_uid, 'finance:manage') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_tipo NOT IN ('RECEITA', 'DESPESA', 'TRANSFERENCIA') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  IF p_tipo <> 'TRANSFERENCIA' THEN
    IF p_rateio_linhas IS NULL OR jsonb_typeof(p_rateio_linhas) <> 'array' OR jsonb_array_length(p_rateio_linhas) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: selecione uma categoria antes de conciliar';
    END IF;
    SELECT count(*) INTO v_invalid_categories
    FROM jsonb_array_elements(p_rateio_linhas) item
    LEFT JOIN public.fin_categorias c
      ON c.id = NULLIF(item->>'categoria_id', '')::uuid
      AND c.company_id = v_company AND c.ativo = true
    WHERE c.id IS NULL
      OR c.tipo <> lower(p_tipo);
    IF v_invalid_categories > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: categoria inválida ou incompatível com o tipo';
    END IF;
  END IF;

  v_idem_key := md5(v_company::text || p_data::text || p_descricao || p_valor::text || p_tipo || p_conta_id::text);
  SELECT id INTO v_lancamento_id FROM public.fin_lancamentos
  WHERE idempotency_key = v_idem_key AND company_id = v_company;
  IF v_lancamento_id IS NOT NULL THEN
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid
    WHERE id = v_lancamento_id;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END IF;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) = 1 THEN
    v_cat_id := NULLIF(p_rateio_linhas->0->>'categoria_id', '')::uuid;
    v_cc_id := NULLIF(p_rateio_linhas->0->>'centro_custo_id', '')::uuid;
  END IF;

  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao, conta_id,
    forma_pagamento, status, conciliado, conciliado_em, conciliado_por,
    created_by, idempotency_key, company_id, origem, categoria_id, centro_custo_id
  ) VALUES (
    p_tipo, p_valor, p_data, p_data, p_descricao, p_conta_id,
    'extrato', 'REALIZADO', true, now(), v_uid,
    v_uid, v_idem_key, v_company, 'conciliacao', v_cat_id, v_cc_id
  ) RETURNING id INTO v_lancamento_id;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 0 THEN
    FOR v_rateio_item IN SELECT * FROM jsonb_array_elements(p_rateio_linhas) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id
      ) VALUES (
        v_lancamento_id, (v_rateio_item->>'categoria_id')::uuid,
        NULLIF(v_rateio_item->>'centro_custo_id', '')::uuid,
        (v_rateio_item->>'valor')::numeric, (v_rateio_item->>'percentual')::numeric,
        v_rateio_item->>'observacao', v_company
      );
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', v_lancamento_id, 'reconcile_import', v_uid, v_company,
    jsonb_build_object('valor', p_valor, 'tipo', p_tipo, 'data', p_data,
      'descricao', p_descricao, 'categoria_id', v_cat_id, 'rateios', p_rateio_linhas,
      'category_validation', 'passed'));
  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb) TO authenticated;

-- Todos os agregados financeiros usam as linhas materializadas já filtradas.
-- DRE/DFC são exceção: recebem todas as linhas para exibir as seções informativas.
DO $$
DECLARE
  v_sig text;
  v_def text;
  v_l_filtered constant text := '(SELECT * FROM public.fin_lancamentos WHERE excluir_dos_relatorios IS NOT TRUE)';
  v_cp_filtered constant text := '(SELECT * FROM public.fin_contas_pagar WHERE excluir_dos_relatorios IS NOT TRUE)';
  v_cr_filtered constant text := '(SELECT * FROM public.fin_contas_receber WHERE excluir_dos_relatorios IS NOT TRUE)';
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_fin_alertas()',
    'public.get_fin_cashflow(date,date)',
    'public.get_fin_counts_by_status(date,date)',
    'public.get_fin_dashboard_charts(date,date)',
    'public.get_fin_dashboard_summary(date,date)',
    'public.get_fin_fluxo_projecao(integer,numeric)',
    'public.get_fin_kpis(date,date)',
    'public.get_fin_kpis(integer)',
    'public.get_fin_lancamentos_totais(date,date,text,uuid,text,uuid,boolean)',
    'public.orcamento_execucao_mensal(text)',
    'public.relatorio_socios_resumo(text)',
    'public.comparativo_periodos(text,text)'
  ] LOOP
    SELECT pg_get_functiondef(v_sig::regprocedure) INTO v_def;

    -- Saldos bancários/base continuam refletindo dinheiro real, inclusive não operacional.
    IF v_sig = 'public.get_fin_dashboard_summary(date,date)' THEN
      v_def := regexp_replace(v_def, 'public\.fin_lancamentos', '__KEEP_L__', 1, 3);
    ELSIF v_sig = 'public.get_fin_cashflow(date,date)' THEN
      v_def := regexp_replace(v_def, '\mfin_lancamentos\M', '__KEEP_L__', 1, 1);
    ELSIF v_sig = 'public.get_fin_fluxo_projecao(integer,numeric)' THEN
      v_def := regexp_replace(v_def, '\mfin_lancamentos\M', '__KEEP_L__', 1, 1);
    END IF;

    v_def := replace(v_def, 'public.fin_lancamentos', '__QL__');
    v_def := replace(v_def, 'public.fin_contas_pagar', '__QCP__');
    v_def := replace(v_def, 'public.fin_contas_receber', '__QCR__');
    v_def := regexp_replace(v_def, '\mfin_lancamentos\M', '__UL__', 'g');
    v_def := regexp_replace(v_def, '\mfin_contas_pagar\M', '__UCP__', 'g');
    v_def := regexp_replace(v_def, '\mfin_contas_receber\M', '__UCR__', 'g');
    v_def := replace(v_def, '__QL__', v_l_filtered);
    v_def := replace(v_def, '__UL__', v_l_filtered);
    v_def := replace(v_def, '__QCP__', v_cp_filtered);
    v_def := replace(v_def, '__UCP__', v_cp_filtered);
    v_def := replace(v_def, '__QCR__', v_cr_filtered);
    v_def := replace(v_def, '__UCR__', v_cr_filtered);
    v_def := replace(v_def, '__KEEP_L__', 'public.fin_lancamentos');

    IF position('excluir_dos_relatorios IS NOT TRUE' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Report function % was not patched', v_sig;
    END IF;
    EXECUTE v_def;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_recompute_entity_report_exclusion(uuid, uuid) FROM PUBLIC;
