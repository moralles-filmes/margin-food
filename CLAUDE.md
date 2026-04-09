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
| Deploy | Vercel (auto-deploy no push para `main`) |

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
- 200+ permissões granulares registradas (sincronizadas com banco via migração)

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
| `admin-companies` | Gestão multi-tenant de empresas |

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

### 2026-04-09 — Fix Tela Branca ao Acessar o Sistema (ChunkLoadError + ErrorBoundary)
- **Bug**: Ao acessar o sistema, a tela ficava branca. Ctrl+R resolvia.
- **Causa raiz**: Após deploy no Vercel, o Service Worker antigo ainda servia o `index.html` cacheado. Esse HTML referenciava chunks JS com hashes antigas. O React tentava importar componentes lazy (13+ views) usando as novas hashes → `ChunkLoadError`. Sem Error Boundary, o Suspense ficava no fallback invisível (`div` com background), parecendo tela branca.
- **Fix — 3 camadas de defesa**:
  1. **`main.tsx`**: Listeners globais de `error` + `unhandledrejection` antes do React montar → detecta chunk errors e recarrega 1x (flag `chunk-reload-attempted` no `sessionStorage` evita loop).
  2. **`App.tsx`**: `ErrorBoundary` de classe envolve o `BrowserRouter` → na 1ª falha recarrega, na 2ª exibe botão "Recarregar" visível ao usuário.
  3. **`index.html`**: Script inline puro → após 8s, se `#root` estiver vazio, recarrega 1x (flag `wsd-reload-attempted`).
- **Arquivos afetados**: `src/main.tsx`, `src/App.tsx`, `index.html`

### 2026-04-06 — Fix Sidebar: "Usuários" e "Configurações" selecionando ambas ao mesmo tempo
- **Bug**: Na seção ADMINISTRAÇÃO da sidebar, clicar em "Usuários" ou "Configurações" selecionava ambos os itens simultaneamente. Clicar em "Usuários" redirecionava para "Configurações - Geral" em vez da subtab "Usuários".
- **Causa**: Ambos os itens tinham `id: 'configuracoes'` no array de navegação do `AppLayout.tsx`. O `activeTab` era comparado com `item.id` para destacar o item ativo, então ambos ficavam ativos. `ConfiguracoesView` sempre iniciava com `activeView: 'geral'`.
- **Fix**: Criado `TabId` separado `'configuracoes-usuarios'` para o item "Usuários". `ConfiguracoesView` agora aceita prop `initialSubTab` para abrir diretamente na subtab correta.
- **Arquivos afetados**: `salmon.ts` (tipo TabId), `AppLayout.tsx` (sidebar items + tabLabels), `Index.tsx` (mapeamentos + renderização), `ConfiguracoesView.tsx` (prop initialSubTab)

### 2026-04-06 — Esconder módulo "Sistema" do PermissionMatrix para não-super-admins
- **Bug**: Admins regulares de empresa viam o módulo "Sistema" (com `system:global:manage`) na árvore de permissões ao editar/criar usuários em Configurações > Usuários, podendo conceder acesso super-admin indevidamente.
- **Fix**: `PermissionMatrix.tsx` agora filtra o módulo `system` usando `effectivePermissions.includes('system:global:manage')` diretamente (sem `useCan`, que resolvia `true` via fallback legado `system:admin` → `system:global:manage` no `LEGACY_PERMISSION_MAP`).
- **Arquivo afetado**: `PermissionMatrix.tsx`

### 2026-04-06 — Exibir nome da empresa na sidebar (substituir "Architect")
- **Antes**: Sidebar exibia "ARCHITECT" hardcoded abaixo do logo "Margin Food".
- **Fix**: Agora exibe o nome da empresa do usuário logado (ex: "MarginPro Oficial", "Royal Parma"). Fallback "Margin Food" se `company_name` for null.
- **AuthContext**: `ProfileData` ganhou campo `company_name`. Query de profile expandida com JOIN `companies(nome)` para buscar o nome da empresa sem query adicional.
- **Arquivos afetados**: `AuthContext.tsx`, `AppLayout.tsx`

### 2026-04-06 — Remover Migração e Reconciliação Salmão das Configurações
- **Remoção**: Removidos utilitários legados da aba Configurações > Geral que não tinham mais utilidade operacional.
- **SalmonMigrationWizard**: migração one-time do localStorage para o banco — já concluída (tela mostrava "Nenhum dado local encontrado").
- **SalmonReconciliationReport**: diagnóstico técnico de reconciliação de saldos — sem valor para o usuário na UI de configurações.
- **Arquivos deletados**: `SalmonMigrationWizard.tsx`, `SalmonReconciliationReport.tsx`
- **Arquivo editado**: `ConfiguracoesView.tsx` (removidos imports e renderização)

