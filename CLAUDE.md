# CLAUDE.md — Contexto do Projeto Moralles Food

> **Leia este arquivo primeiro.** Ele contém todo o contexto necessário para trabalhar neste projeto.
> Após fazer qualquer alteração significativa, atualize a seção **Pendente / Em Aberto** deste arquivo.

---

## SEGURANÇA — Obrigatório antes de qualquer commit/push

**Todo agente (humano ou AI) DEVE verificar os itens abaixo antes de fazer `git add`, `git commit` ou `git push`:**

1. **Nenhum JWT ou chave secreta nos arquivos staged** — procurar padrão `eyJ` (JWTs) e `sb_secret_` nos diffs.
2. **`.claude/settings.local.json` nunca commitado** — pode conter tokens e comandos curl com chaves nas flags de shell history. Já está no `.gitignore`.
3. **`.env`, `.env.*` nunca commitados** — já estão no `.gitignore` via `*.local`, mas verificar manualmente se existirem variantes como `.env.production`.
4. **`supabase/.temp/`nunca commitado** — já está no `.gitignore`.
5. **Edge Functions: nunca hardcodar chaves** — usar sempre `Deno.env.get("SB_SECRET_KEY")`. Chaves novas são adicionadas via painel Supabase → Edge Functions → Secrets.
6. **GitHub Actions: usar `${{ secrets.NOME }}` para qualquer valor sensível** — nunca valor literal no YAML.

**Checklist rápido antes do commit:**
```bash
# Ver o que vai ser commitado
git diff --cached | grep -E 'eyJ|sb_secret_|password|api_key'
# Se retornar algo, NÃO commitar — investigar o arquivo antes
```

> **Incidente de referência (2026-05-08):** Um JWT `service_role` (válido até 2036) foi commitado em `.claude/settings.local.json` via bash history de um curl de teste. A chave foi rotacionada e o legacy JWT desabilitado no Supabase. O arquivo foi removido do tracking e adicionado ao `.gitignore`.

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
5. **React Query config** — `staleTime: 3min`, `gcTime: 10min`
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
| `requisicao-estoque` | Requisições de estoque (estorno, notificação modal ao encerrar, ack do solicitante) |
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
- **jspdf-autotable v5: API funcional** — importar como `import autoTable from 'jspdf-autotable'` e chamar `autoTable(doc, {...})`. O import de side-effect `import 'jspdf-autotable'` e o padrão `(doc as any).autoTable({...})` **não funcionam** na v5 em Vite/ESM — o plugin só patchava o prototype se `window.jsPDF` existia globalmente (quebrou em 2026-05-19).

---

## 🧭 Princípios e Decisões Arquiteturais

> Decisões que orientam código novo. Histórico detalhado: `git log -- CLAUDE.md` e `supabase/migrations/`.

