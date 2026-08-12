# AGENTS.md — Contexto do Projeto Moralles Food

> **Leia este arquivo primeiro.** Ele contém todo o contexto necessário para trabalhar neste projeto.
> Após fazer qualquer alteração significativa, atualize a seção **Pendente / Em Aberto** deste arquivo.

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
├── AGENTS.md                      # ← Este arquivo (contexto para AIs)
└── TAREFAS.md                     # Tarefas em progresso e concluídas
```

---

## 🏗️ Arquitetura — Pontos Críticos

### Multi-tenancy
- Toda tabela tem `company_id NOT NULL` — forçado por trigger (`trg_force_company_id`)
- `get_current_company_id()` resolve: `auth.uid()` → `profiles.company_id`
- UUID placeholder `00000000-0000-0000-0000-000000000001` é mantido para fins de sistema mas bloqueado para operações comuns
- **Nunca** confiar em `company_id` vindo do cliente — sempre do backend
- Onboarding via `onboard_new_company()` (cria empresa + cargos + turnos default)

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

## 🧭 Princípios e Decisões Arquiteturais

> Decisões que orientam código novo. Histórico detalhado: `git log -- AGENTS.md` e `supabase/migrations/`.

- **`produtos.saldo_atual` é fonte única da verdade** — Toda RPC de leitura de valor/saldo de estoque deve consumir o cache (mantido por trigger `fn_recompute_product_saldo`), **nunca** recalcular inline sobre `movimentacoes_estoque`. RPCs alinhadas: `get_stock_summary`, `get_stock_dashboard`, `get_relatorios_kpis`.
- **PL/pgSQL valida colunas só na 1ª execução** — Toda migration que altere RPC com JOIN deve incluir `DO`-block que força resolução de colunas no `db push` (evita crash em produção ao invés de no deploy). Padrão: `20260502151400`.
- **`SECURITY DEFINER` exige `assert_tenant()` + `has_any_permission()` explícitos** — RPCs que retornam dados sensíveis (ex: `list_profiles_minimal`, `relatorio_socios_resumo`) nunca podem resolver tenant via JOIN manual.
- **Hard delete de usuário preserva histórico** — FKs de `auth.users(id)` usam `ON DELETE SET NULL`. Edge function `admin-users` chama `auth.admin.deleteUser`; CASCADE limpa `profiles`/`user_roles`/`user_permissions`.
- **Financeiro: RPCs `_guarded_`** — Todas as operações financeiras (CP, CR, lançamentos, conciliação) usam RPCs prefixadas `_guarded_` com `assert_tenant()`, `has_permission()`, optimistic locking via `updated_at` e log em `fin_audit_logs`.
- **Conciliação Bancária** — 3 destinos: `lancamento`, `conta_pagar`, `conta_receber`. Categoria é obrigatória para conciliar Receita/Despesa (validação no cliente e em triggers/RPCs; Transferência é exceção). Linhas persistidas em `sessionStorage`. "Ignorar" via `fin_conciliacao_ignoradas`.
- **Categorias não operacionais** — raízes fixas `RECEITAS NÃO OPERACIONAIS`/`DESPESAS NÃO OPERACIONAIS` (`fin_categorias.system_key`). Descendentes herdam `excluir_dos_totais`; aparecem como seção informativa no DRE/DFC, mas `excluir_dos_relatorios` os remove de todos os agregados. Saldo bancário/caixa continua real e os inclui.
- **Bundle: Excel em chunk separado** — `vite.config.ts` tem `manualChunks: { 'vendor-excel': ['exceljs'] }`. O pacote `xlsx` foi removido por advisories HIGH; exports XLSX devem usar `src/lib/safeXlsx.ts`. Seções raras do FinanceiroView são `React.lazy`. Não desfazer isso.
- **KPIs agregados são SUM no Postgres, nunca `reduce` no client** — Cards/dashboards com `Total R$`, `Qtd Total`, `Registros` devem consumir RPC dedicada (`get_*_kpis`) que retorna o agregado calculado no banco. Padrão idêntico ao `produtos.saldo_atual`. **Nunca** fazer `.select(...)` sem `.limit()` seguido de `.reduce()` para somar — isso baixa a tabela inteira pela rede e cresce O(n). Referência: `get_movimentacoes_kpis` (migration `20260502180000`). Retornar ambos os lados (entrada+saída, receita+despesa, etc.) em uma única chamada para que o toggle/aba vire filtro client-side instantâneo.

---

### Componentes Padronizados
- **TableActions**: Localizado em `components/ui/TableActions.tsx`. Deve ser usado em todas as tabelas de gerenciamento para fornecer botões de Editar e Excluir consistentes, com suporte a permissões RBAC e diálogos de confirmação integrados.
- **FormCloseConfirmDialog**: Usado em conjunto com `useFormDirtyGuard` para prevenir perda de dados em formulários.
- **SearchableSelect**: Localizado em `components/ui/SearchableSelect.tsx`. Deve ser usado em todos os selects com 10+ opções (produtos, categorias, locais, usuários, fornecedores). Props: `value`, `onValueChange`, `options: {value, label}[]`, `placeholder`, `searchPlaceholder`, `modal` (true para uso dentro de Dialog).

### Padrões de Busca de Texto (OBRIGATÓRIO)

> Bloqueado por ESLint (`no-restricted-syntax`). Toda nova busca de texto na UI **DEVE** seguir este padrão.

- **Cliente:** SEMPRE usar `includesNormalized(haystack, needle)` ou `normalizeSearchText(text)` de `@/lib/utils`. **NUNCA** `.toLowerCase().includes()`.
- **Servidor (PostgREST `.ilike()` / `.or('col.ilike.val')` / RPC):** SEMPRE buscar em coluna `*_unaccent` (gerada como `lower(immutable_unaccent(...))`) e normalizar o termo cliente-side com `normalizeSearchText()` antes de enviar. Razão: `ILIKE` no Postgres é case-insensitive mas **NÃO** remove acentos.
- **Combobox / cmdk `<Command>`:** SEMPRE passar prop `filter={(val, search) => normalizeSearchText(val).includes(normalizeSearchText(search)) ? 1 : 0}`. O default do cmdk não normaliza acentos.
- **Edge Function (Deno):** mesma regra — usar coluna `*_unaccent` e normalizar termo inline (não há import de `@/lib/utils` em Deno).
- **Nova tabela com coluna pesquisável por usuário:** adicionar coluna gerada `*_unaccent` e índice `gin (col_unaccent gin_trgm_ops)` na **mesma migration** que cria a tabela. Wrapper `public.immutable_unaccent(text)` já existe.
- **Casos legítimos não-busca** (path de arquivo, uuid::text, código sem acento): justificar com `// eslint-disable-next-line no-restricted-syntax -- <motivo>`.

