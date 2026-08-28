# Contexto do Projeto Moralles Food

> **Leia este arquivo primeiro.** Ele contém o contexto necessário para trabalhar neste projeto.
> `CLAUDE.md` e `AGENTS.md` são mantidos **idênticos** — ao editar um, replique a mudança no outro.

---

## 📏 Regras para manter este arquivo enxuto (leia antes de editar)

- Este arquivo é contexto operacional, não um diário de bordo. Antes de adicionar qualquer coisa, pergunte: *"um agente futuro precisa disso para não repetir um erro caro, ou consegue descobrir isso lendo o código / `git log` / `TAREFAS.md`?"* Se consegue descobrir sozinho, **não escreva aqui**.
- Só vale uma entrada nova se for: (a) uma regra de negócio ou invariante que o código sozinho não deixa óbvio, (b) uma armadilha que já causou bug em produção e pode se repetir, ou (c) uma decisão arquitetural que orienta código novo.
- Escreva a regra e, se precisar, o motivo em **uma linha**. Não narre o processo de investigação ("testado com X, confirmado via Y, verificado ao vivo simulando Z") — isso é para a mensagem de commit, não para cá.
- **Sem limite de tamanho fixo** — mas isso não é licença para inflar. O critério é sempre "é necessário para o sistema", nunca "documentar o que eu fiz agora".
- Itens concluídos na seção **Pendente / Em Aberto** são removidos, não acumulados — o histórico já mora em `git log` e `TAREFAS.md`.
- Ao corrigir/atualizar uma regra existente, **substitua** o texto antigo — não empilhe um novo parágrafo "REVISÃO" em cima do anterior.

---

## SEGURANÇA — Obrigatório antes de qualquer commit/push

**Todo agente (humano ou AI) DEVE verificar antes de `git add`, `git commit` ou `git push`:**

1. Nenhum JWT ou chave secreta nos arquivos staged — procurar `eyJ` (JWTs) e `sb_secret_` nos diffs.
2. `.claude/settings.local.json` nunca commitado (pode conter tokens em shell history) — já no `.gitignore`.
3. `.env`/`.env.*` nunca commitados (via `*.local`) — verificar variantes como `.env.production`.
4. `supabase/.temp/` nunca commitado.
5. Edge Functions: nunca hardcodar chaves — usar `Deno.env.get("SB_SECRET_KEY")`; segredos novos via Supabase → Edge Functions → Secrets.
6. GitHub Actions: usar `${{ secrets.NOME }}` para qualquer valor sensível, nunca literal no YAML.

```bash
git diff --cached | grep -E 'eyJ|sb_secret_|password|api_key'
```

> **Incidente de referência (2026-05-08):** JWT `service_role` commitado via bash history em `.claude/settings.local.json`. Chave rotacionada, arquivo removido do tracking e adicionado ao `.gitignore`.

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

**Frontend:** React 18 + TypeScript 5, Vite 5 + SWC, shadcn/ui + Radix UI, Tailwind CSS 3, React Router DOM 6, TanStack React Query 5, React Hook Form 7 + Zod 3, Recharts 2, Sonner, jsPDF + ExcelJS (export PDF/Excel), vite-plugin-pwa, Bun (`bun install`, `bun run dev`).

**Backend:** Supabase — PostgreSQL 15+ com RLS global, Supabase Auth (email/senha), PostgREST + RPCs customizadas (30+), Edge Functions (Deno/TypeScript), Realtime (`postgres_changes`), Storage.

---

## 📁 Estrutura de Pastas

```
margin-food/
├── src/
│   ├── App.tsx                    # Roteamento raiz e providers
│   ├── components/                # Componentes por módulo
│   ├── pages/                     # Index, Login, Admin
│   ├── contexts/                  # AuthContext, contextos de store
│   ├── hooks/                     # Hooks customizados
│   ├── lib/                       # Utilitários (formatters, PDFs, permissões)
│   ├── types/                     # Tipos TypeScript (estoque, financeiro, salmon)
│   ├── domain/                    # Regras de negócio e invariantes
│   ├── integrations/supabase/     # Cliente Supabase e tipos gerados
│   └── permissions/                # Registry RBAC, ações, validação
├── supabase/
│   ├── config.toml
│   ├── migrations/                # Migrações SQL (timestamp YYYYMMDDHHMMSS)
│   └── functions/                 # Edge Functions Deno
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DOMAIN_RULES.md
│   ├── ENTERPRISE_SAFE_STANDARDS.md
│   └── rbac/
├── CLAUDE.md / AGENTS.md          # ← Este arquivo (contexto para AIs, mantidos idênticos)
└── TAREFAS.md                     # Histórico detalhado de tarefas concluídas
```

---

## 🏗️ Arquitetura — Pontos Críticos

### Multi-tenancy
- Toda tabela tem `company_id NOT NULL`. Trigger `force_company_id` só existe em `produtos` — **qualquer outra tabela exige `company_id` explícito no payload do INSERT** vindo de `useCompanyId()` (UPDATE/DELETE não precisam, a RLS resolve pelo registro existente).
- `get_current_company_id()` resolve `auth.uid()` → `profiles.company_id`. **Nunca** confiar em `company_id` vindo do cliente.
- UUID placeholder `00000000-0000-0000-0000-000000000001` é reservado para o sistema, bloqueado para operações comuns.
- Onboarding via `onboard_new_company()`.

