
-- Sync ALL missing permission keys from the frontend registry into the permissions table.
-- This ensures that saveUserPermissions in admin-users edge function can persist these keys.

-- compras:alertas_falta (the reported missing subtab)
INSERT INTO public.permissions (key, description, module, submodule, action)
VALUES
  ('compras:alertas_falta:view', 'Compras → Itens em Falta → Ver', 'compras', 'alertas_falta', 'view'),
  ('compras:alertas_falta:approve', 'Compras → Itens em Falta → Confirmar Alerta', 'compras', 'alertas_falta', 'approve')
ON CONFLICT (key) DO NOTHING;

-- estoque subtabs that may be missing
INSERT INTO public.permissions (key, description, module, submodule, action)
VALUES
  ('estoque:dashboard:view', 'Estoque Geral → Dashboard → Ver', 'estoque', 'dashboard', 'view'),
  ('estoque:consumo:view', 'Estoque Geral → Histórico de Consumo → Ver', 'estoque', 'consumo', 'view'),
  ('estoque:ranking:view', 'Estoque Geral → Ranking de Consumo → Ver', 'estoque', 'ranking', 'view'),
  ('estoque:perdas:view', 'Estoque Geral → Relatório de Perdas → Ver', 'estoque', 'perdas', 'view'),
  ('estoque:transferencias:view', 'Estoque Geral → Transferências → Ver', 'estoque', 'transferencias', 'view'),
  ('estoque:transferencias:create', 'Estoque Geral → Transferências → Criar', 'estoque', 'transferencias', 'create'),
  ('estoque:preditivo:view', 'Estoque Geral → Estoque Preditivo → Ver', 'estoque', 'preditivo', 'view'),
  ('estoque:requisicoes:manage', 'Estoque Geral → Requisições → Gerenciar Listas Fixas', 'estoque', 'requisicoes', 'manage')
ON CONFLICT (key) DO NOTHING;

-- financeiro subtabs that may be missing
INSERT INTO public.permissions (key, description, module, submodule, action)
VALUES
  ('financeiro:alertas:export', 'Financeiro → Alertas → Exportar', 'financeiro', 'alertas', 'export'),
  ('financeiro:orcamento:delete', 'Financeiro → Orçamento → Excluir', 'financeiro', 'orcamento', 'delete'),
  ('financeiro:orcamento:export', 'Financeiro → Orçamento → Exportar', 'financeiro', 'orcamento', 'export'),
  ('financeiro:recorrencias:export', 'Financeiro → Recorrências → Exportar', 'financeiro', 'recorrencias', 'export'),
  ('financeiro:categorizacao:create', 'Financeiro → Categorização → Criar Regra', 'financeiro', 'categorizacao', 'create'),
  ('financeiro:categorizacao:edit', 'Financeiro → Categorização → Editar Regra', 'financeiro', 'categorizacao', 'edit'),
  ('financeiro:categorizacao:delete', 'Financeiro → Categorização → Excluir Regra', 'financeiro', 'categorizacao', 'delete')
ON CONFLICT (key) DO NOTHING;

-- Also add legacy map entries for compras:alertas_falta to purchases:read
-- (handled in frontend LEGACY_PERMISSION_MAP, no DB action needed)
