-- ============================================================
-- SEED GRANULAR PERMISSIONS + GRANT TO ADMIN ROLE
--
-- Problem: role_permissions for 'admin' only had OLD-format keys
-- (stock:read, finance:manage, etc.) but frontend checks NEW-format
-- keys (estoque:dashboard:view, financeiro:dashboard:view, etc.)
-- causing "Acesso negado" for new company admins.
--
-- Solution: Insert all ~200 granular permission keys from the
-- frontend registry (src/permissions/registry.ts) and grant them
-- to admin/diretor/gerente_geral roles.
-- ============================================================

-- ─── PART A: Insert all granular permissions ───

INSERT INTO public.permissions (key, description, module, submodule, action) VALUES
  -- System
  ('system:global:manage', 'Sistema > Acesso Global > Super-Admin', 'system', 'global', 'manage'),

  -- Relatorios
  ('relatorios:cmv:view', 'Relatorios > CMV > Ver', 'relatorios', 'cmv', 'view'),
  ('relatorios:cmv:export', 'Relatorios > CMV > Exportar', 'relatorios', 'cmv', 'export'),
  ('relatorios:estoque:view', 'Relatorios > Estoque > Ver', 'relatorios', 'estoque', 'view'),
  ('relatorios:estoque:export', 'Relatorios > Estoque > Exportar', 'relatorios', 'estoque', 'export'),
  ('relatorios:compras:view', 'Relatorios > Compras > Ver', 'relatorios', 'compras', 'view'),
  ('relatorios:compras:export', 'Relatorios > Compras > Exportar', 'relatorios', 'compras', 'export'),
  ('relatorios:tendencia:view', 'Relatorios > Tendencia > Ver', 'relatorios', 'tendencia', 'view'),
  ('relatorios:score:view', 'Relatorios > Score > Ver', 'relatorios', 'score', 'view'),
  ('relatorios:score:simulate', 'Relatorios > Score > Simular', 'relatorios', 'score', 'simulate'),
  ('relatorios:score:export', 'Relatorios > Score > Exportar', 'relatorios', 'score', 'export'),
  ('relatorios:itens:view', 'Relatorios > Itens > Ver', 'relatorios', 'itens', 'view'),
  ('relatorios:itens:export', 'Relatorios > Itens > Exportar', 'relatorios', 'itens', 'export'),

  -- Salmon
  ('salmon:dashboard:view', 'Salmon > Dashboard > Ver', 'salmon', 'dashboard', 'view'),
  ('salmon:entradas:view', 'Salmon > Entradas > Ver', 'salmon', 'entradas', 'view'),
  ('salmon:entradas:create', 'Salmon > Entradas > Criar', 'salmon', 'entradas', 'create'),
  ('salmon:entradas:edit', 'Salmon > Entradas > Editar', 'salmon', 'entradas', 'edit'),
  ('salmon:entradas:delete', 'Salmon > Entradas > Excluir', 'salmon', 'entradas', 'delete'),
  ('salmon:manipulacao:view', 'Salmon > Manipulacao > Ver', 'salmon', 'manipulacao', 'view'),
  ('salmon:manipulacao:create', 'Salmon > Manipulacao > Criar', 'salmon', 'manipulacao', 'create'),
  ('salmon:manipulacao:delete', 'Salmon > Manipulacao > Cancelar', 'salmon', 'manipulacao', 'delete'),
  ('salmon:estoque:view', 'Salmon > Estoque > Ver', 'salmon', 'estoque', 'view'),
  ('salmon:metas:view', 'Salmon > Metas > Ver', 'salmon', 'metas', 'view'),
  ('salmon:metas:edit', 'Salmon > Metas > Editar', 'salmon', 'metas', 'edit'),
  ('salmon:planejamento:view', 'Salmon > Planejamento > Ver', 'salmon', 'planejamento', 'view'),
  ('salmon:planejamento:manage', 'Salmon > Planejamento > Gerenciar', 'salmon', 'planejamento', 'manage'),

  -- Estoque Geral
  ('estoque:dashboard:view', 'Estoque > Dashboard > Ver', 'estoque', 'dashboard', 'view'),
  ('estoque:ranking:view', 'Estoque > Ranking > Ver', 'estoque', 'ranking', 'view'),
  ('estoque:perdas:view', 'Estoque > Perdas > Ver', 'estoque', 'perdas', 'view'),
  ('estoque:transferencias:view', 'Estoque > Transferencias > Ver', 'estoque', 'transferencias', 'view'),
  ('estoque:transferencias:create', 'Estoque > Transferencias > Criar', 'estoque', 'transferencias', 'create'),
  ('estoque:preditivo:view', 'Estoque > Preditivo > Ver', 'estoque', 'preditivo', 'view'),
  ('estoque:saldo:view', 'Estoque > Saldo > Ver', 'estoque', 'saldo', 'view'),
  ('estoque:saldo:export', 'Estoque > Saldo > Exportar', 'estoque', 'saldo', 'export'),
  ('estoque:movimentacoes:view', 'Estoque > Movimentacoes > Ver', 'estoque', 'movimentacoes', 'view'),
  ('estoque:movimentacoes:create', 'Estoque > Movimentacoes > Criar', 'estoque', 'movimentacoes', 'create'),
  ('estoque:movimentacoes:edit', 'Estoque > Movimentacoes > Editar', 'estoque', 'movimentacoes', 'edit'),
  ('estoque:movimentacoes:cancel', 'Estoque > Movimentacoes > Cancelar', 'estoque', 'movimentacoes', 'cancel'),
  ('estoque:movimentacoes:export', 'Estoque > Movimentacoes > Exportar', 'estoque', 'movimentacoes', 'export'),
  ('estoque:simulador:view', 'Estoque > Simulador > Ver', 'estoque', 'simulador', 'view'),
  ('estoque:requisicoes:view', 'Estoque > Requisicoes > Ver', 'estoque', 'requisicoes', 'view'),
  ('estoque:requisicoes:create', 'Estoque > Requisicoes > Criar', 'estoque', 'requisicoes', 'create'),
  ('estoque:requisicoes:approve', 'Estoque > Requisicoes > Aprovar', 'estoque', 'requisicoes', 'approve'),
  ('estoque:requisicoes:close', 'Estoque > Requisicoes > Atender/Finalizar', 'estoque', 'requisicoes', 'close'),
  ('estoque:requisicoes:delete', 'Estoque > Requisicoes > Excluir', 'estoque', 'requisicoes', 'delete'),
  ('estoque:requisicoes:export', 'Estoque > Requisicoes > Exportar', 'estoque', 'requisicoes', 'export'),
  ('estoque:requisicoes:manage', 'Estoque > Requisicoes > Gerenciar Listas Fixas', 'estoque', 'requisicoes', 'manage'),
  ('estoque:catalogo:view', 'Estoque > Catalogo > Ver', 'estoque', 'catalogo', 'view'),
  ('estoque:catalogo:create', 'Estoque > Catalogo > Criar', 'estoque', 'catalogo', 'create'),
  ('estoque:catalogo:edit', 'Estoque > Catalogo > Editar', 'estoque', 'catalogo', 'edit'),
  ('estoque:catalogo:delete', 'Estoque > Catalogo > Excluir', 'estoque', 'catalogo', 'delete'),
  ('estoque:catalogo:export', 'Estoque > Catalogo > Exportar', 'estoque', 'catalogo', 'export'),
  ('estoque:cadastros:view', 'Estoque > Cadastros > Ver', 'estoque', 'cadastros', 'view'),
  ('estoque:cadastros:create', 'Estoque > Cadastros > Criar', 'estoque', 'cadastros', 'create'),
  ('estoque:cadastros:edit', 'Estoque > Cadastros > Editar', 'estoque', 'cadastros', 'edit'),
  ('estoque:cadastros:delete', 'Estoque > Cadastros > Excluir', 'estoque', 'cadastros', 'delete'),
  ('estoque:cadastros:manage', 'Estoque > Cadastros > Gerenciar', 'estoque', 'cadastros', 'manage'),
  ('estoque:cadastros:export', 'Estoque > Cadastros > Exportar', 'estoque', 'cadastros', 'export'),

  -- Inventario
  ('inventario:lista:view', 'Inventario > Lista > Ver', 'inventario', 'lista', 'view'),
  ('inventario:lista:create', 'Inventario > Lista > Criar', 'inventario', 'lista', 'create'),
  ('inventario:lista:edit', 'Inventario > Lista > Editar', 'inventario', 'lista', 'edit'),
  ('inventario:lista:delete', 'Inventario > Lista > Excluir', 'inventario', 'lista', 'delete'),
  ('inventario:lista:export', 'Inventario > Lista > Exportar', 'inventario', 'lista', 'export'),
  ('inventario:criar:create', 'Inventario > Criar > Criar', 'inventario', 'criar', 'create'),
  ('inventario:rapido:view', 'Inventario > Rapido > Ver', 'inventario', 'rapido', 'view'),
  ('inventario:rapido:create', 'Inventario > Rapido > Criar', 'inventario', 'rapido', 'create'),
  ('inventario:detalhe:view', 'Inventario > Detalhe > Ver', 'inventario', 'detalhe', 'view'),
  ('inventario:detalhe:edit', 'Inventario > Detalhe > Editar', 'inventario', 'detalhe', 'edit'),
  ('inventario:detalhe:close', 'Inventario > Detalhe > Finalizar', 'inventario', 'detalhe', 'close'),
  ('inventario:detalhe:export', 'Inventario > Detalhe > Exportar', 'inventario', 'detalhe', 'export'),
  ('inventario:dashboard:view', 'Inventario > Dashboard > Ver', 'inventario', 'dashboard', 'view'),
  ('inventario:dashboard:export', 'Inventario > Dashboard > Exportar', 'inventario', 'dashboard', 'export'),
  ('inventario:auditoria:view', 'Inventario > Auditoria > Ver', 'inventario', 'auditoria', 'view'),
  ('inventario:auditoria:approve', 'Inventario > Auditoria > Aprovar', 'inventario', 'auditoria', 'approve'),
  ('inventario:auditoria:edit', 'Inventario > Auditoria > Editar', 'inventario', 'auditoria', 'edit'),
  ('inventario:auditoria:export', 'Inventario > Auditoria > Exportar', 'inventario', 'auditoria', 'export'),
  ('inventario:conferentes:view', 'Inventario > Conferentes > Ver', 'inventario', 'conferentes', 'view'),
  ('inventario:conferentes:manage', 'Inventario > Conferentes > Gerenciar', 'inventario', 'conferentes', 'manage'),

  -- Compras
  ('compras:lista:view', 'Compras > Lista > Ver', 'compras', 'lista', 'view'),
  ('compras:lista:create', 'Compras > Lista > Criar', 'compras', 'lista', 'create'),
  ('compras:lista:edit', 'Compras > Lista > Editar', 'compras', 'lista', 'edit'),
  ('compras:lista:approve', 'Compras > Lista > Aprovar', 'compras', 'lista', 'approve'),
  ('compras:lista:cancel', 'Compras > Lista > Cancelar', 'compras', 'lista', 'cancel'),
  ('compras:lista:delete', 'Compras > Lista > Excluir', 'compras', 'lista', 'delete'),
  ('compras:lista:export', 'Compras > Lista > Exportar', 'compras', 'lista', 'export'),
  ('compras:pedidos:view', 'Compras > Pedidos > Ver', 'compras', 'pedidos', 'view'),
  ('compras:pedidos:create', 'Compras > Pedidos > Criar', 'compras', 'pedidos', 'create'),
  ('compras:pedidos:edit', 'Compras > Pedidos > Editar', 'compras', 'pedidos', 'edit'),
  ('compras:pedidos:delete', 'Compras > Pedidos > Excluir', 'compras', 'pedidos', 'delete'),
  ('compras:pedidos:export', 'Compras > Pedidos > Exportar', 'compras', 'pedidos', 'export'),
  ('compras:checklist:view', 'Compras > Checklist > Ver', 'compras', 'checklist', 'view'),
  ('compras:checklist:edit', 'Compras > Checklist > Editar', 'compras', 'checklist', 'edit'),
  ('compras:checklist:approve', 'Compras > Checklist > Aprovar', 'compras', 'checklist', 'approve'),
  ('compras:calendario:view', 'Compras > Calendario > Ver', 'compras', 'calendario', 'view'),
  ('compras:calendario:edit', 'Compras > Calendario > Editar', 'compras', 'calendario', 'edit'),
  ('compras:calendario:export', 'Compras > Calendario > Exportar', 'compras', 'calendario', 'export'),
  ('compras:ranking:view', 'Compras > Ranking > Ver', 'compras', 'ranking', 'view'),
  ('compras:ranking:export', 'Compras > Ranking > Exportar', 'compras', 'ranking', 'export'),
  ('compras:fornecedores:view', 'Compras > Fornecedores > Ver', 'compras', 'fornecedores', 'view'),
  ('compras:fornecedores:create', 'Compras > Fornecedores > Criar', 'compras', 'fornecedores', 'create'),
  ('compras:fornecedores:edit', 'Compras > Fornecedores > Editar', 'compras', 'fornecedores', 'edit'),
  ('compras:fornecedores:delete', 'Compras > Fornecedores > Excluir', 'compras', 'fornecedores', 'delete'),
  ('compras:fornecedores:export', 'Compras > Fornecedores > Exportar', 'compras', 'fornecedores', 'export'),
  ('compras:recebimentos:view', 'Compras > Recebimentos > Ver', 'compras', 'recebimentos', 'view'),
  ('compras:recebimentos:create', 'Compras > Recebimentos > Criar', 'compras', 'recebimentos', 'create'),
  ('compras:recebimentos:edit', 'Compras > Recebimentos > Editar', 'compras', 'recebimentos', 'edit'),
  ('compras:recebimentos:close', 'Compras > Recebimentos > Fechar', 'compras', 'recebimentos', 'close'),
  ('compras:recebimentos:export', 'Compras > Recebimentos > Exportar', 'compras', 'recebimentos', 'export'),
  ('compras:confirmacoes:view', 'Compras > Confirmacoes > Ver', 'compras', 'confirmacoes', 'view'),
  ('compras:confirmacoes:approve', 'Compras > Confirmacoes > Confirmar', 'compras', 'confirmacoes', 'approve'),
  ('compras:alertas_falta:view', 'Compras > Itens em Falta > Ver', 'compras', 'alertas_falta', 'view'),
  ('compras:alertas_falta:approve', 'Compras > Itens em Falta > Confirmar', 'compras', 'alertas_falta', 'approve'),

  -- CMV
  ('cmv:categoria:view', 'CMV > Categoria > Ver', 'cmv', 'categoria', 'view'),
  ('cmv:categoria:export', 'CMV > Categoria > Exportar', 'cmv', 'categoria', 'export'),
  ('cmv:setor:view', 'CMV > Setor > Ver', 'cmv', 'setor', 'view'),
  ('cmv:setor:export', 'CMV > Setor > Exportar', 'cmv', 'setor', 'export'),
  ('cmv:top-itens:view', 'CMV > Top Itens > Ver', 'cmv', 'top-itens', 'view'),
  ('cmv:top-itens:export', 'CMV > Top Itens > Exportar', 'cmv', 'top-itens', 'export'),
  ('cmv:semanal:view', 'CMV > Semanal > Ver', 'cmv', 'semanal', 'view'),
  ('cmv:semanal:edit', 'CMV > Semanal > Editar', 'cmv', 'semanal', 'edit'),
  ('cmv:semanal:export', 'CMV > Semanal > Exportar', 'cmv', 'semanal', 'export'),

  -- Ficha Tecnica
  ('ficha:pre-preparos:view', 'Ficha > Pre-Preparos > Ver', 'ficha', 'pre-preparos', 'view'),
  ('ficha:pre-preparos:create', 'Ficha > Pre-Preparos > Criar', 'ficha', 'pre-preparos', 'create'),
  ('ficha:pre-preparos:edit', 'Ficha > Pre-Preparos > Editar', 'ficha', 'pre-preparos', 'edit'),
  ('ficha:pre-preparos:delete', 'Ficha > Pre-Preparos > Excluir', 'ficha', 'pre-preparos', 'delete'),
  ('ficha:itens-prontos:view', 'Ficha > Itens Prontos > Ver', 'ficha', 'itens-prontos', 'view'),
  ('ficha:itens-prontos:create', 'Ficha > Itens Prontos > Criar', 'ficha', 'itens-prontos', 'create'),
  ('ficha:itens-prontos:edit', 'Ficha > Itens Prontos > Editar', 'ficha', 'itens-prontos', 'edit'),
  ('ficha:itens-prontos:delete', 'Ficha > Itens Prontos > Excluir', 'ficha', 'itens-prontos', 'delete'),
  ('ficha:produtos-finais:view', 'Ficha > Produtos Finais > Ver', 'ficha', 'produtos-finais', 'view'),
  ('ficha:produtos-finais:create', 'Ficha > Produtos Finais > Criar', 'ficha', 'produtos-finais', 'create'),
  ('ficha:produtos-finais:edit', 'Ficha > Produtos Finais > Editar', 'ficha', 'produtos-finais', 'edit'),
  ('ficha:produtos-finais:delete', 'Ficha > Produtos Finais > Excluir', 'ficha', 'produtos-finais', 'delete'),
  ('ficha:canais:view', 'Ficha > Canais > Ver', 'ficha', 'canais', 'view'),
  ('ficha:canais:manage', 'Ficha > Canais > Gerenciar', 'ficha', 'canais', 'manage'),
  ('ficha:analise:view', 'Ficha > Analise > Ver', 'ficha', 'analise', 'view'),
  ('ficha:analise:simulate', 'Ficha > Analise > Simular', 'ficha', 'analise', 'simulate'),
  ('ficha:markup:view', 'Ficha > Markup > Ver', 'ficha', 'markup', 'view'),
  ('ficha:markup:manage', 'Ficha > Markup > Gerenciar', 'ficha', 'markup', 'manage'),

  -- Planning
  ('planning:meta-compras:view', 'Planning > Meta Compras > Ver', 'planning', 'meta-compras', 'view'),
  ('planning:meta-compras:edit', 'Planning > Meta Compras > Editar', 'planning', 'meta-compras', 'edit'),
  ('planning:projecao:view', 'Planning > Projecao > Ver', 'planning', 'projecao', 'view'),
  ('planning:ritmo:view', 'Planning > Ritmo > Ver', 'planning', 'ritmo', 'view'),
  ('planning:pressao:view', 'Planning > Pressao > Ver', 'planning', 'pressao', 'view'),
  ('planning:radar:view', 'Planning > Radar > Ver', 'planning', 'radar', 'view'),
  ('planning:simulador:view', 'Planning > Simulador > Ver', 'planning', 'simulador', 'view'),

  -- IA
  ('ia:consultor-geral:view', 'IA > Consultor Geral > Ver', 'ia', 'consultor-geral', 'view'),
  ('ia:consultor-geral:create', 'IA > Consultor Geral > Criar', 'ia', 'consultor-geral', 'create'),
  ('ia:salmon-intelligence:view', 'IA > Salmon Intelligence > Ver', 'ia', 'salmon-intelligence', 'view'),
  ('ia:salmon-intelligence:create', 'IA > Salmon Intelligence > Criar', 'ia', 'salmon-intelligence', 'create'),
  ('ia:estoque-geral:view', 'IA > Estoque Geral > Ver', 'ia', 'estoque-geral', 'view'),
  ('ia:estoque-geral:create', 'IA > Estoque Geral > Criar', 'ia', 'estoque-geral', 'create'),
  ('ia:analista-cmv:view', 'IA > Analista CMV > Ver', 'ia', 'analista-cmv', 'view'),
  ('ia:analista-cmv:create', 'IA > Analista CMV > Criar', 'ia', 'analista-cmv', 'create'),
  ('ia:consultor-compras:view', 'IA > Consultor Compras > Ver', 'ia', 'consultor-compras', 'view'),
  ('ia:consultor-compras:create', 'IA > Consultor Compras > Criar', 'ia', 'consultor-compras', 'create'),
  ('ia:ficha-tecnica:view', 'IA > Ficha Tecnica > Ver', 'ia', 'ficha-tecnica', 'view'),
  ('ia:ficha-tecnica:create', 'IA > Ficha Tecnica > Criar', 'ia', 'ficha-tecnica', 'create'),
  ('ia:consultor-financeiro:view', 'IA > Consultor Financeiro > Ver', 'ia', 'consultor-financeiro', 'view'),
  ('ia:consultor-financeiro:create', 'IA > Consultor Financeiro > Criar', 'ia', 'consultor-financeiro', 'create'),
  ('ia:consultor-rh:view', 'IA > Consultor RH > Ver', 'ia', 'consultor-rh', 'view'),
  ('ia:consultor-rh:create', 'IA > Consultor RH > Criar', 'ia', 'consultor-rh', 'create'),
  ('ia:logs:view', 'IA > Logs > Ver', 'ia', 'logs', 'view'),

  -- RH
  ('rh:prontuario:view', 'RH > Prontuario > Ver', 'rh', 'prontuario', 'view'),
  ('rh:prontuario:create', 'RH > Prontuario > Criar', 'rh', 'prontuario', 'create'),
  ('rh:prontuario:edit', 'RH > Prontuario > Editar', 'rh', 'prontuario', 'edit'),
  ('rh:prontuario:delete', 'RH > Prontuario > Excluir', 'rh', 'prontuario', 'delete'),
  ('rh:prontuario:manage', 'RH > Prontuario > Gerenciar', 'rh', 'prontuario', 'manage'),
  ('rh:escalas:view', 'RH > Escalas > Ver', 'rh', 'escalas', 'view'),
  ('rh:escalas:create', 'RH > Escalas > Criar', 'rh', 'escalas', 'create'),
  ('rh:escalas:edit', 'RH > Escalas > Editar', 'rh', 'escalas', 'edit'),
  ('rh:escalas:delete', 'RH > Escalas > Excluir', 'rh', 'escalas', 'delete'),
  ('rh:tarefas:view', 'RH > Tarefas > Ver', 'rh', 'tarefas', 'view'),
  ('rh:tarefas:create', 'RH > Tarefas > Criar', 'rh', 'tarefas', 'create'),
  ('rh:tarefas:edit', 'RH > Tarefas > Editar', 'rh', 'tarefas', 'edit'),
  ('rh:tarefas:delete', 'RH > Tarefas > Excluir', 'rh', 'tarefas', 'delete'),
  ('rh:onboarding:view', 'RH > Onboarding > Ver', 'rh', 'onboarding', 'view'),
  ('rh:onboarding:manage', 'RH > Onboarding > Gerenciar', 'rh', 'onboarding', 'manage'),
  ('rh:treinamento:view', 'RH > Treinamento > Ver', 'rh', 'treinamento', 'view'),
  ('rh:treinamento:create', 'RH > Treinamento > Criar', 'rh', 'treinamento', 'create'),
  ('rh:treinamento:edit', 'RH > Treinamento > Editar', 'rh', 'treinamento', 'edit'),
  ('rh:treinamento:delete', 'RH > Treinamento > Excluir', 'rh', 'treinamento', 'delete'),
  ('rh:ferias:view', 'RH > Ferias > Ver', 'rh', 'ferias', 'view'),
  ('rh:ferias:create', 'RH > Ferias > Criar', 'rh', 'ferias', 'create'),
  ('rh:ferias:approve', 'RH > Ferias > Aprovar', 'rh', 'ferias', 'approve'),
  ('rh:documentos:view', 'RH > Documentos > Ver', 'rh', 'documentos', 'view'),
  ('rh:documentos:create', 'RH > Documentos > Criar', 'rh', 'documentos', 'create'),
  ('rh:documentos:edit', 'RH > Documentos > Editar', 'rh', 'documentos', 'edit'),
  ('rh:documentos:delete', 'RH > Documentos > Excluir', 'rh', 'documentos', 'delete'),
  ('rh:documentos:manage', 'RH > Documentos > Gerenciar', 'rh', 'documentos', 'manage'),
  ('rh:folha:view', 'RH > Folha > Ver', 'rh', 'folha', 'view'),
  ('rh:folha:export', 'RH > Folha > Exportar', 'rh', 'folha', 'export'),
  ('rh:folha:manage', 'RH > Folha > Gerenciar', 'rh', 'folha', 'manage'),
  ('rh:beneficios:view', 'RH > Beneficios > Ver', 'rh', 'beneficios', 'view'),
  ('rh:beneficios:create', 'RH > Beneficios > Criar', 'rh', 'beneficios', 'create'),
  ('rh:beneficios:edit', 'RH > Beneficios > Editar', 'rh', 'beneficios', 'edit'),
  ('rh:beneficios:delete', 'RH > Beneficios > Excluir', 'rh', 'beneficios', 'delete'),
  ('rh:dashboard:view', 'RH > Dashboard > Ver', 'rh', 'dashboard', 'view'),
  ('rh:custos:view', 'RH > Custos > Ver', 'rh', 'custos', 'view'),
  ('rh:custos:export', 'RH > Custos > Exportar', 'rh', 'custos', 'export'),
  ('rh:sst:view', 'RH > SST > Ver', 'rh', 'sst', 'view'),
  ('rh:sst:create', 'RH > SST > Criar', 'rh', 'sst', 'create'),
  ('rh:sst:edit', 'RH > SST > Editar', 'rh', 'sst', 'edit'),
  ('rh:sst:delete', 'RH > SST > Excluir', 'rh', 'sst', 'delete'),
  ('rh:disciplinar:view', 'RH > Disciplinar > Ver', 'rh', 'disciplinar', 'view'),
  ('rh:disciplinar:create', 'RH > Disciplinar > Criar', 'rh', 'disciplinar', 'create'),
  ('rh:disciplinar:edit', 'RH > Disciplinar > Editar', 'rh', 'disciplinar', 'edit'),
  ('rh:disciplinar:delete', 'RH > Disciplinar > Excluir', 'rh', 'disciplinar', 'delete'),
  ('rh:mural:view', 'RH > Mural > Ver', 'rh', 'mural', 'view'),
  ('rh:mural:create', 'RH > Mural > Criar', 'rh', 'mural', 'create'),
  ('rh:ponto:view', 'RH > Ponto > Ver', 'rh', 'ponto', 'view'),
  ('rh:ponto:create', 'RH > Ponto > Registrar', 'rh', 'ponto', 'create'),
  ('rh:ponto:manage', 'RH > Ponto > Gerenciar', 'rh', 'ponto', 'manage'),
  ('rh:ponto:approve', 'RH > Ponto > Aprovar', 'rh', 'ponto', 'approve'),
  ('rh:banco-horas:view', 'RH > Banco de Horas > Ver', 'rh', 'banco-horas', 'view'),
  ('rh:banco-horas:manage', 'RH > Banco de Horas > Gerenciar', 'rh', 'banco-horas', 'manage'),
  ('rh:banco-horas:reconcile', 'RH > Banco de Horas > Recalcular', 'rh', 'banco-horas', 'reconcile'),

  -- Financeiro
  ('financeiro:dashboard:view', 'Financeiro > Dashboard > Ver', 'financeiro', 'dashboard', 'view'),
  ('financeiro:fechamento:view', 'Financeiro > Fechamento > Ver', 'financeiro', 'fechamento', 'view'),
  ('financeiro:fechamento:create', 'Financeiro > Fechamento > Criar', 'financeiro', 'fechamento', 'create'),
  ('financeiro:fechamento:edit', 'Financeiro > Fechamento > Editar', 'financeiro', 'fechamento', 'edit'),
  ('financeiro:fechamento:close', 'Financeiro > Fechamento > Fechar', 'financeiro', 'fechamento', 'close'),
  ('financeiro:cadastros:view', 'Financeiro > Cadastros > Ver', 'financeiro', 'cadastros', 'view'),
  ('financeiro:cadastros:create', 'Financeiro > Cadastros > Criar', 'financeiro', 'cadastros', 'create'),
  ('financeiro:cadastros:edit', 'Financeiro > Cadastros > Editar', 'financeiro', 'cadastros', 'edit'),
  ('financeiro:cadastros:delete', 'Financeiro > Cadastros > Excluir', 'financeiro', 'cadastros', 'delete'),
  ('financeiro:cadastros:manage', 'Financeiro > Cadastros > Gerenciar', 'financeiro', 'cadastros', 'manage'),
  ('financeiro:cadastros:export', 'Financeiro > Cadastros > Exportar', 'financeiro', 'cadastros', 'export'),
  ('financeiro:contas:view', 'Financeiro > Contas > Ver', 'financeiro', 'contas', 'view'),
  ('financeiro:contas:create', 'Financeiro > Contas > Criar', 'financeiro', 'contas', 'create'),
  ('financeiro:contas:edit', 'Financeiro > Contas > Editar', 'financeiro', 'contas', 'edit'),
  ('financeiro:contas:delete', 'Financeiro > Contas > Excluir', 'financeiro', 'contas', 'delete'),
  ('financeiro:contas:export', 'Financeiro > Contas > Exportar', 'financeiro', 'contas', 'export'),
  ('financeiro:lancamentos:view', 'Financeiro > Lancamentos > Ver', 'financeiro', 'lancamentos', 'view'),
  ('financeiro:lancamentos:create', 'Financeiro > Lancamentos > Criar', 'financeiro', 'lancamentos', 'create'),
  ('financeiro:lancamentos:edit', 'Financeiro > Lancamentos > Editar', 'financeiro', 'lancamentos', 'edit'),
  ('financeiro:lancamentos:delete', 'Financeiro > Lancamentos > Excluir', 'financeiro', 'lancamentos', 'delete'),
  ('financeiro:lancamentos:export', 'Financeiro > Lancamentos > Exportar', 'financeiro', 'lancamentos', 'export'),
  ('financeiro:pagar:view', 'Financeiro > Contas a Pagar > Ver', 'financeiro', 'pagar', 'view'),
  ('financeiro:pagar:create', 'Financeiro > Contas a Pagar > Criar', 'financeiro', 'pagar', 'create'),
  ('financeiro:pagar:edit', 'Financeiro > Contas a Pagar > Editar', 'financeiro', 'pagar', 'edit'),
  ('financeiro:pagar:approve', 'Financeiro > Contas a Pagar > Aprovar', 'financeiro', 'pagar', 'approve'),
  ('financeiro:pagar:delete', 'Financeiro > Contas a Pagar > Excluir', 'financeiro', 'pagar', 'delete'),
  ('financeiro:pagar:export', 'Financeiro > Contas a Pagar > Exportar', 'financeiro', 'pagar', 'export'),
  ('financeiro:receber:view', 'Financeiro > Contas a Receber > Ver', 'financeiro', 'receber', 'view'),
  ('financeiro:receber:create', 'Financeiro > Contas a Receber > Criar', 'financeiro', 'receber', 'create'),
  ('financeiro:receber:edit', 'Financeiro > Contas a Receber > Editar', 'financeiro', 'receber', 'edit'),
  ('financeiro:receber:delete', 'Financeiro > Contas a Receber > Excluir', 'financeiro', 'receber', 'delete'),
  ('financeiro:receber:export', 'Financeiro > Contas a Receber > Exportar', 'financeiro', 'receber', 'export'),
  ('financeiro:fluxo:view', 'Financeiro > Fluxo de Caixa > Ver', 'financeiro', 'fluxo', 'view'),
  ('financeiro:fluxo:export', 'Financeiro > Fluxo de Caixa > Exportar', 'financeiro', 'fluxo', 'export'),
  ('financeiro:dre:view', 'Financeiro > DRE > Ver', 'financeiro', 'dre', 'view'),
  ('financeiro:dre:export', 'Financeiro > DRE > Exportar', 'financeiro', 'dre', 'export'),
  ('financeiro:orcamento:view', 'Financeiro > Orcamento > Ver', 'financeiro', 'orcamento', 'view'),
  ('financeiro:orcamento:edit', 'Financeiro > Orcamento > Editar', 'financeiro', 'orcamento', 'edit'),
  ('financeiro:orcamento:delete', 'Financeiro > Orcamento > Excluir', 'financeiro', 'orcamento', 'delete'),
  ('financeiro:orcamento:export', 'Financeiro > Orcamento > Exportar', 'financeiro', 'orcamento', 'export'),
  ('financeiro:conciliacao:view', 'Financeiro > Conciliacao > Ver', 'financeiro', 'conciliacao', 'view'),
  ('financeiro:conciliacao:reconcile', 'Financeiro > Conciliacao > Conciliar', 'financeiro', 'conciliacao', 'reconcile'),
  ('financeiro:alertas:view', 'Financeiro > Alertas > Ver', 'financeiro', 'alertas', 'view'),
  ('financeiro:alertas:export', 'Financeiro > Alertas > Exportar', 'financeiro', 'alertas', 'export'),
  ('financeiro:recorrencias:view', 'Financeiro > Recorrencias > Ver', 'financeiro', 'recorrencias', 'view'),
  ('financeiro:recorrencias:create', 'Financeiro > Recorrencias > Criar', 'financeiro', 'recorrencias', 'create'),
  ('financeiro:recorrencias:edit', 'Financeiro > Recorrencias > Editar', 'financeiro', 'recorrencias', 'edit'),
  ('financeiro:recorrencias:delete', 'Financeiro > Recorrencias > Excluir', 'financeiro', 'recorrencias', 'delete'),
  ('financeiro:recorrencias:export', 'Financeiro > Recorrencias > Exportar', 'financeiro', 'recorrencias', 'export'),
  ('financeiro:categorizacao:view', 'Financeiro > Categorizacao > Ver', 'financeiro', 'categorizacao', 'view'),
  ('financeiro:categorizacao:create', 'Financeiro > Categorizacao > Criar Regra', 'financeiro', 'categorizacao', 'create'),
  ('financeiro:categorizacao:edit', 'Financeiro > Categorizacao > Editar Regra', 'financeiro', 'categorizacao', 'edit'),
  ('financeiro:categorizacao:delete', 'Financeiro > Categorizacao > Excluir Regra', 'financeiro', 'categorizacao', 'delete'),
  ('financeiro:categorizacao:manage', 'Financeiro > Categorizacao > Aplicar', 'financeiro', 'categorizacao', 'manage'),
  ('financeiro:relatorio-socios:view', 'Financeiro > Relatorio Socios > Ver', 'financeiro', 'relatorio-socios', 'view'),
  ('financeiro:relatorio-socios:export', 'Financeiro > Relatorio Socios > Exportar', 'financeiro', 'relatorio-socios', 'export'),
  ('financeiro:projecao:view', 'Financeiro > Projecao > Ver', 'financeiro', 'projecao', 'view'),
  ('financeiro:projecao:export', 'Financeiro > Projecao > Exportar', 'financeiro', 'projecao', 'export'),
  ('financeiro:kpis:view', 'Financeiro > KPIs > Ver', 'financeiro', 'kpis', 'view'),
  ('financeiro:kpis:export', 'Financeiro > KPIs > Exportar', 'financeiro', 'kpis', 'export'),
  ('financeiro:auditoria:view', 'Financeiro > Auditoria > Ver', 'financeiro', 'auditoria', 'view'),
  ('financeiro:auditoria:export', 'Financeiro > Auditoria > Exportar', 'financeiro', 'auditoria', 'export'),
  ('financeiro:comparativo:view', 'Financeiro > Comparativo > Ver', 'financeiro', 'comparativo', 'view'),
  ('financeiro:comparativo:export', 'Financeiro > Comparativo > Exportar', 'financeiro', 'comparativo', 'export'),

  -- Configuracoes
  ('configuracoes:geral:view', 'Configuracoes > Geral > Ver', 'configuracoes', 'geral', 'view'),
  ('configuracoes:geral:manage', 'Configuracoes > Geral > Gerenciar', 'configuracoes', 'geral', 'manage'),
  ('configuracoes:salmon:view', 'Configuracoes > Salmon > Ver', 'configuracoes', 'salmon', 'view'),
  ('configuracoes:salmon:manage', 'Configuracoes > Salmon > Gerenciar', 'configuracoes', 'salmon', 'manage'),
  ('configuracoes:usuarios:view', 'Configuracoes > Usuarios > Ver', 'configuracoes', 'usuarios', 'view'),
  ('configuracoes:usuarios:create', 'Configuracoes > Usuarios > Criar', 'configuracoes', 'usuarios', 'create'),
  ('configuracoes:usuarios:edit', 'Configuracoes > Usuarios > Editar', 'configuracoes', 'usuarios', 'edit'),
  ('configuracoes:usuarios:delete', 'Configuracoes > Usuarios > Excluir', 'configuracoes', 'usuarios', 'delete'),
  ('configuracoes:usuarios:manage', 'Configuracoes > Usuarios > Gerenciar Permissoes', 'configuracoes', 'usuarios', 'manage'),
  ('configuracoes:auditoria-sistema:view', 'Configuracoes > Auditoria Sistema > Ver', 'configuracoes', 'auditoria-sistema', 'view'),
  ('configuracoes:performance:view', 'Configuracoes > Performance > Ver', 'configuracoes', 'performance', 'view'),
  ('configuracoes:auditoria-seguranca:view', 'Configuracoes > Auditoria Seguranca > Ver', 'configuracoes', 'auditoria-seguranca', 'view'),
  ('configuracoes:auditoria-compras:view', 'Configuracoes > Auditoria Compras > Ver', 'configuracoes', 'auditoria-compras', 'view'),
  ('configuracoes:empresas:view', 'Configuracoes > Empresas > Ver', 'configuracoes', 'empresas', 'view'),
  ('configuracoes:empresas:create', 'Configuracoes > Empresas > Criar', 'configuracoes', 'empresas', 'create'),
  ('configuracoes:empresas:edit', 'Configuracoes > Empresas > Editar', 'configuracoes', 'empresas', 'edit'),
  ('configuracoes:empresas:delete', 'Configuracoes > Empresas > Desativar', 'configuracoes', 'empresas', 'delete')

ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  submodule = EXCLUDED.submodule,
  action = EXCLUDED.action;