### RLS (Row-Level Security)
- `FORCE RLS` em todas as tabelas, sem exceção.
- `has_permission(user_id, key)` / `has_any_permission(user_id, keys[])` / `get_effective_permissions(user_id)` são as RPCs de checagem.
- **Toda policy nova DEVE embrulhar `get_current_company_id()`/`has_permission()`/`has_any_permission()` em `(select ...)` na `USING`/`WITH CHECK`.** Mesmo `STABLE`, o Postgres reavalia essas chamadas linha a linha dentro de um `Filter`; `has_any_permission` chama `get_effective_permissions()` (4 CTEs, VOLATILE) — sem o `(select ...)` isso vira `InitPlan` avaliado 1x por execução em vez de 1x por linha. Sem isso, um `SELECT ... LIMIT N` pode multiplicar o tempo em ordens de grandeza e estourar `statement_timeout` (caso real: `fin_lancamentos.tenant_read`, 8,7s → 47ms, 185x — migration `20260806171500`). Audit completo do schema já corrigiu 388/426 policies em 111 tabelas (`20260806173000`).
- Toda nova tabela com coluna pesquisável por usuário: adicionar coluna gerada `*_unaccent` + índice `gin (col_unaccent gin_trgm_ops)` na mesma migration (wrapper `public.immutable_unaccent(text)` já existe).
- **`SECURITY DEFINER` que retorna dados sensíveis** (ex: `list_profiles_minimal`) exige `assert_tenant()` + `has_any_permission()` explícitos — nunca resolver tenant via JOIN manual.

### RBAC (Permissões)
- Formato: `<módulo>:<submódulo>:<ação>`.
- **Fonte de verdade das ações é `src/permissions/actions.ts`** (`ALLOWED_ACTIONS`, 11 ações): `view, create, edit, delete, export, manage, approve, close, reconcile, cancel, simulate`. `validatePermissionKey()` rejeita qualquer outra — não existem ações como `send_whatsapp`/`use_ai`/`convert`/`audit`/`configure`/`execute`/`admin` (mapear para uma das 11: WhatsApp/IA → `manage`, converter → `close`).
- Registry em `src/permissions/registry.ts` (fonte única de módulos/subtabs) → sync via `rpc_sync_permissions_from_registry()`.

### Autenticação
- JWT Supabase Auth, validado via Bearer token nas Edge Functions (`verify_jwt = false` no config, validação manual dentro de cada função).
- Cache de roles/permissões no `sessionStorage` (TTL 5min) via AuthContext.
- Soft delete em registros críticos (`deleted_at`) — hard delete de usuário preserva histórico via FKs `ON DELETE SET NULL`; `admin-users` chama `auth.admin.deleteUser`, CASCADE limpa `profiles`/`user_roles`/`user_permissions`.

---

## 📦 Módulos do Sistema

| Módulo | Descrição | Componente Principal |
|--------|-----------|---------------------|
| **Estoque** | Gestão de inventário (dual-unit) | `EstoqueGeralView` |
| **Compras** | Pedidos, requisições, fornecedores, Cotação (RFQ) | `ComprasView` |
| **CMV** | Custo da Mercadoria Vendida + metas | `CmvView` |
| **Ficha Técnica** | Fichas de receitas e precificação | `FichaTecnicaView` |
| **Salmão** | Controle de rendimento de salmão | `SalmonControlView` |
| **Financeiro** | Contas a pagar/receber, DRE, Conciliação | `FinanceiroView` |
| **RH** | Folha de pagamento, escalas | `RhView` |
| **Planejamento** | Projeções e radar de compras | `PlanningView` |
| **Relatórios** | Analytics e KPIs | `RelatoriosView` |
| **Inventário** | Auditorias físicas | `InventarioView` |
| **IA Central** | Assistentes AI por módulo | `CentralIAView` |
| **Admin** | Usuários, empresas, logs, segurança | `AdminUsersView` |

---

## ⚡ Otimizações de Performance (Implementadas)

- `get_catalog_counts()` — uma RPC para contagens do catálogo (evita queries separadas com timeout).
- `produtos.saldo_atual` cacheado por trigger — ver princípio abaixo (fonte única da verdade).
- Índices em `movimentacoes_estoque` (company_id + produto_id + status).
- React Query: `staleTime: 3min`, `gcTime: 10min` (`App.tsx`).
- KPIs agregados (`Total R$`, `Qtd Total`) sempre via RPC com `SUM` no Postgres — nunca `.select()` sem `.limit()` + `.reduce()` no client (baixa a tabela inteira, cresce O(n)). Referência: `get_movimentacoes_kpis`.

---

## 🔧 Edge Functions (Supabase)

| Função | Propósito |
|--------|-----------|
| `admin-users` / `admin-create-user` | Gestão de usuários com RBAC |
| `admin-companies` | Gestão multi-tenant de empresas |
| `cmv` | Cálculo de CMV |
| `ficha-tecnica` | Fichas técnicas de receitas |
| `inventario` | Operações de inventário |
| `ai-chat` | Assistente IA central |
| `requisicao-estoque` | Requisições de estoque (estorno, notificação, ack) |
| `check-password` | Validação de senha (exige Bearer + rate limit) |
| `rbac-lint` (+ variantes `-full`/`-quick`) | Auditoria de permissões RBAC |
| `rh` | Recursos humanos |
| `purchase-requisitions` | Ordens de compra |
| `scheduled-jobs` | Jobs em background (cron) |
| `send-whatsapp-zapi` | WhatsApp da Cotação via Z-API (config por empresa em `cotacao_zapi_config`) |
| `cotacao-ia` | Assistente de IA da Cotação (chave por empresa em `cotacao_ia_config`) |

Todas as Edge Functions usam CORS compartilhado via `supabase/functions/_shared/cors.ts` (`getCorsHeaders()`, restringe a `ALLOWED_ORIGINS`) — nunca reintroduzir `Access-Control-Allow-Origin: '*'`.

---

## 📋 Convenções de Desenvolvimento

