-- Vincula cada marca/dark kitchen do Fechamento de Caixa a uma categoria
-- financeira folha do Cadastro Base (RECEITA, operacional).
--
-- Sem esse vinculo o sistema nao sabe quais lancamentos do livro
-- razao/importacao de extrato pertencem a cada loja, o que impede mostrar
-- faturamento liquido por loja na Apresentacao Socios. O vinculo NAO cria
-- receita nova nem substitui financeiro_fechamento_marca_valores — apenas
-- aponta para onde, no razao, essa marca e reconhecida.
--
-- Regras (decididas com o usuario):
--   * Uma marca aponta para UMA categoria; varias marcas podem apontar
--     para a MESMA categoria (ex.: "Vendas Salao" e "Vendas Jantar" caem
--     na mesma categoria do extrato) — a leitura por loja soma as marcas
--     do mesmo grupo, sem rateio.
--   * So e permitido vincular a um no-folha: categoria sem sub-categoria,
--     ou sub-categoria sem item.
--   * Obrigatorio para marcas novas (INSERT). Marcas legadas continuam
--     validas sem vinculo — a UI avisa, o banco so bloqueia quando alguem
--     tenta gravar categoria_id NULL explicitamente.

-- 1) Pre-requisito da FK composta anti-cross-tenant (mesmo padrao usado
--    para financeiro_fechamento_caixa em 20260827202348).
CREATE UNIQUE INDEX IF NOT EXISTS fin_categorias_company_id_id_key
  ON public.fin_categorias (company_id, id);

-- 2) Coluna de vinculo (nullable no banco — a obrigatoriedade e aplicada
--    pelo trigger abaixo, so no INSERT e quando o UPDATE mexe na coluna).
ALTER TABLE public.financeiro_fechamento_marcas
  ADD COLUMN IF NOT EXISTS categoria_id uuid;

ALTER TABLE public.financeiro_fechamento_marcas
  DROP CONSTRAINT IF EXISTS financeiro_fechamento_marcas_categoria_fk;

ALTER TABLE public.financeiro_fechamento_marcas
  ADD CONSTRAINT financeiro_fechamento_marcas_categoria_fk
  FOREIGN KEY (company_id, categoria_id)
  REFERENCES public.fin_categorias (company_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS financeiro_fechamento_marcas_categoria_idx
  ON public.financeiro_fechamento_marcas (company_id, categoria_id);

-- 3) Validacao do vinculo: obrigatorio, do tenant, RECEITA operacional
--    ativa e folha da arvore.
CREATE OR REPLACE FUNCTION public.validate_marca_categoria_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_categoria record;
BEGIN
  IF NEW.categoria_id IS NULL THEN
    RAISE EXCEPTION 'CATEGORIA_MARCA_OBRIGATORIA';
  END IF;

  SELECT c.tipo, c.ativo, c.excluir_dos_totais
  INTO v_categoria
  FROM public.fin_categorias c
  WHERE c.id = NEW.categoria_id
    AND c.company_id = NEW.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATEGORIA_MARCA_INVALIDA';
  END IF;

  IF v_categoria.tipo <> 'receita'
     OR v_categoria.ativo IS NOT TRUE
     OR v_categoria.excluir_dos_totais IS TRUE THEN
    RAISE EXCEPTION 'CATEGORIA_MARCA_INVALIDA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fin_categorias f
    WHERE f.parent_id = NEW.categoria_id
      AND f.company_id = NEW.company_id
      AND f.ativo = true
  ) THEN
    RAISE EXCEPTION 'CATEGORIA_MARCA_NAO_FOLHA';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_marca_categoria_vinculo
  ON public.financeiro_fechamento_marcas;
CREATE TRIGGER trg_validate_marca_categoria_vinculo
  BEFORE INSERT OR UPDATE OF categoria_id, company_id
  ON public.financeiro_fechamento_marcas
  FOR EACH ROW EXECUTE FUNCTION public.validate_marca_categoria_vinculo();

-- 4) Impede quebrar a regra "so folha" por outro caminho: criar ou mover
--    uma categoria para dentro de uma categoria ja vinculada a uma marca.
CREATE OR REPLACE FUNCTION public.block_categoria_pai_vinculada_a_marca()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.financeiro_fechamento_marcas m
    WHERE m.categoria_id = NEW.parent_id
      AND m.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'CATEGORIA_VINCULADA_A_MARCA';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_categoria_vinculada_a_marca ON public.fin_categorias;
CREATE TRIGGER trg_block_categoria_vinculada_a_marca
  BEFORE INSERT OR UPDATE OF parent_id
  ON public.fin_categorias
  FOR EACH ROW EXECUTE FUNCTION public.block_categoria_pai_vinculada_a_marca();

-- PL/pgSQL resolve nomes de colunas tardiamente. Este bloco forca o deploy
-- a validar os JOINs novos antes de qualquer chamada em producao.
DO $migration_validation$
BEGIN
  PERFORM m.id
  FROM public.financeiro_fechamento_marcas m
  JOIN public.fin_categorias c
    ON c.id = m.categoria_id
   AND c.company_id = m.company_id
  WHERE false;

  PERFORM f.id
  FROM public.fin_categorias f
  WHERE f.parent_id = '00000000-0000-0000-0000-000000000000'::uuid
    AND f.company_id = '00000000-0000-0000-0000-000000000000'::uuid
    AND f.ativo = true;

  PERFORM 1
  FROM public.financeiro_fechamento_marcas m
  WHERE m.categoria_id = '00000000-0000-0000-0000-000000000000'::uuid
    AND m.company_id = '00000000-0000-0000-0000-000000000000'::uuid;
END;
$migration_validation$;

COMMENT ON COLUMN public.financeiro_fechamento_marcas.categoria_id IS
  'Categoria folha (RECEITA, operacional) do Cadastro Base onde essa marca e reconhecida no livro razao/importacao de extrato. Obrigatoria em marcas novas.';

NOTIFY pgrst, 'reload schema';
