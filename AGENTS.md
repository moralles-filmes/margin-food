# Contexto do Projeto Moralles Food

> **Leia este arquivo primeiro.** Entrada única para Claude Code (o `CLAUDE.md` importa `@AGENTS.md`) e Codex. Padrão SaaS v3.1. Edite só o AGENTS.md.
> Aqui fica só o que todo agente precisa em qualquer tarefa. Regras de um módulo: `docs/modules/<modulo>.md`. Detalhe de um assunto: "Particularidades deste projeto" em `docs/standards/`. Meta: menos de 200 linhas.

## 1. Projeto

- Produto: ERP de restaurantes multiunidade (Moralles Food / Margin Food): Estoque, Movimentação Operacional, Compras e Cotação, Financeiro (CP/CR, conciliação bancária, DRE/DFC), CMV, Ficha Técnica, RH, Salmão, Inventário, Planejamento, Relatórios e IA.
- Usuários: equipes de cada unidade (gestão, financeiro, compras, estoque, operação), sócios e a administração da plataforma (Moralles).
- Criticidade: movimenta dinheiro (baixa de boletos, conciliação), envia WhatsApp a fornecedores (Z-API), guarda dados pessoais (CPF, salário, documentos de RH) e envia contexto a LLM externo.
- Modo: existente (A). **Nível de maturidade: N2 — operação crítica** (aprovado em 2026-10-07; ver §5).
- Padrões não adotados: `GCP_MIGRATION` (portabilidade para Google Cloud é objetivo futuro, sem data; reavaliar quando houver) e `PUBLIC_API` (não há API nem chaves emitidas a clientes).

## 2. Stack, runtime e fontes de verdade

**Frontend:** React 18 + TypeScript 5, Vite 8 + SWC, shadcn/ui + Radix UI, Tailwind CSS 3, React Router DOM 6, TanStack React Query 5, Recharts 3, Sonner, jsPDF + ExcelJS (export PDF/Excel), vite-plugin-pwa, Vitest 4, Bun 1.3 (`bun install`, `bun run dev`). Versões instaladas: `bun.lock`. Não há React Hook Form nem Zod no `package.json`.

**Backend:** Supabase — PostgreSQL 17 com RLS global, Supabase Auth (email/senha), PostgREST + RPCs customizadas (30+), Edge Functions (Deno/TypeScript), Realtime (`postgres_changes`), Storage.

- Runtime de servidor: Vite SPA + RPCs `SECURITY DEFINER` + Edge Functions Deno (lista em INTEGRATIONS, "Particularidades"). Lockfile canônico: `bun.lock`.
- Ordem de confiança: código e banco vivo > manifests > documentação. Se a documentação divergir do código, reporte a divergência em vez de segui-la às cegas.

| Serviço | Identificador |
|---------|--------------|
| GitHub | `https://github.com/moralles-filmes/margin-food` |
| Supabase Project ID | `wuzxpbixprrgssoeeaez` |
| Supabase URL | `https://wuzxpbixprrgssoeeaez.supabase.co` |
| Supabase Dashboard | `https://supabase.com/dashboard/project/wuzxpbixprrgssoeeaez` |
| Deploy | Vercel (auto-deploy no push para `main`) |

## 3. Arquitetura e estrutura

```
src/components/<modulo>/  telas por módulo (algumas Views ainda na raiz de components/)
src/domain/<modulo>/      regras puras e invariantes testáveis
src/hooks/ src/contexts/  estado, AuthContext, CompanyScopeProvider, notificações
src/lib/                  utilitários (formatters, datetime, conciliação, exports)
src/integrations/supabase/  cliente por empresa e tipos gerados
src/permissions/          registry RBAC, ações, validação
supabase/migrations/      migrations (YYYYMMDDHHMMSS_nome.sql); functions/: Edge Functions
release/                  pacote forward F12 aplicado em produção (fora de migrations/)
docs/standards/           Padrão SaaS v3.1 (normativo; só "Particularidades" se edita)
docs/modules/ docs/adr/   regras por módulo e decisões
.claude/                  tenancy-profile.yml, rules/, settings.json
TAREFAS.md                pendências (Próximas Tarefas) e histórico concluído
```