- **Commits**: `tipo(escopo): descrição` — ex: `fix(estoque): corrige timeout no catálogo`.
- **Idioma do código**: inglês para variáveis/funções, português para UI e comentários de negócio.
- **Migrações**: novo arquivo em `supabase/migrations/` com timestamp `YYYYMMDDHHMMSS_nome.sql`.
- **GRANTs obrigatórios em toda nova tabela**: `GRANT ALL ON TABLE public.<tabela> TO authenticated, service_role;` — sem isso o PostgREST nega SELECT direto do cliente mesmo com RLS permissiva (RPCs `SECURITY DEFINER` mascaram o problema; leitura direta falha em silêncio).
- **Aplicação de migrations**: preferir `supabase db push` (registra `version` = nome do arquivo). O CLI v2.75 quebra qualquer migration com `CREATE FUNCTION` seguido de outro statement (ex.: `GRANT`) — nesse caso usar MCP `apply_migration` + `supabase migration repair` para reconciliar o histórico.
- **Alterar parâmetros de função `SECURITY DEFINER` já em produção**: `DROP FUNCTION IF EXISTS` da assinatura antiga antes do `CREATE OR REPLACE` — assinatura de parâmetros diferente cria overload, não substitui.
- **Permissões novas**: adicionar em `src/permissions/registry.ts` + rodar `rpc_sync_permissions_from_registry()`.
- **Sem mock de banco**: testes de integração sempre usam banco real.
- **Sem amend em commits públicos**: sempre criar novo commit.
- **jspdf-autotable v5**: importar como `import autoTable from 'jspdf-autotable'` e chamar `autoTable(doc, {...})` — o padrão `(doc as any).autoTable({...})` não funciona na v5 em Vite/ESM.
- **CI**: GitHub Actions instala com Bun e lockfile congelado (`bun install --frozen-lockfile`).

---

## 🧭 Princípios e Decisões Arquiteturais

> Decisões que orientam código novo. Histórico detalhado: `git log` e `supabase/migrations/`.