- **`produtos.saldo_atual` é fonte única da verdade** — Toda RPC de leitura de valor/saldo de estoque deve consumir o cache (mantido por trigger `fn_recompute_product_saldo`), **nunca** recalcular inline sobre `movimentacoes_estoque`. RPCs alinhadas: `get_stock_summary`, `get_stock_dashboard`, `get_relatorios_kpis`, `get_stock_predictive_analysis_v2`. **Motivo crítico**: cancelar uma movimentação insere estorno (`ENTRADA_ESTORNO`/`SAIDA_ESTORNO`, status `ATIVO`) mas o trigger ignora esses tipos → ledger diverge do cache. Uma CTE `saldos` que soma todo o ledger `ATIVO` vai ver saldos negativos fantasmas → `(previsao - saldo_negativo) * custo` gera compra sugerida falsa. Caso confirmado em produção: Vinagre de Arroz Ren Sushi, ledger=-39 vs cache=0, bug=R$173,55 (corrigido em `20260505140100`).
- **PL/pgSQL valida colunas só na 1ª execução** — Toda migration que altere RPC com JOIN deve incluir `DO`-block que força resolução de colunas no `db push` (evita crash em produção ao invés de no deploy). Padrão: `20260502151400`.
- **`SECURITY DEFINER` exige `assert_tenant()` + `has_any_permission()` explícitos** — RPCs que retornam dados sensíveis (ex: `list_profiles_minimal`, `relatorio_socios_resumo`) nunca podem resolver tenant via JOIN manual.
- **Hard delete de usuário preserva histórico** — FKs de `auth.users(id)` usam `ON DELETE SET NULL`. Edge function `admin-users` chama `auth.admin.deleteUser`; CASCADE limpa `profiles`/`user_roles`/`user_permissions`.
- **Financeiro: RPCs `_guarded_`** — Todas as operações financeiras (CP, CR, lançamentos, conciliação) usam RPCs prefixadas `_guarded_` com `assert_tenant()`, `has_permission()`, optimistic locking via `updated_at` e log em `fin_audit_logs`. **RPCs de delete DEVEM aceitar `p_expected_updated_at timestamptz DEFAULT NULL` e inserir `entidade_id` em `fin_audit_logs` como `uuid` nativo (sem `::text`) — o cast explícito `::text` sobre variável `uuid` bloqueia o assignment cast do Postgres e lança erro 42804, revertendo o DELETE inteiro na mesma transação. Incidente confirmado em produção: `_guarded_delete_conta_pagar` (REN SUSHI, 2026-05-11). Padrão de erros obrigatório no servidor: `OPTIMISTIC_LOCK_CONFLICT`, `LANCAMENTO_VINCULADO`, `STATUS_INVALIDO: %`, `PERMISSION_DENIED: %`, `NOT_FOUND`. Helper client-side: `mapFinanceiroDeleteError` em `src/lib/financeiroErrorMap.ts`. Lançamentos: usar `_guarded_delete_lancamento` (nunca DELETE direto via PostgREST). Incidente idêntico em `reconcile_import_lancamento`: audit INSERT usava `v_lancamento_id::text` → erro 42804 revertia criação de lançamento na conciliação bancária. Corrigido em `20260605152939`.**
- **Conciliação Bancária** — 3 destinos: `lancamento`, `conta_pagar`, `conta_receber`. Categoria filtrada por `tipo` lowercase (`'receita'`/`'despesa'`). Linhas persistidas em `sessionStorage`. "Ignorar" via tabela `fin_conciliacao_ignoradas`. **Lançamento criado na conciliação nasce `status='REALIZADO'` + `conciliado=true` — a categoria DEVE ir no payload de criação (`reconcile_import_lancamento` aceita rateio de 1 linha e grava `categoria_id`/`centro_custo_id` no INSERT). NUNCA gravar categoria via UPDATE pós-criação: `categoria_id`/`conta_id`/`valor`/`data_competencia`/`centro_custo_id` são campos vigiados pelo trigger `trg_validate_fin_lancamento_update`, que exige `justificativa_edicao` em lançamento REALIZADO → o UPDATE sem justificativa lança P0003 "Justificativa obrigatória". Bug corrigido no cliente `CriarLancamentoExtratoDialog.tsx` (2026-06-05) E na própria RPC `reconcile_import_lancamento` (2026-06-06, migration `20260606160000`): a RPC ainda fazia `INSERT` REALIZADO sem categoria + um 2º `UPDATE ... SET categoria_id` no caminho de rateio de 1 linha (mesmo P0003), o que quebrava também o botão "Processar" em lote. A correção extrai a categoria em `v_cat_id`/`v_cc_id` ANTES do INSERT e grava `categoria_id`/`centro_custo_id` no próprio INSERT, removendo o UPDATE pós-criação.** UX: `ConciliacaoBancariaSection` tem seletor de categoria inline por linha "Criar novo" (reusa `CategoryCombobox` com `modal={false}`) e o diálogo de Rateio usa `CategoryCombobox` (busca por lupa, `modal` default por estar em Dialog) — ambos filtram categorias pelo `tipo` da linha; status da linha usa rótulos explícitos `Conciliar c/ existente` / `Sugestão p/ conciliar` / `Criar novo`. **Após processar conciliação, remover da lista APENAS as linhas no `Set processadas` (toImport + toReconcileLanc + pendingCP + pendingCR) via `setLinhas(prev => prev.filter(l => !processadas.has(l)))` — NUNCA usar `setLinhasState([])` (limpa tudo, incluindo linhas sem match e ignoradas).** **Verificação de conta ao subir extrato (2026-06-06)**: parser centralizado em `src/lib/extratoParser.ts` (`parseExtrato(filename, text)`) extrai identidade da conta do cabeçalho OFX (`ACCTID`/`BRANCHID`/`BANKID` de `<BANKACCTFROM>`) e varre as primeiras 15 linhas de CSV por padrões `agência/conta`. `verifyContaExtrato(extratoConta, cadastro)` compara com `fin_contas.numero_conta`/`agencia` (normaliza para só dígitos, tolera dígito verificador). Resultado: `mismatch` → `AlertDialog` bloqueante com override "Importar mesmo assim"; `unverified` (CSV sem cabeçalho ou cadastro sem nº/agência) → `toast.warning` + importa normalmente; `match` → fluxo normal. Aplicado em `ConciliacaoBancariaSection` e `ImportacaoExtratoSection`. A query de `fin_contas` nessas duas telas DEVE incluir `numero_conta, agencia, banco` (hoje já inclui).
- **DRE por competência (inclui CP/CR em aberto) × DFC por caixa × espelho de pagamento** — Três regras de data que NÃO podem se misturar (corrigido 2026-06-10, migrations `20260610120000`–`20260610120300`): **(1) DRE** (`get_fin_dre_summary`) apura por `data_competencia` e soma `fin_lancamentos` REALIZADO/CONCILIADO **+ contas a pagar/receber EM ABERTO** (`status NOT IN ('PAGO','CANCELADO','RASCUNHO')` / `('RECEBIDO','CANCELADO','RASCUNHO')`) via `COALESCE(data_competencia, data_vencimento)`. **NUNCA** incluir lançamentos manuais `PREVISTO` (orçamento). Sem dupla contagem: CP/CR paga vira espelho `REALIZADO` (contado em `fin_lancamentos`) e sai do conjunto "em aberto". `fin_lancamento_rateios.lancamento_id` é **polimórfico (sem FK)** — splits de CP/CR ficam sob o id da própria conta (ver `_guarded_create_conta_pagar`), então o rateio tem prioridade também para CP/CR (padrão de 6 UNIONs com `NOT EXISTS`). **(2) DFC realizado** (`get_fin_dfc_summary`; `get_fin_cashflow` CTE `realizado`) por `COALESCE(data_pagamento, conciliado_em::date, data_competencia)`, só REALIZADO/CONCILIADO. **(3) DFC previsto** (`get_fin_cashflow`: CTE `previsto_lanc` por `COALESCE(data_vencimento, data_competencia)`; `pagar`/`receber` por `data_vencimento`). **(4) Espelho de pagamento**: `pay_conta_pagar`/`receive_conta_receber` (botões "Pagar"/"Receber") ganharam `p_data_pagamento`/`p_data_recebimento` (DEFAULT NULL; frontend abre seletor de data com default `todayBR()` de `@/lib/datetime`); o espelho grava `data_competencia = COALESCE(conta.data_competencia, conta.data_vencimento, pgto)` e `data_pagamento = data escolhida` — **nunca `CURRENT_DATE`** (UTC desloca o mês à noite no BR; usar o dia do pgto como competência transformava o DRE em relatório de caixa = causa do "mês vigente caindo no anterior"). Idem no INSERT do espelho em `reconcile_pay_conta_pagar`/`reconcile_receive_conta_receber` (ramos "reused/existing" preservam competência — não mexer). Conciliação: match em CP/CR → `reconcile_pay/receive` (baixa + vínculo, sem novo lançamento); match em lançamento → `reconcile_batch_lancamentos`; sem match → `reconcile_import_lancamento` (dedup via `idempotency_key`). **Dashboard/KPIs/Gráficos alinhados na Etapa 2** (migrations `20260610130000`–`20260610130200`): `get_fin_dashboard_summary`, `get_fin_kpis` (2 sobrecargas) e `get_fin_dashboard_charts` incluem CP/CR em aberto por competência em Receita/Despesa/Resultado; Saldo em Caixa por `COALESCE(data_pagamento, conciliado_em::date, data_competencia)`; A Receber/A Pagar e inadimplência/prazos/top fornecedores seguem por vencimento.
- **Drift de versionamento de migrations (MCP/dashboard × arquivo)** — Migrations aplicadas via MCP `apply_migration` (ou pelo dashboard) gravam `supabase_migrations.schema_migrations.version` com o timestamp `now()` da aplicação, **≠ do timestamp no nome do arquivo**. Caso real: o arquivo `20260606160000_fix_reconcile_import_lancamento_categoria_no_insert.sql` está vivo em produção, mas registrado no histórico como `20260606183647`. Consequência: `supabase db push` enxerga o arquivo local como **pendente** e o reaplica (idempotente para `CREATE OR REPLACE`, mas duplica a linha lógica no histórico). **Regra:** aplicar migrations preferencialmente via `supabase db push` (registra version = nome do arquivo); usar MCP `apply_migration` só quando não houver CLI. Conferir pendências reais comparando `ls supabase/migrations | sed 's/_.*//'` com `SELECT version FROM supabase_migrations.schema_migrations`.
- **Bundle: xlsx em chunk separado** — `vite.config.ts` tem `manualChunks: { 'vendor-xlsx': ['xlsx'] }`. Seções raras do FinanceiroView são `React.lazy`. Não desfazer isso.
- **KPIs agregados são SUM no Postgres, nunca `reduce` no client** — Cards/dashboards com `Total R$`, `Qtd Total`, `Registros` devem consumir RPC dedicada (`get_*_kpis`) que retorna o agregado calculado no banco. Padrão idêntico ao `produtos.saldo_atual`. **Nunca** fazer `.select(...)` sem `.limit()` seguido de `.reduce()` para somar — isso baixa a tabela inteira pela rede e cresce O(n). Referência: `get_movimentacoes_kpis` (migration `20260502180000`). Retornar ambos os lados (entrada+saída, receita+despesa, etc.) em uma única chamada para que o toggle/aba vire filtro client-side instantâneo.
- **Estoque: sub-módulos Ranking e Preditivo exibem em unidade de compra** — `get_stock_top_consumed` e `get_stock_predictive_analysis_v2` convertem todas as quantidades para `unidade_compra` no JSON de saída. Padrão: introduzir `fator_exibicao` (= `fator_conversao_padrao` para dual-unit; `1.0` como fallback — sem efeito para não-dual) e dividir todos os campos de quantidade por ele na etapa final. Custo (R$), `cobertura_dias` e `ruptura_em_dias` (em dias) são invariantes. Alertas (`status_estoque`, `status_risco`) calculados em base antes da conversão para preservar thresholds. JSON arrays (`serie_7d[].previsao`, `perfil_dow[].media`) também convertidos via subquery `jsonb_array_elements` / `jsonb_each`. Ficha Técnica e Inventário permanecem em unidade contábil (base). Migrations: `20260505121000` (Ranking), `20260505130100` (Preditivo).
- **`get_stock_dashboard`: bucket `ok` exige `saldo > 0`** — Produto com `saldo=0` e `estoque_minimo=0` NUNCA deve ser contado como OK. Os 4 buckets (ok/atencao/critico/sem_estoque) devem ser mutuamente exclusivos: `atencao` exclui intervalo crítico, `critico` é subconjunto disjunto de `atencao`. A condição `OR COALESCE(estoque_minimo, 0) = 0` no FILTER de `ok` é perigosa sem o guard `saldo > 0`. Migration: `20260505140000`.
- **`formatDateBR` existe em dois módulos com semânticas diferentes — NUNCA importar de `formatters`** — `src/lib/datetime.ts:20` retorna `'yyyy-MM-dd'` (ISO, para `<Input type="date">` e queries ao banco). `src/lib/formatters.ts` re-exporta `formatDisplayBR as formatDateBR`, que retorna `'dd/MM/yyyy'` (exibição). Qualquer componente que use `formatDateBR` para inicializar estado de `<Input type="date">` **deve importar de `@/lib/datetime`**. Importar de `@/lib/formatters` gera valor no formato errado → `parseLocalDate` falha → `RangeError: Invalid time value` ao primeiro render. Causa do crash do módulo CMV corrigida em 2026-05-05.
- **Rótulo de mês a partir de `"yyyy-MM"` DEVE parsear como data LOCAL — `new Date("yyyy-MM-01")` é UTC e recua um mês no BR** — `new Date("2026-06-01")` (string date-only sem horário) é interpretada como **UTC meia-noite**; `new Intl.DateTimeFormat('pt-BR', { month: 'long' })` então formata no fuso local (BRT, UTC-3) → 2026-06-01T00:00Z = 2026-05-31T21:00 BRT → o rótulo exibe **"Maio de 2026"**. Sintoma em produção: seletor de mês do **DRE** mostrava "Maio de 2026" e "não exibia junho", embora o `value` (`"2026-06"`) e a query (`get_fin_dre_summary` `p_mes`) estivessem **corretos** — só o texto do `<SelectItem>` estava um mês atrás. **Regra:** para rotular um mês, fazer `const [y, m] = value.split('-').map(Number); const d = new Date(y, m - 1, 1);` (construtor de componentes = data local, sem shift) — **nunca** `new Date(value + '-01')`. Alternativa segura: anexar horário (`new Date(value + '-01T12:00:00')` é local, padrão de `MetaCompraCard.tsx`). Corrigido em `DRESection.tsx` (`formatMonthLabel`), `OrcamentoSection.tsx` e `RelatorioSociosSection.tsx` (`formatMonthBR`) em 2026-06-10. Bug é **só de exibição** — nenhuma migration/SQL envolvida; exige deploy de frontend.
- **INSERT em tabela multi-tenant DEVE incluir `company_id` explícito no payload** — O trigger `force_company_id` NÃO é global; está aplicado apenas em `produtos` (`produtos_force_company_id`, migration `20260303004339`). Toda outra tabela com `company_id NOT NULL` (sem default) que receba INSERT direto via PostgREST do cliente exige o valor explícito vindo de `useCompanyId()`. Caso confirmado: `listas_fixas_setor` e `listas_fixas_setor_itens` em `ListaFixaSetorAdmin.tsx:115,142` (toast "Erro ao criar lista" mascarava `null value in column "company_id"`). UPDATE/DELETE não precisam — a RLS resolve via `USING (company_id = get_current_company_id())` no registro existente. **Sempre incluir `console.error('[componente.handler]', err)` no catch antes do toast** — toasts genéricos sem log mascaram a causa raiz e atrasam o diagnóstico em produção.
- **Requisições de Estoque: critério de "pendente" é `hasPendingItems`, não `status`** — A lista principal (`RequisicaoEstoqueSection`) exibe apenas requisições com ao menos 1 item `SOLICITADO`. Requisições encerradas (todos itens aceitos/recusados) e canceladas (`ativo=false`) ficam no bucket `historico`, acessível via botão "Histórico" (Sheet lateral). A Edge Function `requisicao-estoque` action `listar` aceita `bucket: 'pendentes' | 'historico'` e usa 2-phase query (Fase 1: IDs com item `SOLICITADO` via `supabaseUser` + RLS; Fase 2: `.in()` para pendentes, `.or(not.in + cancelada)` para histórico). **Nunca** usar `req.status === 'PARCIALMENTE_ATENDIDA'` como proxy para "tem item aberto" — esse status coexiste com 0 itens SOLICITADO (ex: 2 atendidos + 1 recusado = Parcial mas encerrada). Fonte única: `hasPendingItems(req.requisicao_estoque_itens)` de `src/domain/estoque/requisitionStatus.ts`.
- **Notificação modal bloqueante de Requisição encerrada** — Quando admin encerra requisição (ATENDIDA/PARCIALMENTE_ATENDIDA/NEGADA), a Edge Function `requisicao-estoque` chama `notifyIfRequisicaoEncerrada()` que insere 1 registro em `notifications` (type=`REQUISICAO_ENCERRADA`, idempotente via UNIQUE INDEX parcial em `notifications(entity_id) WHERE entity_type='requisicao_estoque' AND type='REQUISICAO_ENCERRADA'`). O solicitante vê um `AlertDialog` central bloqueante via `RequisicaoNotificationModal` montado globalmente em `App.tsx` (dentro do `NotificationsProvider`). Ao confirmar, action `marcar_requisicao_visto` grava `requisicoes_estoque.confirmado_pelo_solicitante_em/por` (visível ao admin como badge "✓ Visto"). **Compartilhamento de estado de notificações**: `NotificationsProvider` (`src/contexts/NotificationsContext.tsx`) instancia `useNotifications` uma única vez — `NotificationBell` e o modal consomem via `useNotificationsContext()`, evitando 2 subscriptions Realtime. **Admin lê confirmação via colunas na requisição** (não via `notifications` — RLS impediria). Migration: `20260508141432`. Texto do modal varia por status (ATENDIDA/PARCIALMENTE/NEGADA), gerado no servidor.

