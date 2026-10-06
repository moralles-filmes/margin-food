# 📦 MarginPro — Documento Completo de Arquitetura do Sistema

> **Versão:** 2026-03-13  
> **Objetivo:** Bootstrap de contexto para novos chats de desenvolvimento com IA.  
> **Regra:** Este documento é a fonte de verdade sobre a arquitetura. Mantenha-o atualizado.

---

> Multiunidades: ver [arquitetura, implantação e rollback](multi-unidades/02-ARQUITETURA-E-OPERACAO.md). As mudanças requerem publicação coordenada de banco, Edge Functions e frontend.

## 1. VISÃO GERAL DO SISTEMA

### 1.1 Identidade
- **Nome:** MarginPro
- **Tipo:** SaaS multi-tenant (B2B)
- **Público-alvo:** Restaurantes, cozinhas industriais e operações de food service
- **Objetivo:** Sistema completo de gestão operacional e financeira para restaurantes, cobrindo estoque, compras, CMV, ficha técnica, planejamento, RH, financeiro e inteligência artificial

### 1.2 Problemas que Resolve
- Controle granular de estoque com rastreabilidade de custos
- Gestão de salmão com controle de aproveitamento bruto→limpo
- Cálculo automático de CMV (Custo de Mercadoria Vendida)
- Ficha técnica com precificação e simulação de cenários
- Planejamento de compras com alertas de pressão orçamentária
- Inventário físico com auditoria e análise de risco
- ERP financeiro completo (contas a pagar/receber, DRE, fluxo de caixa)
- RH completo (escalas, ponto, folha, benefícios, treinamento)
- Central de IA com consultores especializados por módulo

### 1.3 Filosofia de Segurança
- **Deny-by-default:** Sem permissão explícita = acesso negado
- **Database-enforced tenancy:** `x-company-id` é validado contra memberships ativos; INSERTs enviam `company_id` explícito e a RLS valida o tenant. Apenas produtos têm trigger de imposição.
- **RLS:** obrigatória e forçada em tabelas novas; divergências legadas observadas na auditoria estão documentadas em `multi-unidades/00-AUDITORIA.md`.
- **RBAC granular:** Permissões no formato `<módulo>:<subaba>:<ação>` com 11 ações padronizadas
- **Soft delete:** Registros críticos nunca são excluídos fisicamente
- **Auditoria completa:** Todas as operações críticas são logadas

---

## 2. STACK TECNOLÓGICA

### 2.1 Frontend
| Camada | Tecnologia |
|--------|-----------|
| Framework | React 18 + TypeScript |
| Bundler | Vite 5 |
| Estilos | Tailwind CSS 3 + tailwindcss-animate |
| UI Components | shadcn/ui (Radix primitives) |
| Roteamento | React Router DOM 6 |
| State Management | Hooks customizados (useState/useCallback) — sem Redux |
| Data Fetching | @tanstack/react-query + Supabase SDK |
| Gráficos | Recharts |
| Formulários | React Hook Form + Zod |
| Toasts | Sonner + Radix Toast |
| PDF | jsPDF + jspdf-autotable |
| Datas | date-fns + date-fns-tz (timezone BR) |
| Fontes | Inter (body) + Space Grotesk (display) |
| PWA | vite-plugin-pwa |
| QR Code | qrcode |

### 2.2 Backend (Supabase)
| Camada | Tecnologia |
|--------|-----------|
| Banco de dados | PostgreSQL 15+ com RLS |
| Auth | Supabase Auth (email/password) |
| API | Supabase PostgREST + RPCs |
| Edge Functions | Deno (TypeScript) |
| Realtime | Supabase Realtime (postgres_changes) |
| Storage | Supabase Storage (quando necessário) |

### 2.3 Infraestrutura
- **Autenticação:** JWT via Supabase Auth, sem auto-confirm de email
- **Isolamento de tenant:** recursos operacionais usam empresa explícita e RLS; globais, identidades e logs legados exigem classificação. NOT NULL e FORCE RLS não são universais no banco vivo; consultar o [inventário reconciliado](multi-unidades/fase9-20260916/RESULTADOS.md).
- **Secrets:** Gerenciados via Supabase (Edge Function secrets) e Vercel (env vars de build/runtime) — nunca hardcoded
- **Deploy:** Frontend automatizado via Vercel (push em `main`); Edge Functions deployadas via `supabase functions deploy`

---

## 3. ARQUITETURA MULTI-TENANT

### 3.1 Modelo de Isolamento

```
┌─────────────────────────────────────────┐
│ auth.users → profiles → memberships  │
│                       │                  │
│              ┌────────┴────────┐        │
│              │   companies     │        │
│              └────────┬────────┘        │
│ Tabelas operacionais │                  │
│     referenciam ──────┘                  │
│     company_id conforme contrato        │
└─────────────────────────────────────────┘
```

### 3.2 Mecanismos de Proteção

#### `get_current_company_id()`
- Valida `x-company-id` contra `company_memberships` ativo e empresa ativa; sem header mantém a empresa original autorizada para compatibilidade
- Usada em todas as políticas RLS de SELECT

#### `assert_tenant()`
- Versão estrita que lança exceção se o company_id for NULL ou placeholder
- Usada em RPCs críticas como guard de entrada

#### Placeholder Tenant Guard
- UUID `00000000-0000-0000-0000-000000000001` é bloqueado por trigger (`trg_block_placeholder_company`)
- Impede operações em dados de seed/template

#### `trg_force_company_id`
- Trigger de produtos que impõe o `company_id`; outras tabelas recebem o campo explicitamente e validam RLS
- Resolve via `get_current_company_id()` no banco

#### RLS Policies (Padrão)
```sql
-- SELECT: isolamento por tenant
CREATE POLICY "select_own_company" ON tabela
  FOR SELECT TO authenticated
  USING (company_id = (SELECT get_current_company_id()));

-- INSERT: company_id explícito + WITH CHECK; produtos também impõem via trigger
-- UPDATE/DELETE: validado via has_permission() + company_id
```

### 3.3 Garantias
1. **Frontend envia `company_id`** de `useCompanyId()` nos INSERTs; o backend valida independentemente esse valor
2. **Edge Functions** encaminham `x-company-id` ao cliente autenticado e validam `assert_tenant()` antes de usar service_role
3. **RPCs** usam `auth.uid()` internamente — nunca aceitam `p_user_id`
4. **Queries sempre filtradas** por `company_id = get_current_company_id()`
5. **Backup tables** (_bkp_) não têm RLS e não são acessíveis via API

---

## 4. MAPA COMPLETO DOS MÓDULOS

### 4.1 Controle de Salmão (`salmon`)
**Objetivo:** Rastreamento completo do fluxo de salmão bruto → limpo com controle de aproveitamento, custos e lotes.

