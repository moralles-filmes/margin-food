# CLAUDE.md — Contexto do Projeto Moralles Food

> **Leia este arquivo primeiro.** Ele contém todo o contexto necessário para trabalhar neste projeto.
> Após fazer qualquer alteração significativa, atualize a seção **Últimas Atualizações** deste arquivo.

---

## 🔗 Repositórios e Serviços

| Serviço | Identificador |
|---------|--------------|
| GitHub | `https://github.com/moralles-filmes/margin-food` |
| Supabase Project ID | `wuzxpbixprrgssoeeaez` |
| Supabase URL | `https://wuzxpbixprrgssoeeaez.supabase.co` |
| Supabase Dashboard | `https://supabase.com/dashboard/project/wuzxpbixprrgssoeeaez` |
| Deploy | Lovable Cloud (auto-deploy no push para `main`) |

---

## 🧱 Stack Tecnológica

### Frontend
- **React 18 + TypeScript 5** — framework principal
- **Vite 5 + SWC** — build tool
- **shadcn/ui + Radix UI** — componentes de UI
- **Tailwind CSS 3** — estilização
- **React Router DOM 6** — roteamento
- **TanStack React Query 5** — cache e fetching de dados
- **React Hook Form 7 + Zod 3** — formulários e validação
- **Recharts 2** — gráficos
- **Sonner** — notificações toast
- **jsPDF + xlsx** — exportação PDF e Excel
- **vite-plugin-pwa** — suporte PWA com auto-update
- **Bun** — gerenciador de pacotes (`bun install`, `bun run dev`)

### Backend
- **Supabase** — banco PostgreSQL 15+ com RLS global
- **Supabase Auth** — autenticação email/senha
- **PostgREST** — API automática + RPCs customizadas (30+)
- **Edge Functions** — Deno/TypeScript (15 funções)
- **Supabase Realtime** — subscriptions postgres_changes
- **Supabase Storage** — arquivos

---

## 📁 Estrutura de Pastas

```
margin-food/
├── src/
│   ├── App.tsx                    # Roteamento raiz e providers
│   ├── components/                # 50+ componentes por módulo
│   ├── pages/                     # Index, Login, Admin
│   ├── contexts/                  # AuthContext, contextos de store
│   ├── hooks/                     # 20+ hooks customizados
│   ├── lib/                       # Utilitários (formatters, PDFs, permissões)
│   ├── types/                     # Tipos TypeScript (estoque, financeiro, salmon)
│   ├── domain/                    # Regras de negócio e invariantes
│   ├── integrations/supabase/     # Cliente Supabase e tipos gerados
│   └── permissions/               # Registry RBAC, ações, validação
├── supabase/
│   ├── config.toml                # Config CLI (project_id, JWT)
│   ├── migrations/                # 40+ migrações SQL
│   └── functions/                 # 15 Edge Functions Deno
├── docs/
│   ├── ARCHITECTURE.md            # Guia completo de arquitetura
│   ├── DOMAIN_RULES.md            # Regras de negócio documentadas
│   ├── ENTERPRISE_SAFE_STANDARDS.md # Padrões de segurança
│   └── rbac/                      # Playbooks RBAC
├── CLAUDE.md                      # ← Este arquivo (contexto para AIs)
└── TAREFAS.md                     # Tarefas em progresso e concluídas
```

---

## 🏗️ Arquitetura — Pontos Críticos

### Multi-tenancy
- **Fix Inventário Geral — Criação e Seleção de Produtos (2026-03-28):**
  - Corrigido bug de seleção de produtos no modal de Movimentação: `useEffect` com dependência `hasPurchaseUnit` resetava o formulário ao selecionar produtos com unidade de compra diferente.
  - Adicionada coluna `idempotency_key` na tabela `inventarios` (faltava).
  - Adicionada coluna `company_id` na tabela `audit_inventario_log` (faltava).
  - Edge Function `inventario` atualizada para tratar retorno `uuid` da RPC `create_inventory_atomic`.
  - Migração de permissões (GRANTs + RLS) re-aplicada na tabela `produtos`.
  - Deploy da Edge Function `inventario` no Supabase remoto.