### 2026-04-06 — Fix "Acesso negado" para Admin de Nova Empresa (Multi-Tenant)
- **Bug 1 — Permissões desatualizadas**: Ao criar uma nova empresa e um admin para ela, o admin recebia "Acesso negado" em todos os módulos. A tabela `role_permissions` para o role `admin` só continha chaves no formato antigo (`stock:read`, `finance:manage`), mas o frontend verifica chaves no formato novo/granular (`estoque:dashboard:view`, `financeiro:dashboard:view`). O super-admin não era afetado porque `system:global:manage` bypassa todas as checagens.
- **Fix 1**: Migração que insere todas as ~200 permissões granulares do registry na tabela `permissions` e concede ao role `admin` (e `diretor`, `gerente_geral`) todas as permissões exceto `system:global:manage`.
- **Bug 2 — Role não atribuído**: A Edge Function `admin-companies` usava `onConflict: 'user_id'` no upsert de `user_roles`, mas a constraint unique é `(user_id, role)`. O upsert falhava silenciosamente e o usuário ficava sem role.
- **Fix 2**: Corrigido `onConflict` para `'user_id,role'` na Edge Function. Deploy realizado.
- **Bug 3 — Admin via acesso ao Painel Admin**: O role `admin` tinha `system:global:manage` herdado do seed original, dando acesso indevido ao Painel Admin (reservado para super-admins).
- **Fix 3**: Removido `system:global:manage` do role `admin`/`diretor`/`gerente_geral` em `role_permissions`. Super-admin (`morallesfilms@gmail.com`) agora recebe `system:global:manage` via `user_permissions` (grant direto, independente de role).
- **Migração**: `20260406190000_seed_granular_permissions_admin.sql`
- **Arquivos afetados**: `supabase/functions/admin-companies/index.ts`

### 2026-04-06 — Card "Saldo Acumulado" no Fluxo de Caixa
- **Feature**: Adicionado card "Saldo Acumulado" no Fluxo de Caixa, que considera o saldo inicial das contas bancárias ativas + todos os lançamentos realizados/conciliados até o fim do período. Mesma lógica do "Saldo em Caixa" do Dashboard.
- **Backend**: RPC `get_fin_cashflow` agora retorna `saldo_acumulado` no objeto `totais`.
- **Frontend**: Novo card com ícone `Wallet`, visível em todos os modos (Realizado, Previsto, Ambos). Grid ajustado para `lg:grid-cols-5`.
- **Migração**: `20260406180000_cashflow_saldo_acumulado.sql`
- **Arquivos afetados**: `FluxoCaixaSection.tsx`

### 2026-04-06 — Fix Duplo botão "X" nos Dialogs do Financeiro
- **Bug**: Dialogs do módulo financeiro exibiam dois botões "X" de fechar. O `DialogContent` do shadcn/ui já renderiza um X nativo via `DialogPrimitive.Close`, e 10 componentes adicionavam manualmente outro botão X.
- **Fix**: Removidos os botões X manuais e imports de `X` do lucide-react desnecessários em todos os 10 arquivos. O `onOpenChange` de cada Dialog já estava configurado para chamar `guardedClose`/`onClose`, então o X nativo do Radix continua disparando a mesma lógica (incluindo confirmação de dirty form).
- **Arquivos afetados**: `ContaFormDialog.tsx`, `ContaDetailDialog.tsx`, `CadastroBaseTree.tsx`, `CategoriasFinSection.tsx`, `CategorizacaoSection.tsx`, `CentrosCustoFinSection.tsx`, `ContasBancariasSection.tsx`, `FechamentoCaixaSection.tsx`, `OrcamentoSection.tsx`, `PlanoContasFinSection.tsx`

### 2026-04-06 — Fix Lançamentos: navegação do Fluxo de Caixa + filtro de data vazio
- **Bug 1 — Fluxo de Caixa não filtrava data**: Clicar em um dia no Fluxo de Caixa redirecionava para Lançamentos, mas `LivroRazaoSection` não aceitava `initialDateFrom`/`initialDateTo` nas props — as datas eram descartadas e o filtro sempre mostrava os últimos 30 dias.
- **Fix 1**: Adicionadas props `initialDateFrom` e `initialDateTo` em `LivroRazaoProps` e usadas para inicializar `filtroDataDe`/`filtroDataAte`.
- **Bug 2 — Filtro com data vazia**: Quando o campo "De" era limpo, `filtroDataDe` virava `""` e era enviado como `p_start: ""` para a RPC. PostgreSQL não conseguia converter `""` para `date`/null, retornando zero resultados. A SQL já tratava `NULL` corretamente (`p_start IS NULL OR ...`).
- **Fix 2**: `p_start: filtroDataDe || null` e `p_end: filtroDataAte || null` — agora envia `null` quando vazio.
- **Fix 3 — Import formatDateBR**: `LivroRazaoSection` importava `formatDateBR` de `@/lib/formatters` (alias para `formatDisplayBR`, formato `dd/MM/yyyy`). Corrigido para importar de `@/lib/datetime` (formato `yyyy-MM-dd`), compatível com `<input type="date">`.
- **Arquivo**: `LivroRazaoSection.tsx`