**Telas:**
- Dashboard — KPIs de estoque bruto/limpo, aproveitamento médio, custo/kg
- Entradas — Registro de compras de salmão (lote, SIF, fornecedor, peso, valor)
- Manipulações — Registro de processamento bruto→limpo com cálculo de rendimento
- Estoque de Lotes — Saldo por lote com alertas de lotes parados
- Metas — Metas de aproveitamento e compra por mês
- Planejamento — Sugestão inteligente de compra baseada em histórico

**Integrações:**
- Sincronização bidirecional com estoque geral (movimentações automáticas)
- Item "Salmão Fresco" (SKU SALM) protegido de edições manuais
- Cancelamento em estoque propaga status para tabelas de salmão

**Tabelas:** `salmon_entries`, `salmon_manipulations`, `salmon_leftover_records`, `salmon_lots_limpo`

### 4.2 Controle de Estoque (`estoque-geral`)
**Objetivo:** Gestão completa de estoque com catálogo de produtos, movimentações, saldos e análises.

**Telas/Seções:**
- **Dashboard** — KPIs (valor total, itens ativos, alertas de mínimo/ruptura)
- **Saldo** — Listagem de produtos com saldo atual (server-side via RPC)
- **Movimentações** — Histórico de entradas/saídas com paginação cursor-based
- **Simulador** — Simulação de compras
- **Requisições** — Solicitações de estoque por setor (workflow aprovação)
- **Catálogo** — CRUD de produtos com SKU automático, unidade dual (compra/base)
- **Cadastros** — Categorias, locais de estoque, unidades de medida
- **Consumo** — Histórico de consumo agrupado por período/categoria
- **Ranking** — Top consumidos por valor ou quantidade
- **Perdas** — Relatório de baixas por perda
- **Estoque Preditivo** — Previsão de ruptura e consumo futuro
- **Transferências** — Movimentação entre locais

**Tabelas:** `produtos`, `movimentacoes_estoque`, `stock_categories`, `stock_locations`, `stock_sku_counter`, `unidades_medida`, `solicitacoes_compra`

**RPCs principais:**
- `get_saldo_produtos` — Saldo de múltiplos produtos
- `stock_insert_movement_atomic` — Inserção atômica de movimentação
- `list_movimentacoes_cursor` — Listagem paginada por cursor
- `get_stock_dashboard` — KPIs do dashboard
- `get_stock_consumption_history` — Histórico de consumo
- `get_stock_top_consumed` — Ranking de consumo
- `get_stock_losses_report` — Relatório de perdas
- `get_stock_predictive_analysis_v2` — Análise preditiva
- `stock_transfer_between_locations` — Transferência entre locais
- `generate_next_sku` — Geração automática de SKU

### 4.3 Inventário (`inventario`)
**Objetivo:** Inventário físico com contagem, auditoria, análise de risco e ajustes automáticos.

**Telas:**
- Lista de inventários (com status: ABERTO, EM_CONTAGEM, SOB_ANALISE, FINALIZADO)
- Criação de inventário (por categoria, turno, conferente)
- Inventário rápido (contagem simplificada)
- Detalhe com contagem item a item
- Dashboard de acurácia
- Auditoria com log detalhado

**Tabelas:** `inventarios`, `inventario_itens`, `audit_inventario_log`, `turnos`

**RPCs:** `create_inventory_atomic`, `create_quick_inventory_atomic`, `finalize_inventory_atomic`, `reopen_inventory`, `soft_delete_inventory`

### 4.4 Compras (`compras`)
**Objetivo:** Gestão completa do ciclo de compras — solicitação, pedido, recebimento, confirmação.

**Telas:**
- **Lista do dia** — Pedidos de compra com workflow de status
- **Pedidos & Mercado** — Solicitações de compra para mercado (cotação)
- **Checklist** — Lista de compras do dia
- **Calendário** — Regras de compra por dia da semana
- **Ranking de Fornecedores** — Performance comparativa
- **Fornecedores** — Cadastro com preços por item
- **Recebimentos** — Conferência de mercadoria recebida
- **Confirmações** — Aprovação de recebimentos

**Tabelas:** `purchase_orders`, `purchase_order_items`, `solic_compra_mercado`, `solic_compra_mercado_itens`, `aprovacoes_solic_compra_mercado`, `recebimentos`, `recebimento_itens`, `confirmacoes_recebimento`, `suppliers`, `supplier_item_prices`, `purchase_ignored_rules`

**RPCs:** `create_purchase_order_atomic`, `edit_purchase_order_atomic`, `receive_purchase_order_atomic`, `receive_market_order_atomic`, `list_purchase_orders_cursor`, `list_solic_compra_mercado_cursor`, `get_supplier_ranking`, `upsert_supplier`

### 4.5 Centro de CMV (`cmv`)
**Objetivo:** Cálculo e análise de Custo de Mercadoria Vendida por categoria, setor e período.

**Telas:**
- Por Categoria — CMV agrupado por categoria de produto
- Por Setor — CMV agrupado por setor operacional
- Top Itens — Ranking de itens com maior impacto no CMV
- Semanal — Evolução semanal do CMV
- Metas — Definição de metas de CMV

**Tabelas:** `metas_cmv`, `cmv_cache`, `faturamento_periodos_legacy`, `financeiro_fechamento_caixa`

**Edge Function:** `cmv/` — Cálculo server-side do CMV com cache

### 4.6 Ficha Técnica (`ficha-tecnica`)
**Objetivo:** Receituário técnico com composição, custos, precificação e simulação.

**Telas:**
- Pré-Preparos — Componentes base (molhos, cortes, etc.)
- Itens Prontos — Pratos montados
- Produtos Finais — Produtos vendidos
- Canais de Venda — Configuração de taxas por canal (iFood, salão, etc.)
- Análise — Análise de custos por componente
- Markup — Precificação com margem e simulação de cenário

**Tabelas:** `ficha_componentes`, `ficha_componente_itens`, `canais_venda`, `cenarios_simulacao`, `config_precificacao`

**Edge Function:** `ficha-tecnica/` — Operações server-side de ficha técnica

### 4.7 Planejamento (`planning`)
**Objetivo:** Planejamento de compras com metas, projeção e alertas de pressão orçamentária.

**Telas:**
- Meta de Compras — Metas por categoria/mês
- Projeção Mensal — Projeção baseada em ritmo atual
- Ritmo Semanal — Breakdown semanal de gastos
- Pressão Orçamentária — Alertas visuais de estouro
- Radar — Visão consolidada de compras
- Simulador de Compras — Simulação de cenários

**Tabelas:** `metas_compra_mensal`, `metas_provisionadas_salmao`

**RPCs:** `_planning_upsert_meta_guarded`, `_planning_spend_summary_guarded`, `_planning_delete_meta_guarded`

### 4.8 Central de IA (`ia`)
**Objetivo:** Consultores de IA especializados por módulo, usando dados reais do tenant.