- Regra de negócio crítica mora em RPCs `SECURITY DEFINER` (`_guarded_*`, `*_atomic`, `op_*`, `reconcile_*`), Edge Functions e funções puras de `src/domain/`. Não há camada própria de casos de uso no servidor.
- Trabalho assíncrono: não há runner configurado. A Edge `scheduled-jobs` existe, mas nenhum agendador a chama.
- **`supabase db push` está bloqueado desde o release F12 — NUNCA rode o `migration repair` que o CLI sugere** (apagaria o registro do release e aplicaria candidatas superadas em produção). Migration nova vai por MCP `apply_migration` + `supabase migration repair` na mesma sessão. Procedimento completo: DATABASE, "Particularidades".

## 4. Modelo de acesso (resumo)

- Declarado em `.claude/tenancy-profile.yml`: **híbrido A/C**, não o arquétipo E dos exemplos do padrão. Sem filial: "Unidade" na interface é a empresa ([ADR-0001](docs/adr/0001-unidade-e-empresa-sem-filial.md)).
- Tenant `company_id`. A empresa ativa vem do estado do cliente, no header `x-company-id` (um cliente Supabase por empresa), confirmada no banco por `get_current_company_id()` (membership ativa + empresa ativa). `profiles.company_id` é legado, nunca preferência de navegação.
- Dado operacional usa `useSupabase()`/`CompanyScopeProvider`, nunca o cliente global. RPC `SECURITY DEFINER` usa `assert_tenant()` e filtra `company_id = assert_tenant()` em toda busca por id.
- Tabela nova: RLS habilitada e forçada, GRANT só do DML necessário, helpers (`get_current_company_id`, `has_permission`, `has_any_permission`) sempre dentro de `(select …)` na policy.
- Permissões `<módulo>:<submódulo>:<ação>` com as 11 ações de `src/permissions/actions.ts`, por empresa, com ALLOW/DENY (DENY vence). Registry em `src/permissions/registry.ts` → `sync_permissions_from_registry`. O banco não expande `LEGACY_PERMISSION_MAP`: todo gate do banco usa `has_any_permission([<chave granular da tela>, <legado>, 'system:global:manage'])`, com chave que exista no registry.
- Super admin (`system:global:manage`) administra a plataforma, sem acesso implícito a dados de unidade. Concessão só por `admin_upsert_company_membership`/`admin-users`.
- **Precedência:** quando um exemplo do padrão (URL com a empresa, helpers em `private`, chaves com ponto, `company_modules`, filial) divergir de uma regra deste arquivo, vale este arquivo até existir ADR. Reporte a divergência; não migre o modelo como efeito colateral de outra tarefa.
- Detalhes: MULTI_TENANCY, ACCESS_CONTROL e SECURITY ("Particularidades").

## 5. Como aplicar os padrões

- Normas em `docs/standards/` (corpo copiado do kit, não editar; adaptações só em "Particularidades deste projeto").
- Níveis das regras: **[N1]** base, sempre que o fluxo protegido existir; **[N2]** operação crítica; **[N3]** escala, só com necessidade medida. Este projeto é **N2**: valem as regras N1 e N2 dos fluxos que existem. Controles N1 de um fluxo existente nunca são dispensados.
- Não adicione infraestrutura, troque a stack ou amplie escopo só para preencher checklist. Em tarefa sensível, classifique os requisitos como APLICÁVEL, NÃO APLICÁVEL (com justificativa) ou PENDENTE.
- **Regras por caminho:** `.claude/rules/` (Claude Code; banco, integrações, segurança e uma por módulo) e os AGENTS.md aninhados para o Codex (`supabase/`, pastas de módulo em `src/`; alvos em `.claude/nested-agents.json`), gerados por `node scripts/check-padrao.mjs --write-nested`. Conferência: `node scripts/check-padrao.mjs`.
- **Riscos e achados:** P0 (bloqueia) · P1 (alto) · P2 (médio) · P3 (baixo), com evidência e marcados CONFIRMADO, INFERIDO ou NÃO CONFIRMADO. Nunca declare como testado o que não rodou.

