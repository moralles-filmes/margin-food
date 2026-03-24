
-- Sync RH module permissions: add new actions
-- New: rh:ponto:approve, rh:banco-horas:reconcile, rh:folha:manage, rh:documentos:manage

INSERT INTO public.permissions (key, description, module, submodule, action)
VALUES
  ('rh:ponto:approve', 'RH → Ponto → Aprovar', 'rh', 'ponto', 'approve'),
  ('rh:banco-horas:reconcile', 'RH → Banco de Horas → Recalcular', 'rh', 'banco-horas', 'reconcile'),
  ('rh:folha:manage', 'RH → Folha → Gerenciar (Dados Sensíveis)', 'rh', 'folha', 'manage'),
  ('rh:documentos:manage', 'RH → Documentos → Gerenciar (Upload/Compliance)', 'rh', 'documentos', 'manage')
ON CONFLICT (key) DO NOTHING;

-- Ensure all rh permissions exist
INSERT INTO public.permissions (key, description, module, submodule, action)
VALUES
  ('rh:prontuario:view', 'RH → Prontuário → Ver', 'rh', 'prontuario', 'view'),
  ('rh:prontuario:create', 'RH → Prontuário → Criar', 'rh', 'prontuario', 'create'),
  ('rh:prontuario:edit', 'RH → Prontuário → Editar', 'rh', 'prontuario', 'edit'),
  ('rh:prontuario:delete', 'RH → Prontuário → Excluir', 'rh', 'prontuario', 'delete'),
  ('rh:prontuario:manage', 'RH → Prontuário → Gerenciar', 'rh', 'prontuario', 'manage'),
  ('rh:escalas:view', 'RH → Escalas → Ver', 'rh', 'escalas', 'view'),
  ('rh:escalas:create', 'RH → Escalas → Criar', 'rh', 'escalas', 'create'),
  ('rh:escalas:edit', 'RH → Escalas → Editar', 'rh', 'escalas', 'edit'),
  ('rh:escalas:delete', 'RH → Escalas → Excluir', 'rh', 'escalas', 'delete'),
  ('rh:tarefas:view', 'RH → Tarefas → Ver', 'rh', 'tarefas', 'view'),
  ('rh:tarefas:create', 'RH → Tarefas → Criar', 'rh', 'tarefas', 'create'),
  ('rh:tarefas:edit', 'RH → Tarefas → Editar', 'rh', 'tarefas', 'edit'),
  ('rh:tarefas:delete', 'RH → Tarefas → Excluir', 'rh', 'tarefas', 'delete'),
  ('rh:onboarding:view', 'RH → Onboarding → Ver', 'rh', 'onboarding', 'view'),
  ('rh:onboarding:manage', 'RH → Onboarding → Gerenciar', 'rh', 'onboarding', 'manage'),
  ('rh:treinamento:view', 'RH → Treinamento → Ver', 'rh', 'treinamento', 'view'),
  ('rh:treinamento:create', 'RH → Treinamento → Criar', 'rh', 'treinamento', 'create'),
  ('rh:treinamento:edit', 'RH → Treinamento → Editar', 'rh', 'treinamento', 'edit'),
  ('rh:treinamento:delete', 'RH → Treinamento → Excluir', 'rh', 'treinamento', 'delete'),
  ('rh:ferias:view', 'RH → Férias → Ver', 'rh', 'ferias', 'view'),
  ('rh:ferias:create', 'RH → Férias → Criar', 'rh', 'ferias', 'create'),
  ('rh:ferias:approve', 'RH → Férias → Aprovar', 'rh', 'ferias', 'approve'),
  ('rh:documentos:view', 'RH → Documentos → Ver', 'rh', 'documentos', 'view'),
  ('rh:documentos:create', 'RH → Documentos → Criar', 'rh', 'documentos', 'create'),
  ('rh:documentos:edit', 'RH → Documentos → Editar', 'rh', 'documentos', 'edit'),
  ('rh:documentos:delete', 'RH → Documentos → Excluir', 'rh', 'documentos', 'delete'),
  ('rh:folha:view', 'RH → Folha → Ver', 'rh', 'folha', 'view'),
  ('rh:folha:export', 'RH → Folha → Exportar', 'rh', 'folha', 'export'),
  ('rh:beneficios:view', 'RH → Benefícios → Ver', 'rh', 'beneficios', 'view'),
  ('rh:beneficios:create', 'RH → Benefícios → Criar', 'rh', 'beneficios', 'create'),
  ('rh:beneficios:edit', 'RH → Benefícios → Editar', 'rh', 'beneficios', 'edit'),
  ('rh:beneficios:delete', 'RH → Benefícios → Excluir', 'rh', 'beneficios', 'delete'),
  ('rh:dashboard:view', 'RH → Dashboard → Ver', 'rh', 'dashboard', 'view'),
  ('rh:custos:view', 'RH → Custos → Ver', 'rh', 'custos', 'view'),
  ('rh:custos:export', 'RH → Custos → Exportar', 'rh', 'custos', 'export'),
  ('rh:sst:view', 'RH → SST → Ver', 'rh', 'sst', 'view'),
  ('rh:sst:create', 'RH → SST → Criar', 'rh', 'sst', 'create'),
  ('rh:sst:edit', 'RH → SST → Editar', 'rh', 'sst', 'edit'),
  ('rh:sst:delete', 'RH → SST → Excluir', 'rh', 'sst', 'delete'),
  ('rh:disciplinar:view', 'RH → Disciplinar → Ver', 'rh', 'disciplinar', 'view'),
  ('rh:disciplinar:create', 'RH → Disciplinar → Criar', 'rh', 'disciplinar', 'create'),
  ('rh:disciplinar:edit', 'RH → Disciplinar → Editar', 'rh', 'disciplinar', 'edit'),
  ('rh:disciplinar:delete', 'RH → Disciplinar → Excluir', 'rh', 'disciplinar', 'delete'),
  ('rh:mural:view', 'RH → Mural → Ver', 'rh', 'mural', 'view'),
  ('rh:mural:create', 'RH → Mural → Criar', 'rh', 'mural', 'create'),
  ('rh:ponto:view', 'RH → Ponto → Ver', 'rh', 'ponto', 'view'),
  ('rh:ponto:create', 'RH → Ponto → Registrar', 'rh', 'ponto', 'create'),
  ('rh:ponto:manage', 'RH → Ponto → Gerenciar', 'rh', 'ponto', 'manage'),
  ('rh:banco-horas:view', 'RH → Banco de Horas → Ver', 'rh', 'banco-horas', 'view'),
  ('rh:banco-horas:manage', 'RH → Banco de Horas → Gerenciar', 'rh', 'banco-horas', 'manage')
ON CONFLICT (key) DO NOTHING;

-- Grant all rh:% permissions to admin role
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', key FROM public.permissions WHERE key LIKE 'rh:%'
ON CONFLICT (role, permission_key) DO NOTHING;
