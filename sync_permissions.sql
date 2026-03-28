-- 1. Garante que a função tenha acesso total às tabelas
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 2. Popula a tabela de permissões (se estiver vazia)
INSERT INTO permissions (key, module, submodule, action, description)
SELECT 
    m.mod || ':' || s.sub || ':' || a.act as key,
    m.mod,
    s.sub,
    a.act,
    m.mod || ' - ' || s.sub || ' - ' || a.act
FROM 
    (SELECT unnest(ARRAY['system', 'relatorios', 'salmon', 'estoque', 'inventario', 'compras', 'cmv', 'ficha', 'planning', 'ia', 'rh', 'financeiro', 'configuracoes']) as mod) m,
    (SELECT unnest(ARRAY['dashboard', 'view', 'edit', 'create', 'delete', 'manage', 'export', 'cmv', 'entradas', 'manipulacao', 'metas', 'planejamento', 'saldo', 'movimentacoes', 'requisicoes', 'catalogo', 'cadastros', 'lista', 'criar', 'rapido', 'detalhe', 'auditoria', 'conferentes', 'pedidos', 'checklist', 'calendario', 'ranking', 'fornecedores', 'recebimentos', 'confirmacoes', 'alertas_falta', 'categoria', 'setor', 'top-itens', 'semanal', 'pre-preparos', 'itens-prontos', 'produtos-finais', 'canais', 'analise', 'markup', 'meta-compras', 'projecao', 'ritmo', 'pressao', 'radar', 'simulador', 'consultor-geral', 'salmon-intelligence', 'estoque-geral', 'analista-cmv', 'consultor-compras', 'ficha-tecnica', 'consultor-financeiro', 'consultor-rh', 'logs', 'prontuario', 'escalas', 'tarefas', 'onboarding', 'treinamento', 'ferias', 'documentos', 'folha', 'beneficios', 'custos', 'sst', 'disciplinar', 'mural', 'ponto', 'banco-horas', 'fechamento', 'cadastros', 'contas', 'lancamentos', 'pagar', 'receber', 'fluxo', 'dre', 'orcamento', 'conciliacao', 'alertas', 'recorrencias', 'categorizacao', 'relatorio-socios', 'kpis', 'comparativo', 'geral', 'usuarios', 'auditoria-sistema', 'performance', 'auditoria-seguranca', 'auditoria-compras', 'global']) as sub) s,
    (SELECT unnest(ARRAY['view', 'create', 'edit', 'delete', 'export', 'manage', 'approve', 'close', 'cancel', 'simulate', 'reconcile']) as act) a
ON CONFLICT (key) DO NOTHING;

-- 3. Verifica se funcionou (veja se o resultado é maior que 0)
SELECT count(*) as total_permissoes FROM permissions;
