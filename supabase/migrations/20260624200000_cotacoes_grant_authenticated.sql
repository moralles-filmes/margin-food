-- ════════════════════════════════════════════════════════════════════════════
-- Fix: GRANTs faltando nas tabelas de Cotação (RFQ)
-- ════════════════════════════════════════════════════════════════════════════
-- As migrations 20260624100100 (schema) e 20260624105000 (cotacao_ia_config)
-- criaram as tabelas com FORCE RLS mas omitiraM os GRANTs para os roles
-- authenticated e service_role. Sem o GRANT, PostgREST retorna
-- "permission denied" no SELECT direto, mesmo com RLS policy permissiva —
-- o SECURITY DEFINER das RPCs de escrita mascara o problema no INSERT.
-- Resultado observado: cotação criada mas lista sempre vazia.

GRANT ALL ON TABLE public.cotacoes              TO authenticated, service_role;
GRANT ALL ON TABLE public.cotacao_itens         TO authenticated, service_role;
GRANT ALL ON TABLE public.cotacao_fornecedores  TO authenticated, service_role;
GRANT ALL ON TABLE public.cotacao_respostas     TO authenticated, service_role;
GRANT ALL ON TABLE public.cotacao_sugestoes     TO authenticated, service_role;
GRANT ALL ON TABLE public.cotacao_whatsapp_logs TO authenticated, service_role;
GRANT ALL ON TABLE public.cotacao_zapi_config   TO authenticated, service_role;
GRANT ALL ON TABLE public.cotacao_ia_config     TO authenticated, service_role;
