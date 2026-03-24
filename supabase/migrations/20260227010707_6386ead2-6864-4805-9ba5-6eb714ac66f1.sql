
-- Storage bucket for RH documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('rh-documentos', 'rh-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage: Masters and gerentes can upload/read
CREATE POLICY "Masters can manage rh docs" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'rh-documentos' AND (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ))
  WITH CHECK (bucket_id = 'rh-documentos' AND (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral')
  ));

CREATE POLICY "Gerente can manage rh docs" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'rh-documentos' AND has_role(auth.uid(), 'gerente'))
  WITH CHECK (bucket_id = 'rh-documentos' AND has_role(auth.uid(), 'gerente'));

-- Document metadata table
CREATE TABLE public.rh_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.rh_colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'outro', -- aso, contrato, ctps, rg, cpf, comprovante_residencia, certidao, atestado, advertencia, outro
  nome TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  arquivo_path TEXT DEFAULT NULL, -- storage path
  arquivo_nome TEXT DEFAULT '',
  arquivo_tamanho INTEGER DEFAULT 0,
  data_emissao DATE DEFAULT NULL,
  data_vencimento DATE DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'VIGENTE', -- VIGENTE, VENCIDO, PENDENTE, ARQUIVADO
  obrigatorio BOOLEAN NOT NULL DEFAULT false,
  alertar_vencimento BOOLEAN NOT NULL DEFAULT true,
  dias_alerta_antes INTEGER NOT NULL DEFAULT 30,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rh_documentos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Masters can manage rh_documentos" ON public.rh_documentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'diretor') OR has_role(auth.uid(), 'gerente_geral'));

CREATE POLICY "Gerente can manage rh_documentos" ON public.rh_documentos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gerente'))
  WITH CHECK (has_role(auth.uid(), 'gerente'));

CREATE POLICY "Colaborador can read own documentos" ON public.rh_documentos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rh_colaboradores c WHERE c.id = rh_documentos.colaborador_id AND c.user_id = auth.uid()));