-- ─── PART B: Grant ALL permissions to full-access roles ───
-- admin, diretor, gerente_geral get everything EXCEPT system:global:manage
-- (system:global:manage is reserved for super-admins only)

INSERT INTO public.role_permissions (role, permission_key)
SELECT r.role, p.key
FROM (VALUES ('admin'), ('diretor'), ('gerente_geral')) AS r(role)
CROSS JOIN public.permissions p
WHERE p.key <> 'system:global:manage'
ON CONFLICT (role, permission_key) DO NOTHING;

-- ─── PART C: Remove system:global:manage from admin role ───
-- The original seed (migration 20260227162334) gave admin ALL permissions
-- including system:global:manage. That key is reserved for super-admins only.
-- Super-admins must have it via user_permissions (direct grant), not via role.
DELETE FROM public.role_permissions
WHERE role IN ('admin', 'diretor', 'gerente_geral') AND permission_key = 'system:global:manage';

-- ─── PART D: Ensure existing super-admin keeps system:global:manage ───
-- Grant system:global:manage directly to the MarginPro super-admin user
-- via user_permissions so it's not lost when removed from role_permissions.
-- This is a direct user-level permission, independent of any role.
INSERT INTO public.user_permissions (user_id, permission_key, effect)
SELECT p.id, 'system:global:manage', 'ALLOW'
FROM profiles p
WHERE p.email = 'morallesfilms@gmail.com'
ON CONFLICT (user_id, permission_key) DO UPDATE SET effect = 'ALLOW';

NOTIFY pgrst, 'reload schema';