### 2026-04-01 — Fix Fluxo de Caixa/Dashboard (mês errado) + Estorno de Pagamentos
- **Bug 1 — Pagamento em mês errado**: Espelhos criados por `pay_conta_pagar` e `receive_conta_receber` usavam `data_vencimento` como `data_competencia`. Quando uma conta vencida era paga, o lançamento aparecia no mês do vencimento (ex: março) em vez do mês do pagamento real (ex: abril) — afetando Fluxo de Caixa e Dashboard.
- **Fix**: `data_competencia` agora usa `CURRENT_DATE` (data real do pagamento). Dados existentes corrigidos via UPDATE.
- **Feature — Botão Estornar**: Adicionado botão "Estornar" em Contas a Pagar (status PAGO) e Contas a Receber (status RECEBIDO). Usa RPCs `_guarded_estornar_conta_pagar` e `_guarded_estornar_conta_receber` que já existiam mas não tinham UI. O estorno reverte o status para APROVADO/A_RECEBER e cancela o lançamento espelho.
- **Migração**: `20260401230000_fix_espelho_data_competencia.sql`
- **Arquivos frontend**: `ContasPagarSection.tsx`, `ContasReceberSection.tsx`

### 2026-04-01 — Fix Type Mismatches nas RPCs Financeiras
- **Bug 1 — Optimistic Locking**: `pay_conta_pagar` e `receive_conta_receber` comparavam `updated_at::text` (formato PostgreSQL `2026-04-01 10:15:30+00`) com o valor retornado por `row_to_json()` (formato ISO 8601 `2026-04-01T10:15:30+00:00`). A comparação textual **nunca batia**, bloqueando todos os pagamentos/recebimentos com erro "Registro alterado por outro usuário. Recarregue."
- **Fix 1**: Substituída comparação textual por comparação tipada: `v_item.updated_at != p_expected_updated_at::timestamptz`.
- **Bug 2 — CURRENT_DATE::text**: `pay_conta_pagar`, `receive_conta_receber` e `reconcile_receive_conta_receber` usavam `CURRENT_DATE::text` e `p_data_recebimento::text` em colunas `date`, causando erro "column is of type date but expression is of type text".
- **Fix 2**: Removidos casts `::text` desnecessários — `CURRENT_DATE` e `p_data_recebimento` já são `date`.
- **Bug 3 — entidade_id::text**: `fin_audit_logs.entidade_id` é `uuid`, mas RPCs inseriam `p_id::text`. Corrigido em `pay_conta_pagar`, `receive_conta_receber`, `reconcile_pay_conta_pagar` e `reconcile_receive_conta_receber`.
- **Migrações**: `20260401220000_fix_optimistic_lock_timestamp_format.sql`, `20260401223000_fix_type_mismatches_financial_rpcs.sql`

### 2026-04-01 — Multi-Tenant Onboarding (Gestão de Empresas)
- **Hardened `get_current_company_id()`**: Removido fallback perigoso que retornava "primeira empresa ativa" — com múltiplos tenants, isso causaria vazamento de dados. Agora retorna `NULL` se o perfil não tem `company_id` válido.
- **Nova RPC `onboard_new_company()`**: Cria empresa + seed de cargos padrão + audit log. Aceita `p_admin_user_id` opcional para vincular admin existente.
- **Nova RPC `update_company()`**: Edita nome, CNPJ, ativo/inativo com validação de CNPJ duplicado e bloqueio do placeholder.
- **Nova RPC `list_companies()`**: Lista empresas com contagem de usuários, somente para super-admins (`system:global:manage`).
- **Nova Edge Function `admin-companies`**: Ação `create-first-user` cria o primeiro admin de uma empresa nova, atribuindo `company_id` da empresa alvo (não do caller).
- **Novo componente `AdminCompaniesView`**: Cards com nome, CNPJ, status, total de usuários. Dialogs para criar/editar empresa e criar admin.
- **Nova aba "Empresas"** no Painel Admin (`AdminPanel.tsx`).
- **Permissões registradas**: `configuracoes:empresas:{view,create,edit,delete}` no `registry.ts`.
- **Fix audit table**: RPCs usavam `admin_actions_log` (inexistente) — corrigido para `audit_logs`. Migração: `20260401210000_fix_onboarding_audit_table.sql`.
- **Migrações**: `20260401200000_multi_tenant_onboarding.sql`, `20260401210000_fix_onboarding_audit_table.sql`
- **Arquivos afetados**: `AdminCompaniesView.tsx`, `AdminPanel.tsx`, `registry.ts`, `admin-companies/index.ts`