- **Fix Módulo Inventário & Tenant Integrity (2026-03-28):**
  - Execução de migrações para sincronizar `profiles` e `turnos` com a empresa piloto.
  - Reparo de 1450+ registros órfãos (`company_id IS NULL`) vinculados agora ao pilot.
  - Otimização da RPC `create_inventory_atomic` para evitar timeouts durante a criação de inventários completos.
  - Resolução de invisibilidade de produtos no Catálogo e Movimentações.
- **Limpeza de Dados Single-Tenant (2026-03-28):** Executada migração de limpeza profunda para manter apenas a empresa piloto `MarginPro Oficial`.
- Toda tabela tem `company_id NOT NULL` — forçado por trigger (`trg_force_company_id`)
- `get_current_company_id()` resolve: `auth.uid()` → `profiles.company_id`
- UUID placeholder `00000000-0000-0000-0000-000000000001` é mantido para fins de sistema mas bloqueado para operações comuns
- **Nunca** confiar em `company_id` vindo do cliente — sempre do backend

### RLS (Row-Level Security)
- `FORCE RLS` em todas as tabelas — sem exceção
- `has_permission(user_id, permission_key)` — RPC usada no backend para checar permissões
- `get_effective_permissions(user_id)` — retorna permissões efetivas do usuário

### RBAC (Permissões)
- Formato: `<módulo>:<submódulo>:<ação>`
- Ações padrão (11): `view, create, edit, delete, export, manage, audit, approve, configure, execute, admin`
- Registry em `src/permissions/registry.ts` — fonte única da verdade
- Sync via `rpc_sync_permissions_from_registry()`
- 100+ permissões registradas

### Autenticação
- JWT Supabase Auth — validado via Bearer token nas Edge Functions
- `verify_jwt = false` no config (validação manual dentro das funções)
- Cache de roles/permissões no `sessionStorage` (TTL 5min) via AuthContext
- Soft delete: registros críticos nunca deletados fisicamente (`deleted_at`)

---

## 📦 Módulos do Sistema

| Módulo | Descrição | Componente Principal |
|--------|-----------|---------------------|
| **Estoque** | Gestão de inventário (dual-unit) | `EstoqueGeralView` |
| **Compras** | Pedidos, requisições, fornecedores | `ComprasView` |
| **CMV** | Custo da Mercadoria Vendida + metas | `CmvView` |
| **Ficha Técnica** | Fichas de receitas e precificação | `FichaTecnicaView` (74KB) |
| **Salmão** | Controle de rendimento de salmão | `SalmonControlView` |
| **Financeiro** | Contas a pagar/receber, DRE | `FinanceiroView` |
| **RH** | Folha de pagamento, escalas | `RhView` |
| **Planejamento** | Projeções e radar de compras | `PlanningView` |
| **Relatórios** | Analytics e KPIs | `RelatoriosView` |
| **Inventário** | Auditorias físicas | `InventarioView` |
| **IA Central** | Assistentes AI por módulo | `CentralIAView` |
| **Admin** | Usuários, logs, segurança | `AdminUsersView` |

---

## ⚡ Otimizações de Performance (Implementadas)

1. **`get_catalog_counts()` RPC** — uma chamada para contagens do catálogo (evita 3 queries separadas com timeout)
2. **`saldo_atual` cacheado** — saldo de estoque salvo na tabela `produtos` (atualizado por trigger)
3. **RLS otimizado** — funções de permissão simplificadas para evitar queries aninhadas caras
4. **Índices** — adicionados em `movimentações_estoque` (company_id + produto_id + status)
5. **React Query config** — `staleTime: 15s`, `gcTime: 5min`
6. **Error handling no catálogo** — impede limpeza do catálogo em erro de fetch

---

## 🔧 Edge Functions (Supabase)

| Função | Propósito |
|--------|-----------|
| `admin-users` | Gestão de usuários com RBAC |
| `admin-create-user` | Criação de novos usuários |
| `cmv` | Cálculo de CMV |
| `ficha-tecnica` | Fichas técnicas de receitas |
| `inventario` | Operações de inventário |
| `ai-chat` | Assistente IA central |
| `requisicao-estoque` | Requisições de estoque (com lógica de estorno) |
| `check-password` | Validação de senha |
| `rbac-lint` | Auditoria de permissões RBAC |
| `rh` | Recursos humanos |
| `purchase-requisitions` | Ordens de compra |
| `scheduled-jobs` | Jobs em background (cron) |