**Agentes disponíveis:**
- Consultor Geral
- Salmão Intelligence
- Estoque Geral
- Analista CMV
- Consultor Compras
- Ficha Técnica
- Consultor Financeiro
- Consultor RH
- Logs de IA

**Tabelas:** `ai_logs`, `ai_insights`, `ai_score_historico`

**Edge Function:** `ai-chat/` — Processa prompts com contexto do tenant (17+ queries de contexto) usando provedor LLM configurado por secret na Edge Function (chave da API nunca exposta ao cliente)

**Segurança:** Todas as queries de contexto aplicam `.eq("company_id", companyId)` via adminClient com company_id validado pelo cliente autenticado via assert_tenant()

### 4.9 RH — Pessoas (`rh`)
**Objetivo:** Gestão completa de recursos humanos.

**Seções:**
- Dashboard RH
- Prontuário (colaboradores)
- Escalas de trabalho
- Tarefas
- Onboarding
- Treinamento
- Férias e afastamentos
- Documentos e compliance
- Folha de pagamento
- Benefícios (com mascaramento de dados sensíveis)
- Custos RH
- SST (Segurança e Saúde no Trabalho)
- Gestão disciplinar
- Mural (comunicação interna)
- Ponto eletrônico
- Banco de horas

**Tabelas:** `rh_colaboradores`, `rh_escalas`, `rh_tarefas`, `rh_onboarding`, `rh_treinamentos`, `rh_ferias`, `rh_documentos`, `rh_folha_pagamento`, `rh_beneficios`, `rh_custos`, `rh_sst`, `rh_disciplinar`, `rh_mural`, `rh_ponto_registros`, `rh_banco_horas`

**Edge Function:** `rh/` — Operações server-side de RH

**Segurança:** Dados sensíveis (cartões em benefícios) mascarados via trigger (apenas `last4`); acesso completo restrito a `rh:admin`

### 4.10 Financeiro (`financeiro`)
**Objetivo:** ERP financeiro completo com ledger imutável.

**Seções:**
- Dashboard — KPIs financeiros
- Fechamento de Caixa — Registro diário de faturamento
- Cadastros Base — Categorias, centros de custo, plano de contas
- Contas Bancárias — Gestão de contas
- Lançamentos — Ledger (livro razão) com auditoria
- Contas a Pagar — Workflow com aprovação server-side
- Contas a Receber — Gestão de recebíveis
- Fluxo de Caixa — Projeção e histórico
- DRE — Demonstração de Resultado do Exercício
- Orçamento — Budget vs Actual
- Conciliação Bancária — Unificada com detecção de transferências
- Alertas — Vencimentos e irregularidades
- Recorrências — Lançamentos recorrentes
- Categorização — Regras automáticas de categorização
- Relatório para Sócios
- Projeção de Fluxo
- KPIs Financeiros
- Auditoria Financeira
- Comparativo de Períodos

**Tabelas:** `fin_lancamentos`, `fin_contas`, `fin_categorias`, `fin_centros_custo`, `fin_contas_pagar`, `fin_contas_receber`, `fin_orcamentos`, `fin_rateios`, `fin_lancamento_rateios`, `fin_regras_categorizacao`, `fin_audit_logs`, `financeiro_fechamento_caixa`

**RPCs:** `get_fin_dashboard_summary`, `get_fin_dashboard_charts`, `get_fin_cashflow`, `get_fin_dre_summary`, `get_fin_kpis`, `get_fin_counts_by_status`, `list_fin_lancamentos_cursor`, `list_fin_contas_pagar_cursor`, `list_fin_contas_receber_cursor`, `pay_conta_pagar`, `receive_conta_receber`, `create_transfer`, `update_transfer`, `delete_transfer`, `reconcile_batch_lancamentos`, `reconcile_import_lancamento`, `reconcile_pay_conta_pagar`, `reconcile_create_transfer`, `rpc_upsert_fechamento_caixa`, `rpc_delete_fechamento_caixa`, `gerar_parcela_recorrente`

### 4.11 Relatórios Gerais (`relatorios`)
**Objetivo:** Visão consolidada cross-módulo com KPIs, score operacional e tendências.

**Seções:**
- CMV — Relatório consolidado
- Estoque — Análise de estoque
- Compras — Análise de compras
- Tendência — Evolução temporal
- Score Operacional — Classificação da operação com simulação
- Itens — Análise detalhada por item

**RPCs:** `get_relatorios_kpis`, `get_relatorios_compras`, `get_relatorios_score`, `get_relatorios_tendencia`, `get_report_items_summary`, `get_report_item_detail`, `list_report_items_page`, `_simulate_relatorios_guarded`

### 4.12 Configurações (`configuracoes`)
**Objetivo:** Administração de usuários, permissões e configurações do sistema.

**Seções:**
- Geral — Configurações gerais
- Salmão — Configurações do módulo salmão
- Usuários — CRUD de usuários com matriz de permissões
- Auditoria do Sistema — Log de ações
- Performance — Monitoramento
- Auditoria de Segurança — Análise de segurança
- Auditoria de Compras — Log de overrides

---

## 5. MAPA DO BANCO DE DADOS

### 5.1 Tabelas Principais (Agrupadas por Módulo)

#### Core / Multi-tenant
| Tabela | Finalidade |
|--------|-----------|
| `companies` | Cadastro de empresas (tenants) |
| `profiles` | Perfil do usuário (nome, email, company_id, sector, job_role_id) |
| `company_memberships` | Acesso ativo/inativo/revogado por usuário e empresa; cargo/setor locais |
| `user_roles` | Roles por usuário e empresa (enum app_role) |
| `user_permissions` | Permissões granulares por usuário |
| `permissions` | Catálogo de permissões disponíveis |
| `job_roles` | Cargos/funções por empresa |
| `app_config` | Configurações globais do sistema |

#### Estoque
| Tabela | Finalidade |
|--------|-----------|
| `produtos` | Catálogo de produtos com dual-unit, custos, SKU |
| `movimentacoes_estoque` | Ledger de movimentações (ENTRADA/SAIDA/AJUSTE/BAIXA_PERDA) |
| `stock_categories` | Categorias de estoque por tenant |
| `stock_locations` | Locais de estoque por tenant |
| `stock_sku_counter` | Contador sequencial de SKU por tenant |
| `unidades_medida` | Unidades de medida e conversões |
| `solicitacoes_compra` | Solicitações de compra de estoque |

#### Salmão
| Tabela | Finalidade |
|--------|-----------|
| `salmon_entries` | Entradas de salmão bruto |
| `salmon_manipulations` | Manipulações bruto→limpo |
| `salmon_leftover_records` | Registros de sobras |
| `salmon_lots_limpo` | Lotes de salmão limpo com validade |

