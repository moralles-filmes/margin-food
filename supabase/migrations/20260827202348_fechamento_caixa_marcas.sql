-- Detalhamento do fechamento de caixa por marca / dark kitchen.
-- O total oficial continua em financeiro_fechamento_caixa; os valores abaixo
-- apenas explicam a composicao do faturamento bruto sem duplicar receita.

CREATE TABLE public.financeiro_fechamento_marcas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  nome_unaccent text GENERATED ALWAYS AS (lower(public.immutable_unaccent(nome))) STORED,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_fechamento_marcas_nome_check
    CHECK (char_length(btrim(nome)) BETWEEN 1 AND 100),
  CONSTRAINT financeiro_fechamento_marcas_company_id_id_key
    UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX financeiro_fechamento_marcas_nome_unique
  ON public.financeiro_fechamento_marcas (company_id, lower(btrim(nome)));

CREATE INDEX financeiro_fechamento_marcas_company_order_idx
  ON public.financeiro_fechamento_marcas (company_id, ativo DESC, ordem, nome);

CREATE INDEX financeiro_fechamento_marcas_nome_unaccent_trgm_idx
  ON public.financeiro_fechamento_marcas
  USING gin (nome_unaccent public.gin_trgm_ops);

-- A FK composta impede que um detalhe aponte para fechamento ou marca de
-- outra empresa, mesmo que um UUID externo seja conhecido.
CREATE UNIQUE INDEX IF NOT EXISTS financeiro_fechamento_caixa_company_id_id_key
  ON public.financeiro_fechamento_caixa (company_id, id);

CREATE TABLE public.financeiro_fechamento_marca_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fechamento_id uuid NOT NULL,
  marca_id uuid NOT NULL,
  valor_bruto numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financeiro_fechamento_marca_valores_nonnegative
    CHECK (valor_bruto >= 0),
  CONSTRAINT financeiro_fechamento_marca_valores_unique
    UNIQUE (company_id, fechamento_id, marca_id),
  CONSTRAINT financeiro_fechamento_marca_valores_fechamento_fk
    FOREIGN KEY (company_id, fechamento_id)
    REFERENCES public.financeiro_fechamento_caixa (company_id, id)
    ON DELETE CASCADE,
  CONSTRAINT financeiro_fechamento_marca_valores_marca_fk
    FOREIGN KEY (company_id, marca_id)
    REFERENCES public.financeiro_fechamento_marcas (company_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX financeiro_fechamento_marca_valores_fechamento_idx
  ON public.financeiro_fechamento_marca_valores (company_id, fechamento_id);

CREATE INDEX financeiro_fechamento_marca_valores_marca_idx
  ON public.financeiro_fechamento_marca_valores (company_id, marca_id);

GRANT ALL ON TABLE public.financeiro_fechamento_marcas TO authenticated, service_role;
GRANT ALL ON TABLE public.financeiro_fechamento_marca_valores TO authenticated, service_role;

ALTER TABLE public.financeiro_fechamento_marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_fechamento_marcas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_fechamento_marca_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_fechamento_marca_valores FORCE ROW LEVEL SECURITY;

CREATE POLICY "fechamento_marcas_select"
  ON public.financeiro_fechamento_marcas
  FOR SELECT TO authenticated
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'finance:read',
      'financeiro:fechamento:view',
      'system:global:manage'
    ]))
  );

CREATE POLICY "fechamento_marcas_insert"
  ON public.financeiro_fechamento_marcas
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'finance:manage',
      'financeiro:fechamento:create',
      'system:global:manage'
    ]))
  );

CREATE POLICY "fechamento_marcas_update"
  ON public.financeiro_fechamento_marcas
  FOR UPDATE TO authenticated
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'finance:manage',
      'financeiro:fechamento:edit',
      'system:global:manage'
    ]))
  )
  WITH CHECK (
    company_id = (select public.get_current_company_id())
  );

CREATE POLICY "fechamento_marcas_delete"
  ON public.financeiro_fechamento_marcas
  FOR DELETE TO authenticated
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'finance:manage',
      'financeiro:fechamento:delete',
      'system:global:manage'
    ]))
  );

CREATE POLICY "fechamento_marca_valores_select"
  ON public.financeiro_fechamento_marca_valores
  FOR SELECT TO authenticated
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'finance:read',
      'financeiro:fechamento:view',
      'system:global:manage'
    ]))
  );

CREATE POLICY "fechamento_marca_valores_insert"
  ON public.financeiro_fechamento_marca_valores
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'finance:manage',
      'financeiro:fechamento:create',
      'financeiro:fechamento:edit',
      'system:global:manage'
    ]))
  );

CREATE POLICY "fechamento_marca_valores_update"
  ON public.financeiro_fechamento_marca_valores
  FOR UPDATE TO authenticated
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'finance:manage',
      'financeiro:fechamento:edit',
      'system:global:manage'
    ]))
  )
  WITH CHECK (
    company_id = (select public.get_current_company_id())
  );