---

## ⏳ Pendente / Em Aberto

- [x] Categorias financeiras: selecionar homônimas por UUID e exibir rateios múltiplos corretamente na conciliação — concluído em 2026-08-12
- [x] Dashboard Financeiro: renomear "Despesa do Período" para "Despesa Realizada" e adicionar "Despesas Provisionadas" (realizada + contas a pagar) — concluído em 2026-08-12
- [x] Conciliação Bancária: paginação completa, categoria obrigatória com auditoria e categorias não operacionais fora dos totais — concluído em 2026-08-12
- [x] Security Gate do GitHub Actions: alinhar instalação e scripts ao Bun com lockfile congelado — concluído em 2026-08-12
- [ ] Monitorar integridade dos dados na empresa piloto após ativação multi-tenant
- [ ] Testar fluxo completo: criar empresa → criar admin → login admin → criar usuários
- [ ] Validar isolamento: logar como user do tenant A e tentar `GET /rest/v1/faturamento_periodos_legacy` — deve retornar só registros do mesmo tenant
- [ ] Dropar tabelas `*_bkp_reset_20260301` (18 tabelas, snapshot tem ~14 meses) e `z_canary_test`
- [ ] Auditar outras telas (Compras, CMV, Financeiro, Relatórios) por padrão `select sem limit + reduce client` — substituir por RPC com SUM (mesmo padrão de `get_movimentacoes_kpis`)
- [ ] Otimizar `rbac_sql_lint_report()` completo para não estourar statement timeout em produção; `bun run security:check` usa fallback `rbac_sql_lint_report_quick()` e está passando

---

## 📖 Documentação Adicional

- **Arquitetura completa**: `docs/ARCHITECTURE.md`
- **Regras de negócio**: `docs/DOMAIN_RULES.md`
- **Padrões de segurança**: `docs/ENTERPRISE_SAFE_STANDARDS.md`
- **RBAC playbook**: `docs/rbac/playbook-operacional.md`
- **Tarefas ativas**: `TAREFAS.md`
