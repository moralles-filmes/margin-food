INSERT INTO storage.buckets(id,name,public) VALUES('rh-documentos','rh-documentos',false);
CREATE POLICY "company_documents_delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'rh-documentos'::text) AND can_access_company_document(name, 'delete'::text)));
CREATE POLICY "company_documents_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'rh-documentos'::text) AND can_access_company_document(name, 'create'::text)));
CREATE POLICY "company_documents_read" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'rh-documentos'::text) AND can_access_company_document(name, 'view'::text)));
CREATE POLICY "company_documents_update" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'rh-documentos'::text) AND can_access_company_document(name, 'edit'::text))) WITH CHECK (((bucket_id = 'rh-documentos'::text) AND can_access_company_document(name, 'edit'::text)));
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications,public.purchase_orders,public.cotacoes,public.cotacao_fornecedores,public.produtos,public.movimentacoes_estoque;
NOTIFY pgrst,'reload schema';
