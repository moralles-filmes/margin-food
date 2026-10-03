-- Forma de venda por marca (PEDIDOS ou PESSOAS) e quantidade no fechamento.
-- A marca define como a operacao e medida; cada fechamento guarda a
-- quantidade do dia e uma copia da forma vigente, para que trocar a forma
-- da marca depois nao reinterprete o historico.
-- Tudo aditivo: marcas e fechamentos legados continuam validos sem os campos.

ALTER TABLE public.financeiro_fechamento_marcas
  ADD COLUMN IF NOT EXISTS forma_venda text;

ALTER TABLE public.financeiro_fechamento_marcas
  DROP CONSTRAINT IF EXISTS financeiro_fechamento_marcas_forma_venda_check;

ALTER TABLE public.financeiro_fechamento_marcas
  ADD CONSTRAINT financeiro_fechamento_marcas_forma_venda_check
  CHECK (forma_venda IS NULL OR forma_venda IN ('PEDIDOS', 'PESSOAS'));

ALTER TABLE public.financeiro_fechamento_marca_valores
  ADD COLUMN IF NOT EXISTS quantidade integer,
  ADD COLUMN IF NOT EXISTS forma_venda text;

ALTER TABLE public.financeiro_fechamento_marca_valores
  DROP CONSTRAINT IF EXISTS financeiro_fechamento_marca_valores_forma_venda_check;

ALTER TABLE public.financeiro_fechamento_marca_valores
  ADD CONSTRAINT financeiro_fechamento_marca_valores_forma_venda_check
  CHECK (forma_venda IS NULL OR forma_venda IN ('PEDIDOS', 'PESSOAS'));

-- Quantidade e forma andam juntas: sem a forma, o numero nao tem unidade.
ALTER TABLE public.financeiro_fechamento_marca_valores
  DROP CONSTRAINT IF EXISTS financeiro_fechamento_marca_valores_quantidade_check;

ALTER TABLE public.financeiro_fechamento_marca_valores
  ADD CONSTRAINT financeiro_fechamento_marca_valores_quantidade_check
  CHECK (
    (quantidade IS NULL AND forma_venda IS NULL)
    OR (quantidade IS NOT NULL AND quantidade >= 0 AND forma_venda IS NOT NULL)
  );

-- Obrigatoria em marca nova; marca legada sem forma continua valida enquanto
-- o UPDATE nao tocar a coluna (mesmo criterio do vinculo de categoria).
CREATE OR REPLACE FUNCTION public.validate_marca_forma_venda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.forma_venda IS NULL THEN
    RAISE EXCEPTION 'FORMA_VENDA_OBRIGATORIA';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_marca_forma_venda
  ON public.financeiro_fechamento_marcas;

CREATE TRIGGER trg_validate_marca_forma_venda
  BEFORE INSERT OR UPDATE OF forma_venda
  ON public.financeiro_fechamento_marcas
  FOR EACH ROW EXECUTE FUNCTION public.validate_marca_forma_venda();

-- PL/pgSQL resolve nomes de colunas tardiamente. Este bloco faz o deploy
-- validar o JOIN e as colunas novas usados pela RPC.
DO $migration_validation$
BEGIN
  PERFORM m.id, m.forma_venda
  FROM jsonb_array_elements('[]'::jsonb) AS t(item)
  JOIN public.financeiro_fechamento_marcas m
    ON m.id = (item->>'marca_id')::uuid
   AND m.company_id IS NOT NULL
  WHERE false;

  PERFORM v.quantidade, v.forma_venda
  FROM public.financeiro_fechamento_marca_valores v
  WHERE false;
END;
$migration_validation$;

-- Mesma assinatura: p_marcas passa a aceitar "quantidade" (inteiro >= 0,
-- opcional) em cada item. Cliente antigo que nao envia a chave continua
-- funcionando: a quantidade ja gravada no dia e preservada, nunca apagada.
-- "quantidade": null explicito limpa o valor.
CREATE OR REPLACE FUNCTION public.rpc_upsert_fechamento_caixa_com_marcas(
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
  v_old jsonb;
  v_inserted integer := 0;
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
      WHERE (item->>'quantidade') IS NOT NULL
        AND (item->>'quantidade') !~ '^[0-9]{1,9}$'
    ) THEN
      RAISE EXCEPTION 'QUANTIDADE_INVALIDA';
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

  -- O detalhamento e regravado por inteiro; guarda quantidade/forma atuais
  -- para nao perder o que o payload nao informa.
  SELECT COALESCE(
    jsonb_object_agg(v.marca_id::text, jsonb_build_object('q', v.quantidade, 'f', v.forma_venda)),
    '{}'::jsonb
  )
  INTO v_old
  FROM public.financeiro_fechamento_marca_valores v
  WHERE v.company_id = v_company_id
    AND v.fechamento_id = v_id;

  DELETE FROM public.financeiro_fechamento_marca_valores
  WHERE company_id = v_company_id
    AND fechamento_id = v_id;

  -- Quantidade: a do payload; sem a chave (cliente antigo), a ja gravada.
  -- Forma: a que o dia ja tinha vale mais que a atual da marca — trocar a
  -- forma da marca nao reinterpreta um dia ja lancado. Sem forma, a
  -- quantidade nao tem unidade e nao e gravada.
  INSERT INTO public.financeiro_fechamento_marca_valores (
    company_id, fechamento_id, marca_id, valor_bruto, quantidade, forma_venda, created_by
  )
  SELECT
    v_company_id,
    v_id,
    m.id,
    round((item->>'valor')::numeric, 2),
    CASE WHEN n.f IS NOT NULL THEN n.q END,
    CASE WHEN n.q IS NOT NULL THEN n.f END,
    auth.uid()
  FROM jsonb_array_elements(v_marcas) AS t(item)
  JOIN public.financeiro_fechamento_marcas m
    ON m.id = (item->>'marca_id')::uuid
   AND m.company_id = v_company_id
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN item ? 'quantidade' THEN (item->>'quantidade')::integer
        ELSE (v_old->(m.id::text)->>'q')::integer
      END AS q,
      COALESCE(v_old->(m.id::text)->>'f', m.forma_venda) AS f
  ) AS n;

  -- O JOIN nao pode descartar em silencio uma marca removida entre a
  -- validacao e a gravacao.
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> jsonb_array_length(v_marcas) THEN
    RAISE EXCEPTION 'MARCA_INVALIDA';
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'action', v_action,
    'total_marcas', round(v_total_marcas, 2),
    'quantidade_marcas', jsonb_array_length(v_marcas)
  );
END;
$$;

COMMENT ON COLUMN public.financeiro_fechamento_marcas.forma_venda IS
  'Como a operacao e medida no fechamento: PEDIDOS ou PESSOAS. Nulo apenas em marca legada.';

COMMENT ON COLUMN public.financeiro_fechamento_marca_valores.quantidade IS
  'Quantidade de pedidos ou pessoas do dia para a marca, conforme forma_venda desta linha.';

COMMENT ON COLUMN public.financeiro_fechamento_marca_valores.forma_venda IS
  'Copia da forma de venda da marca no momento do fechamento; preserva o historico se a marca mudar.';

NOTIFY pgrst, 'reload schema';