#### Inventário
| Tabela | Finalidade |
|--------|-----------|
| `inventarios` | Cabeçalho de inventários |
| `inventario_itens` | Itens contados por inventário |
| `audit_inventario_log` | Log de auditoria de inventário |
| `turnos` | Turnos de trabalho |

#### Compras
| Tabela | Finalidade |
|--------|-----------|
| `purchase_orders` | Pedidos de compra |
| `purchase_order_items` | Itens de pedido de compra |
| `solic_compra_mercado` | Solicitações de compra para mercado |
| `solic_compra_mercado_itens` | Itens de solicitação de mercado |
| `aprovacoes_solic_compra_mercado` | Aprovações de solicitações |
| `recebimentos` | Recebimentos de mercadoria |
| `recebimento_itens` | Itens de recebimento |
| `confirmacoes_recebimento` | Confirmações de recebimento |
| `suppliers` | Fornecedores |
| `supplier_item_prices` | Preços por item/fornecedor |
| `purchase_ignored_rules` | Regras de compra ignoradas |

#### CMV
| Tabela | Finalidade |
|--------|-----------|
| `metas_cmv` | Metas de CMV por mês |
| `cmv_cache` | Cache de cálculo de CMV |
| `faturamento_periodos_legacy` | Faturamento por período (legacy) |

#### Ficha Técnica
| Tabela | Finalidade |
|--------|-----------|
| `ficha_componentes` | Componentes/receitas (pré-preparo, item pronto, produto final) |
| `ficha_componente_itens` | Itens de cada componente |
| `canais_venda` | Canais de venda (iFood, salão, etc.) |
| `cenarios_simulacao` | Cenários de simulação de preço |
| `config_precificacao` | Configuração de precificação |

#### Planejamento
| Tabela | Finalidade |
|--------|-----------|
| `metas_compra_mensal` | Metas de compra por categoria/mês |
| `metas_provisionadas_salmao` | Metas provisionadas de salmão |

#### Financeiro
| Tabela | Finalidade |
|--------|-----------|
| `fin_lancamentos` | Ledger imutável de lançamentos |
| `fin_contas` | Contas bancárias |
| `fin_categorias` | Categorias financeiras |
| `fin_centros_custo` | Centros de custo |
| `fin_contas_pagar` | Contas a pagar |
| `fin_contas_receber` | Contas a receber |
| `fin_orcamentos` | Orçamentos por categoria/mês |
| `fin_rateios` | Rateios de lançamentos |
| `fin_lancamento_rateios` | Rateios detalhados |
| `fin_regras_categorizacao` | Regras automáticas de categorização |
| `fin_audit_logs` | Auditoria financeira |
| `financeiro_fechamento_caixa` | Fechamento de caixa diário |

#### RH
| Tabela | Finalidade |
|--------|-----------|
| `rh_colaboradores` | Cadastro de colaboradores |
| `rh_escalas` | Escalas de trabalho |
| `rh_tarefas` | Tarefas |
| `rh_onboarding` | Checklists de onboarding |
| `rh_treinamentos` | Treinamentos |
| `rh_ferias` | Férias e afastamentos |
| `rh_documentos` | Documentos e compliance |
| `rh_folha_pagamento` | Folha de pagamento |
| `rh_beneficios` | Benefícios (dados sensíveis mascarados) |
| `rh_ponto_registros` | Registros de ponto |
| `rh_banco_horas` | Banco de horas |
| `rh_sst` | Segurança e saúde |
| `rh_disciplinar` | Gestão disciplinar |
| `rh_mural` | Comunicações internas |

#### IA
| Tabela | Finalidade |
|--------|-----------|
| `ai_logs` | Logs de interações com IA |
| `ai_insights` | Insights gerados pela IA |
| `ai_score_historico` | Histórico de score operacional |

#### Auditoria & Sistema
| Tabela | Finalidade |
|--------|-----------|
| `audit_logs` | Log de auditoria estruturado (global) |
| `audit_log` | Log de auditoria legado |
| `admin_actions_log` | Ações administrativas |
| `system_bugs` | Rastreamento de bugs |
| `dashboard_cache` | Cache de dashboards |
| `notifications` | Notificações do sistema |
| `rbac_legacy_usage` | Telemetria de uso de permissões legadas |

### 5.2 Triggers Importantes
- `trg_force_company_id` — Força `company_id` em INSERT/UPDATE via `get_current_company_id()`
- `trg_block_placeholder_company` — Bloqueia operações com tenant placeholder
- Triggers de mascaramento de dados sensíveis (ex: `rh_beneficios.numero_cartao`)
- Triggers de sincronização salmão↔estoque

### 5.3 Índices Relevantes
- Índices compostos `(company_id, lower(name))` em tabelas de lookup (`stock_categories`, `stock_locations`)
- Índices em `movimentacoes_estoque` por `(company_id, produto_id, created_at)`
- Índices em `fin_lancamentos` por `(company_id, data_competencia)`

---

## 6. MAPA DE RPCs

### 6.1 RPCs de Segurança
| RPC | Finalidade |
|-----|-----------|
| `get_current_company_id` | Valida o escopo solicitado contra os memberships do usuário |
| `get_current_company_id_strict` | Versão estrita (lança exceção se inválido) |
| `assert_tenant` | Guard de tenant para RPCs |
| `has_permission(_user_id, _permission)` | Verifica permissão granular |
| `has_any_permission(_user_id, _permissions[])` | Verifica qualquer permissão de um array |
| `has_role(_user_id, _role)` | Verifica role |
| `has_compras_view(p_user_id)` | Verifica acesso ao módulo compras |
| `admin_has_permission(p_user_id, p_permission)` | Verificação de permissão admin (edge functions) |
| `get_effective_permissions(_user_id)` | Lista todas as permissões efetivas |

### 6.2 RPCs de Estoque
| RPC | Finalidade |
|-----|-----------|
| `get_saldo_produtos(p_produto_ids[])` | Saldo de múltiplos produtos |
| `get_saldo_produto(p_produto_id)` | Saldo de um produto |
| `stock_insert_movement_atomic(...)` | Inserção atômica de movimentação |
| `list_movimentacoes_cursor(...)` | Listagem paginada por cursor |
| `get_stock_dashboard(p_days)` | KPIs do dashboard |
| `get_stock_consumption_history(...)` | Histórico de consumo |
| `get_stock_top_consumed(...)` | Ranking de consumo |
| `get_stock_losses_report(...)` | Relatório de perdas |
| `get_stock_predictive_analysis_v2(...)` | Análise preditiva v2 |
| `get_stock_summary()` | Resumo de estoque |
| `get_inactive_stock_items()` | Itens inativos/parados |
| `stock_transfer_between_locations(...)` | Transferência entre locais |
| `list_stock_transfers(...)` | Listagem de transferências |
| `generate_next_sku(p_prefix)` | Geração de SKU sequencial |
| `recalc_product_costs(p_produto_id)` | Recálculo de custos médios |
| `get_consumo_por_produto(...)` | Consumo por produto |

