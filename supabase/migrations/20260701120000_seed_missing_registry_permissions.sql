-- ============================================================================
-- Seed: chaves do registry RBAC ausentes no catálogo `permissions`
-- ----------------------------------------------------------------------------
-- Contexto: as 8 permissões `compras:cotacao:*` foram adicionadas ao registry
-- (src/permissions/registry.ts) durante as Fases 1–7 da Cotação (RFQ), mas
-- NUNCA foram sincronizadas para a tabela `permissions` (catálogo-fonte).
--
-- Consequência: ao conceder Cotação a um usuário em Admin → Permissões, a
-- Edge Function `admin-users` só insere chaves presentes em
-- `permissions ∪ role_permissions`; uma chave ausente do catálogo é
-- descartada em SILÊNCIO (nem chega a violar a FK `user_permissions ->
-- permissions(key)`). Resultado: a concessão "não salva".
--
-- Diff registry × produção (2026-07-01): das 308 chaves do registry, APENAS
-- estas 8 estavam ausentes no banco. Todas as demais (inclusive
-- `configuracoes:integracoes:*`) já existiam.
--
-- Idempotente: ON CONFLICT (key) DO NOTHING. Não altera nem remove nenhuma
-- chave existente (não toca nas ~14k linhas legadas nem em role_permissions).
-- ============================================================================

INSERT INTO public.permissions (key, description, module, submodule, action) VALUES
  ('compras:cotacao:view',    'Compras → Cotação → Ver',                'compras', 'cotacao', 'view'),
  ('compras:cotacao:create',  'Compras → Cotação → Criar',              'compras', 'cotacao', 'create'),
  ('compras:cotacao:edit',    'Compras → Cotação → Editar',             'compras', 'cotacao', 'edit'),
  ('compras:cotacao:delete',  'Compras → Cotação → Excluir',            'compras', 'cotacao', 'delete'),
  ('compras:cotacao:approve', 'Compras → Cotação → Aprovar Sugestão',   'compras', 'cotacao', 'approve'),
  ('compras:cotacao:close',   'Compras → Cotação → Converter em Pedido','compras', 'cotacao', 'close'),
  ('compras:cotacao:manage',  'Compras → Cotação → WhatsApp / IA',      'compras', 'cotacao', 'manage'),
  ('compras:cotacao:export',  'Compras → Cotação → Exportar',           'compras', 'cotacao', 'export')
ON CONFLICT (key) DO NOTHING;