---

## 📋 Convenções de Desenvolvimento

- **Commits**: `tipo(escopo): descrição` — ex: `fix(estoque): corrige timeout no catálogo`
- **Idioma do código**: inglês para variáveis/funções, português para UI e comentários de negócio
- **Migrações**: sempre criar novo arquivo em `supabase/migrations/` com timestamp `YYYYMMDDHHMMSS_nome.sql`
- **Permissões novas**: sempre adicionar em `src/permissions/registry.ts` + rodar `rpc_sync_permissions_from_registry()`
- **Sem mock de banco**: testes de integração sempre usam banco real
- **Sem amend em commits públicos**: sempre criar novo commit

---

## 🔄 Últimas Atualizações

> **Mantenha esta seção atualizada após cada sessão de trabalho.**

### 2026-03-31 — Fix Itens Indisponíveis não iam para "Não Entregues" + Exibição no Recebimento
- **Bug**: Itens marcados como "indisponível" no Checklist de Compra não faziam o pedido ir para a aba "Não Entregues" após recebimento — iam direto para "Concluídos".
- **Causa raiz**: `receive_purchase_order_atomic` determinava status final baseado apenas nos itens do batch atual (`p_items`). Itens já marcados como `NOT_DELIVERED` na fase de shopping não eram incluídos no batch do frontend, então `v_items_not_delivered = 0` → status = `COMPLETED` em vez de `PARTIAL`.
- **Fix Backend (RPC)**: Status determination agora consulta TODOS os itens do pedido no banco (`SELECT ... FROM purchase_order_items WHERE order_id = ...`) em vez de contar apenas os do batch.
- **Fix Frontend (confirmReceiving)**: `usePurchaseOrdersStore.ts` agora inclui itens NOT_AVAILABLE como NOT_DELIVERED no RPC call, garantindo contagem correta em ambos os lados.
- **UI Recebimento**: Adicionada seção "Indisponíveis na compra" em vermelho na tela de recebimento (`PedidosComprasMercadoView.tsx`), exibindo nome, quantidade, valor e observação do checklist.
- **Migração**: `20260331150834_fix_receive_status_not_available.sql`
- **Arquivos afetados**: `PedidosComprasMercadoView.tsx`, `usePurchaseOrdersStore.ts`

### 2026-03-31 — Fix Saldo Estoque + Requisições + SearchableSelect Global
- **Fix Saldo Cache vs RPC**: `fn_recompute_product_saldo` e `attend_requisicao_item_atomic` estavam com fórmulas divergentes — cache ignorava estornos corretamente, mas a RPC contava todos. Alinhadas ambas para ignorar `ENTRADA_ESTORNO`/`SAIDA_ESTORNO`.
- **Fix Error Handling Requisições**: Mensagens de erro do backend (Edge Function) agora são exibidas no frontend via `extractEdgeFnErrorMessage()` — antes, o toast mostrava apenas "Erro ao atender item" genérico.
- **SearchableSelect Global**: Criado componente genérico `components/ui/SearchableSelect.tsx` (Popover + Command/cmdk) e aplicado em 13 arquivos / 25+ selects que tinham muitas opções sem busca. Selects com poucas opções fixas (status, tipo, período) mantidos como `Select` normal.
- **Arquivos afetados**: `MovimentacoesSection`, `StockLossesSection`, `StockTopConsumedSection`, `StockInactivityAlert`, `SimuladorCompraGeral`, `StockConsumptionHistorySection`, `StockTransfersSection`, `RankingFornecedoresView`, `InventarioView`, `OnboardingSection`, `ProdutoFormPanel`, `CalendarioLembretesView`, `GlobalAuditView`, `RequisicaoEstoqueSection`.