### 6.3 RPCs de Salmão
| RPC | Finalidade |
|-----|-----------|
| `create_salmon_entry_atomic(...)` | Criação atômica de entrada |
| `create_salmon_manipulation_atomic(...)` | Criação atômica de manipulação |
| `cancel_salmon_entry_atomic(...)` | Cancelamento de entrada |
| `cancel_salmon_manipulation_atomic(...)` | Cancelamento de manipulação |
| `get_salmon_dashboard_summary(...)` | Dashboard de salmão |
| `ensure_salmon_raw_product()` | Garantir existência do produto salmão |
| `upsert_salmon_leftover_atomic(...)` | Registrar/atualizar sobras |
| `_salmon_*_guarded(...)` | Versões com guard de permissão |

### 6.4 RPCs de Inventário
| RPC | Finalidade |
|-----|-----------|
| `create_inventory_atomic(...)` | Criação atômica |
| `create_quick_inventory_atomic(...)` | Inventário rápido |
| `finalize_inventory_atomic(...)` | Finalização com ajustes |
| `reopen_inventory(...)` | Reabertura |
| `soft_delete_inventory(...)` | Exclusão lógica |
| `debug_company_inventory()` | Debug de inventário |

### 6.5 RPCs de Compras
| RPC | Finalidade |
|-----|-----------|
| `create_purchase_order_atomic(...)` | Criação atômica de pedido |
| `edit_purchase_order_atomic(...)` | Edição de pedido |
| `receive_purchase_order_atomic(...)` | Recebimento de pedido |
| `receive_market_order_atomic(...)` | Recebimento de pedido de mercado |
| `storno_purchase_order_stock(...)` | Estorno de estoque de pedido |
| `list_purchase_orders_cursor(...)` | Listagem paginada |
| `list_solic_compra_mercado_cursor(...)` | Listagem de solicitações |
| `get_supplier_ranking(...)` | Ranking de fornecedores |
| `upsert_supplier(p_name)` | Criar/atualizar fornecedor |
| `rpc_recebimentos_close(...)` | Fechar recebimento |
| `rpc_confirmacoes_approve(...)` | Aprovar confirmação |

### 6.6 RPCs Financeiras
| RPC | Finalidade |
|-----|-----------|
| `get_fin_dashboard_summary(...)` | Dashboard financeiro |
| `get_fin_dashboard_charts(...)` | Gráficos do dashboard |
| `get_fin_cashflow(...)` | Fluxo de caixa |
| `get_fin_dre_summary(p_mes)` | DRE mensal |
| `get_fin_kpis(...)` | KPIs financeiros |
| `get_fin_counts_by_status(...)` | Contagens por status |
| `list_fin_lancamentos_cursor(...)` | Lançamentos paginados |
| `list_fin_contas_pagar_cursor(...)` | Contas a pagar paginadas |
| `list_fin_contas_receber_cursor(...)` | Contas a receber paginadas |
| `pay_conta_pagar(...)` | Pagar conta |
| `receive_conta_receber(...)` | Receber conta |
| `create_transfer(...)` | Criar transferência entre contas |
| `update_transfer(...)` | Atualizar transferência |
| `delete_transfer(...)` | Excluir transferência |
| `reconcile_batch_lancamentos(...)` | Conciliação em lote |
| `reconcile_import_lancamento(...)` | Importar lançamento em conciliação |
| `reconcile_pay_conta_pagar(...)` | Pagar conta via conciliação |
| `reconcile_create_transfer(...)` | Transferência via conciliação |
| `rpc_upsert_fechamento_caixa(...)` | Upsert de fechamento de caixa |
| `rpc_delete_fechamento_caixa(...)` | Exclusão de fechamento |
| `gerar_parcela_recorrente(...)` | Gerar parcela de recorrência |
| `get_saldo_conta(p_conta_id)` | Saldo de conta bancária |

### 6.7 RPCs de Relatórios
| RPC | Finalidade |
|-----|-----------|
| `get_relatorios_kpis(...)` | KPIs consolidados |
| `get_relatorios_compras(...)` | Relatório de compras |
| `get_relatorios_score(...)` | Score operacional |
| `get_relatorios_tendencia(...)` | Tendências |
| `get_report_items_summary(...)` | Resumo por item |
| `get_report_item_detail(...)` | Detalhe de item |
| `list_report_items_page(...)` | Itens paginados (offset, ordenação e % CMV no banco) |
| `simulate_relatorios_score(...)` | Simulação de score |
| `get_spend_by_sector(...)` | Gastos por setor |

### 6.8 RPCs de RH
| RPC | Finalidade |
|-----|-----------|
| `aprovar_ferias(...)` | Aprovar férias |
| `reject_ponto_record(...)` | Rejeitar ponto |
| `get_beneficios_masked(...)` | Benefícios com dados mascarados |

### 6.9 RPCs de Admin/Sistema
| RPC | Finalidade |
|-----|-----------|
| `admin_list_users()` | Lista de usuários |
| `admin_set_super_admin(...)` | Promover/rebaixar super admin |
| `admin_checkup_suite()` | Suite de verificação do sistema |
| `admin_health_counts()` | Contagens de saúde |
| `rpc_create_company(...)` | Criar empresa |
| `sync_permissions_from_registry(...)` | Sincronizar permissões |
| `rbac_permissions_diff(...)` | Diff de permissões |
| `rbac_sql_lint_report(...)` | Lint de SQL do RBAC |
| `rbac_top_legacy_usage(...)` | Top permissões legadas |
| `audit_log_write(...)` | Escrever log de auditoria |
| `log_audit(...)` | Log de auditoria |
| `list_profiles_minimal(...)` | Lista de perfis (público) |
| `mark_all_notifications_read()` | Marcar notificações como lidas |
| `cleanup_old_audit_logs(...)` | Limpeza de logs antigos |
| `refresh_materialized_views()` | Refresh de views materializadas |
| `debug_tenant()` | Debug de tenant |
| `debug_stock_last_movements(...)` | Debug de movimentações |

---

## 7. EDGE FUNCTIONS

| Edge Function | Finalidade | JWT |
|---------------|-----------|-----|
| `admin-create-user` | Criação de usuários via admin | Não verificado |
| `admin-users` | Listagem/gestão de usuários | Não verificado |
| `ai-chat` | Central de IA — processamento de prompts com contexto do tenant | Não verificado |
| `check-password` | Verificação de força de senha | Não verificado |
| `cmv` | Cálculo de CMV server-side | Não verificado |
| `ficha-tecnica` | Operações de ficha técnica | Não verificado |
| `inventario` | Operações de inventário | Não verificado |
| `purchase-requisitions` | Requisições de compra | Não verificado |
| `rbac-lint` | Validação de RBAC | Não verificado |
| `rbac-lint-quick` | Validação rápida de RBAC | Não verificado |
| `rbac-lint-full` | Validação completa de RBAC | Não verificado |
| `requisicao-estoque` | Requisições de estoque | Não verificado |
| `rh` | Operações de RH | Não verificado |
| `scheduled-jobs` | Jobs agendados (limpeza, recorrências) | Não verificado |