## 6. Segurança — vale em toda tarefa

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

- Não desabilite nem afrouxe RLS, policy ou grant para "fazer funcionar". O frontend (`useCan`) é só UX.
- Service role / secret key só na Edge Function, depois de resolver tenant e permissão com o JWT do usuário, filtrando `company_id` em toda query.
- Testes, CI e preview deployments nunca disparam WhatsApp, chamada paga de IA ou outro efeito real (preview fala com o Supabase de produção).
- Deploy, push, merge, migration remota e alteração destrutiva exigem autorização explícita na conversa. Produção é somente leitura pelos MCPs.

## 7. Comandos oficiais

```text
install:    bun install --frozen-lockfile
dev:        bun run dev
lint:       bun run lint
typecheck:  bunx tsc --noEmit -p tsconfig.app.json   (não há script; o build com SWC não confere tipos)
test:       bun run test
test db:    scripts/test-* com o SQL de supabase/tests/database/ (fora do CI)
build:      bun run build
rbac:       bun run rbac:lint · bun run security:check
padrão:     node scripts/check-padrao.mjs
```

## 8. Roteador de documentação

Leia este arquivo e, depois, só o que a tarefa exige (a união, se tocar vários assuntos).

| Tarefa | Ler |
|---|---|
| Bug ou ajuste em um módulo | `docs/modules/<modulo>.md` + testes relacionados |
| Migration, RPC, policy, índice, query | `DATABASE` + `MULTI_TENANCY` |
| Permissão, papel, usuário, menu por permissão | `ACCESS_CONTROL` + `MULTI_TENANCY` |
| Auth, RLS, dados pessoais, audit log, Storage | `SECURITY` + `MULTI_TENANCY` |
| Edge Function com provedor, Z-API, IA | `INTEGRATIONS` + `docs/integrations/providers/` + `SECURITY` |
| Módulo novo ou mudança de contrato | `MODULES` + `ARCHITECTURE` + `ACCESS_CONTROL` |
| Empresas, onboarding | `TENANT_LIFECYCLE` |
| Lentidão, bundle, agregados | `PERFORMANCE` |
| Testes, CI / deploy, incidente, Git | `TESTING` / `OPERATIONS` |

| Módulo | Documento |
|---|---|
| Financeiro (CP/CR, Livro Razão, fechamento, DRE/DFC, Borderô, CMV Financeiro) | `docs/modules/financeiro.md` |
| Conciliação bancária (extrato OFX/CSV) | `docs/modules/conciliacao.md` |
| Apresentação Sócios | `docs/modules/apresentacao-socios.md` |
| Estoque Geral (catálogo, movimentações, requisições) | `docs/modules/estoque.md` |
| Movimentação Operacional | `docs/modules/operacional.md` |
| Compras e Cotação | `docs/modules/compras.md` |
| Centro de CMV (CMV de estoque, Edge `cmv`) | `docs/modules/cmv.md` |
| Ficha Técnica e precificação | `docs/modules/ficha-tecnica.md` |
| RH | `docs/modules/rh.md` |
| Salmão | `docs/modules/salmao.md` |
| Planejamento (metas de compra) | `docs/modules/planejamento.md` |
| Relatórios | `docs/modules/relatorios.md` |
| Inventário | `docs/modules/inventario.md` |
| IA Central (`ai-chat`) | `docs/modules/ia.md` |
| Admin e Configurações (usuários, empresas, logs, integrações) | `docs/modules/admin.md` |
| Componentes, busca de texto, números, design system | `docs/modules/ui.md` |

Documentação adicional:

- **Arquitetura completa**: `docs/ARCHITECTURE.md`
- **Regras de negócio**: `docs/DOMAIN_RULES.md`
- **Padrões de segurança**: `docs/ENTERPRISE_SAFE_STANDARDS.md`
- **RBAC playbook**: `docs/rbac/playbook-operacional.md`
- **Design system visual (concluído)**: `docs/redesign/01-DESIGN-SYSTEM.md` (referência de tokens/contraste) e `docs/redesign/PROGRESSO.md` (histórico das 11 fases e decisões)
- **CMV Financeiro**: `docs/cmv-financeiro/PLANO.md` (diagnóstico e decisões) e `docs/cmv-financeiro/PROGRESSO.md` (fases, ativação e reversão)
- **Histórico detalhado de tarefas**: `TAREFAS.md`

## 9. Como trabalhar

1. Investigue antes de alterar: fluxo, contratos, testes, banco, tenant, permissões e integrações envolvidos.
2. Faça a menor mudança correta, preservando o comportamento fora do escopo. Nada de refactor paralelo nem abstração prematura.
3. Valide de forma proporcional ao risco, com os comandos do §7. Nunca declare como testado o que não rodou: `NÃO EXECUTADO — Motivo: … Impacto: … Como validar: …`.

- **Commits**: `tipo(escopo): descrição` — ex: `fix(estoque): corrige timeout no catálogo`.
- **Idioma do código**: inglês para variáveis/funções, português para UI e comentários de negócio.
- **Sem amend em commits públicos**: sempre criar novo commit.

## 10. Continuidade e manutenção deste arquivo

- Este arquivo é contexto operacional, não um diário de bordo. Antes de adicionar qualquer coisa, pergunte: *"um agente futuro precisa disso para não repetir um erro caro, ou consegue descobrir isso lendo o código / `git log` / `TAREFAS.md`?"* Se consegue descobrir sozinho, **não escreva aqui**.
- Só vale uma entrada nova se for: (a) uma regra de negócio ou invariante que o código sozinho não deixa óbvio, (b) uma armadilha que já causou bug em produção e pode se repetir, ou (c) uma decisão arquitetural que orienta código novo.
- Escreva a regra e, se precisar, o motivo em **uma linha**. Não narre o processo de investigação ("testado com X, confirmado via Y, verificado ao vivo simulando Z") — isso é para a mensagem de commit, não para cá.
- **Sem limite de tamanho fixo** — mas isso não é licença para inflar. O critério é sempre "é necessário para o sistema", nunca "documentar o que eu fiz agora".
- Pendências ficam em `TAREFAS.md` → "Próximas Tarefas"; item concluído sai de lá (o histórico já mora em `git log` e na seção "Concluído").
- Ao corrigir/atualizar uma regra existente, **substitua** o texto antigo — não empilhe um novo parágrafo "REVISÃO" em cima do anterior.
- Onde guardar conhecimento: regra de um módulo → `docs/modules/<modulo>.md`; de um assunto → "Particularidades" do padrão; decisão arquitetural → `docs/adr/`; regra que todo agente precisa em toda tarefa → este arquivo; temporário → `.tasks/`.
- Em tarefa longa, mantenha `.tasks/<slug>/STATE.md` (fora do Git) e, ao retomar, confira-o contra `git status` e `git diff`. Estado de ferramentas: `.tasks/`, `.saas-audit/`, `.turbo/`, `.ai-router/`.

## 11. Encerramento

- Tarefa simples: o que mudou + validação executada.
- Tarefa sensível (dados, permissões, dinheiro, integrações, produção): Alterado · Preservado · Validação (só o que rodou) · Segurança · Desempenho (ou NÃO MEDIDO) · Documentação · Pendências reais.

## 12. Invariantes — valem em qualquer tarefa