### 2026-04-01 — Hardening de Sincronização Financeira (Lançamentos <> CP/CR)
- **Guard contra deleção de espelhos**: Nova RPC `_guarded_delete_lancamento` bloqueia exclusão de lançamentos com `origem IN ('espelho_cp','espelho_cr')` e lançamentos conciliados.
- **Estorno de CP/CR**: Novas RPCs `_guarded_estornar_conta_pagar` e `_guarded_estornar_conta_receber`. Botões "Estornar" adicionados nas tabelas de CP e CR.
- **Rateio no espelho**: RPCs de pagamento/recebimento agora copiam linhas de rateios para o lançamento espelho.
- **Validação de conta bancária**: Todas as RPCs de pagamento/recebimento validam que `conta_bancaria_id` pertence à empresa.
- **Auditoria de integridade**: Nova RPC `fin_audit_integrity_check()` detecta 10 tipos de inconsistência.
- **Migração**: `20260401140000_financial_sync_hardening.sql`

### 2026-04-01 — Fix entidade_id type mismatch nas RPCs auxiliares do Financeiro
- **Bug**: 8 RPCs auxiliares inseriam `p_id::text` na coluna `entidade_id` (tipo `uuid`) da `fin_audit_logs`.
- **Fix**: Removido cast `::text` em todas as 8 RPCs.
- **Migração**: `20260401120000_fix_auxiliary_audit_entidade_id_type.sql`

### 2026-04-01 — Fix Fluxo de Caixa: formato de datas, contas vencidas e cards "Só Previsto"
- **Bug 1 — RPC falhava**: `formatDateBR` de `@/lib/formatters` retorna `dd/MM/yyyy` (display), mas era passado como parâmetro para RPCs PostgreSQL que esperam `yyyy-MM-dd`. Afetava `get_fin_cashflow`, `get_fin_dfc_summary` e `get_fin_dashboard_summary`.
- **Fix**: Importar `formatDateBR` de `@/lib/datetime` (retorna `yyyy-MM-dd`) para parâmetros de RPC em `FluxoCaixaSection`, `DFCSection` e `DashboardFinanceiroSection`.
- **Bug 2 — Contas vencidas não apareciam**: A RPC `get_fin_cashflow` filtrava contas a pagar por `status IN ('APROVADO', 'AGUARDANDO_APROVACAO')` e contas a receber por `status = 'A_RECEBER'`, excluindo contas vencidas.
- **Fix**: Contas com `data_vencimento < CURRENT_DATE` e status pendente (não PAGO/CANCELADO/RASCUNHO) agora aparecem no fluxo de caixa independente do período selecionado, com badge "Pagar (Vencida)" / "Receber (Vencida)" em vermelho.
- **Bug 3 — Cards sumiam em "Só Previsto"**: Ao selecionar modo "Só Previsto", apenas o card "Saldo Projetado" era exibido.
- **Fix**: Adicionados cards "Prev. Entradas" e "Prev. Saídas" visíveis exclusivamente no modo "Só Previsto".
- **Fix Contas a Pagar/Receber**: Corrigido envio de rateios (`rateioLines.length > 1` → `> 0`) e remoção de `JSON.stringify` redundante nos payloads de RPC. Adicionada coluna Categoria na tabela de Contas a Pagar.
- **Migrações**: `20260331170000_fix_cashflow_include_vencido.sql`, `20260401001000_fix_cashflow_vencido_any_period.sql`, `20260401001500_fix_cashflow_auto_detect_vencido.sql`
- **Arquivos afetados**: `FluxoCaixaSection.tsx`, `DFCSection.tsx`, `DashboardFinanceiroSection.tsx`, `ContasPagarSection.tsx`, `ContasReceberSection.tsx`

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
- [x] Implementar Multi-Tenant Onboarding (Gestão de Empresas)
- [ ] Monitorar integridade dos dados na empresa piloto após ativação multi-tenant
- [ ] Testar fluxo completo: criar empresa → criar admin → login admin → criar usuários

---

## 📖 Documentação Adicional

- **Arquitetura completa**: `docs/ARCHITECTURE.md`
- **Regras de negócio**: `docs/DOMAIN_RULES.md`
- **Padrões de segurança**: `docs/ENTERPRISE_SAFE_STANDARDS.md`
- **RBAC playbook**: `docs/rbac/playbook-operacional.md`
- **Tarefas ativas**: `TAREFAS.md`