**Padrão de segurança das Edge Functions:**
1. Extraem JWT do header `Authorization`
2. Criam `userClient` (com token do usuário) e `adminClient` (service role)
3. Verificam permissões via RPC `admin_has_permission`
4. Validam `x-company-id` contra o membership do usuário com `assert_tenant()`
5. Usam `adminClient` apenas para operações autorizadas na whitelist
6. `userClient` para todas as RPCs que dependem de `auth.uid()`

---

## 8. ARQUITETURA FRONTEND

### 8.1 Estrutura de Pastas
```
src/
├── assets/                    # Imagens e assets estáticos
├── components/                # Componentes React
│   ├── ui/                    # Componentes base (shadcn/ui)
│   ├── admin/                 # Componentes admin
│   ├── cmv/                   # Componentes do módulo CMV
│   ├── compras/               # Componentes do módulo Compras
│   ├── estoque/               # Componentes do módulo Estoque
│   ├── financeiro/            # Componentes do módulo Financeiro
│   ├── relatorios/            # Componentes de Relatórios
│   ├── rh/                    # Componentes do módulo RH
│   ├── AppLayout.tsx          # Layout principal com sidebar
│   ├── [Module]View.tsx       # Views principais de cada módulo
│   └── ...
├── contexts/                  # React Contexts
│   ├── AuthContext.tsx         # Autenticação + RBAC
│   ├── SalmonStoreContext.tsx  # Provider do store de salmão
│   └── EstoqueGeralStoreContext.tsx  # Provider do store de estoque
├── hooks/                     # Custom hooks
│   ├── useEstoqueGeralStore.ts # Store principal de estoque
│   ├── useSalmonStore.ts      # Store de salmão
│   ├── useComprasStore.ts     # Store de compras
│   ├── useInventarioStore.ts  # Store de inventário
│   ├── usePlanningStore.ts    # Store de planejamento
│   ├── usePurchaseOrdersStore.ts # Store de pedidos
│   ├── useRecebimentoStore.ts # Store de recebimento
│   ├── useCompanyId.ts        # Hook de resolução de tenant
│   ├── useNotifications.ts    # Notificações
│   └── ...
├── integrations/supabase/     # Client e types (AUTO-GERADOS, NÃO EDITAR)
│   ├── client.ts
│   └── types.ts
├── lib/                       # Utilitários
│   ├── tenant.ts              # resolveCompanyIdOrThrow, TenantError
│   ├── money.ts               # Normalização/formatação monetária
│   ├── datetime.ts            # Utilitários de data/timezone BR
│   ├── dateUtils.ts           # parseLocalDate
│   ├── formatters.ts          # Formatadores centrais
│   ├── permissions.ts         # MODULE_TREE (legado, UI da matriz)
│   ├── brand.ts               # APP_NAME, APP_TAGLINE
│   ├── unitConversions.ts     # Conversões de unidades
│   ├── pdfGenerator.ts        # Geração de PDFs
│   ├── pdfFinanceiro.ts       # PDFs financeiros
│   ├── pdfPedidoFornecedor.ts # PDF de pedido para fornecedor
│   └── utils.ts               # cn() e utilitários gerais
├── pages/                     # Páginas/rotas
│   ├── Index.tsx              # Página principal (SPA com tabs)
│   ├── Login.tsx              # Login
│   ├── ResetPassword.tsx      # Reset de senha
│   ├── AdminPanel.tsx         # Painel admin (super-admin only)
│   └── NotFound.tsx           # 404
├── permissions/               # Sistema RBAC
│   ├── actions.ts             # 11 ações permitidas
│   ├── registry.ts            # Registro completo de permissões
│   ├── hooks.ts               # useCan, useCanAny, useModuleAccess
│   ├── components.tsx         # RequirePermission, RequireAnyPermission
│   └── index.ts               # Re-exports
├── test/                      # Testes
│   ├── setup.ts               # Configuração vitest
│   ├── example.test.ts
│   ├── money.test.ts
│   └── rbac-actions.test.ts
└── types/
    └── salmon.ts              # Tipos compartilhados (TabId, Produto, etc.)
```

### 8.2 Padrão de Componentes

**Views (telas):** `[Modulo]View.tsx` — Componente de nível superior para cada módulo
- `EstoqueGeralView.tsx`, `ComprasView.tsx`, `FinanceiroView.tsx`, etc.

**Sections (seções):** Componentes internos de uma view
- `StockDashboardSection.tsx`, `MovimentacoesSection.tsx`, etc.

**Stores (hooks):** `use[Modulo]Store.ts` — Lógica de dados e estado
- Cada store é um hook que encapsula fetch, CRUD, paginação e filtros
- Dados paginados via cursor ou offset
- Saldos calculados server-side via RPC

### 8.3 Fluxo de Navegação
```
App.tsx
  └── BrowserRouter
        ├── /login → Login.tsx
        ├── /reset-password → ResetPassword.tsx
        ├── /admin → AdminPanel.tsx
        ├── / → Index.tsx (SPA)
        │     └── AppLayout.tsx (sidebar + header)
        │           └── [ActiveView].tsx (renderizado por activeTab)
        └── * → NotFound.tsx
```

A navegação principal é por tabs dentro de `Index.tsx` (SPA), não por rotas separadas. O `activeTab` controla qual view é renderizada.

### 8.4 Sistema de Permissões (Frontend)

#### Registry (`src/permissions/registry.ts`)
- `MODULE_MANIFESTS[]` — Definição completa de módulos, sub-abas e ações
- Formato: `<módulo>:<subaba>:<ação>` (ex: `estoque:catalogo:create`)
- 11 ações permitidas: `view`, `create`, `edit`, `delete`, `export`, `manage`, `approve`, `close`, `reconcile`, `cancel`, `simulate`

#### Hooks (`src/permissions/hooks.ts`)
```tsx
useCan('estoque:catalogo:create')        // boolean — pode criar no catálogo?
useCanAny('finance:read', 'finance:manage')  // boolean — tem alguma dessas?
useCanAll('rh:folha:view', 'rh:folha:export') // boolean — tem todas?
useModuleAccess('estoque')               // { visibleSubtabs: string[], canView: boolean }
```

#### Components (`src/permissions/components.tsx`)
```tsx
<RequirePermission permission="estoque:catalogo:delete">
  <Button>Excluir</Button>
</RequirePermission>
```