- **Banco e Edge Functions rodam em UTC — dia de negócio é sempre `(now() AT TIME ZONE 'America/Sao_Paulo')::date`**, nunca `CURRENT_DATE`/`now()::date`, e timestamptz vira data com `(col AT TIME ZONE 'America/Sao_Paulo')::date`, nunca `col::date` (depois das 21h BRT o dia UTC já é o seguinte). Vale para corpo de RPC, default de parâmetro e default de coluna; na Edge Function usar `Intl.DateTimeFormat` com `timeZone`, pois `getDate()` devolve o dia UTC. Os corpos antigos em `supabase/migrations/`/`release/` ainda têm `CURRENT_DATE` — ao copiar uma função de lá, trocar; `migrationsDataNegocioFuso.test.ts` barra migration nova com o padrão UTC (correção em massa: `20260928144950`).
- **INSERT em tabela multi-tenant exige `company_id` explícito no payload** (ver Multi-tenancy acima). Sempre `console.error` no catch antes do toast — toasts genéricos mascaram a causa raiz.
- **Idempotência exige índice único** — check-then-insert sozinho não é idempotente: toda RPC que aceita chave de idempotência tem índice único que a garante (ex.: `uq_mov_operacional_request`), e a `unique_violation` é tratada como reenvio. A chave identifica a OPERAÇÃO, não a tentativa: no cliente é derivada de semente + conteúdo (`useChavesPendentes` sobre `criarChavesPendentes` de `@/lib/chaveOperacao`), confirmada só no sucesso daquele conteúdo; o servidor compara o conteúdo no reenvio (`REQUEST_ID_REUTILIZADO`). Efeito colateral depois do commit nunca vira erro na resposta. Regra completa: DATABASE, "Particularidades".
- **Envio externo sem deduplicação no provedor** (WhatsApp, chamada paga de IA) registra a tentativa antes de enviar e trata resultado ambíguo como `UNKNOWN` (INTEGRATIONS, "Particularidades").
- **Nunca devolver `supabase.rpc` solto de um helper** — o método depende do `this`; sem `.bind(supabase)` toda chamada estoura no navegador antes da requisição (derrubou CMV e Contas a Pagar em produção), e mock de função solta não pega: o teste precisa de um cliente cujo `rpc` use `this`. Chamada opcional carregada junto com dados essenciais (`fetchCmvConfig` no `Promise.all` de Contas a Pagar) nunca lança.
- **UPDATE/DELETE por PostgREST que a RLS descarta volta 0 linhas SEM erro** — a tela que confirma sucesso confere `.select('id')` e `data.length` antes do toast (Prontuário, Escala e parâmetros do Salmão mostravam "atualizado" sem gravar); o UPDATE com `WHERE` também exige que a linha passe na policy de SELECT.
- **Número formatado em pt-BR nunca volta para campo numérico editável** — `formatarQuantidade` agrupa milhar e `parseQuantidade` relê o ponto como decimal (gravava ~1000x menos sem erro); campo editável usa `quantidadeParaCampo` (`useGrouping: false`). Moeda: `BRLInput`, ou `CurrencyInput` salvo com `normalizeBRLMoneyToNumber()`; nunca `Number`/`parseFloat` sobre texto formatado. Detalhes: `docs/modules/ui.md`.
- **Nome e descrição digitados passam por `padronizarTexto`** (`src/lib/padronizarTexto.ts`) no valor enviado ao banco, nunca por trigger: RPCs idempotentes comparam o texto exato no reenvio. Exceções (extrato bancário, transferências, nome copiado em outras tabelas) e backfill: `docs/modules/ui.md`.
- **Busca de texto sem acento**: `includesNormalized`/`normalizeSearchText` de `@/lib/utils`, nunca `.toLowerCase().includes()` (ESLint bloqueia); no servidor, coluna `*_unaccent`. Detalhes: `docs/modules/ui.md`.

<!-- ai-router-br:start -->
## AI Router BR
When ai-router-br is available (Claude Code skill `ai-router-br:route`, Codex skill `$ai-router`), classify substantial work by risk/cost before executing. Keep critical/security/architecture decisions with the main agent; delegate only when beneficial; external-worker output must be tested and reviewed before integration. Never place secrets in router state.
<!-- ai-router-br:end -->
