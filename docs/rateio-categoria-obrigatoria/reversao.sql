-- Reversão da migration 20261010210000_fin_rateio_categoria_obrigatoria.sql.
-- Definição viva de produção capturada em 2026-10-10, antes da aplicação
-- (pg_get_functiondef). Volta a aceitar linha de rateio sem categoria; as
-- conferências de empresa da categoria e do centro de custo continuam.
-- O trigger trg_fin_rateio_valida_empresa não muda nem na ida nem na volta.

CREATE OR REPLACE FUNCTION public.fin_rateio_valida_empresa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- SECURITY DEFINER: a conferência não pode depender de quem grava enxergar
  -- o cadastro (quem lança sem financeiro:cadastros:view teria a própria
  -- categoria recusada); a empresa é sempre a do rateio.
  IF NEW.categoria_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_categorias c
    WHERE c.id = NEW.categoria_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: categoria do rateio não pertence à empresa';
  END IF;

  IF NEW.centro_custo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_centros_custo cc
    WHERE cc.id = NEW.centro_custo_id AND cc.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: centro de custo do rateio não pertence à empresa';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_rateio_valida_empresa() FROM public, anon, authenticated;