- **`produtos.saldo_atual` é fonte única da verdade** — Toda RPC de leitura de saldo/valor de estoque consome o cache (mantido por trigger `fn_recompute_product_saldo`), nunca recalcula sobre `movimentacoes_estoque` (estornos `*_ESTORNO` divergem do ledger cumulativo). RPCs alinhadas: `get_stock_summary`, `get_stock_dashboard`, `get_relatorios_kpis`, `get_stock_predictive_analysis_v2`. Já regrediu 2x por migrations que "consertavam" outra coisa — **confira com `pg_get_functiondef` antes de assumir que está alinhada**.
- **PL/pgSQL só valida colunas na 1ª execução** — migration que altera RPC com JOIN deve incluir `DO`-block que força a resolução de colunas no `db push` (evita crash em produção em vez de no deploy).
- **Financeiro: RPCs `_guarded_`** — toda operação financeira (CP, CR, lançamentos, conciliação) usa prefixo `_guarded_`, `assert_tenant()`, `has_permission()`, optimistic lock via `updated_at`, log em `fin_audit_logs`. Deletes exigem `p_expected_updated_at` e gravam `entidade_id` como `uuid` nativo — **nunca `::text`** (cast explícito sobre variável uuid bloqueia o assignment cast do Postgres, erro 42804, reverte a transação inteira). Erros padrão: `OPTIMISTIC_LOCK_CONFLICT`, `LANCAMENTO_VINCULADO`, `STATUS_INVALIDO: %`, `PERMISSION_DENIED: %`, `NOT_FOUND` (helper client: `mapFinanceiroDeleteError`).
- **Fechamento de Caixa por marca é detalhamento, não nova receita** — `financeiro_fechamento_caixa.faturamento_bruto` continua a fonte oficial; `financeiro_fechamento_marca_valores` apenas decompõe esse total e deve somar exatamente o bruto via `rpc_upsert_fechamento_caixa_com_marcas`.
- **Conciliação Bancária (OFX/OFC)** — 3 destinos: `lancamento`, `conta_pagar`, `conta_receber`. Categoria obrigatória para Receita/Despesa (Transferência é exceção); vai no INSERT do lançamento (nasce `REALIZADO`+`conciliado=true`), **nunca via UPDATE pós-criação** (trigger de lançamento realizado exige justificativa nos campos vigiados). FITID é persistido no banco para reconhecer vínculos entre computadores diferentes; parser não pode colapsar transações legítimas repetidas. Transferências entre contas usam um único lançamento (não duplicam). Lista de Lançamentos usa paginação PostgREST completa (`range`), nunca `.limit(200)`; filtro padrão de período é resolvido no banco (90 dias, com opção de todo o histórico).
- **FITID de banco não é garantidamente estável entre exportações — não confiar nele como única defesa contra reimportação** — Santander e PagBank (confirmado; provavelmente outros) geram um FITID sintético que embute o timestamp do download (`ACCTID+DTSERVER+seq`), então baixar o mesmo extrato de novo troca o FITID de todas as linhas. Isso derrota o `idempotency_key` de `reconcile_import_lancamento`; no client, o dedup por conteúdo (`buildConciliadosCounts` em `src/lib/conciliacaoConciliados.ts`) só exclui lançamento cujo vínculo de FITID **aparece no arquivo atual** (esse será reivindicado pelo fast-path) — vínculo com FITID morto NÃO exclui, senão cada linha do histórico reaparecia como "Criar novo" a cada novo download (regrediu repetidas vezes até 2026-08-21). Causou 97 lançamentos duplicados em produção (2 contas, R$48.125,76) antes da correção. `reconcile_import_lancamento` agora tem uma 2ª camada: quando o FITID não bate com nada, verifica conteúdo idêntico (empresa+conta+tipo+valor+data+descrição) já conciliado e devolve `status:'possible_duplicate'` em vez de inserir — a UI exige confirmação explícita (`p_force_duplicate=true`) para tratar como venda legítima repetida no mesmo dia. Qualquer novo caminho que crie lançamento a partir de extrato bancário (nova instituição, nova Edge Function) precisa passar por essa mesma checagem — nunca confiar em FITID sozinho.
- **A comparação de descrição no dedup por conteúdo precisa colapsar espaços internos, não só acento/caixa** — o MEMO do OFX (confirmado no Santander) varia o espaçamento interno entre dois downloads do mesmo extrato (ex.: `"PIX RECEBIDO                       04740876000125"` vira `"PIX RECEBIDO     04740876000125"`), e `lower(immutable_unaccent(...))` sozinho não pega isso — nem `normalizeSearchText()` no client, que só remove acento/caixa. As duas metades da 2ª camada (`bankLineKey` em `src/lib/conciliacaoConciliados.ts` no client, e a query de `possible_duplicate` em `reconcile_import_lancamento` no servidor) precisam de `regexp_replace(..., '\s+', ' ', 'g')` além do lower+unaccent, senão reimportar o mesmo período nem mostra a linha como "já conciliada" na tela nem é barrado pela 2ª camada no servidor — insere um lançamento novo direto. Causou 143 lançamentos duplicados em produção (Santander Gm, R$68.495,55 receita / R$6.019,99 despesa) em 2026-08-28, corrigido na migration `20260828200906`.
- **`extratoParser.ts` normaliza na origem — cada banco implementa OFX do seu jeito e a descrição/valor viram chave de duplicata** — toda instabilidade no que o parser devolve vira lançamento duplicado, então a defesa mora no parser, não só nos comparadores: (1) descrição sai com espaços internos colapsados e sem caracteres de controle (`normalizeDescricao`); (2) **FITID nunca é fallback de descrição** — Santander/PagBank regeneram o FITID a cada download, então usá-lo como texto mudaria a descrição a cada exportação (ordem correta: `MEMO → NAME → CHECKNUM → "Sem descrição"`); (3) banco que exporta **TRNAMT sempre positivo** tem o sentido só em `<TRNTYPE>` — sem isso o extrato inteiro vira receita; a inferência só liga quando NENHUMA linha do arquivo é negativa e usa apenas TRNTYPE inequívoco (`DEBIT/FEE/SRVCHG/DIRECTDEBIT/CHECK`, nunca `XFER/PAYMENT/ATM/CASH`, que servem aos dois sentidos); (4) separador único com 3 dígitos (`"1.234"`) é milhar, não decimal — banco não emite 3 casas em BRL; (5) CSV com coluna `Saldo` exige ler a coluna de **valor** pelo cabeçalho e varrer da esquerda para a direita, senão o saldo acumulado vira o valor do lançamento; (6) arquivo com mais de um `ACCTID` **de origem** (ignorar `BANKACCTTO`, que é destino de TED) é sinalizado em `avisos[]` em vez de ter as transações misturadas na conta selecionada.
- **Extrato bancário é lido por bytes, não por `file.text()`** — `File.text()` decodifica sempre como UTF-8 e o extrato brasileiro costuma vir em Windows-1252 (o header OFX declara `CHARSET:1252`); os acentos viram U+FFFD e a descrição corrompida deixa de bater com o lançamento já conciliado. Usar `decodeExtratoBuffer(await file.arrayBuffer())`, que cai para Windows-1252 **pela evidência** (a decodificação UTF-8 produziu U+FFFD) e não pelo header — muitos bancos declaram 1252 e entregam UTF-8.
- **Checagem de "possível duplicata" por conteúdo tem que ser sensível a contagem, não só a existência** — quando o mesmo valor+data+descrição se repete legitimamente no extrato (comum em vendas de cartão — mesma bandeira, mesmo valor arredondado, várias vezes no dia) e só 1 já existia no razão, uma checagem "existe algum lançamento igual?" recusa TODAS as ocorrências extras como duplicata da mesma única existente — mesmo sendo vendas distintas. `reconcile_import_lancamento` recebe `p_occurrence_index` (calculado no client: nº de linhas da mesma `bankLineKey` já reconhecidas como "já conciliada" + posição desta linha dentro do lote) e só recusa se já existirem pelo menos `p_occurrence_index + 1` lançamentos com aquele conteúdo. Sem isso, R$9.007,93 (52 vendas legítimas do PagBank Gm) foram descartadas como duplicata em produção (2026-08-20) porque o usuário confiou no aviso e clicou "ignorar". Ao relançar venda descartada assim, **remover também o registro de `fin_conciliacao_ignoradas`** — senão a próxima importação marca a linha de novo como ignorada e o lançamento relançado fica sem vínculo.
- **A promoção da chave de idempotência legada → FITID nunca pode "roubar" lançamento já vinculado a outra linha do extrato** — a chave legada de `reconcile_import_lancamento` é por conteúdo e não distingue duas vendas idênticas do mesmo dia: a linha da 2ª venda promovia o lançamento da 1ª para o SEU FITID e retornava `duplicate` — a 2ª venda nunca nascia e as duas linhas ficavam cobertas por um só lançamento (15 vendas, R$3.060,15, invisível na UI porque ambas apareciam "já conciliada"). A guarda exige ausência de vínculo com outro `external_id` na conta antes de promover (migration `20260820213500`); no client, o fast-path de FITID em `matchLinha` consome cada `lancamento_id` no máximo uma vez por arquivo — a 2ª linha cujo vínculo aponta para um lançamento já reivindicado cai no fluxo de criação em vez de ficar verde.
- **Conferência de saldo pós-processamento é a rede final da conciliação** — o saldo final confirmado no upload (`ConfirmarSaldoExtratoDialog` devolve `{valor, data}`) fica em sessionStorage por conta, e um banner em Importar Extrato recompara `get_fin_saldo_conta_em(conta, data)` + linhas ainda pendentes contra o saldo do banco a cada mudança nas linhas. "0 p/ conciliar" na tela NÃO significa saldo correto (linha engolida/ignorada indevidamente também zera a fila) — só confiar com o banner verde.
- **Desconciliar (`unreconcile_lancamento`) limpa `fin_conciliacao_vinculos`, igual ao estorno de CP** — sem isso, o vínculo do FITID antigo sobrevive e exclui o lançamento das sugestões de match (`lancamentosVinculados`) mesmo depois de desconciliado; como o FITID muda a cada novo download (ver acima), a reconciliação seguinte não reconhece o FITID novo nem encontra o lançamento nas sugestões — e para lançamento `espelho_cp`/`espelho_cr` a checagem de duplicata por conteúdo também não pega (só olha `origem='conciliacao'`). Resultado: nasce um segundo lançamento para o mesmo pagamento.
- **Editar lançamento conciliado sem desconciliar é só reclassificação** — usar `_guarded_update_reconciled_classification`, que preserva `fin_conciliacao_vinculos` e permite apenas categoria, centro de custo, rateio e observações com justificativa; valor, datas, conta, tipo, status e descrição bancária exigem desconciliação, e espelhos CP/CR são editados no título de origem.
- **Conciliação × Contas a Pagar: a linha do extrato casa por `data_pagamento`, não por competência** — o espelho de CP/CR guarda a competência do boleto, que pode estar semanas antes da saída real; `computeScore` zera acima de 7 dias de diferença, então o matcher precisa comparar `COALESCE(data_pagamento, data_competencia)`. Espelhos já conciliados (`origem in espelho_cp/espelho_cr`) também entram como candidatos — as demais queries filtram `conciliado=false` e os esconderiam, fazendo a linha virar um 2º lançamento (R$ 4 mil duplicados em produção antes da correção). Match de espelho usa `reconcile_link_existing_lancamento` (vincula + grava FITID + adota conta nula), nunca cria lançamento. Lançamento já presente em `fin_conciliacao_vinculos` sai da lista de candidatos: duas linhas apontando para a mesma baixa escondem uma despesa real. **A mesma regra vale para TODO reconhecimento por conteúdo, não só o matcher de sugestões** — o fast-path "já conciliada" (`fetchConciliadosExtrato`/`conciliadosCounts` em `ConciliacaoBancariaSection.tsx`) e a checagem de "possível duplicata" por conteúdo em `reconcile_import_lancamento` também precisam de `data_pagamento` (não só `data_competencia`) e `origem IN ('conciliacao','espelho_cp','espelho_cr')` — sem os dois, um boleto pago com atraso e reimportado (sem FITID estável, ou via CSV) não bate como já existente e vira um 2º lançamento silencioso, sem nem passar pelo aviso de duplicata (corrigido na migration `20260820221500`).
- **Baixa de boleto pela conciliação: valor exato para casar sozinho, e sempre com revisão** — o match automático de CP/CR só ocorre com o valor batendo no centavo (a tolerância de 5% do `computeScore` casou boleto de um fornecedor com linha de outro), e o "Processar" abre revisão antes de baixar (sem ela, 21 contas foram baixadas em 3 segundos sem ninguém confirmar). Valor aproximado continua como sugestão manual.
- **Divergência entre boleto e extrato vira lançamento separado** — `reconcile_pay_conta_pagar` recebe `p_valor_extrato` e recusa a baixa com `DIVERGENCIA_VALOR` se a diferença não for classificada como JUROS/TARIFA/DESCONTO. O espelho mantém o valor e a categoria do boleto; a diferença nasce como `origem='ajuste_pagamento'` na categoria financeira (DESPESA se o banco debitou a mais, RECEITA se a menos). Assim a soma bate com o extrato sem poluir a categoria da mercadoria.
- **Desconto obtido não é faturamento** — a diferença a menor nasce tipo RECEITA e, em categoria operacional, entraria no total de RECEITAS do DRE/DFC. `reconcile_pay_conta_pagar` exige categoria cuja cadeia inteira até a raiz esteja marcada `excluir_dos_totais` (`fin_categoria_fora_do_resultado`, erro `CATEGORIA_OPERACIONAL`) e, sem categoria informada, usa a de sistema `Descontos Obtidos` sob RECEITAS NÃO OPERACIONAIS (`fin_get_categoria_desconto_baixa`). Duas engrenagens exigem isso ao mesmo tempo: `DemonstrativoTree` separa pela **raiz** (`calcNodeValue` soma a subárvore sem olhar o flag dos filhos) e os relatórios filtram `excluir_dos_relatorios`, que materializa o flag **da própria** categoria. Juros/tarifa continuam operacionais em Despesas Financeiras.
- **`fin_categorias.system_key` é reservado às duas raízes não operacionais** — `fin_prepare_category_reporting_class` recusa qualquer outro valor com `SYSTEM_CATEGORY_INVALID` e força nome/código/tipo das raízes; categoria de sistema nova identifica-se por raiz + nome. O mesmo trigger herda `excluir_dos_totais` do pai no INSERT/UPDATE, e `trg_fin_category_propagate_reporting_class` propaga para a subárvore.
- **Espelho de baixa não pode ser excluído, só estornado** — `_guarded_delete_lancamento` recusa lançamento com `referencia_modulo` de CP/CR cujo título está PAGO/RECEBIDO (`LANCAMENTO_ESPELHO`). Excluir não desfaz a baixa: o título fica PAGO sem despesa no razão (aconteceu com 4 contas, R$ 4.534,24).
- **Baixa de conta a pagar exige conta bancária** (`pay_conta_pagar`/`reconcile_pay_conta_pagar` → `CONTA_OBRIGATORIA`) — no cadastro do boleto continua opcional. Sem conta, o espelho nasce com `conta_id NULL`, some da conciliação (que filtra por conta) e o extrato traz a mesma despesa como nova.
- **Alterar `conta_id` de lançamento `REALIZADO` exige `justificativa_edicao` no mesmo UPDATE** — `trg_validate_fin_lancamento_update` vigia valor/categoria/conta/data/centro de custo e derruba a transação com P0003 sem ela.
- **Limite de aprovação de contas a pagar vem de `fin_config` por empresa** (`fin_get_limite_aprovacao`, fallback `app_config` → R$ 2.500). `app_config` é global e service-role-only — nunca usar para parâmetro que cada empresa ajusta. Editável em Contas a Pagar por quem tem `financeiro:pagar:approve`.
- **Estorno de CP limpa `fin_conciliacao_vinculos`** — sem isso o FITID continua apontando para o lançamento CANCELADO, a linha reaparece como "já conciliada" e o valor some do razão sem como relançar (mesmo princípio do `unreconcile_lancamento`, ver acima).
- **Rateio manda: quando o lançamento/CP/CR tem linhas em `fin_lancamento_rateios`, `categoria_id` do registro principal é ignorado** — DRE, DFC e KPIs somam o rateio e só caem no `categoria_id` do cabeçalho quando não existe rateio. Duas consequências: (1) reclassificar uma despesa rateada exige alterar as linhas do rateio, não só o cabeçalho (mudar só o cabeçalho não move nada no relatório); (2) `categoria_id IS NULL` não significa "sem categoria" — é o estado normal de registro rateado, e filtro/alerta de "Sem categoria" precisa excluir quem tem rateio. Rateio com `categoria_id` nulo, esse sim, cai em "Sem categoria — Despesas" (aconteceu com R$ 125,00 de um boleto em produção).
- **Rateio órfão só sai com os triggers desligados** — `trg_validate_rateio_sum` resolve o lançamento pai a cada DELETE/UPDATE e aborta com P0002 quando ele não existe, que é exatamente a condição do órfão. Limpar exige `set local session_replication_role = replica` dentro da transação (escopo de sessão, não afeta outras conexões); nunca `ALTER TABLE ... DISABLE TRIGGER`, que é global.
- **Categorias não operacionais** — raízes fixas `RECEITAS/DESPESAS NÃO OPERACIONAIS` (`fin_categorias.system_key`); `excluir_dos_totais` é herdado pela árvore e materializado em `excluir_dos_relatorios` nos lançamentos/CP/CR. DRE/DFC exibem como seção informativa fora do resultado; `get_fin_dashboard_summary` filtra o marcador nas receitas/despesas atuais e anteriores, mas **Saldo bancário/caixa permanece real e inclui tudo**.
- **DRE/KPIs (competência) × DFC/Dashboard/Apresentação Sócios — Resultados (caixa)** — as regras de data não podem se misturar. Dashboard e Resultados da Apresentação Sócios mostram `fin_lancamentos` REALIZADO/CONCILIADO pela data efetiva `COALESCE(data_pagamento, conciliado_em::date, data_competencia)`, excluindo transferências, não operacionais e conciliações pendentes; DRE/KPIs permanecem accrual (competência + CP/CR em aberto). Espelho de pagamento (`pay_conta_pagar`/`receive_conta_receber`) grava `data_pagamento` = data escolhida pelo usuário, **nunca `CURRENT_DATE`** (UTC desloca o mês à noite no BR). Lançamentos `origem='conciliacao'` ainda não conciliados (`conciliado=false`) são excluídos de todos os agregados de relatório — só o saldo acumulado/em caixa os inclui, pois reflete dinheiro real já movimentado.
- **Apresentação Sócios — metas e projeção** — no comparativo de plano, orçamento monetário vem só de `fin_orcamentos`, meta percentual de CMV só de `metas_cmv.meta_cmv_total` e realizado mantém a competência canônica; orçamento mais específico vence e pai/filho no mesmo mês é bloqueado, ausência nunca vira zero, contas em aberto ficam fora e projeção linear só existe com ao menos 7 dias observados.
- **Ritual executivo e atas são evidência de governança** — decisões e ações permanecem entidades canônicas da Fase 11; atas só as referenciam, e snapshots aprovados nunca viram fonte financeira viva.
- **Bundle**: `exceljs` (não `xlsx`, removido por advisories HIGH) em chunk separado (`vendor-excel` no `vite.config.ts`); exports usam `src/lib/safeXlsx.ts`. Seções raras do FinanceiroView são `React.lazy`.
- **Estoque: Ranking/Preditivo exibem em unidade de compra** (`get_stock_top_consumed`, `get_stock_predictive_analysis_v2` convertem via `fator_exibicao`). Ficha Técnica e Inventário permanecem em unidade contábil (base).
- **`get_stock_dashboard`: bucket `ok` exige `saldo > 0`** — os 4 buckets (ok/atencao/critico/sem_estoque) são mutuamente exclusivos.
- **`formatDateBR` existe em 2 módulos com semânticas diferentes** — `@/lib/datetime` retorna ISO (`yyyy-MM-dd`, para `<Input type="date">`); `@/lib/formatters` retorna `dd/MM/yyyy` (exibição). Importar do módulo errado quebra `<Input type="date">` (`RangeError: Invalid time value`).
- **Rótulo de mês a partir de `"yyyy-MM"` deve parsear como data local** — `new Date("yyyy-MM-01")` é UTC e recua um mês no BR. Usar `new Date(y, m - 1, 1)` (construtor de componentes) ou anexar horário (`+'T12:00:00'`).
- **INSERT em tabela multi-tenant exige `company_id` explícito no payload** (ver Multi-tenancy acima). Sempre `console.error` no catch antes do toast — toasts genéricos mascaram a causa raiz.
- **Requisições de Estoque**: critério de "pendente" é `hasPendingItems(itens)` (`src/domain/estoque/requisitionStatus.ts`), nunca `status` isolado (um pedido `PARCIALMENTE_ATENDIDA` pode não ter nenhum item `SOLICITADO` aberto). Encerramento dispara notificação modal bloqueante via `NotificationsProvider`/`RequisicaoNotificationModal`.
- **Cotação (RFQ)** — sub-módulo de Compras completo: CRUD, respostas/matriz comparativa, sugestão inteligente (função pura e determinística em `src/domain/compras/cotacaoOptimizer.ts` — a IA só anota, nunca decide números), WhatsApp via Z-API (config por empresa, token só no banco), IA multi-provider (reusa `ai-chat`/Gemini), conversão em pedido via RPC atômica `create_purchase_orders_from_cotacao_atomic` (1 `purchase_orders` por fornecedor vencedor, só INSERT — não toca recebimento/estoque).
- **Salmão: exclusão é cancelamento idempotente** — `salmon_entries`/`salmon_manipulations` usam soft-cancel via RPCs atômicas, que também cancelam o movimento de estoque vinculado. Esse movimento pode ser cancelado *fora* do módulo (em Movimentações), o que cascateia de volta e dessincroniza a lista local do `useSalmonStore`. O delete no Salmão detecta "já cancelado" (`isAlreadyCancelledError`) e trata como no-op — não remover a cascata do lado de Movimentações, ela evita órfãos.
- **Conciliação: contrapartida de transferência** — uma transferência é **um único** `fin_lancamentos` (`conta_id`=origem, `conta_destino_id`=destino); o Livro Razão e os saldos já a leem nas duas contas. O matcher genérico (`matchLinha`) compara `tipo` (`RECEITA`/`DESPESA` vs `TRANSFERENCIA`) e por isso nunca casa a contrapartida sozinho — a cobertura são três camadas: `matchTransferCandidate` (`src/lib/conciliacaoTransferMatch.ts`, casa por valor/data/direção sem depender de FITID, cobre CSV), guard de idempotência em `reconcile_create_transfer` (reaproveita transferência `REALIZADO` do mesmo par/valor em janela de 3 dias) e `reconcile_auto_bind_transfer_counterparts` (grava o vínculo FITID da 2ª conta). Quando nenhum candidato é inequívoco, `findTransferWarnings` avisa na própria linha em vez de deixá-la parecer nova — foi assim que a mesma transferência acabou duplicada/triplicada em produção.
- **`min()` não existe para `uuid` no Postgres** — para escolher "o id do candidato mais próximo" use `(array_agg(id ORDER BY id))[1]`. `min(id)` sobre uuid passa no `CREATE FUNCTION` e só quebra na chamada real (42883 `function min(uuid) does not exist`), derrubando a RPC inteira: foi o que manteve "Marcar como Transferência" e o auto-bind de contrapartida quebrados por dias (migration `20260818150000`).
- **Design System (azul/branco/preto)** — tokens HSL em `src/index.css` (valores) + `tailwind.config.ts` (mapeamento de classe), consumidos via `hsl(var(--token))`; **nunca hex em componente** e nunca `dark:` avulso (falta de token, não é caso de usar `dark:`). `--primary` varia por tema e é **AA como texto nos dois** (light `#2563EB`, dark `#3B82F6`) — por isso `text-primary`/`border-primary` estão corretos em qualquer tela. Superfície com **label pequeno** (botão preenchido, chip com texto) usa `--primary-strong` (mesmo valor nos 2 temas, branco 5,2:1), nunca `bg-primary`; azul como **texto pequeno** usa `--primary-ink`. `--info` é ciano-azulado, desacoplado do `--primary`. Nunca `--border` branco puro no dark. Nunca usar opacidade (`text-x/40`, `bg-x/10`) para hierarquia semântica — usar o token `-soft`/`-border`/`muted` correto (exceções já aceitas: ícone grande de empty/error state, hover-darken de botão sólido, skeleton `animate-pulse`). Não renomear a classe legada `.glow-salmon` (2 usos reais, alerta de estoque crítico) — o nome é legado, o valor já é azul; os tokens `--gold*`/`--gradient-gold`/`.text-gradient-salmon`/`.gradient-salmon`/`.gradient-brand`/`--gradient-brand` **foram removidos** (Fase 11 e follow-up) por ficarem sem nenhum consumidor real — CTA primário usa `bg-primary-strong` diretamente. Os 4 arquivos de export do Modo Apresentação (`src/lib/presentationPdfExport.ts`, `presentationPptxExport.ts`, `presentationMinutesPdfExport.ts`, `presentationMinutesPptxExport.ts`) têm paleta de cor **impressa e literal, intencionalmente fora do sistema de tokens** (jsPDF/pptxgenjs exigem string de cor, não CSS var) — nunca migrar para `hsl(var(--token))`. Referência completa: `docs/redesign/01-DESIGN-SYSTEM.md`.