#### Super Admin
- Permissão `system:global:manage` — acesso total a tudo
- Verificada primeiro em todas as checagens

#### Legacy Fallback
- Permissões legadas mapeadas para granulares via `LEGACY_PERMISSION_MAP`
- Controlado pelo kill switch `VITE_ENABLE_LEGACY_PERMISSIONS`
- Telemetria de uso enviada para `rbac_legacy_usage`

---

## 9. PADRÕES DE INPUTS

### BRL Input (`src/components/ui/brl-input.tsx`)
- Campos monetários com formatação automática R$ 5.000,00
- Normalização via `normalizeBRLMoneyToNumber()` ao salvar
- Valor armazenado como `number` no backend

### Decimal Input (`src/components/ui/decimal-input.tsx`)
- Para quantidades (kg, litros, unidades)
- Separador decimal: vírgula (,)
- Valor armazenado como `number`

### Numeric Input (`src/components/ui/numeric-input.tsx`)
- Para inteiros (quantidades exatas)
- Sem separador decimal

---

## 10. PADRÕES DE FORMATAÇÃO

Centralizado em `src/lib/formatters.ts`:

| Helper | Exemplo | Uso |
|--------|---------|-----|
| `formatMoneyBR(5000)` | `R$ 5.000,00` | Valores monetários |
| `fmtBRL(5000)` | `R$ 5.000,00` | Alias curto |
| `fmtBRLRaw(5000)` | `5.000,00` | Sem símbolo R$ |
| `fmtBRLCompact(1500)` | `R$ 1,5k` | Eixos de gráficos |
| `formatDecimalBR(5.25)` | `5,25` | Quantidades decimais |
| `formatPercentBR(12.5)` | `12,5%` | Percentuais |
| `formatIntegerBR(2300)` | `2.300` | Inteiros com separador |
| `formatFixedBR(5.2, 2)` | `5,20` | Decimal fixo (alinhamento) |
| `formatDateBR(date)` | `13/03/2026` | Datas dd/MM/yyyy |
| `formatDateTimeBR(date)` | `13/03/2026 14:35` | Data e hora |
| `todayBR()` | `2026-03-13` | Data atual yyyy-MM-dd |
| `parseUTCToBR(ts)` | `13/03/2026 14:35` | UTC → display BR |

**Regra:** Toda formatação de exibição DEVE usar esses helpers. Nunca `toFixed()` ou `toLocaleString()` diretamente nos componentes.

---

## 11. PADRÕES VISUAIS

### Design System
- **Cores:** HSL via CSS variables em `index.css` (light/dark mode)
- **Tokens semânticos:** `--primary`, `--background`, `--foreground`, `--muted`, `--destructive`, `--success`, `--warning`, `--info`
- **Fontes:** Inter (corpo) + Space Grotesk (títulos/display)
- **Border radius:** `0.75rem` (padrão)
- **Gradientes:** `--gradient-salmon`, `--gradient-gold`, `--gradient-card`

### Componentes UI
- **Badge:** `<Badge>` do shadcn com variantes de cor
- **StatusBadge:** `<StatusBadge status="ATIVO" />` — cores semânticas por status
- **KpiCard:** `<KpiCard title="..." value="..." />` — card de indicador
- **EmptyState:** `<EmptyState title="..." />` — estado vazio padronizado
- **Tabelas:** `<Table>` do shadcn com sorting, paginação
- **Modais:** `<Dialog>` do shadcn
- **Toasts:** `toast.success()` / `toast.error()` via Sonner
- **Botões:** Variantes: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`

### Cores de Status
| Status | Cor |
|--------|-----|
| ATIVO/Sucesso | `--success` (verde) |
| PENDENTE/Alerta | `--warning` (amarelo) |
| CANCELADO/Erro | `--destructive` (vermelho) |
| INFORMAÇÃO | `--info` (azul) |
| INATIVO/Neutro | `--muted` (cinza) |

---

## 12. INTEGRAÇÕES ENTRE MÓDULOS

```
┌──────────────┐     ┌───────────────┐     ┌─────────────┐
│   Compras    │────→│    Estoque    │────→│     CMV     │
│              │     │               │     │             │
│  (Pedidos,   │     │ (Movimentações│     │ (Cálculo    │
│   Recebim.)  │     │  automáticas) │     │  server-side)│
└──────┬───────┘     └───────┬───────┘     └──────┬──────┘
       │                     │                     │
       │              ┌──────┴──────┐              │
       │              │  Inventário │              │
       │              │ (Ajustes de │              │
       │              │   estoque)  │              │
       │              └─────────────┘              │
       │                                           │
┌──────┴───────┐     ┌───────────────┐     ┌──────┴──────┐
│ Fornecedores │     │    Salmão     │     │Ficha Técnica│
│              │     │ (Sync bidirec.│     │ (Custos de  │
│ (Preços por  │     │  com estoque) │     │  receitas)  │
│   item)      │     └───────────────┘     └─────────────┘
└──────────────┘
       │
┌──────┴───────┐     ┌───────────────┐
│ Planejamento │     │  Financeiro   │
│ (Metas de    │     │ (Fechamento   │
│  compra)     │     │  de caixa →   │
└──────────────┘     │  faturamento  │
                     │  → CMV)       │
                     └───────────────┘
```

### Detalhamento das Integrações

1. **Compras → Estoque:** Recebimento de pedido gera movimentações automáticas de ENTRADA via `receive_purchase_order_atomic`
2. **Estoque → CMV:** Movimentações de saída são base do cálculo de CMV
3. **Ficha Técnica → CMV:** Custo de receitas usa preços do estoque
4. **Inventário → Estoque:** Finalização gera movimentações de AJUSTE automáticas
5. **Salmão ↔ Estoque:** Sincronização bidirecional — entrada de salmão gera ENTRADA no estoque; cancelamento no estoque propaga para salmão
6. **Requisições → Estoque → Compras:** Requisições de estoque podem gerar pedidos de compra
7. **Financeiro → CMV:** Fechamento de caixa fornece faturamento para cálculo de CMV %
8. **Planejamento → Compras:** Metas de compra geram alertas de pressão orçamentária

---

## 13. FUNCIONALIDADES AVANÇADAS

### 13.1 Simulador de Compras
- Simulação de impacto de uma compra no orçamento mensal
- Projeta gasto total e compara com meta
- Alerta visual de estouros

### 13.2 Ranking de Consumo
- RPC `get_stock_top_consumed` — Top N itens por valor ou quantidade
- Filtros por categoria, período
- Identificação de itens de alto impacto

### 13.3 Relatório de Perdas
- RPC `get_stock_losses_report` — Análise de baixas por perda
- Agrupamento por tipo de perda, categoria, produto
- Valor financeiro do desperdício

### 13.4 Estoque Preditivo
- RPC `get_stock_predictive_analysis_v2` — Previsão baseada em padrões de consumo
- **Previsão de ruptura:** Dias até estoque zerar
- **Previsão de consumo:** Baseada em médias e padrões semanais (`p_use_weekday_pattern`)
- **Cobertura:** Quantos dias o estoque atual cobre
- **Alertas:** Produtos em nível crítico ou abaixo do mínimo

### 13.5 Score Operacional
- Classificação da operação por período (Excelente/Bom/Regular/Crítico)
- Componentes: CMV, aproveitamento salmão, acurácia inventário, etc.
- Simulação de cenários "what-if"

### 13.6 Conciliação Bancária
- Detecção automática de transferências entre contas
- Importação de extratos
- Match de lançamentos com contas a pagar/receber

---

## 14. PADRÕES DE SEGURANÇA

### 14.1 RLS (Row Level Security)
- **Ativado em todas as tabelas** com `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- **FORCE RLS** ativado globalmente (mesmo para roles de serviço, exceto via `service_role`)
- Padrão de política SELECT: `USING (company_id = get_current_company_id())`
- Padrão de política INSERT: `WITH CHECK (true)` + trigger força `company_id`
- Padrão de política UPDATE: `USING (company_id = get_current_company_id()) WITH CHECK (...)`
- Padrão de política DELETE: `USING (false)` — soft delete obrigatório para tabelas críticas