CREATE POLICY "fechamento_marca_valores_delete"
  ON public.financeiro_fechamento_marca_valores
  FOR DELETE TO authenticated
  USING (
    company_id = (select public.get_current_company_id())
    AND (select public.has_any_permission(auth.uid(), ARRAY[
      'finance:manage',
      'financeiro:fechamento:edit',
      'financeiro:fechamento:delete',
      'system:global:manage'
    ]))
  );

CREATE TRIGGER financeiro_fechamento_marcas_updated_at
  BEFORE UPDATE ON public.financeiro_fechamento_marcas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER financeiro_fechamento_marca_valores_updated_at
  BEFORE UPDATE ON public.financeiro_fechamento_marca_valores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER financeiro_fechamento_marcas_block_placeholder_company
  BEFORE INSERT OR UPDATE ON public.financeiro_fechamento_marcas
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();

CREATE TRIGGER financeiro_fechamento_marca_valores_block_placeholder_company
  BEFORE INSERT OR UPDATE ON public.financeiro_fechamento_marca_valores
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();

-- Garante a invariavel mesmo se um cliente antigo chamar a RPC legada ou se
-- os detalhes forem alterados diretamente. Sem detalhes, fechamentos legados
-- continuam validos; existindo ao menos uma linha, a soma precisa fechar.
CREATE FUNCTION public.validate_fechamento_marca_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_fechamento_id uuid;
  v_company_id uuid;
  v_faturamento_bruto numeric;
  v_total_marcas numeric;
  v_quantidade integer;
BEGIN
  IF TG_TABLE_NAME = 'financeiro_fechamento_caixa' THEN
    IF TG_OP = 'DELETE' THEN
      v_fechamento_id := OLD.id;
      v_company_id := OLD.company_id;
    ELSE
      v_fechamento_id := NEW.id;
      v_company_id := NEW.company_id;
    END IF;
  ELSE
    IF TG_OP = 'UPDATE'
       AND (OLD.company_id, OLD.fechamento_id, OLD.marca_id)
           IS DISTINCT FROM (NEW.company_id, NEW.fechamento_id, NEW.marca_id) THEN
      RAISE EXCEPTION 'IDENTIDADE_MARCA_VALOR_IMUTAVEL';
    END IF;

    IF TG_OP = 'DELETE' THEN
      v_fechamento_id := OLD.fechamento_id;
      v_company_id := OLD.company_id;
    ELSE
      v_fechamento_id := NEW.fechamento_id;
      v_company_id := NEW.company_id;
    END IF;
  END IF;

  SELECT fc.faturamento_bruto
  INTO v_faturamento_bruto
  FROM public.financeiro_fechamento_caixa fc
  WHERE fc.id = v_fechamento_id
    AND fc.company_id = v_company_id;

  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT count(*), COALESCE(sum(v.valor_bruto), 0)
  INTO v_quantidade, v_total_marcas
  FROM public.financeiro_fechamento_marca_valores v
  WHERE v.fechamento_id = v_fechamento_id
    AND v.company_id = v_company_id;

  IF v_quantidade > 0
     AND round(v_total_marcas, 2) <> round(v_faturamento_bruto, 2) THEN
    RAISE EXCEPTION 'TOTAL_MARCAS_DIVERGENTE';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER financeiro_fechamento_caixa_marca_total_check
  AFTER INSERT OR UPDATE ON public.financeiro_fechamento_caixa
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_fechamento_marca_total();

CREATE CONSTRAINT TRIGGER financeiro_fechamento_marca_valores_total_check
  AFTER INSERT OR UPDATE OR DELETE ON public.financeiro_fechamento_marca_valores
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_fechamento_marca_total();

-- PL/pgSQL resolve nomes de colunas tardiamente. Este bloco faz o deploy
-- validar os JOINs usados pela RPC antes de qualquer chamada em producao.
DO $migration_validation$
BEGIN
  PERFORM m.id
  FROM jsonb_array_elements('[]'::jsonb) AS t(item)
  LEFT JOIN public.financeiro_fechamento_marcas m
    ON m.id = (item->>'marca_id')::uuid
   AND m.company_id IS NOT NULL
  WHERE false;

  PERFORM fc.id, fc.updated_at
  FROM public.financeiro_fechamento_caixa fc
  WHERE false;
END;
$migration_validation$;

