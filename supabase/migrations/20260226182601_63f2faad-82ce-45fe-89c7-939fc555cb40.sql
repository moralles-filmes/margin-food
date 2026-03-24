
-- AI Logs table for conversation history
CREATE TABLE public.ai_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agente text NOT NULL DEFAULT 'geral',
  periodo text DEFAULT '',
  entrada_usuario text NOT NULL DEFAULT '',
  contexto_enviado jsonb DEFAULT '{}'::jsonb,
  resposta_ia text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ai_logs" ON public.ai_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai_logs" ON public.ai_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- AI Insights table for cached auto-generated insights
CREATE TABLE public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text NOT NULL,
  agente text NOT NULL DEFAULT 'geral',
  tipo text NOT NULL DEFAULT 'insight',
  titulo text NOT NULL DEFAULT '',
  descricao text NOT NULL DEFAULT '',
  impacto text DEFAULT '',
  recomendacao text DEFAULT '',
  severidade text NOT NULL DEFAULT 'info',
  dados jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ai_insights" ON public.ai_insights
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin or Compras can manage ai_insights" ON public.ai_insights
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'compras'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'compras'));

-- AI Score history
CREATE TABLE public.ai_score_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo text NOT NULL,
  score_total numeric NOT NULL DEFAULT 0,
  componentes jsonb NOT NULL DEFAULT '{}'::jsonb,
  classificacao text NOT NULL DEFAULT 'atencao',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_score_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ai_score" ON public.ai_score_historico
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin can manage ai_score" ON public.ai_score_historico
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
