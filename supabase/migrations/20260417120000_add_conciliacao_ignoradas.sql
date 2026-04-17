-- Tabela para persistir entradas do extrato OFX que o usuário optou por ignorar
-- (ex: PIX enviado e devolvido no dia seguinte — não deve criar despesa nem afetar saldo)

CREATE TABLE IF NOT EXISTS public.fin_conciliacao_ignoradas (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conta_id     uuid REFERENCES public.fin_contas(id) ON DELETE SET NULL,
  data         date NOT NULL,
  valor        numeric(15,2) NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('RECEITA','DESPESA')),
  descricao    text,
  ignorado_em  timestamptz DEFAULT now(),
  ignorado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.fin_conciliacao_ignoradas ENABLE ROW LEVEL SECURITY;

-- RLS: cada membro acessa apenas dados da própria empresa
CREATE POLICY "conciliacao_ignoradas_company_rls"
  ON public.fin_conciliacao_ignoradas
  FOR ALL
  USING (company_id = public.get_current_company_id())
  WITH CHECK (company_id = public.get_current_company_id());

-- Super-admin bypass
CREATE POLICY "conciliacao_ignoradas_superadmin"
  ON public.fin_conciliacao_ignoradas
  FOR ALL
  USING (public.has_permission(auth.uid(), 'system:global:manage'));

-- Index para lookup rápido na re-importação de OFX
CREATE INDEX idx_conciliacao_ignoradas_conta_data
  ON public.fin_conciliacao_ignoradas (company_id, conta_id, data);

-- RPC para ignorar uma entrada do extrato.
-- company_id é resolvido via get_current_company_id() — mesmo padrão das outras RPCs financeiras.
CREATE OR REPLACE FUNCTION public.reconcile_ignorar_lancamento(
  p_conta_id  uuid,
  p_data      date,
  p_valor     numeric,
  p_tipo      text,
  p_descricao text,
  p_user_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id         uuid;
  v_company_id uuid;
BEGIN
  IF NOT (
    public.has_permission(p_user_id, 'finance:manage') OR
    public.has_permission(p_user_id, 'system:global:manage')
  ) THEN
    RAISE EXCEPTION 'Permissão negada: finance:manage necessário';
  END IF;

  v_company_id := public.get_current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada para o usuário atual';
  END IF;

  INSERT INTO public.fin_conciliacao_ignoradas
    (company_id, conta_id, data, valor, tipo, descricao, ignorado_por)
  VALUES
    (v_company_id, p_conta_id, p_data, p_valor, p_tipo, p_descricao, p_user_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'ok', 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_ignorar_lancamento TO authenticated;