### 14.2 RBAC
- **Formato:** `<módulo>:<subaba>:<ação>` — ex: `estoque:catalogo:create`
- **11 ações:** `view`, `create`, `edit`, `delete`, `export`, `manage`, `approve`, `close`, `reconcile`, `cancel`, `simulate`
- **Validação:** `has_permission()` e `has_any_permission()` em RPCs e RLS
- **Super admin:** `system:global:manage` — bypass total
- **Frontend:** `useCan()`, `useModuleAccess()`, `<RequirePermission>`

### 14.3 Auditoria
- Tabela `audit_logs` com campos: `action`, `entity`, `module`, `before`, `after`, `severity`
- RPCs `audit_log_write()` e `log_audit()` para escrita estruturada
- `fin_audit_logs` para auditoria financeira detalhada
- `audit_inventario_log` para auditoria de inventário
- `admin_actions_log` para ações administrativas

### 14.4 Idempotência
- Chave `idempotency_key` em operações críticas (inventário, lançamentos)
- Previne duplicação por double-click ou retry

### 14.5 Soft Delete
- Colunas `deleted_at` e `deleted_by` em tabelas críticas
- Política RLS `DELETE USING(false)` bloqueia exclusão física
- RPCs dedicadas para soft delete (ex: `soft_delete_inventory`)

### 14.6 Proteção de Dados Sensíveis
- Mascaramento de cartões em `rh_beneficios` (apenas `last4`)
- `profiles` acessível apenas pelo próprio usuário ou admin
- `list_profiles_minimal` para buscas públicas de metadados

---

## 15. CONVENÇÕES IMPORTANTES

### 15.1 Backend
- **Campos monetários:** `number` (numeric no Postgres), nunca string
- **Datas:** `timestamptz` no banco; `yyyy-MM-dd` para datas de negócio
- **IDs:** UUID (`gen_random_uuid()`)
- **Soft delete:** `deleted_at timestamptz`, `deleted_by uuid`
- **Tenant:** `company_id uuid NOT NULL REFERENCES companies(id)` — em TODAS as tabelas
- **RPCs:** `SECURITY DEFINER` para operações atômicas; resolução de identidade via `auth.uid()`
- **Status enums:** String livre (não enum Postgres), ex: `'ATIVO'`, `'CANCELADO'`

### 15.2 Frontend
- **NUNCA enviar `company_id`** em operações de escrita
- **Formatação:** Sempre via helpers centrais (`formatMoneyBR`, `formatDecimalBR`, etc.)
- **Datas:** Sempre via `datetime.ts` (timezone `America/Sao_Paulo`)
- **Imports:** `@/` para path alias (src/)
- **Cores:** Sempre via tokens CSS semânticos, nunca cores hardcoded
- **Loading states:** Obrigatório em todos os botões de ação
- **Feedback:** Toast em toda operação CRUD

### 15.3 Edge Functions
- **userClient** para RPCs que dependem de `auth.uid()`
- **adminClient** apenas para operações na whitelist autorizada
- **Resolver `company_id`** via `assert_tenant()` no cliente JWT com header da unidade; nunca confiar no request body
- **npm imports:** `npm:@supabase/supabase-js@2`

### 15.4 Nomenclatura
- **Módulos no frontend:** camelCase (`estoque-geral`, `ficha-tecnica`)
- **Tabelas:** snake_case (`movimentacoes_estoque`)
- **RPCs:** snake_case (`get_saldo_produtos`)
- **Componentes:** PascalCase (`EstoqueGeralView.tsx`)
- **Hooks:** camelCase com `use` prefix (`useEstoqueGeralStore`)

---

## 16. ROLES DO SISTEMA

### Enum `app_role`
```
admin, compras, compras_assistente, operador, viewer,
diretor, gerente_geral, gerente, colaborador,
financeiro, chefe_setor, estoquista
```

### Templates de Permissão
- **Colaborador:** Acesso básico (requisições de estoque, ponto)
- **Compras:** Acesso completo a compras, estoque e fornecedores
- **Financeiro:** Relatórios + financeiro completo
- **Estoquista:** Estoque, recebimentos e mercados

---

## 17. ARQUIVOS QUE NÃO DEVEM SER EDITADOS

| Arquivo | Motivo |
|---------|--------|
| `src/integrations/supabase/client.ts` | Auto-gerado pelo Supabase |
| `src/integrations/supabase/types.ts` | Auto-gerado pelo Supabase |
| `supabase/config.toml` | Configuração auto-gerenciada |
| `.env` | Variáveis auto-configuradas |

---

## 18. VARIÁVEIS DE AMBIENTE

| Variável | Uso |
|----------|-----|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave anon do Supabase |
| `VITE_SUPABASE_PROJECT_ID` | ID do projeto |
| `VITE_ENABLE_LEGACY_PERMISSIONS` | Kill switch de permissões legadas (`true`/`false`) |

---

## 19. SCRIPTS DISPONÍVEIS

| Script | Comando | Finalidade |
|--------|---------|-----------|
| `dev` | `vite` | Servidor de desenvolvimento |
| `build` | `vite build` | Build de produção |
| `test` | `vitest run` | Executar testes |
| `test:watch` | `vitest` | Testes em watch mode |
| `rbac:lint` | `npx tsx scripts/rbac-lint.ts` | Lint de permissões RBAC |
| `security:check` | `npx tsx scripts/verify-security.ts` | Verificação de segurança |

---

*Documento gerado em 2026-03-13. Mantenha atualizado conforme o sistema evolui.*
