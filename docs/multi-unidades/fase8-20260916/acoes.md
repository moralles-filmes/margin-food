# Índice por ação do candidato

Leia com MAPA-DE-CONFIANCA.md. Extração AST de condições, literais e acessos diretos; não é certificação nem inventário transitivo. Corpos integrais por condição e chamadas do arquivo inteiro em edges.json. Gates comuns, interpolados e de helpers estão descritos no mapa e no fonte.

| Fonte/linha | Condição | Literais de permissão presentes | Tabelas/RPCs diretas no bloco |
|---|---|---|---|
| admin-users:26 | action === 'list' ? !(canManage \|\| has('configuracoes:usuarios:view')) : !canManage | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| admin-users:67 | action === 'list' | gate comum/dinâmico; ver mapa | company_memberships, user_roles, user_permissions, job_roles |
| admin-users:81 | action === 'create' | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| admin-users:88 | ['edit-user','update-role','disable','enable','delete','reset-password'].includes(action) | gate comum/dinâmico; ver mapa | profiles |
| admin-users:92 | action === 'edit-user' \|\| action === 'update-role' | gate comum/dinâmico; ver mapa | profiles |
| admin-users:111 | action === 'reset-password' | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| admin-users:120 | action==='delete' && (typeof body.motivo!=='string' \|\| body.motivo.trim().length<3) | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| admin-users:122 | action==='delete' | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| admin-users:125 | action==='create-job-role' | gate comum/dinâmico; ver mapa | job_roles |
| admin-users:131 | action==='toggle-job-role' | gate comum/dinâmico; ver mapa | job_roles |
| ai-chat:115 | !ALLOWED_ACTIONS.has(action) | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| inventario:81 | action === 'list' | inventario:lista:view | inventarios |
| inventario:119 | action === 'list_turnos' | inventario:detalhe:view, inventario:criar:create, inventario:lista:view | turnos |
| inventario:131 | action === 'get' | inventario:detalhe:view | inventarios, inventario_itens, audit_inventario_log |
| inventario:149 | action === 'create' | inventario:criar:create | create_inventory_atomic, inventarios, inventario_itens |
| inventario:200 | action === 'update_status' | inventario:detalhe:edit, inventario:auditoria:approve, system:global:manage | inventarios |
| inventario:218 | action === 'update_contagem' | inventario:detalhe:edit | inventario_itens |
| inventario:275 | action === 'finalizar' | inventario:detalhe:close, inventario:auditoria:approve, system:global:manage | inventarios, inventario_itens, finalize_inventory_atomic |
| inventario:417 | action === 'aprovar_analise' | inventario:auditoria:approve, system:global:manage | inventarios |
| inventario:437 | action === 'correcao_posterior' | inventario:auditoria:edit, system:global:manage | inventarios, produtos, inventario_itens, movimentacoes_estoque |
| inventario:478 | action === 'dashboard' | inventario:dashboard:view | inventarios, inventario_itens, profiles |
| inventario:551 | action === 'reopen' | inventario:auditoria:edit | reopen_inventory |
| inventario:573 | action === 'delete_inventory' | inventario:lista:delete | soft_delete_inventory |
| inventario:595 | action === 'audit_logs' | inventario:auditoria:view | audit_inventario_log |
| inventario:608 | action === 'list_conferentes' | inventario:conferentes:view, inventario:conferentes:manage | inventario_conferentes, profiles |
| inventario:633 | action === 'add_conferente' | inventario:conferentes:manage | company_memberships, inventario_conferentes |
| inventario:657 | action === 'remove_conferente' | inventario:conferentes:manage | inventario_conferentes |
| inventario:672 | action === 'assign_conferente' | inventario:detalhe:edit, inventario:conferentes:manage | inventarios, inventario_conferentes, notifications |
| purchase-requisitions:96 | !action | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| purchase-requisitions:118 | action === "listar" | gate comum/dinâmico; ver mapa | purchase_requisitions, profiles |
| purchase-requisitions:152 | action === "detalhe" | gate comum/dinâmico; ver mapa | purchase_requisitions, purchase_requisition_audit, profiles |
| purchase-requisitions:206 | action === "criar" | gate comum/dinâmico; ver mapa | purchase_requisitions, purchase_requisition_items, purchase_requisition_audit |
| purchase-requisitions:265 | action === "editar" | gate comum/dinâmico; ver mapa | purchase_requisitions, purchase_requisition_items, purchase_requisition_audit |
| purchase-requisitions:333 | action === "ignorar_item" | gate comum/dinâmico; ver mapa | purchase_requisition_items, purchase_requisitions, purchase_requisition_audit |
| purchase-requisitions:379 | action === "converter" | gate comum/dinâmico; ver mapa | purchase_requisitions, purchase_requisition_audit |
| requisicao-estoque:204 | !action \|\| typeof action !== "string" | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| requisicao-estoque:211 | action === "editar_movimentacao" | estoque:movimentacoes:edit, estoque:movimentacoes:manage, system:global:manage | movimentacoes_estoque, inventarios |
| requisicao-estoque:300 | action === "cancelar_movimentacao" | estoque:movimentacoes:cancel, estoque:movimentacoes:edit, estoque:movimentacoes:manage, system:global:manage | movimentacoes_estoque, inventarios, salmon_entries, salmon_manipulations |
| requisicao-estoque:436 | action === "criar" | estoque:requisicoes:create, stock:requisitions:create, system:global:manage | produtos, get_saldo_produto, requisicoes_estoque, requisicao_estoque_itens, alertas_falta_estoque |
| requisicao-estoque:746 | action === "recusar_item" | estoque:requisicoes:approve, estoque:requisicoes:close, system:global:manage | requisicoes_estoque, requisicao_estoque_itens |
| requisicao-estoque:813 | action === "atender_item" | estoque:requisicoes:approve, estoque:requisicoes:close, estoque:movimentacoes:create, system:global:manage | helper; ver corpo integral |
| requisicao-estoque:858 | action === "atender" | estoque:requisicoes:approve, estoque:requisicoes:close, estoque:movimentacoes:create, system:global:manage | requisicoes_estoque, produtos, alertas_falta_estoque |
| requisicao-estoque:977 | action === "negar" | estoque:requisicoes:approve, estoque:requisicoes:close, system:global:manage | requisicao_estoque_itens, requisicoes_estoque |
| requisicao-estoque:1034 | action === "marcar_requisicao_visto" | system:global:manage | requisicoes_estoque, notifications |
| requisicao-estoque:1075 | action === "soft_delete_requisicao" | estoque:requisicoes:delete, estoque:requisicoes:manage, system:global:manage | requisicoes_estoque |
| requisicao-estoque:1136 | action === "listar" | gate comum/dinâmico; ver mapa | requisicao_estoque_itens, requisicoes_estoque |
| requisicao-estoque:1190 | action === "saldo" | gate comum/dinâmico; ver mapa | produtos, get_saldo_produto |
| cmv:66 | action === 'calcular_cmv' | cmv:categoria:view | helper; ver corpo integral |
| cmv:71 | action === 'get_faturamento' | cmv:categoria:view | helper; ver corpo integral |
| cmv:76 | action === 'save_faturamento' | financeiro:fechamento:create | helper; ver corpo integral |
| cmv:81 | action === 'get_metas' | cmv:semanal:view | helper; ver corpo integral |
| cmv:86 | action === 'save_meta' | cmv:semanal:edit | helper; ver corpo integral |
| cmv:91 | action === 'get_ranking_itens' | cmv:top-itens:view | helper; ver corpo integral |
| cmv:96 | action === 'recalcular_precos_produto' | estoque:cadastros:manage | helper; ver corpo integral |
| cmv:101 | action === 'recalcular_todos_precos' | estoque:cadastros:manage | helper; ver corpo integral |
| cmv:106 | action === 'get_historico_precos' | cmv:top-itens:view | helper; ver corpo integral |
| rh:55 | action === "calcular_banco_horas" | rh:banco-horas:reconcile | rh_colaboradores, rh_ponto_registros, rh_banco_horas, rh_audit_log |
| ficha-tecnica:105 | action === 'listar_componentes' | ficha:pre-preparos:view, ficha:itens-prontos:view, ficha:produtos-finais:view, ficha:analise:view, ficha:markup:view, system:global:manage | helper; ver corpo integral |
| ficha-tecnica:114 | action === 'get_componente_detalhe' | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| ficha-tecnica:121 | action === 'calcular_custo_componente' | ficha:pre-preparos:view, ficha:itens-prontos:view, ficha:produtos-finais:view, ficha:markup:view, system:global:manage | helper; ver corpo integral |
| ficha-tecnica:130 | action === 'calcular_custo_arvore' | ficha:analise:view, ficha:markup:view, system:global:manage | helper; ver corpo integral |
| ficha-tecnica:140 | action === 'salvar_componente' | gate comum/dinâmico; ver mapa | ficha_componentes |
| ficha-tecnica:161 | action === 'salvar_componente_itens' | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| ficha-tecnica:172 | action === 'deletar_componente' | gate comum/dinâmico; ver mapa | ficha_componentes |
| ficha-tecnica:189 | action === 'listar_canais' | ficha:canais:view | helper; ver corpo integral |
| ficha-tecnica:195 | action === 'salvar_canal' | ficha:canais:manage | canais_venda |
| ficha-tecnica:213 | action === 'deletar_canal' | ficha:canais:manage | canais_venda |
| ficha-tecnica:228 | action === 'salvar_precificacao' | ficha:markup:manage | helper; ver corpo integral |
| ficha-tecnica:238 | action === 'get_precificacao' | ficha:markup:view | helper; ver corpo integral |
| ficha-tecnica:244 | action === 'recalcular_todos_custos' | ficha:markup:manage | helper; ver corpo integral |
| ficha-tecnica:256 | action === 'simular_cenario' | ficha:analise:simulate | helper; ver corpo integral |
| ficha-tecnica:262 | action === 'salvar_cenario' | ficha:analise:simulate | helper; ver corpo integral |
| ficha-tecnica:275 | action === 'get_preco_referencia_salmao' | ficha:analise:view | helper; ver corpo integral |
| ficha-tecnica:281 | action === 'set_preco_referencia_salmao' | ficha:markup:manage | config_precificacao |
| ficha-tecnica:294 | action === 'sync_preco_salmao_auto' | ficha:markup:manage | helper; ver corpo integral |
| admin-companies:51 | action === 'create-first-user' | gate comum/dinâmico; ver mapa | companies |
| scheduled-jobs:42 | !["refresh_all", "refresh_mvs", "cleanup"].includes(action) | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| scheduled-jobs:51 | action === "refresh_all" \|\| action === "refresh_mvs" | gate comum/dinâmico; ver mapa | refresh_materialized_views |
| scheduled-jobs:57 | action === "refresh_all" \|\| action === "cleanup" | gate comum/dinâmico; ver mapa | cleanup_old_audit_logs |
| cotacao-ia:144 | !task \|\| !TASKS.has(task) | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| cotacao-ia:145 | task === "gerar_mensagem" && (!tipo \|\| !TIPOS.has(tipo)) | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
| cotacao-ia:189 | task === "gerar_mensagem" | gate comum/dinâmico; ver mapa | helper; ver corpo integral |
