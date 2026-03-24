
-- Turnos table
CREATE TABLE public.turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read turnos" ON public.turnos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage turnos" ON public.turnos FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default shifts
INSERT INTO public.turnos (nome, hora_inicio, hora_fim) VALUES
  ('Manhã', '06:00', '14:00'),
  ('Tarde', '14:00', '22:00'),
  ('Noite', '22:00', '06:00');

-- Audit inventario log (immutable)
CREATE TABLE public.audit_inventario_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id uuid REFERENCES public.inventarios(id),
  item_id uuid,
  user_id uuid NOT NULL,
  user_role text NOT NULL DEFAULT '',
  acao text NOT NULL,
  antes jsonb,
  depois jsonb,
  ip_address text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_inventario_log ENABLE ROW LEVEL SECURITY;

-- Only insert, no update/delete (immutable log)
CREATE POLICY "Authenticated can read audit_inventario_log" ON public.audit_inventario_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert audit_inventario_log" ON public.audit_inventario_log FOR INSERT TO authenticated WITH CHECK (true);

-- Add new columns to inventarios
ALTER TABLE public.inventarios 
  ADD COLUMN turno_id uuid REFERENCES public.turnos(id),
  ADD COLUMN aprovado_por uuid,
  ADD COLUMN flag_risco text DEFAULT '',
  ADD COLUMN score_risco numeric DEFAULT 0,
  ADD COLUMN sob_analise_motivo text DEFAULT '',
  ADD COLUMN justificativa_analise text DEFAULT '',
  ADD COLUMN aprovacao_admin_em timestamptz;

-- Update status CHECK to include new status
ALTER TABLE public.inventarios DROP CONSTRAINT inventarios_status_check;
ALTER TABLE public.inventarios ADD CONSTRAINT inventarios_status_check 
  CHECK (status IN ('RASCUNHO', 'EM_CONTAGEM', 'EM_REVISAO', 'SOB_ANALISE', 'FINALIZADO'));

-- Add columns to inventario_itens
ALTER TABLE public.inventario_itens
  ADD COLUMN contado_por uuid,
  ADD COLUMN contagem_inicio timestamptz,
  ADD COLUMN contagem_fim timestamptz,
  ADD COLUMN justificativa text DEFAULT '';

-- Create indexes for performance
CREATE INDEX idx_audit_inv_log_inventario ON public.audit_inventario_log(inventario_id);
CREATE INDEX idx_audit_inv_log_user ON public.audit_inventario_log(user_id);
CREATE INDEX idx_inventarios_status ON public.inventarios(status);
CREATE INDEX idx_inventarios_turno ON public.inventarios(turno_id);
CREATE INDEX idx_inventarios_flag ON public.inventarios(flag_risco);
CREATE INDEX idx_inventario_itens_contado ON public.inventario_itens(contado_por);