### 2026-03-28 — Fix Scroll em Dropdowns (cmdk 1.x)
- Corrigido bug de scroll em **todos os dropdowns/comboboxes** do sistema.
- Causa: cmdk 1.x aplica inline styles (`overflow: hidden; height: var(--cmdk-list-height)`) que impedem scroll dentro de Radix Popover.
- Correção: Override global em `index.css` com `[cmdk-list] { max-height: 300px !important; overflow: auto !important; }`.
- Componentes afetados: `ProductSearchCombobox`, `CategoryCombobox`, `SupplierCombobox`, `PedidosComprasMercadoView`.

### 2026-03-28 — Consolidação Single-Tenant e Limpeza de Dados
- Execução da migração de limpeza (`20260328144800_cleanup_stale_companies.sql`) para remover todas as empresas exceto a "MarginPro Oficial" e o placeholder de sistema.
- Remoção em cascata de todos os dados operacionais vinculados às empresas deletadas.
- Verificação do banco de dados: restam apenas 2 registros na tabela `companies`.
- Correção de turnos no Inventário para a empresa piloto.

### Componentes Padronizados
- **TableActions**: Localizado em `components/ui/TableActions.tsx`. Deve ser usado em todas as tabelas de gerenciamento para fornecer botões de Editar e Excluir consistentes, com suporte a permissões RBAC e diálogos de confirmação integrados.
- **FormCloseConfirmDialog**: Usado em conjunto com `useFormDirtyGuard` para prevenir perda de dados em formulários.
- **SearchableSelect**: Localizado em `components/ui/SearchableSelect.tsx`. Deve ser usado em todos os selects com 10+ opções (produtos, categorias, locais, usuários, fornecedores). Props: `value`, `onValueChange`, `options: {value, label}[]`, `placeholder`, `searchPlaceholder`, `modal` (true para uso dentro de Dialog).

### 2026-03-30 — Padronização de CRUD Financeiro (Hardening)
- **Módulos Padronizados**: `Contas a Pagar`, `Contas a Receber`, `Categorias`, `Centros de Custo`, `Plano de Contas` e `Contas Bancárias`.
- **Hardening de Segurança**: Implementação de 12+ RPCs `_guarded_` que exigem `assert_tenant()`, `has_permission()` e registram logs na `fin_audit_logs`.
- **Interface**: Adoção sistêmica do componente `TableActions` para operações de edição e exclusão.
- **Optimistic Locking**: Implementado em todas as edições financeiras via campo `updated_at`.

### 2026-03-30 — Fix Salmon Module Tenant Isolation
- **RPCs Tenantizadas**: `create_salmon_entry_atomic`, `cancel_salmon_entry_atomic`, `create_salmon_manipulation_atomic`, `cancel_salmon_manipulation_atomic` — todas com `assert_tenant()` e `company_id` explícito.
- **Função `ensure_salmon_raw_product()`**: Tenantizada — busca e cria produto salmão bruto por `company_id`.
- **`get_current_company_id()`**: Atualizada para não retornar placeholder; fallback dinâmico para primeira empresa ativa.
- **`assert_tenant()`**: Reforçada — bloqueia placeholder UUID e exige perfil com empresa vinculada.
- **Schema Repair**: `supplier_item_prices` ganhou colunas `company_id` e `supplier_uuid`; unique constraints atualizadas para incluir `company_id`.
- **Frontend**: Sem alterações — `useSalmonStore.ts` usa wrappers `_guarded` que delegam para `*_atomic`, que resolvem tenant internamente.

### Pendente / Em Aberto
- [x] Corrigir turnos ausentes no módulo de Inventário
- [x] Consolidar sistema para Single-Tenant (Remover empresas legadas)
- [x] Padronizar CRUD de todos os módulos financeiros (Contas, Categorias, Centros, Plano)
- [x] Fix Salmon Module Tenant Isolation
- [ ] Monitorar integridade dos dados na empresa piloto após limpeza intensa

---

## 📖 Documentação Adicional

- **Arquitetura completa**: `docs/ARCHITECTURE.md`
- **Regras de negócio**: `docs/DOMAIN_RULES.md`
- **Padrões de segurança**: `docs/ENTERPRISE_SAFE_STANDARDS.md`
- **RBAC playbook**: `docs/rbac/playbook-operacional.md`
- **Tarefas ativas**: `TAREFAS.md`