---

### Componentes Padronizados
- **TableActions** (`components/ui/TableActions.tsx`) — botões Editar/Excluir com RBAC e diálogo de confirmação; usar em toda tabela de gerenciamento.
- **FormCloseConfirmDialog** + `useFormDirtyGuard` — previne perda de dados em formulários.
- **SearchableSelect** (`components/ui/SearchableSelect.tsx`) — usar em todo select com 10+ opções (produtos, categorias, locais, usuários, fornecedores).
- **NotificationsProvider** (`src/contexts/NotificationsContext.tsx`) — instância única de `useNotifications`, montada em `App.tsx`. Nunca instanciar `useNotifications` de novo dentro do Provider (duplica subscription Realtime).
- **RequisicaoNotificationModal** — `AlertDialog` global bloqueante para requisições encerradas.
- **DateRangePresets** (`components/financeiro/DateRangePresets.tsx`) — atalhos de período em strings `yyyy-MM-dd`, importar de `@/lib/datetime`. Query consumidora deve tratar `from`/`to` vazio condicionalmente (`.gte()` com string vazia quebra no Postgres).
- **MonthNavigator** (`components/financeiro/MonthNavigator.tsx`) — navegação de mês (setas + select), aritmética pura em `yyyy-MM` (sem passar por `new Date`).
- **DateInput** (`components/ui/DateInput.tsx`) — usar em todo campo de data financeira (nunca `Input type="date"` cru) — limita ano a 4 dígitos, backstop de um CHECK constraint no banco.
- **Campos monetários** — estado numérico usa `BRLInput`; estado string usa `CurrencyInput` e salva com `normalizeBRLMoneyToNumber()`; nunca converter moeda formatada com `Number`/`parseFloat` nem atualizar estado numérico a cada tecla.
- **SubmoduleSwitcher** (`components/ui/SubmoduleSwitcher.tsx`) — obrigatório para navegação de sub-módulos (substitui fileira horizontal de botões).
- **KpiCard** (`components/ui/KpiCard.tsx`) — fonte única de card de indicador (`variant` semântico, `delta` opcional para comparação com período anterior); não criar card de indicador local a uma tela.
- **StatusBadge** (`components/ui/StatusBadge.tsx`) — mapa de status→variante semântica (`success/warning/danger/info/neutral`); preferir a um `Record`/mapa de cor local quando o domínio bate 1:1 nas 5 variantes.
- **DatePicker** / **DateRangePicker** (`components/ui/DatePicker.tsx`) — popover+calendário para campo `Date` único ou intervalo `from`/`to` ISO; não recompor `Popover`+`Calendar` manualmente.
- **ChartCard** / **ChartTooltip** / **ChartLegend** + `src/lib/chartTheme.ts` — camada central de gráficos Recharts (cores de série, grade, eixo, tooltip, formatação BRL/%/qtd). Todo gráfico novo consome daqui, nunca `contentStyle`/cor inline.
- **SegmentedControl** / **ModuleNav** (`components/ui/`) — grupo de opções exclusivas (`Mês|Ano|Total` etc.) e navegação de módulo em 2 níveis; **PageHeader** (`components/ui/PageHeader.tsx`) para cabeçalho de conteúdo de tela (título+ação, distinto do header global do `AppLayout`).