---

### Componentes Padronizados
- **TableActions**: Localizado em `components/ui/TableActions.tsx`. Deve ser usado em todas as tabelas de gerenciamento para fornecer botões de Editar e Excluir consistentes, com suporte a permissões RBAC e diálogos de confirmação integrados.
- **FormCloseConfirmDialog**: Usado em conjunto com `useFormDirtyGuard` para prevenir perda de dados em formulários.
- **SearchableSelect**: Localizado em `components/ui/SearchableSelect.tsx`. Deve ser usado em todos os selects com 10+ opções (produtos, categorias, locais, usuários, fornecedores). Props: `value`, `onValueChange`, `options: {value, label}[]`, `placeholder`, `searchPlaceholder`, `modal` (true para uso dentro de Dialog).
- **NotificationsProvider**: Localizado em `src/contexts/NotificationsContext.tsx`. Instância única de `useNotifications` compartilhada entre `NotificationBell` e `RequisicaoNotificationModal` via `useNotificationsContext()`. Montado em `App.tsx` dentro do `BrowserRouter`. **Nunca** instanciar `useNotifications` diretamente em componentes que já estão dentro do Provider — duplicaria subscription Realtime e dessincronizaria estados.
- **RequisicaoNotificationModal**: Localizado em `src/components/RequisicaoNotificationModal.tsx`. `AlertDialog` global bloqueante (sem ESC/clique fora). Montado em `App.tsx`. Processa fila de notificações `REQUISICAO_ENCERRADA` não lidas da mais antiga para a mais nova.
- **DateRangePresets**: Localizado em `components/financeiro/DateRangePresets.tsx`. Row de botões de atalho de período para filtros de data em strings `yyyy-MM-dd`. Props: `from`, `to`, `onChange(from, to)`, `className?`. Presets: Dia, Esta semana, Este mês, Últimos 7/30/90 dias, Limpar (zera para `''`). Importa obrigatoriamente de `@/lib/datetime` (não de `@/lib/formatters`). **Query que usa esse componente DEVE tratar `from/to` vazio de forma condicional** — ex: `if (startDate) query = query.gte('data', startDate)` — pois string vazia no Supabase `.gte` gera erro no Postgres. Módulos: `FechamentoCaixaSection`, `LivroRazaoSection`.
- **SubmoduleSwitcher**: Localizado em `components/ui/SubmoduleSwitcher.tsx`. **Obrigatório** para navegação de sub-módulos — substitui a fileira horizontal de botões (`overflow-x-auto`). Exibe um botão único com o sub-módulo ativo + chevron; abre Drawer (bottom sheet) no mobile e DropdownMenu no desktop. Props: `items: {id, label, icon, badge?}[]`, `value`, `onChange`, `groupLabel?`, `groupIcon?` — quando `value` não pertence a `items`, o trigger exibe o fallback de grupo com estilo ghost (sem gradient-salmon). Útil para navegação multi-grupo (ex: Financeiro). Módulos já migrados: Estoque, Compras, Configurações, Salmão, Ficha Técnica, PedidosComprasMercado, **Financeiro**, **RH**. Financeiro usa layout especial: Dashboard isolado (botão direto) + 3 `SubmoduleSwitcher` por grupo (Operações, Configurações, Relatórios & Análise) dentro de um card. Módulos com `<Tabs>` do shadcn: Admin, CMV, Relatórios.

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

