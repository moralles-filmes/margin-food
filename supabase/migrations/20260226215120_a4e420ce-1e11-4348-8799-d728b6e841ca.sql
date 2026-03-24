
-- Allow collaboradores/chefe_setor to see their own solicitações
CREATE POLICY "Solicitantes can read own solic_mercado"
ON public.solic_compra_mercado FOR SELECT
TO authenticated
USING (solicitante_user_id = auth.uid());

-- Allow collaboradores to update their own pending solicitações
CREATE POLICY "Solicitantes can update own pending solic_mercado"
ON public.solic_compra_mercado FOR UPDATE
TO authenticated
USING (solicitante_user_id = auth.uid() AND status = 'ENVIADA')
WITH CHECK (solicitante_user_id = auth.uid() AND status = 'ENVIADA');

-- Allow collaboradores to delete their own pending solicitações
CREATE POLICY "Solicitantes can delete own pending solic_mercado"
ON public.solic_compra_mercado FOR DELETE
TO authenticated
USING (solicitante_user_id = auth.uid() AND status = 'ENVIADA');

-- Allow collaboradores to insert solicitações
CREATE POLICY "Authenticated can insert solic_mercado"
ON public.solic_compra_mercado FOR INSERT
TO authenticated
WITH CHECK (solicitante_user_id = auth.uid());

-- Allow solicitantes to read their own solic items
CREATE POLICY "Solicitantes can read own solic_items"
ON public.solic_compra_mercado_item FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.solic_compra_mercado s
    WHERE s.id = solicitacao_id AND s.solicitante_user_id = auth.uid()
  )
);

-- Allow solicitantes to insert items on their own pending solicitações
CREATE POLICY "Solicitantes can insert own solic_items"
ON public.solic_compra_mercado_item FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.solic_compra_mercado s
    WHERE s.id = solicitacao_id AND s.solicitante_user_id = auth.uid() AND s.status = 'ENVIADA'
  )
);

-- Allow solicitantes to delete items on their own pending solicitações
CREATE POLICY "Solicitantes can delete own solic_items"
ON public.solic_compra_mercado_item FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.solic_compra_mercado s
    WHERE s.id = solicitacao_id AND s.solicitante_user_id = auth.uid() AND s.status = 'ENVIADA'
  )
);
