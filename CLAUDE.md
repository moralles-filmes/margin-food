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

### 2026-05-02 — Fix Custo Unitário em Saída para produtos clonados Moralles → Ren Sushi

- **Bug**: Em **Controle de Estoque → Saída**, ao selecionar produtos antigos (clonados da Moralles), o campo "Custo unitário (R$)" ficava vazio e exibia *"⚠️ Item sem custo cadastrado. Registre uma entrada ou custo padrão."* — mesmo com `custo_padrao` preenchido. Produtos cadastrados na Ren Sushi pós-clone (10 itens) funcionavam.
- **Causa raiz — clone incompleto**: A migration [20260409150000_clone_catalog_moralles_to_ren_sushi.sql:78-102](supabase/migrations/20260409150000_clone_catalog_moralles_to_ren_sushi.sql#L78-L102) copiou apenas um subconjunto de colunas e omitiu **`default_cost_purchase_unit`**, **`default_cost_base_unit`**, **`unidade_compra`** e **`fator_conversao_padrao`**. As 4 ficaram com o default da coluna (`0`/`'UN'`/`1`). Validado no banco: 231 de 242 produtos ativos da Ren Sushi tinham `default_cost_base_unit = 0` e `custo_padrao > 0`.
- **Causa raiz — frontend mascarava o problema**: [CustoItemDisplay.tsx:32-41](src/components/estoque/CustoItemDisplay.tsx#L32-L41) tinha `case 'padrao': return p.defaultCostBaseUnit ?? (custoPadrao / fator)`. O `??` só aciona o fallback se o valor for `null`/`undefined`; como `dbToProduto` faz `Number(...) || 0`, chegava como `0` (`NOT NULL DEFAULT 0` na coluna). `0 ?? fallback` retorna `0` — fallback `custoPadrao / fator` **nunca era avaliado**. `costBase = 0` → `hasCost = false` → o `useEffect` de auto-fill em [NovaMovimentacaoModal.tsx:184-193](src/components/estoque/NovaMovimentacaoModal.tsx#L184-L193) deixava `custoUnitario` em branco.
- **Bonus descoberto**: Salmão Fresco da Ren Sushi tinha `unidade_compra = 'UN'` (default), enquanto na Moralles era `'KG'` — o backfill também corrigiu isso.

#### Fix em 2 camadas

**Camada 1 — Backfill (banco)** [`20260502120000_backfill_ren_sushi_cloned_product_costs.sql`](supabase/migrations/20260502120000_backfill_ren_sushi_cloned_product_costs.sql): UPDATE com JOIN por SKU (validado: 0 duplicatas em ambas empresas) que copia `unidade_compra`, `fator_conversao_padrao`, `default_cost_purchase_unit`, `default_cost_base_unit` da Moralles para a Ren Sushi. Idempotente via `WHERE r.default_cost_base_unit = 0` (preserva os 10 produtos pós-clone). Triggers analisados (`produtos_force_company_id` em UPDATE só faz `NEW.company_id := OLD.company_id`, `trg_block_placeholder_company` não toca Ren Sushi, `audit_trigger_fn` aceita `auth.uid()=NULL`) — sem `DISABLE TRIGGER USER`. Pós-fix: 241/242 com `default_cost_base_unit > 0`, 0 na categoria do bug, 1 produto sem nenhum custo (criado em branco para preencher depois).

**Camada 2 — Defesa em profundidade (frontend)** [src/components/estoque/CustoItemDisplay.tsx:27-50](src/components/estoque/CustoItemDisplay.tsx#L27-L50): `getActiveCostBase` e `getActiveCostPurchase` agora checam `def > 0` em vez de `?? fallback`. Razão: backend devolve `0` (não null) por causa do `NOT NULL DEFAULT 0`. Esta correção é independente da migração — protege contra qualquer empresa futura clonada por código que reproduza o mesmo bug, e ativa o fallback existente (`custoPadrao / fator`).

#### Verificação
- `npx tsc --noEmit` — limpo
- Query de validação pós-backfill: 241/242 com `default_cost_base_unit > 0`, 0 sem default mas com `custo_padrao`
- Smoke test pendente (UI): Login Ren Sushi → Saída → "Bisnaga de Doce de Leite" deve auto-preencher R$21,02; Salmão Fresco deve mostrar `unidade_compra = KG`.

### 2026-05-01 — Hardening Dashboards Round 2 (3 achados da Fase 4 endereçados)

Após o fix do "Abaixo do Mínimo", aplicada rodada de hardening nos 3 achados não-bloqueantes da auditoria Fase 4:

- **`get_fin_dashboard_charts` agora inclui status `CONCILIADO`** ([20260501201044](supabase/migrations/20260501201044_fix_fin_dashboard_charts_include_conciliado.sql)). A função filtrava apenas `status='REALIZADO'` em 3 lugares (evolução mensal + 2 ramos de despesas por categoria), enquanto `get_fin_dashboard_summary` e `get_fin_kpis` usam `IN ('REALIZADO','CONCILIADO')`. Resultado: gráficos do dashboard financeiro mostravam valores menores que os cards de resumo do mesmo período. Agora alinhado em `IN ('REALIZADO','CONCILIADO')` em todos os 3 ramos. Permissão também padronizada para `has_any_permission(['finance:read', 'financeiro:dashboard:view', 'system:global:manage'])`.
- **FORCE RLS em `salmon_auditorias_compra` + `salmon_metas_provisionadas`** ([20260501201233](supabase/migrations/20260501201233_force_rls_salmon_aux_tables.sql)). Ambas tinham `rls_enabled=true` mas `force=false` — owners e service_role bypassavam a policy `"Tenant isolation"` (`cmd=ALL`, `qual=company_id=get_current_company_id()`) que já existia. Agora `FORCE` aplicado, padronizado com o resto do schema. Sem mudanças de código frontend.
- **`relatorio_socios_resumo` padronizada** ([20260501201358](supabase/migrations/20260501201358_harden_relatorio_socios_resumo.sql)). 2 problemas: (1) resolvia tenant via JOIN manual em `profiles` em vez de `assert_tenant()` — perdia validações centrais (placeholder UUID, perfil sem empresa); (2) **não checava permissão** antes das queries — qualquer usuário autenticado da empresa lia receita/despesa/resultado/top categorias sem RBAC. Agora usa `assert_tenant()` + `has_any_permission(['financeiro:relatorio-socios:view', 'finance:read', 'system:global:manage'])`. Validado: chave granular já existia no `permissions` e roles `admin`/`diretor` já tinham acesso — nenhum usuário existente perde permissão. Lógica de negócio (rateios, intervalos, status `REALIZADO+CONCILIADO`) preservada integralmente.

### 2026-05-01 — Fix Dashboards: produtos positivos aparecendo "Abaixo do Mínimo" (Relatórios + Estoque)

- **Bug**: Em Relatórios Gerais, produtos com saldo positivo no Estoque Geral apareciam no alerta "Abaixo do Mínimo". Reproduzido em produção: 31 falsos alertas na Moralles, 87 na Ren Sushi (Royal Parma intacta).
- **Causa raiz** — fórmula de saldo divergente entre cache e RPC:
  - **Trigger canônico** [`fn_recompute_product_saldo`](supabase/migrations/20260331133000_fix_saldo_revert_and_fix_rpc.sql#L21-L32) mantém `produtos.saldo_atual` decidindo entrada/saída por **`m.direction = 'IN'`**.
  - **RPC `get_relatorios_kpis`** ([20260321011743](supabase/migrations/20260321011743_ca89316b-e0dd-41bd-9144-caa8bcb22512.sql)) recalculava saldo inline em 4 pontos usando **`me.tipo LIKE 'ENTRADA%' OR me.tipo = 'AJUSTE' OR me.tipo LIKE '%DEVOLUCAO%'`**. Tipos como `AJUSTE_INVENTARIO_POSITIVO` (introduzido pelos fixes de inventário de 2026-03-28) caíam no `ELSE -me.quantidade` virando saída fantasma. Cenário real validado: produto "Shoyu blister Delivery" tinha 1 movimentação `AJUSTE_INVENTARIO_POSITIVO direction=IN qtd=240` → cache=+240, recalc buggy=-240, alerta falso disparado (mínimo=20).
  - **Bug paralelo descoberto** em `get_stock_dashboard` ([20260312230807](supabase/migrations/20260312230807_04fb19d3-b22f-4461-add7-6f9c58577484.sql#L18-L25)): usava `direction` mas **não ignorava `ENTRADA_ESTORNO`/`SAIDA_ESTORNO`**, contaminando contadores OK/Atenção/Crítico/Sem Estoque do Estoque Geral.
- **Por que apareceu agora**: A migration `20260328111500_add_default_turnos.sql` e os fixes de inventário criaram movimentações com tipo `AJUSTE_INVENTARIO_POSITIVO` (e clones REN SUSHI/Royal Parma trouxeram saldos novos via inventários). Antes o catálogo só tinha tipos `ENTRADA_*`/`SAIDA_*` simples, então o bug latente nunca aparecia.
- **Fix em 2 migrations**:
  1. [`20260501195715_fix_relatorios_kpis_use_saldo_cache.sql`](supabase/migrations/20260501195715_fix_relatorios_kpis_use_saldo_cache.sql) — refatora `get_relatorios_kpis` para usar `produtos.saldo_atual` direto nos 4 blocos (`v_valor_estoque`, `v_count_abaixo`, `v_abaixo_minimo`, `v_count_parados`). Filtro defensivo `p.estoque_minimo > 0` para excluir produtos sem mínimo cadastrado dos alertas. Inclui DO-block sanity de auditoria que detecta cache divergente da fórmula canônica e dispara `fn_recompute_product_saldo` (validado: 0 divergências em todas as 3 empresas — cache 100% íntegro).
  2. [`20260501195743_fix_stock_dashboard_use_saldo_cache.sql`](supabase/migrations/20260501195743_fix_stock_dashboard_use_saldo_cache.sql) — refatora `get_stock_dashboard` para usar `p.saldo_atual` na CTE `produto_saldos`, eliminando a CTE `saldos` que recalculava sem ignorar estornos.
- **Princípio aplicado**: `produtos.saldo_atual` é a fonte da verdade. Toda RPC de leitura deve consumir o cache em vez de recalcular inline — evita divergência e melhora performance (uma RPC fica O(N) em vez de O(N²) com subquery por produto).
- **Sanity Fase 4 (read-only)**: Auditadas `get_fin_dashboard_summary` (limpa), `get_fin_kpis` (limpa). Achados separados (não bloqueantes, virarão tarefas próprias):
  - `get_fin_dashboard_charts` filtra apenas `status='REALIZADO'` enquanto summary/KPIs usam `IN ('REALIZADO','CONCILIADO')` — drift entre gráfico e cards.
  - `relatorio_socios_resumo` resolve tenant via JOIN manual em `profiles` em vez de `assert_tenant()` e não checa `has_permission()` antes das queries.
  - `salmon_auditorias_compra` e `salmon_metas_provisionadas` têm `rls_enabled=true` mas `force=false` E zero policies SELECT — protegidas por DENY default, mas fora do padrão MarginPro.
  - 13 "BLOCKERs" reportados pelo subagent em queries client-side de Salmão/RH (ausência de `.eq('company_id')`) **foram falsos alarmes**: validado via `pg_class.relrowsecurity` que todas as 12 tabelas têm RLS forçada + policy SELECT scoped — defesa em profundidade do banco cobre.

### 2026-05-01 — Fix Definitivo Busca Accent-Insensitive (sistema inteiro + blindagem)

- **Bug recorrente**: Buscar `salmao`, `acucar`, `oleo` (sem acento) não encontrava `Salmão`, `Açúcar`, `Óleo`. Já tinha sido corrigido em **2026-03-31 (commit `834ccad`)** com helpers `normalizeSearchText()`/`includesNormalized()` em [src/lib/utils.ts:12-26](src/lib/utils.ts#L12-L26), mas regrediu porque a adoção foi parcial e não havia lint/regra forçando o padrão.
- **Causa-raiz da regressão**: Sem ESLint rule, sem documentação obrigatória, sem code-review check. **9 componentes client-side** continuaram com `.toLowerCase().includes()` (case-insensitive mas accent-sensitive) e **3 buscas server-side** (Catálogo Estoque, Inventário Rápido, Auditoria Global) usavam `.ilike()` direto — `ILIKE` no Postgres é case-insensitive mas **NÃO** remove acentos. Componentes criados depois do fix nasceram bugados.

#### Correção em 3 fases

**Fase 1 — 9 componentes client-side**: substituídos `.toLowerCase().includes()` por `includesNormalized()` em [MercadoSazonaisView.tsx:104](src/components/MercadoSazonaisView.tsx#L104), [RecebimentoView.tsx:62](src/components/RecebimentoView.tsx#L62), [AlertasFaltaEstoqueView.tsx:105-106](src/components/compras/AlertasFaltaEstoqueView.tsx#L105-L106), [InventarioView.tsx:520](src/components/InventarioView.tsx#L520), [SecurityAuditView.tsx:53,57-60](src/components/SecurityAuditView.tsx#L53-L60), [UserMentionSelect.tsx:44](src/components/UserMentionSelect.tsx#L44), [RequisicaoEstoqueSection.tsx:153-154](src/components/RequisicaoEstoqueSection.tsx#L153-L154), [CadastroBaseTree.tsx:93](src/components/financeiro/CadastroBaseTree.tsx#L93), [ContasBancariasSection.tsx:157](src/components/financeiro/ContasBancariasSection.tsx#L157).

**Fase 2 — Backend (colunas geradas + índices GIN trigram)**:
- Migration [`20260501200000_add_unaccent_search_columns.sql`](supabase/migrations/20260501200000_add_unaccent_search_columns.sql): wrapper `public.immutable_unaccent(text)` (a função `unaccent` da extensão é STABLE — não pode ser usada em `GENERATED STORED`/índices, então criamos versão IMMUTABLE com a forma de 2 args + `regdictionary` constante). Colunas geradas `nome_produto_unaccent` e `sku_unaccent` em `produtos`, `entity_unaccent` em `audit_logs`. Extensão `pg_trgm` instalada. Índices `idx_*_unaccent_trgm` (GIN trigram) para ILIKE com substring rápido.
- Migration [`20260501200001_add_unaccent_ficha_componentes.sql`](supabase/migrations/20260501200001_add_unaccent_ficha_componentes.sql): mesmo tratamento para `ficha_componentes.nome` (Edge Function `ficha-tecnica` action `list_componentes` tinha o mesmo bug em [supabase/functions/ficha-tecnica/index.ts:609](supabase/functions/ficha-tecnica/index.ts#L609)).
- Frontend: 3 hooks/components ([useEstoqueGeralStore.ts:386-391](src/hooks/useEstoqueGeralStore.ts#L386-L391), [QuickInventorySection.tsx:66-72](src/components/QuickInventorySection.tsx#L66-L72), [GlobalAuditView.tsx:111-116](src/components/GlobalAuditView.tsx#L111-L116)) agora usam `*_unaccent.ilike` + `normalizeSearchText()` no termo enviado.
- Edge Function [`ficha-tecnica/index.ts:609-619`](supabase/functions/ficha-tecnica/index.ts#L609-L619) usa `ilike('nome_unaccent', ...)` com normalização inline (Deno não importa de `@/lib/utils`).

**Fase 3 — Blindagem para impedir nova regressão**:
- ESLint `no-restricted-syntax` em [eslint.config.js](eslint.config.js): 3 seletores bloqueantes — `.toLowerCase().includes()`, `.ilike(...)` (chamada direta) e `Literal/TemplateElement` contendo `.ilike.` (cobre `or('col.ilike.val')`). Mensagens explicam a regra e como justificar disable inline. Linting pós-fix: zero violações.
- Nova seção **"Padrões de Busca de Texto (OBRIGATÓRIO)"** em [CLAUDE.md](CLAUDE.md) abaixo de "Componentes Padronizados".
- Comentário no topo de [src/components/ui/command.tsx](src/components/ui/command.tsx) avisando que `<Command>` precisa de `filter` custom (já é o padrão nos 5 usos atuais).
- Disables inline justificados nos 4 usos legítimos (3 com colunas `*_unaccent` + 1 path de arquivo em `scripts/rbac-lint.ts`).

#### Verificação
- TS clean (`npx tsc --noEmit`).
- 10/10 testes em [src/test/search-normalize.test.ts](src/test/search-normalize.test.ts).
- Smoke test SQL: `SELECT * FROM produtos WHERE nome_produto_unaccent ILIKE '%salmao%'` retorna `Salmão Fresco` e `Poupa De Salmão` ✅.
- Build OK em 24.89s, PWA com 143 entries.
- ESLint: zero violações de `no-restricted-syntax`.

### 2026-05-01 — Fix "Erro ao salvar produto" no cadastro do Estoque (defasagem de SKU counter)

- **Bug**: Ao cadastrar produto novo no Estoque/Catálogo, toast genérico `"Erro ao salvar produto"` sem detalhe. DevTools revelou `23505 unique violation produtos_company_sku_unique` — `generate_next_sku` retornava SKU já existente.
- **Causa raiz**: `stock_sku_counter` ficou defasado em relação a `produtos.sku`. A migration `20260326000001_importacao_catalogo_produtos.sql` (236 produtos via `DISABLE TRIGGER USER`) e o clone Moralles→REN SUSHI inseriram SKUs MP-0001..MP-0240 sem incrementar o counter por empresa. Diagnóstico via `execute_sql`: Moralles tinha `next_value=5` mas `MAX(sku)=240`, defasado 235; Ren Sushi `next_value=15` vs 240 (defasado 225); Royal Parma OK (56=56).
- **Visibilidade prévia**: O catch em `ProdutoFormPanel.tsx:161-168` só lia `err.message`, ignorando `err.code`/`err.details`/`err.hint` do `PostgrestError`. Mensagem do Postgres ficava invisível para o usuário e operador.
- **Fix em 3 camadas**:
  1. **Visibilidade** — novo helper [src/lib/supabaseErrors.ts](src/lib/supabaseErrors.ts) `extractSupabaseErrorMessage(err, fallback)` que combina `message + details + hint + code` em string legível. Adotado em `ProdutoFormPanel.tsx` e `console.error('[produto.save.create|update]', err)` antes do toast. Em `useEstoqueGeralStore.ts`, `addProduto`/`updateProduto`/`deleteProduto` ganham `console.error` com tag rastreável antes de propagar o erro.
  2. **Backfill one-time** — `20260501190000_fix_generate_next_sku_skip_existing.sql` itera `(company_id, prefix)` distintos em `produtos`, calcula `MAX((substring sku))` e faz UPSERT em `stock_sku_counter` com `next_value = GREATEST(existing, calculated_max)`. Pós-migration: Moralles=240, Ren Sushi=240, Royal Parma=56.
  3. **Hardening da função** — `generate_next_sku` agora tem loop de retry: incrementa o counter, gera candidato, verifica `EXISTS produtos.sku = candidate`, repete (até 1000 tentativas). Defesa contra futuros imports/restores que voltem a desincronizar o counter. UPDATE com RETURNING garante lock implícito → seguro contra concorrência.
- **Padrão MarginPro**: Backfill filtra `company_id <> placeholder UUID` por causa do trigger `trg_block_placeholder_company`.
- **Validação pós-fix**: TS limpo, build OK (17.05s, 143 PWA entries). Smoke test pendente: usuário deve cadastrar novo produto e confirmar SKU MP-0241 (próximo após o max).

### 2026-05-01 — Varredura Funcional Completa do Frontend (16 findings, 4 ondas)

- **Auditoria** delegada ao subagent `code-health:functional-auditor` (7 detectores em paralelo: phantom buttons, broken routes, mocked data, stubs, empty handlers, TODOs, código comentado). Relatório completo em `docs/audits/functional-audit-2026-05-01.md`.
- **Resultado**: 0 broken routes, 0 dados mockados em produção, 0 phantom buttons em módulos reais. Achou: 2 BLOCKERs (debug log + catch silencioso crítico), 6 HIGHs (catches vazios em admin + templates stub), 5 MEDIUMs (catches sem binding) e 3 LOWs.

#### Onda 1 — BLOCKERs
- **B1** [AdminUsersView.tsx:575]: `console.log` de debug que vazava estrutura de permissões (nome de role + contagem de defaults) ao trocar perfil de acesso → removido.
- **B2** [FichaTecnicaView.tsx:310]: `.catch(() => {})` no `sync_preco_salmao_auto` mascarava falhas silenciosas, causando divergência entre UI e banco no CMV → trocado por `console.warn` rastreável com tag `[salmon-price-sync]`.

#### Onda 2 — HIGHs
- **H1** [AdminUsersView.tsx:170,201]: `fetchJobRoles` e `fetchRolePermissions` ignoravam erros silenciosamente (`catch { /* ignore */ }`), deixando dropdowns vazios sem aviso → agora propagam, logam (`console.error`) e mostram `toast.error`.
- **H2** [admin/AccessManagementCard.tsx:74]: `catch {}` vazio no carregamento do log de auditoria → mesma estratégia (propaga, loga, toast).
- **H3** [AdminUsersView.tsx:111,115]: 2 catches vazios aninhados em `parseInvokeError` → ganham bindings (`parseErr`, `ctxErr`) e `console.debug` para rastreabilidade.
- **H4** [FichaTecnicaView.tsx:97-115] `invokeApi`: lógica frágil de re-throw condicional (`if (parseErr.message !== msg) throw parseErr`) que podia engolir `FORBIDDEN_TENANT`/`NOT_FOUND` se mensagens coincidissem → refactor remove try/catch desnecessário, throws sempre propagam linearmente.
- **H5/H6** + **M3/M4** — `src/components/templates/` removido inteiro (4 arquivos: `CrudSectionTemplate.tsx`, `AnalyticsSectionTemplate.tsx`, `DashboardSectionTemplate.tsx`, `index.ts`). Confirmado via grep que ninguém importava. O `CrudSectionTemplate.handleCreate` exibia `toast.success('Item criado')` sem persistir nada — risco de cópia acidental para produção. 16 TODOs eliminados.

#### Onda 3 — MEDIUMs
- **M1** [estoque/ListaFixaSetorAdmin.tsx:151,165,203]: 3 catches sem binding (`catch {`) → ganham `catch (e)` + `console.error` com tags `[lista-fixa.addProduct]`, `[lista-fixa.removeProduct]`, `[lista-fixa.toggleAtivo]`. Toast continua igual; agora há rastreabilidade.
- **M2** [compras/AlertasFaltaEstoqueView.tsx:132]: mesmo tratamento, tag `[alertas-estoque.confirm]`.

#### Onda 4 — LOWs
- **L1** [financeiro/ConciliacaoBancariaSection.tsx:97,104,108]: 3 catches em sessionStorage helpers (`saveLinhas`/`loadLinhas`/`clearLinhas`) ganham `catch (_)` + comentário explicando que sessionStorage indisponível (modo privado/quota) é cenário aceito.
- **L2** [financeiro/CategorizacaoSection.tsx:160,250]: 2 catches em validação de regex ganham `catch (_)` para descarte intencional.

#### Verificação
- `npx tsc --noEmit` — passa em todas as 4 ondas
- `bun run build` — passou em 17.30s, PWA gerado com 143 entries
- Cada onda foi commitada separadamente (`4e2b247`, `2fd4b7f`, `a82e64a`, `b1ad29b`) para revisão isolada de cada nível de severidade.

### 2026-05-01 — Cleanup de Drift de Migração + Hardening RLS faturamento_periodos_legacy
- **Problema 1 — Drift**: O histórico de migrações do Supabase tinha drift acumulado: 2 migrações remote-only (`20260423154703`, `20260501163238`) aplicadas via SQL Editor / MCP que não tinham arquivos locais correspondentes, bloqueando `supabase db push`. Além disso, a migration `20260429000001_fix_faturamento_legacy_rls.sql` (vazamento cross-tenant em tabela histórica) estava pendente desde a auditoria de 29/04.
- **Verificação de equivalência**: Antes de qualquer reparo, conteúdo de `20260423154703` (remote) foi consultado em `supabase_migrations.schema_migrations` e confirmou ser idêntico a `20260423000000_add_idempotency_key_fin_lancamentos.sql` (local). Mesmo procedimento para `20260501163238` (remote) ↔ `20260501120000_seed_default_turnos_all_companies.sql` (local).
- **Reparos aplicados** (apenas tabela de tracking, nenhum schema afetado):
  - `migration repair --status applied 20260423000000`
  - `migration repair --status reverted 20260423154703`
  - `migration repair --status applied 20260501120000`
  - `migration repair --status reverted 20260501163238`
- **Push final**: `supabase db push --include-all` aplicou `20260429000001_fix_faturamento_legacy_rls.sql` em produção.
- **Problema 2 — Bypass cross-tenant residual**: A migration `20260429000001` dropou apenas a policy wide-open `legacy_select_all`, mas deixou ativas 4 policies legadas que NÃO filtravam por tenant: `fin_read_faturamento` (SELECT) e `fin_manage_{insert,update,delete}_faturamento`. Em RLS, policies do mesmo cmd são combinadas com OR — então qualquer usuário com `finance:read` ainda bypassava o `faturamento_legacy_select_own_tenant` e lia dados cross-tenant. Da mesma forma, `finance:manage` bypassava os blocks de write.
- **Fix** (`20260501170000_drop_legacy_fin_policies_faturamento.sql`): Dropa as 4 policies legadas com guarda defensiva (RAISE EXCEPTION se a policy tenant-scoped não existir, evitando deixar a tabela sem SELECT). Estado final: apenas 4 policies — `select_own_tenant` (tenant-scoped) + 3 `block_*` (writes proibidos). **Leak cross-tenant fechado.**

### 2026-05-01 — Fix Inventário: turnos não apareciam em empresas não-piloto
- **Bug**: Royal Parma e REN SUSHI (e qualquer empresa nova criada via `onboard_new_company`) não conseguiam criar inventários — o dropdown "Turno" vinha vazio e o botão "Criar" ficava desabilitado (validação `!formTurno`).
- **Causa raiz**: `20260328111500_add_default_turnos.sql` semeou turnos default apenas para a primeira empresa (`SELECT ... LIMIT 1`, a piloto MarginPro Oficial). A RPC `onboard_new_company()` em `20260401200000_multi_tenant_onboarding.sql` semeia `companies + user_roles + job_roles + audit log` mas **não cria turnos**. A migração de clone Moralles→REN SUSHI também não copiou turnos.
- **Diagnóstico técnico**: A Edge Function `inventario` action `list_turnos` usa `adminClient` (service_role) com `.eq('company_id', companyId)` — RLS não está envolvida, os dados literalmente não existem para essas empresas. `create_inventory_atomic` exige `p_turno_id` obrigatório (sem DEFAULT).
- **Fix** (`20260501120000_seed_default_turnos_all_companies.sql`):
  - **Backfill idempotente**: itera sobre todas empresas ativas (exceto placeholder) que não têm turnos ativos e insere os 4 defaults (Manhã 07-15, Tarde 15-23, Noite 23-07, Geral 00-23:59) usando os mesmos horários da migração original.
  - **Forward-fix**: `CREATE OR REPLACE FUNCTION onboard_new_company()` adiciona o INSERT de turnos logo após o INSERT da empresa, antes da audit log — toda nova empresa criada doravante recebe os defaults automaticamente.
- **Notas técnicas**: Não há trigger `force_company_id` em `turnos` (só em `produtos`), INSERT explícito é seguro. Não há unique constraint em `(company_id, nome)`, idempotência via `WHERE NOT EXISTS`. Função é `SECURITY DEFINER`, bypass natural de RLS.
- **Validação pendente**: logar como admin da Royal Parma → Inventário → Novo Inventário e confirmar que o dropdown de turnos aparece preenchido.

### 2026-04-29 — Auditoria Multi-Tenant + Fix RLS faturamento_periodos_legacy
- Auditoria multi-tenant completa do projeto: validou resolver canônico, FORCE RLS, triggers `force_company_id`, edge functions (todas validam JWT e derivam `companyId` server-side), e ausência de VIEWs e `service_role` no frontend.
- Confirmado que o fix de `profiles` RLS já foi aplicado em `20260414120000_fix_profiles_rls_and_rpc.sql` (commit `fd8f6de`) — `profiles_select_company_member` substitui a policy wide-open e a RPC `list_profiles_minimal()` foi corrigida.
- Identificado resíduo: policy `"legacy_select_all"` em `faturamento_periodos_legacy` (criada em `20260301180830:140`) permitia leitura cross-tenant. Criada migração `20260429000001_fix_faturamento_legacy_rls.sql` que dropa a policy wide-open, aplica FORCE RLS defensivo, cria SELECT scoped por tenant e bloqueia writes (tabela é histórica somente-leitura).
- Itens não-bloqueantes identificados na auditoria (próximas tarefas): adicionar `CRON_SECRET` em `supabase/functions/scheduled-jobs/index.ts`, remover `company_id` de payloads do frontend (BugTracker, ListaFixaSetor, permissions/hooks), dropar tabelas `*_bkp_reset_20260301` e `z_canary_test`.

### 2026-04-23 — Melhoria UI: Input de arquivo em português na Conciliação Bancária

- **Mudança**: O `<Input type="file">` nativo (que exibia "Choose File / No file chosen" em inglês pelo browser) foi substituído por um botão estilizado personalizado.
- **Implementação**: Input nativo oculto (`hidden`) + `<label>` com botão "Escolher arquivo" (ícone `Upload` + borda/hover) + texto ao lado mostrando o nome do arquivo ou "Nenhum arquivo selecionado".
- **Estado adicionado**: `nomeArquivo` (string) — atualizado em `handleFile`, resetado em `handleFile` (após processar) e em `limparExtrato`.
- **Arquivo afetado**: `src/components/financeiro/ConciliacaoBancariaSection.tsx`

### 2026-04-23 — Fix Conciliação Bancária: erro "reconcile_batch_lancamentos(p_lancamento_ids, p_user_id)"

- **Problema**: Ao clicar para conciliar um lançamento em Financeiro → Lançamentos → Conciliação Bancária, aparecia o erro "Could not find the function public.reconcile_batch_lancamentos(p_lancamento_ids, p_user_id) in the schema cache".
- **Causa**: Conflito entre dois fixes anteriores. A migração `20260303030306` endureceu a função removendo o parâmetro `p_user_id` (usa `auth.uid()` internamente). Porém o fix de frontend de 2026-04-17 havia adicionado `p_user_id: user?.id` em 3 chamadas RPC — gerando mismatch de assinatura.
- **Fix**: Removido `p_user_id: user?.id` das 3 chamadas a `reconcile_batch_lancamentos` em `ConciliacaoBancariaSection.tsx` (funções `conciliar()`, `conciliarTodos()` e `processarEConciliar()`).
- **Arquivo afetado**: `src/components/financeiro/ConciliacaoBancariaSection.tsx`

### 2026-04-23 — Fix Conciliação Bancária: Filtro de Categorias + idempotency_key

#### Bug 1 — Dropdown de Categoria exibia todas as categorias independente do tipo (RECEITA/DESPESA)
- **Causa 1**: Filtro `filteredCategorias` em `CriarLancamentoExtratoDialog.tsx` só ativava para `destino === 'conta_receber'` ou `destino === 'conta_pagar'`. Quando `destino === 'lancamento'` (o padrão), o `return true` exibia todas as categorias.
- **Causa 2**: Comparação usava maiúsculo `c.tipo === 'RECEITA'`/`'DESPESA'`, mas `fin_categorias.tipo` armazena minúsculo `'receita'`/`'despesa'` — a comparação nunca batia, exibindo tudo.
- **Fix**: Filtro agora atua exclusivamente sobre o `tipo` da transação (independente de `destino`) com comparação em minúsculo.
- **Arquivo afetado**: `src/components/financeiro/CriarLancamentoExtratoDialog.tsx` (linhas 333–337)

#### Bug 2 — "column 'idempotency_key' does not exist" ao clicar em Criar e Conciliar
- **Causa**: A RPC `reconcile_import_lancamento` foi redefinida na migration `20260314191751_restore_ledger_origem.sql` para usar `idempotency_key` em `fin_lancamentos` (idempotência via MD5), mas a coluna nunca foi adicionada à tabela. A migration original que adicionaria a coluna (`20260303031002_…sql.bak`) foi arquivada sem ser aplicada.
- **Fix**: Nova migration `20260423000000_add_idempotency_key_fin_lancamentos.sql` — adiciona coluna `idempotency_key text` + índice único em `(company_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. Aplicada no Supabase remoto.
- **Arquivos afetados**: `supabase/migrations/20260423000000_add_idempotency_key_fin_lancamentos.sql` (novo), `src/components/financeiro/CriarLancamentoExtratoDialog.tsx`

### 2026-04-17 — Fix Service Worker Travado + Otimização de Bundle (FinanceiroView 728KB → 196KB)

#### Fix Service Worker persistente
- **Problema**: Sistema mostrava "Ocorreu um erro inesperado" em produção mesmo após clicar Recarregar. `window.location.reload()` não bypassa o cache do SW — o SW continuava servindo assets de uma versão anterior.
- **Fix**: Criado `src/lib/swRecovery.ts` com `clearSwAndReload()`: desregistra todos os SWs ativos e limpa todos os caches (Cache API) antes de recarregar.
- **Integrado em**: `src/App.tsx` (botão Recarregar do ErrorBoundary) e `src/main.tsx` (chunk errors persistentes na segunda tentativa).
- **Extra**: ErrorBoundary agora exibe a mensagem real do erro JS na UI (antes era sempre genérico "Ocorreu um erro inesperado" sem detalhes).

#### Otimização de bundle
- **FinanceiroView**: 728KB → 196KB (73% de redução). Principal causa: `xlsx` era staticament importado por 16+ componentes financeiros e bundleado junto com o view.
- **Fix vite.config.ts**: Adicionado `'vendor-xlsx': ['xlsx']` em `manualChunks` — xlsx (429KB) agora é chunk de vendor separado, cacheado indefinidamente, nunca re-bundleado.
- **Lazy loading de seções raras**: 7 seções do FinanceiroView convertidas de static para `React.lazy` (carregam apenas quando o tab é aberto):
  - `AuditoriaFinSection`, `ComparativoSection`, `RelatorioSociosSection`, `ProjecaoFluxoSection`, `KPIsSection`, `OrcamentoSection`, `ConciliacaoBancariaSection`
- **Arquivos afetados**: `src/lib/swRecovery.ts` (novo), `src/App.tsx`, `src/main.tsx`, `src/components/FinanceiroView.tsx`, `vite.config.ts`

### 2026-04-17 — Fix Conciliação Bancária: 3 Problemas Corrigidos

#### Bug 1 — Linhas do OFX sumiam ao sair da página
- **Causa**: Estado React (`useState`) sem persistência — ao desmontar o componente, as linhas importadas do extrato eram perdidas.
- **Fix**: Linhas salvas no `sessionStorage` (chave `conciliacao_linhas_<contaId>`). Ao voltar com a mesma conta selecionada, o estado é restaurado. Botão "Limpar Extrato" para reset manual.
- **Extra**: Ao reimportar o mesmo OFX, entradas já conciliadas aparecem com badge "Já Conciliado" em vez de serem filtradas silenciosamente.

#### Bug 2 — Checkbox "Conciliar" marcava na UI mas não persistia no banco
- **Causa**: `reconcile_batch_lancamentos` exige `p_user_id uuid` obrigatório, mas o frontend chamava sem esse parâmetro em 3 locais — RPC falhava silenciosamente.
- **Fix**: Adicionado `p_user_id: user?.id` nas funções `conciliar()`, `conciliarTodos()` e `importarEConciliar()`.

#### Feature — Botão "Ignorar" entrada do extrato bancário
- **Caso de uso**: PIX enviado e devolvido — usuário precisa ignorar ambos sem gerar despesa/receita.
- **Backend** (`20260417120000_add_conciliacao_ignoradas.sql`): Nova tabela `fin_conciliacao_ignoradas` (RLS por empresa) + RPC `reconcile_ignorar_lancamento`.
- **Frontend**: Botão `EyeOff` em cada linha do extrato. Em reimportações, entradas ignoradas aparecem com badge "Ignorado" sem botões de ação.
- **Arquivo afetado**: `src/components/financeiro/ConciliacaoBancariaSection.tsx`

### 2026-04-14 — Fix FK ON DELETE SET NULL para Preservar Histórico ao Excluir Usuários

- **Problema**: Ao fazer hard delete de um usuário, o banco bloqueava com erro de FK se o usuário tinha movimentações, pedidos de compra, orçamentos, etc. vinculados.
- **Causa**: 10 tabelas tinham colunas `created_by`/`solicitante_user_id`/etc. referenciando `auth.users(id)` sem `ON DELETE` definido — o padrão do PostgreSQL é `RESTRICT`, bloqueando a deleção.
- **Fix** (`20260414150000_fix_fk_on_delete_set_null_users.sql`): Todas as FKs alteradas para `ON DELETE SET NULL`. Duas colunas `NOT NULL` (`solic_compra_mercado.solicitante_user_id` e `aprovacoes_solic_compra_mercado.aprovado_por_user_id`) tiveram a restrição removida para permitir o `SET NULL`.
- **Resultado**: Ao excluir um usuário, todos os registros históricos são preservados — apenas o campo `created_by`/`user_id` fica `null`. O Supabase Auth deleta o usuário e o banco limpa as referências automaticamente via CASCADE/SET NULL.
- **Tabelas corrigidas**: `movimentacoes_estoque`, `solic_compra_mercado` (2 colunas), `solic_compra_mercado_item`, `aprovacoes_solic_compra_mercado`, `fin_orcamentos`, `job_roles`, `user_permissions`, `stock_categories`, `stock_locations`.

### 2026-04-14 — Fix Hard Delete de Usuário (não sumia do Supabase Auth)

- **Bug**: Ao excluir um usuário em Configurações → Usuários, o usuário não era removido do Supabase Auth — aparecia no dashboard do Supabase com status "banned".
- **Causa**: O fluxo anterior fazia apenas soft-delete: banimento de 876.600h (`ban_duration: '876600h'`), prefixo `[EXCLUÍDO]` no nome do perfil e deleção manual de `user_roles`/`user_permissions`. O registro em `auth.users` permanecia.
- **Fix** (`admin-users/index.ts`): Ação `delete` substituída por hard delete real via `adminClient.auth.admin.deleteUser(userId)`. Como `profiles`, `user_roles` e `user_permissions` têm `ON DELETE CASCADE` sobre `auth.users.id`, o banco limpa tudo automaticamente. O log de auditoria é gravado **antes** da deleção para garantir captura dos dados.
- **Deploy**: Edge Function `admin-users` redeploy realizado.

### 2026-04-14 — Fix Erro Genérico ao Criar Usuário ("Edge Function returned a non-2xx status code")

- **Bug**: Ao tentar criar um novo usuário em Configurações → Usuários, o toast exibia sempre `"Edge Function returned a non-2xx status code"` em vez da mensagem real do erro.
- **Causa 1 — Double-consume do body stream**: A função `parseInvokeError` no frontend lia o corpo da Response HTTP duas vezes:
  - 1ª leitura: na checagem `isAuthError` (linha 118) — `error.context.json()` consumia o stream
  - 2ª leitura: para lançar o erro (linha 132) — stream já consumido, `.json()` lançava exceção, catch retornava `undefined`, e o fallback era `error.message` genérico
- **Causa 2 — Bypass ausente para super-admin**: A edge function `admin-users` não verificava `system:global:manage` no `checkPermission`. Super-admins sem role `admin` explícita podiam ser bloqueados com 403.
- **Fix Frontend** (`AdminUsersView.tsx`): `parseInvokeError` reescrito para ler o body como `.text()` uma única vez e reutilizar o resultado. Erros não-auth agora lançam imediatamente com `firstMsg` (já parseado), evitando segunda leitura.
- **Fix Edge Function** (`admin-users/index.ts`): Adicionado check de `system:global:manage` como primeira verificação em `checkPermission` — super-admins passam independente de role ou permissão granular.
- **Deploy**: Edge Function `admin-users` redeploy realizado (versão 22).

### 2026-04-14 — Fix Botão X Ausente nos Dialogs de Usuários (AdminUsersView)

- **Bug**: Os 5 `AlertDialog` em Configurações → Usuários não exibiam botão X para fechar (Criar Novo Usuário, Editar Usuário, Resetar Senha, Excluir Usuário, Novo Cargo).
- **Causa**: O componente `AlertDialog` do shadcn/ui **não renderiza** botão X por padrão, ao contrário do `Dialog` que tem `DialogPrimitive.Close` embutido. Por design do Radix UI, AlertDialog é pensado para confirmações com ações explícitas.
- **Fix**: Adicionado botão X absolutamente posicionado (`absolute right-4 top-4`) dentro de cada `AlertDialogContent`, com o mesmo estilo do `DialogContent` nativo. Cada botão chama o handler de fechamento correto para limpar o estado associado.
- **Arquivo afetado**: `src/components/AdminUsersView.tsx` (import de `X` adicionado + 5 botões X inseridos)

### 2026-04-14 — Fix Vazamento Multi-Tenant: Usuários de Outras Empresas em Dropdowns

- **Bug**: Dropdown "Responsável" em Compras → Nova Solicitação exibia usuários de TODAS as empresas (ex: usuários da REN SUSHI apareciam para usuários da Moralles). Usuários excluídos (soft-deleted) também apareciam.
- **Causa 1 — RPC sem filtro**: `list_profiles_minimal()` era `SECURITY DEFINER` sem filtro de `company_id`, retornando todos os profiles do banco. Usada por `UserMentionSelect`, `GlobalAuditView`, `InventarioView` e `RhView`.
- **Causa 2 — RLS permissiva**: A migration `20260324154500_repair_profiles.sql` recriava a policy `"Users can read all profiles"` com `USING(true)`. Em RLS, qualquer policy que permita acesso garante acesso — nulificando as policies granulares de `20260301175412`.
- **Fix**: Nova migration `20260414120000_fix_profiles_rls_and_rpc.sql`:
  - Remove policies permissivas (`"Users can read all profiles"`, `"Authenticated can read profiles"`, `"Users can read own profile"`)
  - Cria policy `profiles_select_company_member`: qualquer membro lê apenas profiles da SUA empresa, excluindo `[EXCLUÍDO]%`
  - Substitui `list_profiles_minimal()` com filtros por `company_id` e `nome NOT ILIKE '[EXCLUÍDO]%'`
- **Sem mudanças de frontend**: todos os componentes afetados já usavam a RPC — corrigir a RPC corrige todos automaticamente.
- **Políticas ativas após fix**: `profiles_select_own`, `profiles_select_admin_company`, `profiles_select_company_member`, `profiles_update_own`

### 2026-04-14 — Fix Categorias Hardcoded em Nova Solicitação de Compras

- **Bug**: No fluxo COMPRAS → PEDIDOS & COMPRAS MERCADO → NOVA SOLICITAÇÃO, o dropdown de "Categorias" exibia apenas 10 categorias fixas. Empresas com mais categorias (ex: REN SUSHI, com 21 categorias clonadas) não viam as categorias extras.
- **Causa**: `PedidosComprasMercadoView.tsx` usava array hardcoded `CATEGORIAS` em vez de buscar do banco. O array era usado em dois lugares: Popover da Nova Solicitação e Select de filtro nas abas Concluídos/Não Entregues.
- **Por que apareceu agora**: Antes do clone do catálogo para REN SUSHI, a Moralles tinha exatamente as mesmas 10 categorias do array — o bug era invisível. Com multi-tenant e catálogos diferentes por empresa, o problema ficou evidente.
- **Fix**: Adicionado fetch dinâmico de `stock_categories` com `is_active = true`, ordenado por `sort_order` e `name`. RLS da tabela garante isolamento por empresa automaticamente.
- **Arquivo afetado**: `src/components/PedidosComprasMercadoView.tsx` (removida constante `CATEGORIAS`, adicionados `useState<string[]>` + `useEffect` com query ao banco)
- **Blindagem**: Comentário no código deixa explícito que categorias devem vir do banco. Nunca adicionar lista hardcoded de categorias — sempre usar `stock_categories`.

### 2026-04-09 — Fix 3 Bugs: Usuário empresa errada + Sub-abas RBAC + RLS Requisições

#### Bug 1 — Usuário criado na empresa errada (admin-users)
- **Causa**: `admin-users` Edge Function criava auth user sem `company_id` nos metadados. O trigger `handle_new_user()` fazia fallback para a empresa mais recentemente criada (REN SUSHI) em vez da empresa do admin logado.
- **Fix**: Profile update após criação agora é incondicional e sempre inclui `company_id: callerCompanyId`, `nome` e `email` — sobrescrevendo o que o trigger errou.
- **Arquivo afetado**: `supabase/functions/admin-users/index.ts` (ação `create`, linhas ~270-274)
- **Remediação**: `UPDATE profiles SET company_id = '<MORALLES_UUID>' WHERE email = 'estoquistafood@gmail.com'` executado no Supabase SQL Editor.

#### Bug 2 — Todas as sub-abas visíveis mesmo com permissões restritas
- **Causa**: `saveUserPermissions` percorria apenas `allKeys` (tabela `permissions`) para gerar DENY. Chaves presentes em `role_permissions` mas ausentes da tabela `permissions` não recebiam DENY, permanecendo ativas via role grant.
- **Fix**: Loop agora percorre `allKeys UNION roleGranted`, garantindo DENY para todas as permissões do role que foram desmarcadas.
- **Arquivo afetado**: `supabase/functions/admin-users/index.ts` (função `saveUserPermissions`, linha ~187)

#### Bug 3 — "Erro ao carregar requisições" no módulo Estoque
- **Causa**: RLS em `requisicoes_estoque` e `requisicao_estoque_itens` usava chave legada `stock:requisitions:read`. A função `has_permission` no banco faz verificação direta (sem mapeamento legado). Usuários com `estoque:requisicoes:view` ou `system:global:manage` eram bloqueados.
- **Fix**: Migração que substitui as políticas antigas pelas novas com chaves granulares (`estoque:requisicoes:view/create/approve`) + chaves legadas de fallback + bypass `system:global:manage`.
- **Migração**: `20260409180000_fix_rls_requisicoes_permissions.sql`

### 2026-04-09 — Clone Catálogo Moralles → REN SUSHI
- **Ação**: Copiado catálogo completo da Moralles (MarginPro Oficial) para a empresa REN SUSHI.
- **O que foi copiado**: 21 categorias (`stock_categories`), 7 locais de estoque (`stock_locations`), 236 produtos (`produtos`).
- **O que NÃO foi copiado**: saldo atual (zerado), histórico de movimentações, vinculação salmão (`is_salmon_raw_linked = false`).
- **Técnica**: Migração SQL com `DISABLE TRIGGER USER` nas 3 tabelas (necessário pois `assert_tenant()` exige `auth.uid()` mas migrações rodam sem sessão auth). Idempotente via `ON CONFLICT DO NOTHING` em categorias/locais e `NOT EXISTS` por nome em produtos.
- **Migração**: `20260409150000_clone_catalog_moralles_to_ren_sushi.sql`
- **REN SUSHI company_id**: `de57a3ff-10f9-4b98-b6be-7bdab791c3f3`

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

### 2026-04-09 — Fix Catálogo: "0 itens encontrados" (stale closure)
- **Bug**: Catálogo mostrava "0 itens encontrados" mesmo com produtos visíveis. Afetava empresas novas (ex: Royal Parma) na primeira abertura do catálogo.
- **Causa**: `fetchProdutos` useCallback capturava `prodGlobalCounts` com valor inicial `{0,0,0}` via stale closure — `prodGlobalCounts` não estava no array de dependências.
- **Fix**: `fetchProdutoGlobalCounts` agora retorna `Promise<ProductGlobalCounts>`. Em `fetchProdutos`, usa `await fetchProdutoGlobalCounts()` e aplica o valor retornado diretamente em `setProdTotalCount`, eliminando a dependência do estado stale.
- **Arquivo**: `src/hooks/useEstoqueGeralStore.ts`

### 2026-04-09 — Fix Dados Royal Parma: produtos vinculados a categorias da Moralles
- **Problema**: Produtos criados na Royal Parma antes do fix de RLS estavam vinculados ao campo `categoria` com valores de categorias da Moralles (ex: "Insumos", "Hortifruti"). Após o fix de isolamento, o catálogo mostrava produtos mas o filtro de categoria mostrava opções erradas.
- **Fix**: Migração `20260409130000_fix_royal_parma_categories.sql` — cria categoria "Geral" na Royal Parma e atualiza os 13 produtos para usar essa categoria.
- **Royal Parma company_id**: `c064aa98-5120-4eaf-97a2-8dbc5cfbeee7`

### 2026-04-09 — Fix Isolamento Multi-Tenant: RLS sem company_id
- **Problema**: 7 tabelas tinham `company_id` na coluna mas RLS checava apenas permissão (`has_permission(uid, 'stock:read')`), sem filtrar por empresa. Um usuário da Empresa A podia ler/editar dados da Empresa B.
- **Caso especial `rh_escalas`**: políticas corretas existiam mas antigas (incluindo bypass `status = 'publicada'` cross-tenant) ainda estavam ativas — em RLS, basta uma policy autorizar para conceder acesso.
- **Migração**: `20260409120000_fix_rls_tenant_isolation.sql` — remove todas as policies históricas das 7 tabelas e recria com `company_id = get_current_company_id()` + chaves granulares + legadas + `system:global:manage`.
- **Tabelas corrigidas**: `stock_categories`, `stock_locations`, `fin_categorias`, `fin_centros_custo`, `turnos`, `rh_escalas`, `job_roles`
- **Frontend (defesa em profundidade)**: Adicionado `.eq('company_id', ...)` nas queries diretas de `StockCadastrosSection.tsx`, `CategoriasFinSection.tsx`, `EscalasSection.tsx`. Também adicionado `company_id` explícito nos INSERTs desses componentes.

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

### Padrões de Busca de Texto (OBRIGATÓRIO)

> Bloqueado por ESLint (`no-restricted-syntax`). Toda nova busca de texto na UI **DEVE** seguir este padrão.

- **Cliente:** SEMPRE usar `includesNormalized(haystack, needle)` ou `normalizeSearchText(text)` de `@/lib/utils`. **NUNCA** `.toLowerCase().includes()`.
- **Servidor (PostgREST `.ilike()` / `.or('col.ilike.val')` / RPC):** SEMPRE buscar em coluna `*_unaccent` (gerada como `lower(immutable_unaccent(...))`) e normalizar o termo cliente-side com `normalizeSearchText()` antes de enviar. Razão: `ILIKE` no Postgres é case-insensitive mas **NÃO** remove acentos.
- **Combobox / cmdk `<Command>`:** SEMPRE passar prop `filter={(val, search) => normalizeSearchText(val).includes(normalizeSearchText(search)) ? 1 : 0}`. O default do cmdk não normaliza acentos.
- **Edge Function (Deno):** mesma regra — usar coluna `*_unaccent` e normalizar termo inline (não há import de `@/lib/utils` em Deno).
- **Nova tabela com coluna pesquisável por usuário:** adicionar coluna gerada `*_unaccent` e índice `gin (col_unaccent gin_trgm_ops)` na **mesma migration** que cria a tabela. Wrapper `public.immutable_unaccent(text)` já existe.
- **Casos legítimos não-busca** (path de arquivo, uuid::text, código sem acento): justificar com `// eslint-disable-next-line no-restricted-syntax -- <motivo>`.

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
- [ ] Aplicar migração `20260429000001_fix_faturamento_legacy_rls.sql` em produção (`supabase db push`)
- [ ] Validar isolamento: logar como user do tenant A e tentar `GET /rest/v1/faturamento_periodos_legacy` — deve retornar só registros do mesmo tenant
- [x] Adicionar `CRON_SECRET` em `scheduled-jobs/index.ts` (validar header `Authorization: Bearer ${CRON_SECRET}`) — feito em 2026-04-29
- [x] Remover `company_id` dos payloads do frontend (BugTracker, ListaFixaSetor [2 inserts], permissions/hooks) — feito em 2026-04-29
- [ ] Dropar tabelas `*_bkp_reset_20260301` (18 tabelas, snapshot tem ~14 meses) e `z_canary_test`

---

## 📖 Documentação Adicional

- **Arquitetura completa**: `docs/ARCHITECTURE.md`
- **Regras de negócio**: `docs/DOMAIN_RULES.md`
- **Padrões de segurança**: `docs/ENTERPRISE_SAFE_STANDARDS.md`
- **RBAC playbook**: `docs/rbac/playbook-operacional.md`
- **Tarefas ativas**: `TAREFAS.md`
