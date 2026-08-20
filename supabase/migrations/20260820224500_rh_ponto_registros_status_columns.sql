-- Bug: reject_ponto_record (migration 20260303043647) e RhView.tsx (fetchPontos)
-- dependem de rh_ponto_registros.status/rejeitado_por/rejeitado_em/motivo_rejeicao/
-- updated_at, mas essas colunas nunca chegaram a existir na tabela em produção.
--
-- Causa raiz: a migration original (20260303043646, preservada como .sql.bak neste
-- repo) tinha ALTER TABLE + CREATE FUNCTION + mais ALTER/CREATE POLICY depois —
-- exatamente o padrão que quebra `supabase db push` no CLI v2.75 (documentado no
-- CLAUDE.md). Foi dividida em 20260303043647_split_0.sql (CREATE FUNCTION +
-- policies H3) e 20260303043648_split_1.sql (trigger updated_at), mas o bloco de
-- ALTER TABLE que criava as colunas foi perdido no meio da divisão — nunca foi
-- reaplicado em nenhum dos dois splits.
--
-- Efeito em produção: fetchPontos() (RhView.tsx) faz SELECT/filter em `status`,
-- que não existe -> toda consulta falha, a lista de Registros de Ponto fica
-- sempre vazia. O RPC reject_ponto_record referencia as mesmas colunas ausentes
-- e falha na primeira execução (PL/pgSQL só valida colunas em runtime). Tabela
-- confirmada vazia em produção (0 linhas) — sem dado para conflitar com o backfill.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rh_ponto_registros' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.rh_ponto_registros ADD COLUMN status text NOT NULL DEFAULT 'PENDENTE';
    ALTER TABLE public.rh_ponto_registros ADD CONSTRAINT rh_ponto_registros_status_check
      CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO'));
    UPDATE public.rh_ponto_registros SET status = 'APROVADO' WHERE aprovado = true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rh_ponto_registros' AND column_name = 'rejeitado_por'
  ) THEN
    ALTER TABLE public.rh_ponto_registros ADD COLUMN rejeitado_por uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rh_ponto_registros' AND column_name = 'rejeitado_em'
  ) THEN
    ALTER TABLE public.rh_ponto_registros ADD COLUMN rejeitado_em timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rh_ponto_registros' AND column_name = 'motivo_rejeicao'
  ) THEN
    ALTER TABLE public.rh_ponto_registros ADD COLUMN motivo_rejeicao text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rh_ponto_registros' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.rh_ponto_registros ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.rh_ponto_registros;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.rh_ponto_registros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