-- Salva o fechamento e todo o detalhamento por marca na mesma transacao.
CREATE FUNCTION public.rpc_upsert_fechamento_caixa_com_marcas(
  p_data date,
  p_faturamento_bruto numeric,
  p_taxas numeric DEFAULT 0,
  p_descontos numeric DEFAULT 0,
  p_observacao text DEFAULT NULL,
  p_marcas jsonb DEFAULT '[]'::jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
  v_action text;
  v_company_id uuid;
  v_existing record;
  v_marcas jsonb := COALESCE(p_marcas, '[]'::jsonb);
  v_total_marcas numeric := 0;
  v_marca_count integer := 0;
BEGIN
  v_company_id := public.assert_tenant();

  IF p_faturamento_bruto IS NULL OR p_faturamento_bruto < 0 THEN
    RAISE EXCEPTION 'Faturamento bruto não pode ser negativo.';
  END IF;
  IF COALESCE(p_taxas, 0) < 0 THEN
    RAISE EXCEPTION 'Taxas não podem ser negativas.';
  END IF;
  IF COALESCE(p_descontos, 0) < 0 THEN
    RAISE EXCEPTION 'Descontos não podem ser negativos.';
  END IF;
  IF COALESCE(p_descontos, 0) > p_faturamento_bruto THEN
    RAISE EXCEPTION 'Descontos não podem ser maiores que o faturamento bruto.';
  END IF;
  IF jsonb_typeof(v_marcas) <> 'array' THEN
    RAISE EXCEPTION 'MARCAS_INVALIDAS';
  END IF;

  IF jsonb_array_length(v_marcas) > 0 THEN
    BEGIN
      SELECT
        count(*),
        COALESCE(sum((item->>'valor')::numeric), 0)
      INTO v_marca_count, v_total_marcas
      FROM jsonb_array_elements(v_marcas) AS t(item)
      WHERE item ? 'marca_id'
        AND item ? 'valor'
        AND (item->>'valor')::numeric >= 0;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'MARCAS_INVALIDAS';
    END;

    IF v_marca_count <> jsonb_array_length(v_marcas) THEN
      RAISE EXCEPTION 'MARCAS_INVALIDAS';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_marcas) AS t(item)
      GROUP BY item->>'marca_id'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'MARCA_DUPLICADA';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_marcas) AS t(item)
      LEFT JOIN public.financeiro_fechamento_marcas m
        ON m.id = (item->>'marca_id')::uuid
       AND m.company_id = v_company_id
      WHERE m.id IS NULL
    ) THEN
      RAISE EXCEPTION 'MARCA_INVALIDA';
    END IF;

    IF round(v_total_marcas, 2) <> round(p_faturamento_bruto, 2) THEN
      RAISE EXCEPTION 'TOTAL_MARCAS_DIVERGENTE';
    END IF;
  END IF;

  SELECT id, updated_at
  INTO v_existing
  FROM public.financeiro_fechamento_caixa
  WHERE data = p_data
    AND company_id = v_company_id
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF NOT public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:fechamento:edit',
      'finance:manage',
      'system:global:manage'
    ]) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;
    IF p_expected_updated_at IS NOT NULL
       AND v_existing.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
    END IF;

    UPDATE public.financeiro_fechamento_caixa
    SET faturamento_bruto = round(p_faturamento_bruto, 2),
        taxas = round(COALESCE(p_taxas, 0), 2),
        descontos = round(COALESCE(p_descontos, 0), 2),
        observacao = p_observacao,
        updated_at = now()
    WHERE id = v_existing.id;

    v_id := v_existing.id;
    v_action := 'update';
  ELSE
    IF NOT public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:fechamento:create',
      'finance:manage',
      'system:global:manage'
    ]) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    INSERT INTO public.financeiro_fechamento_caixa (
      data, faturamento_bruto, taxas, descontos, observacao, created_by, company_id
    ) VALUES (
      p_data,
      round(p_faturamento_bruto, 2),
      round(COALESCE(p_taxas, 0), 2),
      round(COALESCE(p_descontos, 0), 2),
      p_observacao,
      auth.uid(),
      v_company_id
    )
    RETURNING id INTO v_id;

    v_action := 'create';
  END IF;

  DELETE FROM public.financeiro_fechamento_marca_valores
  WHERE company_id = v_company_id
    AND fechamento_id = v_id;

  INSERT INTO public.financeiro_fechamento_marca_valores (
    company_id, fechamento_id, marca_id, valor_bruto, created_by
  )
  SELECT
    v_company_id,
    v_id,
    (item->>'marca_id')::uuid,
    round((item->>'valor')::numeric, 2),
    auth.uid()
  FROM jsonb_array_elements(v_marcas) AS t(item);

  RETURN jsonb_build_object(
    'id', v_id,
    'action', v_action,
    'total_marcas', round(v_total_marcas, 2),
    'quantidade_marcas', jsonb_array_length(v_marcas)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_upsert_fechamento_caixa_com_marcas(
  date, numeric, numeric, numeric, text, jsonb, timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_upsert_fechamento_caixa_com_marcas(
  date, numeric, numeric, numeric, text, jsonb, timestamptz
) TO authenticated;

COMMENT ON TABLE public.financeiro_fechamento_marcas IS
  'Marcas, saloes e dark kitchens configuraveis por empresa para detalhar o fechamento diario.';

COMMENT ON TABLE public.financeiro_fechamento_marca_valores IS
  'Composicao do faturamento bruto de um fechamento por marca, sem gerar receita adicional.';

NOTIFY pgrst, 'reload schema';