### Padrões de Busca de Texto (OBRIGATÓRIO)

> Bloqueado por ESLint (`no-restricted-syntax`). Toda nova busca de texto na UI **DEVE** seguir este padrão.

- **Cliente:** `includesNormalized(haystack, needle)` ou `normalizeSearchText(text)` de `@/lib/utils`. Nunca `.toLowerCase().includes()`.
- **Servidor (`.ilike()` / RPC):** buscar em coluna `*_unaccent` e normalizar o termo cliente-side com `normalizeSearchText()` antes de enviar — `ILIKE` não remove acentos.
- **Combobox / cmdk:** `filter={(val, search) => normalizeSearchText(val).includes(normalizeSearchText(search)) ? 1 : 0}` — o default do cmdk não normaliza acentos.
- **Edge Function (Deno):** mesma regra, normalizar termo inline (sem import de `@/lib/utils`).
- **Casos legítimos não-busca** (path de arquivo, uuid::text): justificar com `// eslint-disable-next-line no-restricted-syntax -- <motivo>`.

---

## ⏳ Pendente / Em Aberto

- [ ] Verificação visual em navegador real (light/dark, todos os breakpoints) do redesign — nenhuma das 11 fases teve acesso a Playwright/credenciais neste ambiente; recomendado antes do próximo deploy de UI
- [ ] Conceder permissão `inventario:detalhe:export` aos roles Admin/Conferente/Gerente via Admin → Permissões
- [ ] Monitorar integridade dos dados na empresa piloto após ativação multi-tenant
- [ ] Testar fluxo completo: criar empresa → criar admin → login admin → criar usuários
- [ ] Validar isolamento: logar como user do tenant A e tentar `GET /rest/v1/faturamento_periodos_legacy` — deve retornar só registros do mesmo tenant
- [ ] Dropar tabelas `*_bkp_reset_20260301` (18 tabelas) e `z_canary_test`
- [ ] Auditar outras telas (Compras, CMV, Financeiro, Relatórios) por padrão `select sem limit + reduce client`
- [ ] Auditar outros INSERTs diretos via PostgREST em tabelas multi-tenant sem `company_id` explícito
- [ ] Conciliação: permitir override de competência no lançamento criado pela conciliação (`p_competencia` em `reconcile_import_lancamento`)
- [ ] Otimizar `rbac_sql_lint_report()` completo para não estourar `statement_timeout` em produção (`bun run security:check` usa o fallback `rbac_sql_lint_report_quick()`)

---

## 📖 Documentação Adicional

- **Arquitetura completa**: `docs/ARCHITECTURE.md`
- **Regras de negócio**: `docs/DOMAIN_RULES.md`
- **Padrões de segurança**: `docs/ENTERPRISE_SAFE_STANDARDS.md`
- **RBAC playbook**: `docs/rbac/playbook-operacional.md`
- **Design system visual (concluído)**: `docs/redesign/01-DESIGN-SYSTEM.md` (referência de tokens/contraste) e `docs/redesign/PROGRESSO.md` (histórico das 11 fases e decisões)
- **Histórico detalhado de tarefas**: `TAREFAS.md`