- [x] Inventário: exportar lista de contagem em PDF (impressão para contagem manual) — RASCUNHO e EM_CONTAGEM, agrupado por local→categoria, lista cega por padrão — `src/lib/pdfInventarioContagem.ts` + `ExportListaContagemModal.tsx` (2026-05-19)
- [ ] Conceder permissão `inventario:detalhe:export` aos roles Admin/Conferente/Gerente via Admin → Permissões (adicionado em `LEGACY_PERMISSION_MAP` como `inventory:export` mas roles precisam de grant explícito)
- [ ] Monitorar integridade dos dados na empresa piloto após ativação multi-tenant
- [ ] Testar fluxo completo: criar empresa → criar admin → login admin → criar usuários
- [ ] Validar isolamento: logar como user do tenant A e tentar `GET /rest/v1/faturamento_periodos_legacy` — deve retornar só registros do mesmo tenant
- [ ] Dropar tabelas `*_bkp_reset_20260301` (18 tabelas, snapshot tem ~14 meses) e `z_canary_test`
- [ ] Auditar outras telas (Compras, CMV, Financeiro, Relatórios) por padrão `select sem limit + reduce client` — substituir por RPC com SUM (mesmo padrão de `get_movimentacoes_kpis`)
- [ ] Auditar bugs latentes do `formatDateBR` errado (importado de `formatters` em vez de `datetime`): `MetaCompraCard.tsx:107` (`formatDateBR(new Date()).slice(0, 7)` gera `'01/05/2'` em vez de `'2026-05'`) e `RhView.tsx:473` (`formatDateBR(pontoDate) === todayBR()` é sempre false — comparação dd/MM/yyyy vs yyyy-MM-dd)
- [ ] Auditar outros INSERTs diretos via PostgREST em tabelas multi-tenant que omitem `company_id` (mesmo bug de `ListaFixaSetorAdmin.tsx`) — apenas `produtos` tem trigger `force_company_id`; demais tabelas exigem o valor explícito do payload
- [x] Listas Fixas por Setor: erro "Erro ao criar lista" — INSERT em `listas_fixas_setor`/`_itens` faltava `company_id` em `ListaFixaSetorAdmin.tsx:115,142` (corrigido 2026-05-08)
- [x] Ranking de Estoque exibindo em unidade de compra (`get_stock_top_consumed` — migration `20260505121000`)
- [x] Preditivo de Estoque exibindo em unidade de compra (`get_stock_predictive_analysis_v2` — migration `20260505130100`)
- [x] Dashboard: "Status do Estoque" mostrava OK=1 com saldo zero — corrigido em `20260505140000`
- [x] Preditivo: "Compras sugeridas" mostrava R$173,55 fantasma após cancelar movs — corrigido em `20260505140100`
- [x] Requisições encerradas saem da lista principal e vão para Sheet "Histórico" (`RequisicaoEstoqueSection` + Edge Function `requisicao-estoque` v4 — 2026-05-05)
- [x] Notificação modal bloqueante ao encerrar requisição: AlertDialog global para solicitante + badge "Visto/Aguardando" para admin (Edge Function v7 + migration `20260508141432` — 2026-05-08)
- [x] Financeiro: erro ao excluir Conta a Pagar (REN SUSHI) — `_guarded_delete_conta_pagar` fazia `p_id::text` em `fin_audit_logs.entidade_id uuid` → erro 42804 revertia transação. Corrigido em migration `20260511150000`: também corrigido `_guarded_delete_conta_receber`, `_guarded_delete_orcamento`; criado `_guarded_delete_lancamento`; adicionado optimistic lock e validação FK em CP/CR; blindagem sistêmica de todos handlers de delete financeiro com `console.error` e `mapFinanceiroDeleteError` (2026-05-11)
- [x] Conciliação Bancária: erro ao processar lançamento — `reconcile_import_lancamento` usava `v_lancamento_id::text` no INSERT de `fin_audit_logs.entidade_id uuid` → erro 42804 revertia criação. Corrigido em migration `20260605152939` (2026-06-05)
- [x] Financeiro: atalhos de período (Dia / Esta semana / Este mês / Últimos 7,30,90 dias / Limpar) adicionados a Livro Razão e Fechamento de Caixa via `DateRangePresets` (2026-06-06). Query de `FechamentoCaixaSection` corrigida para condicional (suporte a datas vazias = ver tudo).
- [x] Conciliação Bancária: após processar conciliação, apenas as linhas efetivamente processadas são removidas da lista (`processadas = new Set([...toImport, ...toReconcileLanc, ...pendingCP, ...pendingCR])`); linhas sem match, não selecionadas, ignoradas ou já conciliadas permanecem — corrigido em `ConciliacaoBancariaSection` (2026-06-06).
- [x] Conciliação Bancária: erro "Justificativa obrigatória ao editar lançamento realizado" ao usar "Criar" com categoria — `CriarLancamentoExtratoDialog` criava o lançamento sem categoria e gravava `categoria_id` num 2º UPDATE (campo vigiado pelo trigger). Corrigido passando a categoria no payload de criação. UX: seletor de categoria inline na linha + rótulos `Conciliar c/ existente`/`Criar novo` (2026-06-05)
- [x] Conciliação Bancária: erro "Justificativa obrigatória" ao clicar **Processar** (e em "Criar") com categoria — a RPC `reconcile_import_lancamento` ainda fazia `INSERT` REALIZADO sem categoria + 2º `UPDATE ... SET categoria_id` no caminho de rateio de 1 linha → disparava `trg_validate_fin_lancamento_update` (P0003). Confirmado na função viva em produção via `pg_get_functiondef`. Corrigido gravando `categoria_id`/`centro_custo_id` no próprio INSERT (vars `v_cat_id`/`v_cc_id` extraídas antes) e removendo o UPDATE pós-criação — migration `20260606160000`, aplicada em produção (2026-06-06). Sem alteração de frontend (o cliente já enviava o rateio de 1 linha)
- [x] Conciliação Bancária / Importação de Extratos: verificação de conta ao subir extrato — parser unificado `src/lib/extratoParser.ts` lê identidade da conta do OFX (`<BANKACCTFROM>`) e heurística CSV; `verifyContaExtrato` bloqueia com `AlertDialog` se divergir (override possível) ou avisa com toast se não puder verificar (2026-06-06)
- [x] Financeiro DRE/DFC: DRE passou a apurar por **competência** incluindo CP/CR **em aberto**; DFC realizado por data de pagamento/conciliação; DFC previsto por vencimento; espelho de pagamento preserva a competência da conta e usa a **data real** (seletor de data nos botões Pagar/Receber). Corrige o "mês vigente caindo no anterior" (era `CURRENT_DATE` UTC + competência = dia do pagamento). Migrations `20260610120000`–`20260610120300` + `ContasPagarSection.tsx`/`ContasReceberSection.tsx` (2026-06-10). **APLICADO em produção via `supabase db push` (2026-06-10)** — antes foi preciso `supabase migration repair --status reverted 20260606183647` (órfão do drift de versionamento, ver princípio acima). Types do Supabase regenerados (`as any` removido das chamadas). **Falta apenas: commit/push do frontend (manual) — as melhorias de DRE/DFC já estão vivas no banco; o seletor de data de pagamento só aparece após o deploy do frontend.**
- [x] Financeiro Dashboard/KPIs/Gráficos: alinhados ao critério competência/caixa do DRE/DFC (Etapa 2) — Receita/Despesa/Resultado + KPIs (`receita_total`/`despesa_total`/`margem`/`ticket_medio`/`receita_por_mes`) + evolução mensal + despesas por categoria passam a incluir CP/CR em aberto por competência; Saldo em Caixa por data de pagamento; A Receber/A Pagar e inadimplência/prazos/top fornecedores mantidos por vencimento. Migrations `20260610130000`–`20260610130200`, aplicadas em produção via `supabase db push` (2026-06-10). Sem mudança de frontend (mesmo shape de JSON).
- [ ] Conciliação: permitir override de competência no lançamento criado pela conciliação (`CriarLancamentoExtratoDialog` + `p_competencia` em `reconcile_import_lancamento`) — hoje competência = data da transação (default OK; falta o "salvo se o usuário informar outra competência" do Cenário 6)

---

## 📖 Documentação Adicional

- **Arquitetura completa**: `docs/ARCHITECTURE.md`
- **Regras de negócio**: `docs/DOMAIN_RULES.md`
- **Padrões de segurança**: `docs/ENTERPRISE_SAFE_STANDARDS.md`
- **RBAC playbook**: `docs/rbac/playbook-operacional.md`
- **Tarefas ativas**: `TAREFAS.md`
