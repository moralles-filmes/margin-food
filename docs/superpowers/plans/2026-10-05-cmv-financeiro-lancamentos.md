# CMV Financeiro com despesas de Lançamentos e Conciliação — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer as despesas de `fin_lancamentos` (Livro Razão e Conciliação Bancária) entrarem no CMV Financeiro pela data de competência, com a mesma decisão por linha "Aparecer no CMV financeiro?" que o boleto já tem, sem contar nada duas vezes.

**Architecture:** uma fonte só. Uma função interna nova (`_fin_cmv_linhas_fontes`) une as linhas dos boletos (inalteradas) e as das despesas de `fin_lancamentos`. Relatório, lista, classificação, "Aplicar padrões" e PDF passam a ler dessa união. A decisão fica na linha de rateio (`fin_lancamento_rateios.cmv_incluir`, coluna que já existe) ou, sem rateio, numa coluna nova `fin_lancamentos.cmv_incluir`. As RPCs de gravação (conciliação, Livro Razão e reclassificação) passam a aceitar a resposta e a competência própria. O frontend só mostra os controles novos quando `get_fin_cmv_config` informa `recursos.lancamentos = true`.

**Tech Stack:** PostgreSQL 15+/Supabase (plpgsql, SECURITY DEFINER), React 18 + TypeScript 5, Vitest + Testing Library, PostgreSQL 16 local descartável para os testes de banco (`psql`).

**Spec:** [`docs/superpowers/specs/2026-10-05-cmv-financeiro-lancamentos-design.md`](../specs/2026-10-05-cmv-financeiro-lancamentos-design.md). Leia a spec antes de cada tarefa: ela tem as decisões e o porquê.

## Global Constraints

- Trabalhe **só** na worktree `C:\Users\Yuri\Documents\Desenvolvedor\margin.food\.claude\worktrees\cmv-lancamentos` (branch `feat/cmv-financeiro-lancamentos`, base `release/redesign-v2-f01-f05b`). Há outras sessões no checkout principal. Nunca use `git stash` sem tag.
- Migration nova: `supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql`. O nome **não** pode terminar em `_cmv_financeiro.sql`, porque `src/test/cmvFinanceiroMigration.test.ts` exige um único arquivo com esse sufixo.
- Toda função `SECURITY DEFINER` usa `SET search_path = '...'`, com `=`. O hook `check-sql-antipattern` do saas-shield barra a escrita do arquivo com `TO`.
- Nada de `CURRENT_DATE`, `now()::date` ou `<timestamptz>::date` em migration: `src/test/migrationsDataNegocioFuso.test.ts` reprova. O dia de negócio é `(now() AT TIME ZONE 'America/Sao_Paulo')::date`.
- **Nunca** rode `supabase db push` (bloqueado pelo release F12, ver CLAUDE.md). A migration é aplicada só na Tarefa 12, pelo SQL Editor, com autorização do usuário.
- O contrato do relatório continua `'cmv-financeiro/v1'` e só ganha campos. O parser atual recusa qualquer outra versão.
- `p_data` de `reconcile_import_lancamento` é **sempre** a data do banco: ela entra na chave de idempotência e na checagem de "possível duplicata". A competência própria vai só em `p_data_competencia`.
- `NULL` em `cmv_incluir` = pendente, **nunca** "Sim". `fin_categorias.cmv_sugerir` só sugere; nenhuma apuração lê essa coluna.
- A decisão só é gravada por RPC `SECURITY DEFINER`. As travas `trg_fin_cmv_guard_decisao` recusam a escrita direta do papel `authenticated`.
- Lançamento e conciliação **não travam** o salvar por falta de resposta. `CMV_DECISAO_OBRIGATORIA` continua exclusivo de boleto.
- Frontend:
  - UI em português; nomes e comentários no estilo do arquivo ao redor;
  - tokens de design, nunca hex nem `dark:`;
  - campo de data com `DateInput`;
  - `supabase.rpc` nunca solto: chame como método ou com `.bind(supabase)`;
  - não acrescente `any` novo, exceto onde o arquivo já usa o mesmo padrão (indicado na tarefa).
- Testes de banco usam PostgreSQL real (descartável), nunca mock de banco.
- Commits:
  - formato `tipo(escopo): descrição`;
  - última linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - antes de cada commit, rode `git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'`: deve vir vazio;
  - nunca use `--amend` nem `--no-verify`.
- Comandos (PowerShell, na raiz da worktree):
  - vitest: `bunx vitest run <arquivos>`;
  - tipos: `bunx tsc --noEmit -p tsconfig.app.json`;
  - lint: `bunx eslint <arquivos>`;
  - banco: `powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql` (criado na Tarefa 1).

## Review Focus

Entradas e situações que a spec implica e que um teste pequeno deixaria passar. Cada uma ganhou um teste na tarefa dona:

1. **Linha da conciliação salva no `sessionStorage` antes do deploy**, sem os campos novos. Ela deve seguir pendente e sem competência própria, sem quebrar o "Processar". Testes na Tarefa 5 (lib) e na Tarefa 8 (tela).
2. **Competência igual à data do banco, apagada, ou em receita.** Nesses casos `p_data_competencia` não é enviado. Teste na Tarefa 5.
3. **Linha com rateio de uma linha salvo e, depois, a categoria trocada no seletor da linha.** Hoje a importação usa o rateio e ignora o que a tela mostra. A categoria visível passa a valer, com a decisão sugerida de novo. Teste na Tarefa 5.
4. **Lote da revisão do CMV que mistura boleto e lançamento, com um deles desatualizado.** Tudo ou nada: o boleto não pode mudar. Teste na Tarefa 3 (banco).
5. **Formulário que nasceu como despesa e virou receita**, ainda com respostas nas linhas. O cliente não envia a decisão e o servidor grava `NULL`. Testes nas Tarefas 2 (banco) e 5 (lib).

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql` (novo) | coluna, trava, apuração por fonte, RPCs de escrita, classificação e "Aplicar padrões" | 1, 2, 3 |
| `supabase/tests/database/cmv_lancamentos_ephemeral.sql` (novo) | integração em PostgreSQL real descartável | 1, 2, 3 |
| `supabase/tests/database/run_ephemeral.ps1` (novo) | sobe um cluster local, roda um `.sql`, apaga | 1 |
| `src/test/cmvLancamentosMigration.test.ts` (novo) | contrato do SQL (texto) | 1, 2, 3 |
| `src/domain/financeiro/cmv/report.ts`, `rateio.ts` (+ testes) | payload aditivo, contagem por fonte, decisão ao trocar categoria | 4 |
| `src/hooks/useCmvFinanceiro.ts` (+ teste) | config com `recursos`, lista por fonte, classificar lançamento, aplicar padrões | 4 |
| `src/lib/cmvLancamentoPayload.ts` (novo, + teste) | payload da decisão no Livro Razão e na reclassificação | 5 |
| `src/lib/conciliacaoCmv.ts` (novo, + teste) | decisão e competência da linha do extrato; datas do diálogo "Criar" | 5 |
| `src/components/financeiro/ContaFormDialog.tsx` (+ `ContaFormCmv.test.tsx`) | bloco de CMV também em despesa de lançamento; competência na reclassificação | 6 |
| `src/components/financeiro/LivroRazaoSection.tsx` (+ teste), `src/components/FinanceiroView.tsx` | carregar config, ler/enviar decisão, abrir lançamento vindo do CMV | 7 |
| `src/components/financeiro/ConciliacaoLinhaCmv.tsx` (novo), `ConciliacaoBancariaSection.tsx` (+ teste) | Sim/Não e competência na linha e no rateio | 8 |
| `src/components/financeiro/CriarLancamentoExtratoDialog.tsx` (+ teste novo) | Sim/Não e datas certas no "Criar" | 9 |
| `src/components/financeiro/cmv/*`, `src/lib/cmvFinanceiroPdfExport.ts` (+ testes) | "despesas", origem, classificar lançamento, "Aplicar padrões" | 10 |
| `CLAUDE.md`, `AGENTS.md`, `docs/cmv-financeiro/PLANO.md`, `PROGRESSO.md` | regras e checkpoint | 11 |

### Task 1: Banco — coluna, trava e apuração das duas fontes (leitura)

**Files:**
- Create: `supabase/tests/database/run_ephemeral.ps1`
- Create: `supabase/tests/database/cmv_lancamentos_ephemeral.sql`
- Create: `src/test/cmvLancamentosMigration.test.ts`
- Create: `supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql`

**Interfaces:**
- Consumes (já em produção, migrations `20261003140000_cmv_financeiro.sql` e `20261003203219_cmv_financeiro_serie.sql`):
  - `public._fin_cmv_linhas(uuid)` → `(conta_pagar_id, rateio_id, categoria_id, valor, cmv_incluir, data_competencia)`;
  - `public._fin_cmv_retrato(uuid, uuid)`, `public._fin_cmv_ativo(uuid)`, `public._fin_cmv_serie(uuid, uuid)`;
  - `public._fin_cmv_guard_decisao()` (função de trigger).
- Produces (usado pelas Tarefas 2, 3, 4 e 10):
  - `public._fin_cmv_linhas_lancamentos(p_company_id uuid)` → `TABLE(lancamento_id uuid, rateio_id uuid, categoria_id uuid, valor numeric, cmv_incluir boolean, data_competencia date)`;
  - `public._fin_cmv_linhas_fontes(p_company_id uuid)` → `TABLE(fonte text /* 'boleto' | 'lancamento' */, documento_id uuid, rateio_id uuid, categoria_id uuid, valor numeric, cmv_incluir boolean, data_competencia date)`;
  - `public._fin_cmv_retrato_lancamento(p_company_id uuid, p_lancamento_id uuid)` → `jsonb` (mesmo formato de `_fin_cmv_retrato`);
  - payload de `get_fin_cmv_financeiro` ganha `lancamentos: [{data, quantidade}]` e `pendentes_geral_por_fonte: {boleto: {titulos, centavos}, lancamento: {titulos, centavos}}`;
  - itens de `list_fin_cmv_linhas` ganham `fonte`, `documento_id`, `lancamento_id`, `origem`, `conta_nome`;
  - `get_fin_cmv_config()` ganha `recursos: {lancamentos: true}`.

- [ ] **Step 1: Criar o executor do teste de banco descartável**

`supabase/tests/database/run_ephemeral.ps1`:

```powershell
# Roda um teste de banco DESCARTÁVEL (PostgreSQL 16 local) e apaga o cluster no fim.
# Uso: powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/<arquivo>.sql
param([Parameter(Mandatory = $true)][string]$Arquivo)
$ErrorActionPreference = 'Stop'
$env:PGCLIENTENCODING = 'UTF8'
$pg = Join-Path $env:TEMP ('pg-ephemeral-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$porta = 54329
initdb -D $pg -U postgres -A trust -E UTF8 --locale=C | Out-Null
try {
  pg_ctl -D $pg -o "-p $porta" -l "$pg.log" -w start | Out-Null
  createdb -h localhost -p $porta -U postgres teste
  psql -h localhost -p $porta -U postgres -d teste -v ON_ERROR_STOP=1 -q -f $Arquivo
  if ($LASTEXITCODE -ne 0) { throw "psql falhou (código $LASTEXITCODE)" }
} finally {
  pg_ctl -D $pg -m fast stop | Out-Null
  Remove-Item -Recurse -Force $pg -ErrorAction SilentlyContinue
}
```

- [ ] **Step 2: Escrever o teste de banco (schema mínimo + cenários de leitura)**

`supabase/tests/database/cmv_lancamentos_ephemeral.sql`:

```sql
\set ON_ERROR_STOP on

-- CMV Financeiro com despesas de Lançamentos e da Conciliação: teste de integração
-- em PostgreSQL real e DESCARTÁVEL. Aplica as migrations do CMV sobre um schema
-- mínimo. São simulados apenas: auth.uid(), assert_tenant() (lê test.company_id),
-- has_permission/has_any_permission (leem test.permissions), strip_html,
-- immutable_unaccent (sem a extensão unaccent), fin_get_limite_aprovacao e
-- fin_validate_recorrencia_config. Os gatilhos de soma do rateio e de edição de
-- lançamento realizado têm o corpo de produção (2026-10-05).
-- Uso: powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT NULLIF(current_setting('test.user_id', true), '')::uuid $$;

CREATE FUNCTION public.assert_tenant() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v uuid := NULLIF(current_setting('test.company_id', true), '')::uuid;
BEGIN
  IF v IS NULL THEN RAISE EXCEPTION 'COMPANY_ACCESS_DENIED'; END IF;
  RETURN v;
END; $$;

CREATE FUNCTION public.has_any_permission(_user_id uuid, _permissions text[]) RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT _user_id IS NOT NULL AND string_to_array(COALESCE(current_setting('test.permissions', true), ''), ',') && _permissions $$;
CREATE FUNCTION public.has_permission(_permission text) RETURNS boolean LANGUAGE sql STABLE
AS $$ SELECT public.has_any_permission(auth.uid(), ARRAY[_permission]) $$;
CREATE FUNCTION public.strip_html(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT p $$;
CREATE FUNCTION public.immutable_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT $1 $$;
CREATE FUNCTION public.fin_get_limite_aprovacao(p_company_id uuid) RETURNS numeric LANGUAGE sql STABLE AS $$ SELECT 2500::numeric $$;
CREATE FUNCTION public.fin_validate_recorrencia_config(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT p $$;

CREATE TABLE public.companies (id uuid PRIMARY KEY, nome text NOT NULL);
CREATE TABLE public.permissions (key text PRIMARY KEY, description text, module text, submodule text, action text);
CREATE TABLE public.role_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role text NOT NULL, permission_key text NOT NULL);
CREATE TABLE public.fin_config (
  company_id uuid NOT NULL, key text NOT NULL, value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid, PRIMARY KEY (company_id, key)
);
CREATE TABLE public.fin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entidade text NOT NULL, entidade_id uuid, acao text NOT NULL,
  antes jsonb, depois jsonb, justificativa text DEFAULT '', user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY, nome text NOT NULL, tipo text NOT NULL DEFAULT 'despesa', grupo text DEFAULT '',
  parent_id uuid, codigo text DEFAULT '', ordem integer DEFAULT 0, ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
CREATE TABLE public.fin_contas (id uuid PRIMARY KEY, nome text NOT NULL, company_id uuid NOT NULL);
CREATE TABLE public.fin_centros_custo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, ativo boolean NOT NULL DEFAULT true, company_id uuid NOT NULL
);
CREATE TABLE public.fin_contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), descricao text NOT NULL DEFAULT '', valor numeric NOT NULL DEFAULT 0,
  valor_pago numeric DEFAULT 0, fornecedor text DEFAULT '', supplier_id uuid,
  data_vencimento date NOT NULL, data_competencia date, data_pagamento date,
  categoria_id uuid, centro_custo_id uuid, conta_id uuid, forma_pagamento text DEFAULT 'boleto', observacoes text DEFAULT '',
  status text NOT NULL DEFAULT 'RASCUNHO', created_by uuid, company_id uuid NOT NULL,
  recorrente boolean NOT NULL DEFAULT false, recorrencia_config jsonb DEFAULT '{}'::jsonb,
  parcela_atual integer, parcela_total integer, lancamento_pai_id uuid, lancamento_id uuid,
  idempotency_key text, tipo_codigo_pagamento text, codigo_pagamento text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_fin_contas_pagar_idempotency ON public.fin_contas_pagar (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE public.fin_contas_receber (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), valor numeric NOT NULL DEFAULT 0, company_id uuid NOT NULL);
-- Colunas de produção (information_schema, 2026-10-05), sem as que nenhuma função toca.
CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'DESPESA',
  valor numeric NOT NULL DEFAULT 0 CHECK (valor > 0),
  data_competencia date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'))::date,
  data_pagamento date, data_vencimento date,
  categoria_id uuid, centro_custo_id uuid, conta_id uuid, conta_destino_id uuid,
  forma_pagamento text DEFAULT 'pix', status text NOT NULL DEFAULT 'PREVISTO',
  descricao text DEFAULT '', observacoes text DEFAULT '', justificativa_edicao text DEFAULT '',
  recorrente boolean NOT NULL DEFAULT false, recorrencia_config jsonb DEFAULT '{}'::jsonb,
  parcela_atual integer, parcela_total integer, lancamento_pai_id uuid,
  referencia_modulo text DEFAULT '', referencia_id text DEFAULT '',
  conciliado boolean DEFAULT false, conciliado_em timestamptz, conciliado_por uuid,
  origem text NOT NULL DEFAULT 'manual', idempotency_key text,
  excluir_dos_relatorios boolean NOT NULL DEFAULT false,
  created_by uuid, company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_fin_lancamentos_company_idempotency ON public.fin_lancamentos (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lancamento_id uuid NOT NULL, categoria_id uuid, centro_custo_id uuid,
  valor numeric NOT NULL DEFAULT 0, percentual numeric, observacao text,
  created_at timestamptz NOT NULL DEFAULT now(), company_id uuid NOT NULL
);
CREATE TABLE public.fin_conciliacao_vinculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, conta_id uuid NOT NULL,
  external_id text NOT NULL, tipo text NOT NULL, lancamento_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid
);
CREATE TABLE public.financeiro_fechamento_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data date NOT NULL, faturamento_bruto numeric NOT NULL DEFAULT 0,
  taxas numeric DEFAULT 0, descontos numeric DEFAULT 0, company_id uuid NOT NULL
);
CREATE UNIQUE INDEX idx_fechamento_caixa_company_data ON public.financeiro_fechamento_caixa (company_id, data);

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
CREATE TRIGGER trg_updated_at_fin_contas_pagar BEFORE UPDATE ON public.fin_contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_updated_at_fin_lancamentos BEFORE UPDATE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Corpo de produção (2026-10-05): edição de lançamento REALIZADO exige justificativa.
CREATE FUNCTION public.trg_validate_fin_lancamento_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF OLD.status = 'REALIZADO' THEN
    IF (
      NEW.valor IS DISTINCT FROM OLD.valor
      OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id
      OR NEW.conta_id IS DISTINCT FROM OLD.conta_id
      OR NEW.data_competencia IS DISTINCT FROM OLD.data_competencia
      OR NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id
    ) THEN
      IF NEW.justificativa_edicao IS NULL OR TRIM(NEW.justificativa_edicao) = '' THEN
        RAISE EXCEPTION 'Justificativa obrigatória ao editar lançamento realizado (campos: valor, categoria, conta, data, centro de custo)'
          USING ERRCODE = 'P0003';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_fin_lancamento_update BEFORE UPDATE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_fin_lancamento_update();

-- Corpo de produção (2026-10-05): o pai do rateio pode ser lançamento, boleto ou conta a receber.
CREATE FUNCTION public.trg_validate_rateio_sum() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_lancamento_id uuid; v_company_id uuid; v_lancamento_valor numeric; v_soma_rateios numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN v_lancamento_id := OLD.lancamento_id; v_company_id := OLD.company_id;
  ELSE v_lancamento_id := NEW.lancamento_id; v_company_id := NEW.company_id; END IF;
  SELECT ABS(valor) INTO v_lancamento_valor FROM fin_lancamentos WHERE id = v_lancamento_id AND company_id = v_company_id FOR UPDATE;
  IF v_lancamento_valor IS NULL THEN
    SELECT ABS(valor) INTO v_lancamento_valor FROM fin_contas_pagar WHERE id = v_lancamento_id AND company_id = v_company_id FOR UPDATE;
  END IF;
  IF v_lancamento_valor IS NULL THEN
    SELECT ABS(valor) INTO v_lancamento_valor FROM fin_contas_receber WHERE id = v_lancamento_id AND company_id = v_company_id FOR UPDATE;
  END IF;
  IF v_lancamento_valor IS NULL THEN RAISE EXCEPTION 'Lançamento não encontrado: %', v_lancamento_id USING ERRCODE = 'P0002'; END IF;
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND company_id = v_company_id AND id <> OLD.id;
  ELSE
    SELECT COALESCE(SUM(ABS(valor)), 0) INTO v_soma_rateios FROM fin_lancamento_rateios
    WHERE lancamento_id = v_lancamento_id AND company_id = v_company_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    v_soma_rateios := v_soma_rateios + ABS(NEW.valor);
  END IF;
  IF v_soma_rateios > v_lancamento_valor + 0.01 THEN
    RAISE EXCEPTION 'Soma dos rateios (%) excede o valor do lançamento (%)', v_soma_rateios, v_lancamento_valor USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_rateio_sum BEFORE INSERT OR DELETE OR UPDATE ON public.fin_lancamento_rateios
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_rateio_sum();

-- Versões anteriores das RPCs (assinatura de produção), para as migrations dropparem e recriarem.
CREATE FUNCTION public._guarded_create_conta_pagar(text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,text,jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public._guarded_update_conta_pagar(uuid,text,numeric,text,uuid,date,date,uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.reconcile_import_lancamento(date,text,numeric,text,uuid,uuid,jsonb,text,boolean,integer)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public._guarded_upsert_lancamento(uuid,text,text,numeric,uuid,uuid,uuid,date,date,date,text,text,text,text,boolean,jsonb,jsonb,timestamptz,text,text)
RETURNS TABLE(id uuid, updated_at timestamptz, idempotente boolean) LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::timestamptz, false $$;
CREATE FUNCTION public._guarded_update_reconciled_classification(uuid,uuid,uuid,text,jsonb,timestamptz,text)
RETURNS TABLE(id uuid, updated_at timestamptz) LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::timestamptz $$;

\ir ../../migrations/20261003140000_cmv_financeiro.sql
\ir ../../migrations/20261003203219_cmv_financeiro_serie.sql
\ir ../../migrations/20261005120000_cmv_financeiro_lancamentos.sql

-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.cmv_assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF; END; $$;

CREATE FUNCTION public.cmv_expect_error(p_sql text, p_like text, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_like THEN RETURN; END IF;
    RAISE EXCEPTION 'FALHOU: % — erro inesperado: %', p_msg, SQLERRM;
  END;
  RAISE EXCEPTION 'FALHOU: % — era esperado erro %', p_msg, p_like;
END; $$;

-- Soma do CMV (centavos) do payload num intervalo.
CREATE FUNCTION public.cmv_total(p jsonb, p_ini date, p_fim date) RETURNS bigint LANGUAGE sql AS $$
  SELECT COALESCE(sum((x->>'centavos')::bigint), 0)::bigint FROM jsonb_array_elements(p->'cmv') x
  WHERE (x->>'data')::date BETWEEN p_ini AND p_fim
$$;

CREATE FUNCTION public.run_cmv_lancamentos_ephemeral_tests() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  A constant uuid := '11111111-1111-4111-8111-111111111111';
  B constant uuid := '22222222-2222-4222-8222-222222222222';
  U constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  c_peixes constant uuid := 'c0000000-0000-4000-8000-000000000001'; -- padrão Sim
  c_escr constant uuid := 'c0000000-0000-4000-8000-000000000002';   -- padrão Não
  c_sem constant uuid := 'c0000000-0000-4000-8000-000000000003';    -- sem padrão
  c_rec constant uuid := 'c0000000-0000-4000-8000-000000000004';    -- receita
  c_b constant uuid := 'c0000000-0000-4000-8000-0000000000b1';      -- unidade B
  k_a constant uuid := 'd0000000-0000-4000-8000-00000000000a';
  k_b constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  TUDO constant text := 'financeiro:cmv:view,financeiro:cmv:manage,financeiro:pagar:create,financeiro:pagar:edit,financeiro:lancamentos:create,financeiro:lancamentos:edit,financeiro:conciliacao:reconcile';
  r jsonb;
  v_manual uuid; v_prev uuid; v_conc uuid; v_rat uuid; v_pend uuid; v_cancel uuid; v_desconc uuid;
  v_espelho uuid; v_ajuste uuid; v_receita uuid; v_bol uuid;
  v_imp uuid; v_rid uuid; v_lr uuid; v_lr2 uuid; v_lr3 uuid; v_sem_pag uuid;
  v_p_peixes uuid; v_p_escr uuid; v_p_sem uuid; v_p_antigo uuid; v_p_decidido uuid; v_p_rat uuid; v_bol_pend uuid;
  v_ids uuid[]; v_criados timestamptz[]; v_n bigint;
BEGIN
  INSERT INTO companies VALUES (A, 'Unidade A'), (B, 'Unidade B');
  INSERT INTO fin_categorias (id, nome, tipo, company_id, cmv_sugerir) VALUES
    (c_peixes, 'Peixes', 'despesa', A, true),
    (c_escr, 'Escritório', 'despesa', A, false),
    (c_sem, 'Sem padrão', 'despesa', A, NULL),
    (c_rec, 'Vendas', 'receita', A, NULL),
    (c_b, 'Peixes B', 'despesa', B, true);
  INSERT INTO fin_contas (id, nome, company_id) VALUES (k_a, 'Banco A', A), (k_b, 'Banco B', B);
  PERFORM set_config('test.user_id', U::text, false);
  PERFORM set_config('test.company_id', A::text, false);
  PERFORM set_config('test.permissions', TUDO, false);

  -- 1. Helpers novos fechados para clientes; config aberta
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_linhas_lancamentos(uuid)', 'EXECUTE'), 'helper de lançamentos fechado');
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_linhas_fontes(uuid)', 'EXECUTE'), 'helper de fontes fechado');
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_retrato_lancamento(uuid,uuid)', 'EXECUTE'), 'retrato de lançamento fechado');
  PERFORM cmv_assert(has_function_privilege('authenticated', 'public.get_fin_cmv_config()', 'EXECUTE'), 'config aberta a authenticated');

  -- 2. Regra de apuração (semana 07–13/09/2026)
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao, conta_id)
  VALUES ('DESPESA', 100, '2026-09-08', '2026-09-08', 'REALIZADO', 'manual', A, c_peixes, true, 'PIX mercado', k_a) RETURNING id INTO v_manual;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 20, '2026-09-09', 'PREVISTO', 'manual', A, c_peixes, true, 'Compra prevista') RETURNING id INTO v_prev;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, conciliado, company_id, descricao, conta_id)
  VALUES ('DESPESA', 40, '2026-09-10', '2026-09-10', 'REALIZADO', 'conciliacao', true, A, 'PIX conciliado', k_a) RETURNING id INTO v_conc;
  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id, cmv_incluir)
  VALUES (v_conc, c_peixes, 30, A, true), (v_conc, c_escr, 10, A, false);
  -- fora: cancelado, desconciliado, espelho de baixa, encargo da baixa, receita
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 1000, '2026-09-08', '2026-09-08', 'CANCELADO', 'manual', A, c_peixes, true, 'Cancelado') RETURNING id INTO v_cancel;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, conciliado, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 2000, '2026-09-08', '2026-09-08', 'REALIZADO', 'conciliacao', false, A, c_peixes, true, 'Desconciliado') RETURNING id INTO v_desconc;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, referencia_modulo, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 4000, '2026-09-08', '2026-09-08', 'REALIZADO', 'espelho_cp', 'contas_pagar', A, c_peixes, true, 'Espelho de baixa') RETURNING id INTO v_espelho;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, referencia_modulo, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 8000, '2026-09-08', '2026-09-08', 'REALIZADO', 'ajuste_pagamento', 'contas_pagar', A, c_peixes, true, 'Juros da baixa') RETURNING id INTO v_ajuste;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('RECEITA', 16000, '2026-09-08', '2026-09-08', 'REALIZADO', 'manual', A, c_rec, true, 'Venda') RETURNING id INTO v_receita;
  -- rateio manda: cabeçalho Sim, linhas 60 Sim + 40 Não
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 100, '2026-09-11', '2026-09-11', 'REALIZADO', 'manual', A, c_peixes, true, 'Feira rateada') RETURNING id INTO v_rat;
  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id, cmv_incluir)
  VALUES (v_rat, c_peixes, 60, A, true), (v_rat, c_escr, 40, A, false);
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 7, '2026-09-12', '2026-09-12', 'REALIZADO', 'manual', A, c_sem, 'Pendente') RETURNING id INTO v_pend;
  -- o boleto continua contando como antes
  r := _guarded_create_conta_pagar(p_descricao => 'Boleto peixe', p_valor => 50, p_data_vencimento => '2026-09-20',
    p_data_competencia => '2026-09-09', p_categoria_id => c_peixes, p_cmv => '{"incluir": true}');
  v_bol := (r->>'id')::uuid;

  r := get_fin_cmv_financeiro('2026-09-07', '2026-09-13');
  -- 100 (manual) + 20 (previsto) + 30 (conciliação, só a linha Sim) + 60 (rateio Sim) + 50 (boleto) = R$ 260,00
  PERFORM cmv_assert(cmv_total(r, '2026-09-07', '2026-09-13') = 26000, 'CMV soma boletos e despesas de lançamentos pela regra');
  PERFORM cmv_assert(r->>'contrato' = 'cmv-financeiro/v1', 'contrato continua v1');
  PERFORM cmv_assert((SELECT sum((x->>'quantidade')::int) FROM jsonb_array_elements(r->'boletos') x) = 1, '"boletos" conta só boletos');
  PERFORM cmv_assert((SELECT sum((x->>'quantidade')::int) FROM jsonb_array_elements(r->'lancamentos') x) = 4, 'lançamentos com linha Sim: manual, previsto, conciliação, rateado');
  PERFORM cmv_assert((SELECT sum((x->>'centavos')::bigint) FROM jsonb_array_elements(r->'qualidade') x WHERE x->>'situacao' = 'fora') = 5000, 'linhas Não entram na qualidade (10 + 40)');
  PERFORM cmv_assert((r->'pendentes_geral_por_fonte'->'lancamento'->>'titulos')::int = 1
    AND (r->'pendentes_geral_por_fonte'->'lancamento'->>'centavos')::bigint = 700, 'pendência por fonte: lançamento');
  PERFORM cmv_assert((r->'pendentes_geral_por_fonte'->'boleto'->>'titulos')::int = 0, 'nenhum boleto pendente');
  PERFORM cmv_assert((r->'pendentes_geral'->>'titulos')::int = 1, 'pendentes gerais somam as fontes');

  -- 3. Lista de origem
  r := list_fin_cmv_linhas('2026-09-07', '2026-09-13', 'incluido');
  PERFORM cmv_assert((r->>'total_titulos')::int = 5, 'lista: 1 boleto + 4 lançamentos');
  PERFORM cmv_assert((r->>'total_centavos')::bigint = 26000, 'lista fecha com o CMV');
  PERFORM cmv_assert(EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'itens') x
    WHERE x->>'fonte' = 'lancamento' AND x->>'lancamento_id' = v_conc::text AND x->>'documento_id' = v_conc::text
      AND x->>'origem' = 'conciliacao' AND x->>'conta_nome' = 'Banco A' AND x->'conta_pagar_id' = 'null'::jsonb
      AND (x->>'serie_boletos')::int = 1
  ), 'item de lançamento identifica fonte, origem e conta');
  PERFORM cmv_assert(EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'itens') x
    WHERE x->>'fonte' = 'boleto' AND x->>'conta_pagar_id' = v_bol::text AND x->'lancamento_id' = 'null'::jsonb
  ), 'item de boleto mantém conta_pagar_id');
  r := list_fin_cmv_linhas(NULL, NULL, 'pendente');
  PERFORM cmv_assert((r->>'total_titulos')::int = 1 AND (r->'itens'->0->>'lancamento_id')::uuid = v_pend, 'pendência de lançamento aparece na revisão');

  -- 4. Isolamento entre unidades
  PERFORM set_config('test.company_id', B::text, false);
  r := get_fin_cmv_financeiro('2026-09-07', '2026-09-13');
  PERFORM cmv_assert(cmv_total(r, '2026-09-07', '2026-09-13') = 0, 'B não vê despesas da A');
  PERFORM cmv_assert((list_fin_cmv_linhas(NULL, NULL, 'todos')->>'total_linhas')::int = 0, 'lista de B vazia');
  PERFORM set_config('test.company_id', A::text, false);

  -- 5. Configuração informa o recurso a quem lança e a quem concilia
  PERFORM set_config('test.permissions', 'financeiro:lancamentos:create', false);
  PERFORM cmv_assert((get_fin_cmv_config()->'recursos'->>'lancamentos')::boolean, 'config para quem lança');
  PERFORM set_config('test.permissions', 'financeiro:conciliacao:reconcile', false);
  PERFORM cmv_assert((get_fin_cmv_config()->'recursos'->>'lancamentos')::boolean, 'config para quem concilia');
  PERFORM set_config('test.permissions', TUDO, false);

  -- 6. Escrita direta (PostgREST, papel authenticated) não altera a decisão do lançamento
  GRANT USAGE ON SCHEMA public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.fin_lancamentos SET cmv_incluir = false WHERE id = v_manual;
    RAISE EXCEPTION 'CMV TEST FAILED: UPDATE direto da decisão do lançamento passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.fin_lancamentos (tipo, valor, data_competencia, status, company_id, cmv_incluir)
    VALUES ('DESPESA', 1, '2026-09-08', 'PREVISTO', A, true);
    RAISE EXCEPTION 'CMV TEST FAILED: INSERT direto com decisão passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Escrita que não toca a decisão continua permitida (as telas atuais fazem isso).
  UPDATE public.fin_lancamentos SET observacoes = 'nota' WHERE id = v_manual;
  RESET ROLE;
  PERFORM cmv_assert((SELECT cmv_incluir AND observacoes = 'nota' FROM fin_lancamentos WHERE id = v_manual), 'escrita direta sem a decisão continua permitida');

  RETURN 'cmv_lancamentos_ephemeral: OK';
END;
$$;

SELECT public.run_cmv_lancamentos_ephemeral_tests();
```

- [ ] **Step 3: Escrever o teste de contrato do SQL**

`src/test/cmvLancamentosMigration.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da migration que leva as despesas de Lançamentos e da Conciliação ao
 * CMV Financeiro (spec 2026-10-05-cmv-financeiro-lancamentos-design.md). O banco
 * real é testado em supabase/tests/database/cmv_lancamentos_ephemeral.sql.
 */
const dir = resolve(process.cwd(), 'supabase/migrations');
const arquivo = readdirSync(dir).filter(nome => nome.endsWith('_cmv_financeiro_lancamentos.sql'));
const sql = readFileSync(resolve(dir, arquivo[0] ?? ''), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = sql.replace(/--[^\n]*/g, '');
const foraDasFuncoes = semComentarios.replace(/\$(function)?\$[\s\S]*?\$(function)?\$/g, '');
const plano = (s: string) => s.replace(/\s+/g, ' ');

function corpo(nome: string): string {
  const inicio = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nome}\\(`));
  expect(inicio, `função ${nome} não encontrada`).toBeGreaterThanOrEqual(0);
  const resto = sql.slice(inicio);
  const fim = resto.search(/\n\$(function)?\$;/);
  return resto.slice(0, fim);
}

describe('migration CMV com lançamentos — leitura', () => {
  it('existe uma única migration e o teste de banco real a aplica', () => {
    expect(arquivo).toHaveLength(1);
    const ephemeral = readFileSync(resolve(process.cwd(), 'supabase/tests/database/cmv_lancamentos_ephemeral.sql'), 'utf8');
    expect(ephemeral).toContain(`\\ir ../../migrations/${arquivo[0]}`);
  });

  it('é aditiva e não classifica o histórico', () => {
    expect(semComentarios).not.toMatch(/DROP\s+(TABLE|COLUMN|POLICY|TRIGGER|INDEX)/i);
    expect(semComentarios).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).toContain('ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS cmv_incluir boolean;');
    expect(foraDasFuncoes).not.toMatch(/\bUPDATE\s+public\./i);
    expect(foraDasFuncoes).not.toMatch(/\bINSERT\s+INTO\s+public\./i);
  });

  it('toda função fixa o search_path com "="', () => {
    const funcoes = sql.match(/CREATE (OR REPLACE )?FUNCTION/g) ?? [];
    expect(funcoes.length).toBeGreaterThan(0);
    expect((sql.match(/SET search_path = '/g) ?? []).length).toBe(funcoes.length);
    expect(sql).not.toMatch(/SET search_path TO/);
  });

  it('regra de apuração das despesas de fin_lancamentos', () => {
    const c = plano(corpo('_fin_cmv_linhas_lancamentos'));
    expect(c).toContain("l.tipo = 'DESPESA'");
    expect(c).toContain("l.status <> 'CANCELADO'");
    expect(c).toContain("NULLIF(l.referencia_modulo, '') IS NULL");
    expect(c).toContain("l.origem NOT IN ('espelho_cp', 'espelho_cr', 'ajuste_pagamento')");
    expect(c).toContain("(l.origem <> 'conciliacao' OR l.conciliado IS TRUE)");
    // rateio manda: o cabeçalho só vale sem linhas de rateio
    expect(c).toContain('WHERE NOT EXISTS');
  });

  it('o relatório soma as duas fontes e mantém o contrato v1', () => {
    const p = plano(corpo('_fin_cmv_payload'));
    expect(p).toContain("'contrato', 'cmv-financeiro/v1'");
    expect(p).toContain('FROM public._fin_cmv_linhas_fontes(p_company_id) l');
    expect(p).toContain("FROM documentos WHERE fonte = 'boleto'");
    expect(p).toContain("FROM documentos WHERE fonte = 'lancamento'");
    expect(p).toContain("'pendentes_geral_por_fonte'");
    expect(plano(corpo('_fin_cmv_linhas_fontes'))).toContain('FROM public._fin_cmv_linhas(p_company_id) b');
    expect(plano(corpo('_fin_cmv_lista'))).toContain('FROM public._fin_cmv_linhas_fontes(p_company_id) l');
  });

  it('a decisão do lançamento também só é gravada pelas RPCs', () => {
    expect(plano(sql)).toContain(
      'CREATE OR REPLACE TRIGGER trg_fin_cmv_guard_decisao BEFORE INSERT OR UPDATE ON public.fin_lancamentos FOR EACH ROW EXECUTE FUNCTION public._fin_cmv_guard_decisao();',
    );
  });

  it('helpers internos não são executáveis por clientes', () => {
    for (const assinatura of ['_fin_cmv_linhas_lancamentos(uuid)', '_fin_cmv_linhas_fontes(uuid)', '_fin_cmv_retrato_lancamento(uuid, uuid)']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${assinatura} FROM PUBLIC, anon, authenticated;`);
    }
  });

  it('a configuração informa o recurso a quem lança e a quem concilia', () => {
    const c = plano(corpo('get_fin_cmv_config'));
    expect(c).toContain("'recursos', jsonb_build_object('lancamentos', true)");
    expect(c).toContain("'financeiro:lancamentos:create'");
    expect(c).toContain("'financeiro:conciliacao:reconcile'");
  });
});
```

- [ ] **Step 4: Rodar os dois testes e ver falhar**

Run: `bunx vitest run src/test/cmvLancamentosMigration.test.ts`
Expected: FAIL. `readFileSync` não acha a migration (`ENOENT`).

Run: `powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql`
Expected: FAIL. O `\ir` não acha `20261005120000_cmv_financeiro_lancamentos.sql`.

- [ ] **Step 5: Escrever a migration (parte de leitura)**

`supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CMV Financeiro — despesas de Lançamentos (Livro Razão) e da Conciliação Bancária
-- Spec: docs/superpowers/specs/2026-10-05-cmv-financeiro-lancamentos-design.md
--
-- Além dos boletos, entra no CMV a despesa de fin_lancamentos que:
--   * é DESPESA e não está CANCELADA (PREVISTO conta: regime de competência);
--   * não deriva de um título: referencia_modulo vazio. Espelho de baixa,
--     encargo da baixa e título criado do extrato ficam fora — o boleto já conta
--     pela própria competência, então nada é contado duas vezes;
--   * se veio da conciliação, está conciliada (mesma regra dos relatórios).
-- Data = data_competencia. Decisão = linha de rateio; sem rateio, o próprio
-- lançamento (fin_lancamentos.cmv_incluir). NULL = pendente, nunca "Sim".
--
-- Aditiva: nada do histórico é classificado. O contrato do relatório continua
-- 'cmv-financeiro/v1' (só ganha campos), então a tela publicada não quebra.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS cmv_incluir boolean;

COMMENT ON COLUMN public.fin_lancamentos.cmv_incluir IS
  'CMV Financeiro: decisão da despesa SEM rateio (true entra, false fica fora, NULL pendente). Ignorada quando há linhas em fin_lancamento_rateios.';
COMMENT ON COLUMN public.fin_lancamento_rateios.cmv_incluir IS
  'CMV Financeiro: decisão da linha de rateio de um boleto ou de uma despesa de fin_lancamentos (true entra, false fica fora, NULL pendente). Sem efeito em conta a receber.';

-- Mesma trava dos boletos: a decisão só é gravada pelas RPCs (SECURITY DEFINER).
CREATE OR REPLACE TRIGGER trg_fin_cmv_guard_decisao
  BEFORE INSERT OR UPDATE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public._fin_cmv_guard_decisao();

-- ─── Helpers internos (sem EXECUTE para clientes) ────────────────────────────

-- Linhas classificáveis de fin_lancamentos (regra no cabeçalho do arquivo).
CREATE OR REPLACE FUNCTION public._fin_cmv_linhas_lancamentos(p_company_id uuid)
RETURNS TABLE (
  lancamento_id uuid,
  rateio_id uuid,
  categoria_id uuid,
  valor numeric,
  cmv_incluir boolean,
  data_competencia date
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH despesas AS (
    SELECT l.id, l.categoria_id, l.valor, l.cmv_incluir, l.data_competencia
    FROM public.fin_lancamentos l
    WHERE l.company_id = p_company_id
      AND l.tipo = 'DESPESA'
      AND l.status <> 'CANCELADO'
      AND NULLIF(l.referencia_modulo, '') IS NULL
      AND l.origem NOT IN ('espelho_cp', 'espelho_cr', 'ajuste_pagamento')
      AND (l.origem <> 'conciliacao' OR l.conciliado IS TRUE)
  )
  SELECT d.id, r.id, r.categoria_id, r.valor, r.cmv_incluir, d.data_competencia
  FROM despesas d
  JOIN public.fin_lancamento_rateios r
    ON r.lancamento_id = d.id AND r.company_id = p_company_id
  UNION ALL
  SELECT d.id, NULL::uuid, d.categoria_id, d.valor, d.cmv_incluir, d.data_competencia
  FROM despesas d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fin_lancamento_rateios r
    WHERE r.lancamento_id = d.id AND r.company_id = p_company_id
  );
$$;

-- Fonte única da apuração: boletos (regra de antes, inalterada) + lançamentos.
CREATE OR REPLACE FUNCTION public._fin_cmv_linhas_fontes(p_company_id uuid)
RETURNS TABLE (
  fonte text,
  documento_id uuid,
  rateio_id uuid,
  categoria_id uuid,
  valor numeric,
  cmv_incluir boolean,
  data_competencia date
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT 'boleto'::text, b.conta_pagar_id, b.rateio_id, b.categoria_id, b.valor, b.cmv_incluir, b.data_competencia
  FROM public._fin_cmv_linhas(p_company_id) b
  UNION ALL
  SELECT 'lancamento'::text, l.lancamento_id, l.rateio_id, l.categoria_id, l.valor, l.cmv_incluir, l.data_competencia
  FROM public._fin_cmv_linhas_lancamentos(p_company_id) l;
$$;

-- Retrato da classificação de UM lançamento (qualquer status), para auditoria.
CREATE OR REPLACE FUNCTION public._fin_cmv_retrato_lancamento(p_company_id uuid, p_lancamento_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'incluido', COALESCE(sum(x.valor) FILTER (WHERE x.cmv_incluir IS TRUE), 0),
    'fora', COALESCE(sum(x.valor) FILTER (WHERE x.cmv_incluir IS FALSE), 0),
    'pendentes', count(*) FILTER (WHERE x.cmv_incluir IS NULL),
    'linhas', COALESCE(jsonb_agg(jsonb_build_object(
      'rateio_id', x.rateio_id, 'categoria_id', x.categoria_id,
      'valor', x.valor, 'cmv_incluir', x.cmv_incluir
    ) ORDER BY x.rateio_id), '[]'::jsonb)
  )
  FROM (
    SELECT r.id AS rateio_id, r.categoria_id, r.valor, r.cmv_incluir
    FROM public.fin_lancamento_rateios r
    WHERE r.lancamento_id = p_lancamento_id AND r.company_id = p_company_id
    UNION ALL
    SELECT NULL::uuid, l.categoria_id, l.valor, l.cmv_incluir
    FROM public.fin_lancamentos l
    WHERE l.id = p_lancamento_id AND l.company_id = p_company_id
      AND NOT EXISTS (
        SELECT 1 FROM public.fin_lancamento_rateios r
        WHERE r.lancamento_id = l.id AND r.company_id = l.company_id
      )
  ) x;
$$;

-- Payload do relatório (mesma assinatura e mesmo contrato v1, só com campos a mais):
-- "boletos" continua contando só boletos; "lancamentos" é a contagem nova.
CREATE OR REPLACE FUNCTION public._fin_cmv_payload(
  p_company_id uuid,
  p_inicio date,
  p_fim date,
  p_anterior_inicio date,
  p_anterior_fim date
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH linhas AS MATERIALIZED (
    SELECT l.*,
      round(l.valor * 100)::bigint AS centavos,
      CASE
        WHEN l.data_competencia BETWEEN p_inicio AND p_fim THEN 'atual'
        WHEN p_anterior_inicio IS NOT NULL
          AND l.data_competencia BETWEEN p_anterior_inicio AND p_anterior_fim THEN 'anterior'
      END AS janela
    FROM public._fin_cmv_linhas_fontes(p_company_id) l
  ),
  cmv AS (
    SELECT data_competencia AS data, categoria_id, sum(centavos)::bigint AS centavos
    FROM linhas
    WHERE janela IS NOT NULL AND cmv_incluir IS TRUE
    GROUP BY 1, 2
  ),
  documentos AS (
    SELECT data_competencia AS data, fonte, count(DISTINCT documento_id)::int AS quantidade
    FROM linhas
    WHERE janela IS NOT NULL AND cmv_incluir IS TRUE
    GROUP BY 1, 2
  ),
  qualidade AS (
    SELECT data_competencia AS data,
      CASE WHEN cmv_incluir IS NULL THEN 'pendente' ELSE 'fora' END AS situacao,
      count(DISTINCT documento_id)::int AS titulos,
      sum(centavos)::bigint AS centavos
    FROM linhas
    WHERE janela IS NOT NULL AND cmv_incluir IS NOT TRUE
    GROUP BY 1, 2
  ),
  pendentes AS (
    SELECT fonte, count(DISTINCT documento_id)::int AS titulos, COALESCE(sum(centavos), 0)::bigint AS centavos
    FROM linhas
    WHERE cmv_incluir IS NULL
    GROUP BY fonte
  ),
  faturamento AS (
    -- Uma linha por (empresa, data) — idx_fechamento_caixa_company_data.
    -- Linha existente = fechamento registrado (inclusive com valor zero).
    SELECT f.data, round(f.faturamento_bruto * 100)::bigint AS centavos
    FROM public.financeiro_fechamento_caixa f
    WHERE f.company_id = p_company_id
      AND (f.data BETWEEN p_inicio AND p_fim
        OR (p_anterior_inicio IS NOT NULL AND f.data BETWEEN p_anterior_inicio AND p_anterior_fim))
  ),
  categorias AS (
    WITH RECURSIVE arvore AS (
      SELECT c.id, c.nome, c.parent_id, c.codigo, c.ordem, c.ativo, c.created_at
      FROM public.fin_categorias c
      WHERE c.company_id = p_company_id
        AND c.id IN (SELECT categoria_id FROM linhas WHERE janela IS NOT NULL AND cmv_incluir IS TRUE AND categoria_id IS NOT NULL)
      UNION
      SELECT p.id, p.nome, p.parent_id, p.codigo, p.ordem, p.ativo, p.created_at
      FROM public.fin_categorias p
      JOIN arvore a ON a.parent_id = p.id
      WHERE p.company_id = p_company_id
    )
    SELECT a.id, a.nome, a.parent_id, a.codigo, a.ordem, a.ativo,
      (SELECT count(*) FROM public.fin_categorias x
       WHERE x.company_id = p_company_id
         AND (x.created_at, x.id) < (a.created_at, a.id))::int AS indice
    FROM arvore a
  )
  SELECT jsonb_build_object(
    'contrato', 'cmv-financeiro/v1',
    'gerado_em', now(),
    'hoje', (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'classificacao_ativa', public._fin_cmv_ativo(p_company_id),
    'empresa', (SELECT company.nome FROM public.companies AS company WHERE company.id = p_company_id),
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'anterior', CASE WHEN p_anterior_inicio IS NULL THEN NULL
      ELSE jsonb_build_object('inicio', p_anterior_inicio, 'fim', p_anterior_fim) END,
    'faturamento', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'centavos', centavos) ORDER BY data) FROM faturamento), '[]'::jsonb),
    'cmv', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'categoria_id', categoria_id, 'centavos', centavos) ORDER BY data, categoria_id) FROM cmv), '[]'::jsonb),
    'boletos', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'quantidade', quantidade) ORDER BY data) FROM documentos WHERE fonte = 'boleto'), '[]'::jsonb),
    'lancamentos', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'quantidade', quantidade) ORDER BY data) FROM documentos WHERE fonte = 'lancamento'), '[]'::jsonb),
    'qualidade', COALESCE((SELECT jsonb_agg(jsonb_build_object('data', data, 'situacao', situacao, 'titulos', titulos, 'centavos', centavos) ORDER BY data, situacao) FROM qualidade), '[]'::jsonb),
    'categorias', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'parent_id', parent_id, 'codigo', codigo, 'ordem', ordem, 'ativo', ativo, 'indice', indice) ORDER BY nome, id) FROM categorias), '[]'::jsonb),
    'sem_competencia', (
      SELECT jsonb_build_object(
        'titulos', count(DISTINCT documento_id),
        'centavos', COALESCE(sum(centavos), 0)::bigint)
      FROM linhas WHERE data_competencia IS NULL
    ),
    'pendentes_geral', (
      SELECT jsonb_build_object(
        'titulos', COALESCE(sum(titulos), 0)::int,
        'centavos', COALESCE(sum(centavos), 0)::bigint)
      FROM pendentes
    ),
    'pendentes_geral_por_fonte', jsonb_build_object(
      'boleto', COALESCE((SELECT jsonb_build_object('titulos', titulos, 'centavos', centavos) FROM pendentes WHERE fonte = 'boleto'),
        jsonb_build_object('titulos', 0, 'centavos', 0)),
      'lancamento', COALESCE((SELECT jsonb_build_object('titulos', titulos, 'centavos', centavos) FROM pendentes WHERE fonte = 'lancamento'),
        jsonb_build_object('titulos', 0, 'centavos', 0))
    )
  );
$$;

-- Detalhe (drill-down e revisão de pendências), paginado, das duas fontes.
-- Item de boleto mantém "conta_pagar_id" (o cliente publicado lê esse campo).
CREATE OR REPLACE FUNCTION public._fin_cmv_lista(
  p_company_id uuid,
  p_inicio date,
  p_fim date,
  p_situacao text,
  p_categoria_id uuid,
  p_limit integer,
  p_offset integer,
  p_so_direto boolean
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH RECURSIVE ramo AS (
    SELECT c.id FROM public.fin_categorias c
    WHERE c.company_id = p_company_id AND c.id = p_categoria_id
    UNION
    SELECT c.id FROM public.fin_categorias c
    JOIN ramo r ON c.parent_id = r.id
    WHERE c.company_id = p_company_id
  ),
  filtradas AS MATERIALIZED (
    SELECT l.*, round(l.valor * 100)::bigint AS centavos
    FROM public._fin_cmv_linhas_fontes(p_company_id) l
    WHERE CASE p_situacao
        WHEN 'incluido' THEN l.cmv_incluir IS TRUE
        WHEN 'fora' THEN l.cmv_incluir IS FALSE
        WHEN 'pendente' THEN l.cmv_incluir IS NULL
        WHEN 'sem_competencia' THEN l.data_competencia IS NULL
        ELSE true
      END
      AND (p_situacao = 'sem_competencia'
        OR ((p_inicio IS NULL OR l.data_competencia >= p_inicio)
          AND (p_fim IS NULL OR l.data_competencia <= p_fim)
          -- com período informado, documento sem competência nunca entra
          AND (p_inicio IS NULL AND p_fim IS NULL OR l.data_competencia IS NOT NULL)))
      -- uuid nulo (zeros) = só as linhas SEM categoria
      AND (p_categoria_id IS NULL
        OR (p_categoria_id = '00000000-0000-0000-0000-000000000000'::uuid AND l.categoria_id IS NULL)
        -- "lançado direto": só a própria categoria, sem os descendentes
        OR (p_so_direto AND l.categoria_id = p_categoria_id)
        OR (NOT p_so_direto AND l.categoria_id IN (SELECT id FROM ramo)))
  ),
  documentos AS (
    SELECT 'boleto'::text AS fonte, cp.id, cp.descricao, cp.fornecedor, cp.data_vencimento, cp.status,
      cp.updated_at, round(cp.valor * 100)::bigint AS titulo_centavos, NULL::text AS origem, NULL::text AS conta_nome
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = p_company_id
      AND cp.id IN (SELECT f.documento_id FROM filtradas f WHERE f.fonte = 'boleto')
    UNION ALL
    SELECT 'lancamento'::text, l.id, l.descricao, NULL::text, l.data_vencimento, l.status,
      l.updated_at, round(l.valor * 100)::bigint, l.origem, ct.nome
    FROM public.fin_lancamentos l
    LEFT JOIN public.fin_contas ct ON ct.id = l.conta_id AND ct.company_id = p_company_id
    WHERE l.company_id = p_company_id
      AND l.id IN (SELECT f.documento_id FROM filtradas f WHERE f.fonte = 'lancamento')
  ),
  pagina AS (
    SELECT f.*, d.descricao, d.fornecedor, d.data_vencimento, d.status, d.updated_at,
      d.titulo_centavos, d.origem, d.conta_nome, cat.nome AS categoria_nome
    FROM filtradas f
    JOIN documentos d ON d.id = f.documento_id AND d.fonte = f.fonte
    LEFT JOIN public.fin_categorias cat ON cat.id = f.categoria_id AND cat.company_id = p_company_id
    ORDER BY f.data_competencia DESC NULLS FIRST, d.descricao, f.documento_id, f.rateio_id NULLS FIRST
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total_linhas', (SELECT count(*) FROM filtradas),
    'total_titulos', (SELECT count(DISTINCT documento_id) FROM filtradas),
    'total_centavos', (SELECT COALESCE(sum(centavos), 0)::bigint FROM filtradas),
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'fonte', p.fonte,
        'documento_id', p.documento_id,
        'conta_pagar_id', CASE WHEN p.fonte = 'boleto' THEN p.documento_id END,
        'lancamento_id', CASE WHEN p.fonte = 'lancamento' THEN p.documento_id END,
        'rateio_id', p.rateio_id,
        'descricao', p.descricao,
        'fornecedor', p.fornecedor,
        'origem', p.origem,
        'conta_nome', p.conta_nome,
        'data_competencia', p.data_competencia,
        'data_vencimento', p.data_vencimento,
        'status', p.status,
        'categoria_id', p.categoria_id,
        'categoria_nome', p.categoria_nome,
        'titulo_centavos', p.titulo_centavos,
        'linha_centavos', p.centavos,
        'cmv_incluir', p.cmv_incluir,
        'updated_at', p.updated_at,
        'serie_boletos', CASE WHEN p.fonte = 'boleto'
          THEN (SELECT count(*) FROM public._fin_cmv_serie(p_company_id, p.documento_id)) ELSE 1 END
      ) ORDER BY p.data_competencia DESC NULLS FIRST, p.descricao, p.documento_id, p.rateio_id NULLS FIRST)
      FROM pagina p
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public._fin_cmv_linhas_lancamentos(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_linhas_fontes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_retrato_lancamento(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_payload(uuid, date, date, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fin_cmv_lista(uuid, date, date, text, uuid, integer, integer, boolean) FROM PUBLIC, anon, authenticated;

-- ─── Configuração: também para quem lança despesa e para quem concilia ────────
CREATE OR REPLACE FUNCTION public.get_fin_cmv_config()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.assert_tenant();

  -- O formulário do Livro Razão e a linha do extrato sugerem a resposta pelo
  -- padrão da categoria: quem lança e quem concilia também leem a configuração.
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:cmv:view', 'financeiro:pagar:view', 'financeiro:pagar:create',
    'financeiro:pagar:edit', 'financeiro:lancamentos:view', 'financeiro:lancamentos:create',
    'financeiro:lancamentos:edit', 'financeiro:conciliacao:reconcile',
    'finance:read', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:view';
  END IF;

  RETURN jsonb_build_object(
    'classificacao_ativa', public._fin_cmv_ativo(v_company_id),
    -- Sinal para o frontend: o banco aceita a decisão em Lançamentos e na Conciliação.
    'recursos', jsonb_build_object('lancamentos', true),
    'categorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'codigo', c.codigo, 'parent_id', c.parent_id,
        'grupo', c.grupo, 'ativo', c.ativo, 'cmv_sugerir', c.cmv_sugerir,
        'updated_at', c.updated_at
      ) ORDER BY c.nome, c.id)
      FROM public.fin_categorias c
      WHERE c.company_id = v_company_id AND c.tipo = 'despesa'
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_fin_cmv_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_cmv_config() TO authenticated, service_role;

-- ─── Resolução de colunas no deploy ──────────────────────────────────────────
-- As consultas são LANGUAGE sql (validadas no CREATE); aqui elas rodam uma vez,
-- sobre uma empresa inexistente, para erro de coluna aparecer na aplicação.
DO $$
DECLARE
  v_vazio uuid := '00000000-0000-0000-0000-0000000000ff';
  v_payload jsonb;
BEGIN
  PERFORM 1 FROM public._fin_cmv_linhas_fontes(v_vazio);
  PERFORM public._fin_cmv_retrato_lancamento(v_vazio, v_vazio);
  PERFORM public._fin_cmv_lista(v_vazio, NULL, NULL, 'pendente', NULL, 1, 0, false);
  v_payload := public._fin_cmv_payload(v_vazio, DATE '2026-01-01', DATE '2026-01-07', DATE '2025-12-25', DATE '2025-12-31');
  IF v_payload->>'contrato' IS DISTINCT FROM 'cmv-financeiro/v1' OR NOT (v_payload ? 'lancamentos') THEN
    RAISE EXCEPTION 'CMV lançamentos: payload inesperado';
  END IF;
END;
$$;
```

- [ ] **Step 6: Rodar os testes e ver passar**

Run: `powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql`
Expected: a última saída do `psql` contém `cmv_lancamentos_ephemeral: OK`, sem `FALHOU`.

Run: `bunx vitest run src/test/cmvLancamentosMigration.test.ts src/test/cmvFinanceiroMigration.test.ts src/test/cmvFinanceiroSerieMigration.test.ts src/test/migrationsDataNegocioFuso.test.ts`
Expected: PASS em todos. Os dois testes antigos do CMV continuam lendo os arquivos antigos.

- [ ] **Step 7: Commit**

```powershell
git add supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql src/test/cmvLancamentosMigration.test.ts supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): apura despesas de lançamentos e conciliação junto com os boletos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 2: Banco — a resposta e a competência nas três RPCs de gravação

**Files:**
- Modify: `supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql` (acrescentar no fim)
- Modify: `supabase/tests/database/cmv_lancamentos_ephemeral.sql` (cenários antes do `RETURN`)
- Modify: `src/test/cmvLancamentosMigration.test.ts` (novo `describe` no fim)

**Interfaces:**
- Consumes: `_fin_cmv_retrato_lancamento(uuid, uuid)` (Task 1).
- Produces (usado pelas Tarefas 7, 8 e 9):
  - `reconcile_import_lancamento(p_data date, p_descricao text, p_valor numeric, p_tipo text, p_conta_id uuid, p_user_id uuid, p_rateio_linhas jsonb DEFAULT NULL, p_external_id text DEFAULT NULL, p_force_duplicate boolean DEFAULT false, p_occurrence_index integer DEFAULT 0, p_data_competencia date DEFAULT NULL) RETURNS jsonb`. Cada item de `p_rateio_linhas` aceita `"cmv_incluir": true|false|null`.
  - `_guarded_upsert_lancamento(...os 20 parâmetros de hoje..., p_cmv jsonb DEFAULT NULL) RETURNS TABLE(id uuid, updated_at timestamptz, idempotente boolean)`:
    - `p_cmv` = `{"incluir": true|false|null}`;
    - itens de `p_rateios` aceitam `"id"` e `"cmv_incluir"`.
  - `_guarded_update_reconciled_classification(p_id uuid, p_categoria_id uuid DEFAULT NULL, p_centro_custo_id uuid DEFAULT NULL, p_observacoes text DEFAULT NULL, p_rateios jsonb DEFAULT '[]', p_expected_updated_at timestamptz DEFAULT NULL, p_justificativa_edicao text DEFAULT NULL, p_cmv jsonb DEFAULT NULL, p_data_competencia date DEFAULT NULL) RETURNS TABLE(id uuid, updated_at timestamptz)`.
  - `_fin_cmv_heranca(p_anteriores jsonb, p_categoria_id uuid) RETURNS boolean`, de uso interno.

- [ ] **Step 1: Escrever os cenários de banco (antes do `RETURN 'cmv_lancamentos_ephemeral: OK';`)**

Insira este bloco em `supabase/tests/database/cmv_lancamentos_ephemeral.sql`, logo antes de `  RETURN 'cmv_lancamentos_ephemeral: OK';`:

```sql
  -- 7. Conciliação: competência própria e decisão por linha
  r := reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'PIX ARROZ', p_valor => 55, p_tipo => 'DESPESA',
    p_conta_id => k_a, p_user_id => U,
    p_rateio_linhas => format('[{"categoria_id":"%s","valor":55,"percentual":100,"cmv_incluir":true}]', c_peixes)::jsonb,
    p_data_competencia => '2026-09-03');
  PERFORM cmv_assert(r->>'status' = 'ok', 'importação ok');
  v_imp := (r->>'lancamento_id')::uuid;
  PERFORM cmv_assert((SELECT data_pagamento = '2026-09-10' AND data_competencia = '2026-09-03' AND origem = 'conciliacao' AND conciliado
    FROM fin_lancamentos WHERE id = v_imp), 'data do banco fica no pagamento; a competência, só na competência');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamento_rateios WHERE lancamento_id = v_imp), 'decisão da linha gravada no rateio');
  r := get_fin_cmv_financeiro('2026-08-31', '2026-09-06');
  PERFORM cmv_assert(cmv_total(r, '2026-08-31', '2026-09-06') = 5500, 'o PIX entra na semana da competência');
  -- reenviar a mesma linha (sem FITID) com outra competência: mesma chave (data do banco)
  r := reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'PIX ARROZ', p_valor => 55, p_tipo => 'DESPESA',
    p_conta_id => k_a, p_user_id => U,
    p_rateio_linhas => format('[{"categoria_id":"%s","valor":55,"percentual":100}]', c_peixes)::jsonb,
    p_data_competencia => '2026-09-05');
  PERFORM cmv_assert(r->>'status' = 'duplicate' AND (r->>'lancamento_id')::uuid = v_imp, 'reenvio reconhecido pela data do banco, não pela competência');
  -- mesmo conteúdo com FITID novo e espaçamento diferente: a 2ª camada compara a data do banco
  r := reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'PIX  ARROZ', p_valor => 55, p_tipo => 'DESPESA',
    p_conta_id => k_a, p_user_id => U,
    p_rateio_linhas => format('[{"categoria_id":"%s","valor":55,"percentual":100}]', c_peixes)::jsonb,
    p_external_id => 'FIT-NOVO', p_data_competencia => '2026-09-01');
  PERFORM cmv_assert(r->>'status' = 'possible_duplicate', 'possível duplicata pela data do banco');
  -- receita: a decisão enviada é ignorada
  r := reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'VENDA', p_valor => 80, p_tipo => 'RECEITA',
    p_conta_id => k_a, p_user_id => U,
    p_rateio_linhas => format('[{"categoria_id":"%s","valor":80,"percentual":100,"cmv_incluir":true}]', c_rec)::jsonb);
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamento_rateios WHERE lancamento_id = (r->>'lancamento_id')::uuid), 'receita nunca recebe decisão do CMV');
  -- cliente antigo (posicional, sem competência nem decisão)
  r := reconcile_import_lancamento('2026-09-11', 'PIX ANTIGO', 12, 'DESPESA', k_a, U,
    format('[{"categoria_id":"%s","valor":12,"percentual":100}]', c_peixes)::jsonb);
  PERFORM cmv_assert((SELECT data_competencia = '2026-09-11' AND data_pagamento = '2026-09-11' FROM fin_lancamentos WHERE id = (r->>'lancamento_id')::uuid),
    'sem competência informada vale a data do banco');
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamento_rateios WHERE lancamento_id = (r->>'lancamento_id')::uuid), 'cliente antigo deixa pendente');
  PERFORM cmv_expect_error(format($q$SELECT public.reconcile_import_lancamento(p_data => '2026-09-10', p_descricao => 'T', p_valor => 5, p_tipo => 'TRANSFERENCIA', p_conta_id => '%s', p_user_id => '%s', p_data_competencia => '2026-09-01')$q$, k_a, U),
    'COMPETENCIA_INVALIDA%', 'transferência não aceita competência própria');
  PERFORM cmv_assert((SELECT count(*) FROM pg_proc WHERE proname = 'reconcile_import_lancamento') = 1, 'uma única assinatura de reconcile_import_lancamento');

  -- 8. Livro Razão: criação e edição com a decisão
  SELECT u.id INTO v_lr FROM _guarded_upsert_lancamento(p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 90,
    p_categoria_id => c_peixes, p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Mercado',
    p_cmv => '{"incluir": true}') u;
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_lr), 'despesa sem rateio guarda a decisão no lançamento');
  SELECT u.id INTO v_lr2 FROM _guarded_upsert_lancamento(p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 100,
    p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Feira', p_cmv => '{}',
    p_rateios => format('[{"categoria_id":"%s","valor":70,"cmv_incluir":true},{"categoria_id":"%s","valor":30,"cmv_incluir":false}]', c_peixes, c_escr)::jsonb) u;
  PERFORM cmv_assert((SELECT count(*) FILTER (WHERE cmv_incluir) = 1 AND count(*) FILTER (WHERE NOT cmv_incluir) = 1
    FROM fin_lancamento_rateios WHERE lancamento_id = v_lr2), 'decisão por linha de rateio');
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_lr2), 'lançamento rateado não tem decisão própria');
  -- receita: nem o cabeçalho nem as linhas recebem decisão (formulário que virou receita)
  SELECT u.id INTO v_lr3 FROM _guarded_upsert_lancamento(p_tipo => 'RECEITA', p_valor => 10, p_descricao => 'Receita',
    p_cmv => '{"incluir": true}',
    p_rateios => format('[{"categoria_id":"%s","valor":10,"cmv_incluir":true}]', c_rec)::jsonb) u;
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_lr3)
    AND (SELECT bool_and(cmv_incluir IS NULL) FROM fin_lancamento_rateios WHERE lancamento_id = v_lr3), 'receita sem decisão');
  PERFORM cmv_expect_error($q$SELECT * FROM public._guarded_upsert_lancamento(p_descricao => 'x', p_valor => 1, p_cmv => '"sim"')$q$,
    'CMV_INVALIDO%', 'p_cmv malformado');
  -- edição preservando id e created_at das linhas, com nova decisão
  SELECT array_agg(id ORDER BY valor DESC), array_agg(created_at ORDER BY valor DESC) INTO v_ids, v_criados
  FROM fin_lancamento_rateios WHERE lancamento_id = v_lr2;
  PERFORM _guarded_upsert_lancamento(p_id => v_lr2, p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 100,
    p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Feira',
    p_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_lr2), p_cmv => '{}',
    p_rateios => format('[{"id":"%s","categoria_id":"%s","valor":70,"cmv_incluir":false},{"id":"%s","categoria_id":"%s","valor":30,"cmv_incluir":false}]',
      v_ids[1], c_peixes, v_ids[2], c_escr)::jsonb);
  PERFORM cmv_assert((SELECT array_agg(id ORDER BY valor DESC) = v_ids AND array_agg(created_at ORDER BY valor DESC) = v_criados
    AND bool_and(cmv_incluir IS FALSE) FROM fin_lancamento_rateios WHERE lancamento_id = v_lr2), 'edição preserva id/created_at e grava a nova decisão');
  -- cliente antigo (sem p_cmv): mesma categoria herda; categoria trocada volta para pendente
  PERFORM _guarded_upsert_lancamento(p_id => v_lr, p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 90,
    p_categoria_id => c_peixes, p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Mercado editado',
    p_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_lr));
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_lr), 'cliente antigo herda a decisão da mesma categoria');
  PERFORM _guarded_upsert_lancamento(p_id => v_lr, p_tipo => 'DESPESA', p_status => 'REALIZADO', p_valor => 90,
    p_categoria_id => c_escr, p_data_competencia => '2026-09-08', p_data_pagamento => '2026-09-08', p_descricao => 'Mercado editado',
    p_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_lr), p_justificativa_edicao => 'troca de categoria');
  PERFORM cmv_assert((SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_lr), 'categoria trocada sem resposta volta para pendente');
  PERFORM cmv_expect_error(format($q$SELECT * FROM public._guarded_upsert_lancamento(p_id => '%s', p_tipo => 'DESPESA', p_valor => 90, p_descricao => 'x', p_updated_at => '2020-01-01T00:00:00Z', p_cmv => '{}')$q$, v_lr),
    'CONFLICT%', 'lock otimista da edição');
  PERFORM cmv_assert((SELECT count(*) FROM pg_proc WHERE proname = '_guarded_upsert_lancamento') = 1, 'uma única assinatura do upsert');

  -- 9. Reclassificação de lançamento conciliado: decisão e competência
  v_rid := (SELECT id FROM fin_lancamento_rateios WHERE lancamento_id = v_imp);
  PERFORM _guarded_update_reconciled_classification(p_id => v_imp,
    p_rateios => format('[{"id":"%s","categoria_id":"%s","valor":55,"cmv_incluir":false}]', v_rid, c_peixes)::jsonb,
    p_expected_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_imp),
    p_justificativa_edicao => 'compra da semana anterior', p_cmv => '{}', p_data_competencia => '2026-08-31');
  PERFORM cmv_assert((SELECT data_competencia = '2026-08-31' AND data_pagamento = '2026-09-10' AND conciliado
    FROM fin_lancamentos WHERE id = v_imp), 'reclassificação muda só a competência e mantém a conciliação');
  PERFORM cmv_assert((SELECT id = v_rid AND cmv_incluir IS FALSE FROM fin_lancamento_rateios WHERE lancamento_id = v_imp), 'linha preservada com a nova decisão');
  -- conciliado sem data_pagamento: a competência antiga vira a data do banco
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, conciliado, descricao)
  VALUES ('DESPESA', 33, '2026-09-05', NULL, 'REALIZADO', 'manual', A, c_peixes, true, 'Manual conciliado') RETURNING id INTO v_sem_pag;
  PERFORM _guarded_update_reconciled_classification(p_id => v_sem_pag, p_categoria_id => c_peixes,
    p_expected_updated_at => (SELECT updated_at FROM fin_lancamentos WHERE id = v_sem_pag),
    p_justificativa_edicao => 'competência', p_cmv => '{"incluir": true}', p_data_competencia => '2026-09-01');
  PERFORM cmv_assert((SELECT data_competencia = '2026-09-01' AND data_pagamento = '2026-09-05' AND cmv_incluir
    FROM fin_lancamentos WHERE id = v_sem_pag), 'sem data do banco, a competência antiga vira data de pagamento');
  -- cliente antigo (7 parâmetros) preserva decisão e competência
  PERFORM _guarded_update_reconciled_classification(v_sem_pag, c_peixes, NULL, 'obs', '[]'::jsonb,
    (SELECT updated_at FROM fin_lancamentos WHERE id = v_sem_pag), 'só observação');
  PERFORM cmv_assert((SELECT cmv_incluir AND data_competencia = '2026-09-01' FROM fin_lancamentos WHERE id = v_sem_pag),
    'cliente antigo preserva decisão e competência');
  PERFORM cmv_expect_error(format($q$SELECT * FROM public._guarded_update_reconciled_classification(p_id => '%s', p_categoria_id => '%s', p_justificativa_edicao => ' ')$q$, v_sem_pag, c_peixes),
    'JUSTIFICATIVA_OBRIGATORIA%', 'reclassificação exige justificativa');
  PERFORM cmv_assert((SELECT count(*) FROM pg_proc WHERE proname = '_guarded_update_reconciled_classification') = 1, 'uma única assinatura da reclassificação');
  PERFORM cmv_assert(NOT has_function_privilege('authenticated', 'public._fin_cmv_heranca(jsonb,uuid)', 'EXECUTE'), 'helper de herança fechado');
```

- [ ] **Step 2: Escrever o contrato do SQL de escrita**

Acrescente no fim de `src/test/cmvLancamentosMigration.test.ts`:

```ts
describe('migration CMV com lançamentos — escrita', () => {
  it('conciliação: a data do banco continua na chave e na 2ª camada; competência e decisão são opcionais', () => {
    const c = corpo('reconcile_import_lancamento');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer);');
    expect(c).toContain('p_occurrence_index integer DEFAULT 0,\n  p_data_competencia date DEFAULT NULL::date');
    expect(c).toContain('v_legacy_idem_key := md5(v_company::text || p_data::text || p_descricao || p_valor::text || p_tipo || p_conta_id::text);');
    expect(c.split('AND l.data_pagamento = p_data').length - 1).toBe(2);
    expect(c).toContain('v_competencia := COALESCE(p_data_competencia, p_data);');
    expect(plano(c)).toContain('p_tipo, p_valor, v_competencia, p_data, p_descricao, p_conta_id,');
    expect(plano(c)).toContain("CASE WHEN p_tipo = 'DESPESA' AND jsonb_typeof(v_rateio_item->'cmv_incluir') = 'boolean'");
    expect(plano(c)).toContain("'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage'");
    expect(c).toContain("IF v_constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN");
  });

  it('Livro Razão: p_cmv opcional, id da linha preservado, nunca exige a resposta', () => {
    const c = corpo('_guarded_upsert_lancamento');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text);');
    expect(c).toContain('p_cmv jsonb DEFAULT NULL::jsonb');
    expect(c).not.toContain('CMV_DECISAO_OBRIGATORIA');
    expect(c).toContain('NOT (_r.id = ANY(_usados))');
    expect(c).toContain('public._fin_cmv_heranca(_old_set, _r.categoria_id)');
    expect(c).toContain("RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';");
    expect(c).toContain("RAISE EXCEPTION 'Lançamento conciliado não pode ser editado. Desconcilie primeiro.';");
    expect(plano(c)).toContain("'financeiro:lancamentos:create', 'finance:manage', 'system:global:manage'");
  });

  it('reclassificação: muda a competência e a decisão; a data do banco nunca', () => {
    const c = corpo('_guarded_update_reconciled_classification');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public._guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text);');
    expect(c).toContain('p_cmv jsonb DEFAULT NULL::jsonb,\n  p_data_competencia date DEFAULT NULL::date');
    expect(c).toContain('THEN COALESCE(v_lanc.data_pagamento, v_lanc.data_competencia)');
    expect(c).toContain("RAISE EXCEPTION 'ORIGEM_INVALIDA: edite a conta a pagar/receber de origem';");
    expect(c).toContain("RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA';");
    expect(c).not.toMatch(/\bvalor\s*=\s*p_/);
    expect(c).not.toMatch(/\bconta_id\s*=/);
  });

  it('EXECUTE das assinaturas novas só para authenticated e service_role', () => {
    for (const sig of [
      'reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date)',
      '_guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text, jsonb)',
      '_guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text, jsonb, date)',
    ]) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated, service_role;`);
    }
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._fin_cmv_heranca(jsonb, uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bunx vitest run src/test/cmvLancamentosMigration.test.ts`
Expected: FAIL. O bloco "escrita" não acha `reconcile_import_lancamento` na migration.

Run: `powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql`
Expected: FAIL. O stub antigo de `reconcile_import_lancamento` não aceita `p_data_competencia` (`function ... does not exist`).

- [ ] **Step 4: Acrescentar as RPCs de escrita no fim da migration**

Acrescente no fim de `supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql`:

```sql
-- ─── Herança da decisão para o cliente antigo ────────────────────────────────
-- Decisão que a MESMA categoria tinha no documento antes da edição: só quando é
-- unânime; senão, pendente (mesma regra de _guarded_update_conta_pagar).
CREATE OR REPLACE FUNCTION public._fin_cmv_heranca(p_anteriores jsonb, p_categoria_id uuid)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE o.cmv_incluir IS NULL) = 0
              AND count(DISTINCT o.cmv_incluir) = 1 THEN bool_and(o.cmv_incluir) END
  FROM jsonb_to_recordset(COALESCE(p_anteriores, '[]'::jsonb)) AS o(categoria_id uuid, cmv_incluir boolean)
  WHERE o.categoria_id IS NOT DISTINCT FROM p_categoria_id;
$$;

REVOKE ALL ON FUNCTION public._fin_cmv_heranca(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- ─── Conciliação: competência própria e decisão do CMV por linha ─────────────
-- p_data continua sendo a data do BANCO: vira data_pagamento e entra na chave de
-- idempotência e na checagem de "possível duplicata" (nada disso muda). A
-- competência (p_data_competencia, opcional) só muda data_competencia — DRE e
-- CMV. Cada item de p_rateio_linhas pode levar "cmv_incluir" (só em DESPESA).
-- Corpo a partir de 20260930130000_conciliacao_chave_ocorrencia.sql (= banco vivo
-- em 2026-10-05). Parâmetro novo com default: chamadas antigas continuam valendo.
DROP FUNCTION IF EXISTS public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer);

CREATE FUNCTION public.reconcile_import_lancamento(
  p_data date,
  p_descricao text,
  p_valor numeric,
  p_tipo text,
  p_conta_id uuid,
  p_user_id uuid,
  p_rateio_linhas jsonb DEFAULT NULL::jsonb,
  p_external_id text DEFAULT NULL::text,
  p_force_duplicate boolean DEFAULT false,
  p_occurrence_index integer DEFAULT 0,
  p_data_competencia date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_lancamento_id uuid;
  v_idem_key text;
  v_legacy_idem_key text;
  v_conteudo_idem_key text;
  v_external_id text;
  v_company uuid;
  v_uid uuid;
  v_rateio_item jsonb;
  v_cat_id uuid;
  v_cc_id uuid;
  v_invalid_categories int;
  v_dup_id uuid;
  v_dup_created_at timestamptz;
  v_existing_count int;
  v_occurrence_index int;
  v_descricao_normalizada text;
  v_constraint text;
  v_competencia date;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;
  IF p_tipo NOT IN ('RECEITA', 'DESPESA', 'TRANSFERENCIA') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  -- Transferência não tem competência própria: as duas pernas usam a data do banco.
  IF p_data_competencia IS NOT NULL AND p_tipo = 'TRANSFERENCIA' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COMPETENCIA_INVALIDA: transferência usa a data do banco';
  END IF;
  v_competencia := COALESCE(p_data_competencia, p_data);

  -- Mesmo padrão do cabeçalho de CP/CR: a conta entra na chave e no lançamento.
  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_occurrence_index := GREATEST(COALESCE(p_occurrence_index, 0), 0);

  IF p_tipo <> 'TRANSFERENCIA' THEN
    IF p_rateio_linhas IS NULL OR jsonb_typeof(p_rateio_linhas) <> 'array' OR jsonb_array_length(p_rateio_linhas) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: selecione uma categoria antes de conciliar';
    END IF;
    SELECT count(*) INTO v_invalid_categories
    FROM jsonb_array_elements(p_rateio_linhas) item
    LEFT JOIN public.fin_categorias c
      ON c.id = NULLIF(item->>'categoria_id', '')::uuid
      AND c.company_id = v_company AND c.ativo = true
    WHERE c.id IS NULL OR c.tipo <> lower(p_tipo);
    IF v_invalid_categories > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: categoria inválida ou incompatível com o tipo';
    END IF;
  END IF;

  v_external_id := NULLIF(btrim(p_external_id), '');
  IF v_external_id IS NOT NULL AND length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_ID';
  END IF;

  v_legacy_idem_key := md5(v_company::text || p_data::text || p_descricao || p_valor::text || p_tipo || p_conta_id::text);
  -- Linha sem FITID (CSV): a identidade é o conteúdo + a ocorrência dele no
  -- extrato. A 1ª ocorrência mantém a chave legada — lançamentos já gravados
  -- continuam reconhecidos e reimportar o arquivo não duplica —, e a n-ésima
  -- tem chave própria. Sem isso a 2ª venda idêntica do dia caía no caminho
  -- rápido da 1ª e devolvia 'duplicate' antes de olhar p_force_duplicate.
  v_conteudo_idem_key := CASE
    WHEN v_legacy_idem_key IS NULL OR v_occurrence_index = 0 THEN v_legacy_idem_key
    ELSE md5(concat_ws('|', v_legacy_idem_key, 'ocorrencia', v_occurrence_index::text))
  END;
  v_idem_key := CASE
    WHEN v_external_id IS NOT NULL
      THEN md5(concat_ws('|', v_company::text, p_conta_id::text, 'external', v_external_id))
    ELSE v_conteudo_idem_key
  END;

  SELECT id INTO v_lancamento_id
  FROM public.fin_lancamentos
  WHERE idempotency_key = v_idem_key AND company_id = v_company;

  IF v_lancamento_id IS NULL AND v_external_id IS NOT NULL THEN
    SELECT id INTO v_lancamento_id
    FROM public.fin_lancamentos
    WHERE idempotency_key = v_legacy_idem_key AND company_id = v_company;

    IF v_lancamento_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.fin_conciliacao_vinculos v
        WHERE v.company_id = v_company
          AND v.conta_id = p_conta_id
          AND v.lancamento_id = v_lancamento_id
          AND v.external_id <> v_external_id
      ) THEN
        v_lancamento_id := NULL;
      ELSE
        UPDATE public.fin_lancamentos
        SET idempotency_key = v_idem_key
        WHERE id = v_lancamento_id;
      END IF;
    END IF;
  END IF;

  IF v_lancamento_id IS NOT NULL THEN
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid
    WHERE id = v_lancamento_id;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END IF;

  -- Colapsa espaços internos antes de comparar: o MEMO do OFX varia o espaçamento
  -- entre exportações do mesmo extrato (ex.: Santander), então uma comparação exata
  -- de string (mesmo com lower+unaccent) deixa passar duplicata como se fosse nova.
  v_descricao_normalizada := regexp_replace(lower(public.immutable_unaccent(btrim(p_descricao))), '\s+', ' ', 'g');

  IF NOT p_force_duplicate THEN
    SELECT count(*) INTO v_existing_count
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.conta_id = p_conta_id
      AND l.tipo = p_tipo
      AND l.valor = p_valor
      AND l.data_pagamento = p_data
      AND regexp_replace(lower(public.immutable_unaccent(btrim(l.descricao))), '\s+', ' ', 'g') = v_descricao_normalizada
      AND l.origem IN ('conciliacao', 'espelho_cp', 'espelho_cr');

    IF v_occurrence_index < v_existing_count THEN
      SELECT l.id, l.created_at INTO v_dup_id, v_dup_created_at
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.conta_id = p_conta_id
        AND l.tipo = p_tipo
        AND l.valor = p_valor
        AND l.data_pagamento = p_data
        AND regexp_replace(lower(public.immutable_unaccent(btrim(l.descricao))), '\s+', ' ', 'g') = v_descricao_normalizada
        AND l.origem IN ('conciliacao', 'espelho_cp', 'espelho_cr')
      ORDER BY l.created_at ASC
      OFFSET v_occurrence_index
      LIMIT 1;

      IF v_dup_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'status', 'possible_duplicate',
          'lancamento_id', v_dup_id,
          'criado_em', v_dup_created_at
        );
      END IF;
    END IF;
  END IF;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) = 1 THEN
    v_cat_id := NULLIF(p_rateio_linhas->0->>'categoria_id', '')::uuid;
    v_cc_id := NULLIF(p_rateio_linhas->0->>'centro_custo_id', '')::uuid;
  END IF;

  BEGIN
    INSERT INTO public.fin_lancamentos (
      tipo, valor, data_competencia, data_pagamento, descricao, conta_id,
      forma_pagamento, status, conciliado, conciliado_em, conciliado_por,
      created_by, idempotency_key, company_id, origem, categoria_id, centro_custo_id
    ) VALUES (
      p_tipo, p_valor, v_competencia, p_data, p_descricao, p_conta_id,
      'extrato', 'REALIZADO', true, now(), v_uid,
      v_uid, v_idem_key, v_company, 'conciliacao', v_cat_id, v_cc_id
    ) RETURNING id INTO v_lancamento_id;
  EXCEPTION WHEN unique_violation THEN
    -- Outra chamada com a mesma chave gravou entre o SELECT acima e este INSERT:
    -- é a mesma linha do extrato, então vale o mesmo retorno do caminho rápido.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN
      RAISE;
    END IF;
    SELECT id INTO v_lancamento_id
    FROM public.fin_lancamentos
    WHERE idempotency_key = v_idem_key AND company_id = v_company;
    IF v_lancamento_id IS NULL THEN
      RAISE;
    END IF;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 0 THEN
    FOR v_rateio_item IN SELECT * FROM jsonb_array_elements(p_rateio_linhas) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id, cmv_incluir
      ) VALUES (
        v_lancamento_id, (v_rateio_item->>'categoria_id')::uuid,
        NULLIF(v_rateio_item->>'centro_custo_id', '')::uuid,
        (v_rateio_item->>'valor')::numeric, (v_rateio_item->>'percentual')::numeric,
        v_rateio_item->>'observacao', v_company,
        -- Só despesa entra no CMV financeiro; sem resposta = pendente.
        CASE WHEN p_tipo = 'DESPESA' AND jsonb_typeof(v_rateio_item->'cmv_incluir') = 'boolean'
          THEN (v_rateio_item->>'cmv_incluir')::boolean END
      );
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', v_lancamento_id, 'reconcile_import', v_uid, v_company,
    jsonb_build_object('valor', p_valor, 'tipo', p_tipo, 'data', p_data, 'data_competencia', v_competencia,
      'descricao', p_descricao, 'categoria_id', v_cat_id, 'rateios', p_rateio_linhas,
      'external_id_used', v_external_id IS NOT NULL, 'category_validation', 'passed',
      'force_duplicate', p_force_duplicate, 'occurrence_index', v_occurrence_index));
  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$function$;

-- ─── Livro Razão: a decisão do CMV na criação/edição da despesa manual ───────
-- p_cmv (novo, opcional): {"incluir": true|false|null} = decisão da despesa SEM
-- rateio. Com rateio, cada item de p_rateios leva "cmv_incluir" e, na edição, o
-- "id" da linha, que é preservado (mesma regra de _guarded_update_conta_pagar).
-- Cliente sem p_cmv (versão antiga, edição pela tela de Conciliação): na criação
-- a decisão nasce pendente; na edição herda a da MESMA categoria (se unânime).
-- Nunca exige a resposta: CMV_DECISAO_OBRIGATORIA é só de boleto.
-- Corpo a partir do banco vivo (pg_get_functiondef, 2026-10-05).
DROP FUNCTION IF EXISTS public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text);

CREATE FUNCTION public._guarded_upsert_lancamento(
  p_id uuid DEFAULT NULL::uuid,
  p_tipo text DEFAULT 'DESPESA'::text,
  p_status text DEFAULT 'PREVISTO'::text,
  p_valor numeric DEFAULT 0,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_data_competencia date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date,
  p_data_vencimento date DEFAULT NULL::date,
  p_data_pagamento date DEFAULT NULL::date,
  p_descricao text DEFAULT ''::text,
  p_observacoes text DEFAULT NULL::text,
  p_forma_pagamento text DEFAULT 'pix'::text,
  p_origem text DEFAULT 'manual'::text,
  p_recorrente boolean DEFAULT false,
  p_recorrencia_config jsonb DEFAULT NULL::jsonb,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_justificativa_edicao text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_cmv jsonb DEFAULT NULL::jsonb
)
RETURNS TABLE(id uuid, updated_at timestamp with time zone, idempotente boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _company_id uuid;
  _user_id uuid;
  _v_id uuid;
  _v_updated_at timestamptz;
  _existing record;
  _request_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  _idem_key text;
  _replay boolean := false;
  _constraint text;
  -- CMV Financeiro
  _cmv_cliente boolean := p_cmv IS NOT NULL;
  _despesa boolean := p_tipo = 'DESPESA';
  _rateios jsonb := CASE WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios ELSE '[]'::jsonb END;
  _tem_rateio boolean;
  _cmv_titulo boolean;
  _cmv_antes jsonb;
  _old_rateios jsonb := '[]'::jsonb;
  _old_set jsonb := '[]'::jsonb;
  _usados uuid[] := '{}';
  _r record;
  _line_id uuid;
  _line_created timestamptz;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _company_id := public.assert_tenant();

  IF p_cmv IS NOT NULL AND (
    jsonb_typeof(p_cmv) <> 'object'
    OR (p_cmv ? 'incluir' AND jsonb_typeof(p_cmv->'incluir') NOT IN ('boolean', 'null'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;
  _tem_rateio := jsonb_array_length(_rateios) > 0;

  -- Permission check
  IF p_id IS NULL THEN
    IF NOT public.has_any_permission(_user_id, ARRAY[
      'financeiro:lancamentos:create', 'finance:manage', 'system:global:manage'
    ]) THEN
      RAISE EXCEPTION 'Permission denied: financeiro:lancamentos:create';
    END IF;
  ELSE
    IF NOT public.has_any_permission(_user_id, ARRAY[
      'financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage'
    ]) THEN
      RAISE EXCEPTION 'Permission denied: financeiro:lancamentos:edit';
    END IF;

    -- Fetch existing for optimistic locking
    SELECT fl.* INTO _existing
    FROM public.fin_lancamentos fl
    WHERE fl.id = p_id AND fl.company_id = _company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lancamento not found';
    END IF;

    -- Block editing conciliados
    IF _existing.conciliado = true THEN
      RAISE EXCEPTION 'Lançamento conciliado não pode ser editado. Desconcilie primeiro.';
    END IF;

    -- Optimistic locking
    IF p_updated_at IS NOT NULL AND _existing.updated_at != p_updated_at THEN
      RAISE EXCEPTION 'CONFLICT: Registro alterado por outro usuário';
    END IF;

    -- Estado anterior da classificação do CMV (auditoria + herança do cliente antigo).
    _cmv_antes := public._fin_cmv_retrato_lancamento(_company_id, p_id);
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'categoria_id', r.categoria_id, 'cmv_incluir', r.cmv_incluir, 'created_at', r.created_at
    )), '[]'::jsonb)
    INTO _old_rateios
    FROM public.fin_lancamento_rateios r
    WHERE r.lancamento_id = p_id AND r.company_id = _company_id;
    _old_set := CASE WHEN jsonb_array_length(_old_rateios) > 0 THEN _old_rateios
      ELSE jsonb_build_array(jsonb_build_object('categoria_id', _existing.categoria_id, 'cmv_incluir', _existing.cmv_incluir)) END;
  END IF;

  -- Decisão da despesa SEM rateio (com rateio, cada linha tem a sua). Só despesa
  -- entra no CMV financeiro. Cliente antigo herda a decisão da mesma categoria.
  _cmv_titulo := CASE
    WHEN NOT _despesa OR _tem_rateio THEN NULL
    WHEN _cmv_cliente THEN
      CASE WHEN jsonb_typeof(p_cmv->'incluir') = 'boolean' THEN (p_cmv->>'incluir')::boolean END
    WHEN p_id IS NULL THEN NULL
    ELSE public._fin_cmv_heranca(_old_set, p_categoria_id)
  END;

  IF p_id IS NULL THEN
    -- Chave só vale para criação. Prefixo próprio: fin_lancamentos.idempotency_key
    -- é compartilhada com a conciliação (md5) e a recorrência ('recorrencia:').
    IF _request_key IS NOT NULL THEN
      IF length(_request_key) > 200 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALIDA';
      END IF;
      _idem_key := 'manual:' || _request_key;

      SELECT fl.id, fl.updated_at, fl.tipo, fl.valor, fl.conta_id, fl.data_competencia,
             fl.descricao, fl.categoria_id
        INTO _existing
      FROM public.fin_lancamentos fl
      WHERE fl.company_id = _company_id AND fl.idempotency_key = _idem_key;
      _replay := FOUND;
    END IF;

    IF NOT _replay THEN
      BEGIN
        INSERT INTO public.fin_lancamentos (
          tipo, status, valor, conta_id, categoria_id, centro_custo_id,
          data_competencia, data_vencimento, data_pagamento,
          descricao, observacoes, forma_pagamento, origem,
          recorrente, recorrencia_config,
          created_by, company_id, idempotency_key, cmv_incluir
        ) VALUES (
          p_tipo, p_status, p_valor, p_conta_id, p_categoria_id, p_centro_custo_id,
          p_data_competencia, p_data_vencimento, p_data_pagamento,
          p_descricao, p_observacoes, p_forma_pagamento, p_origem,
          p_recorrente, p_recorrencia_config,
          _user_id, _company_id, _idem_key, _cmv_titulo
        )
        RETURNING fin_lancamentos.id, fin_lancamentos.updated_at
        INTO _v_id, _v_updated_at;
      EXCEPTION WHEN unique_violation THEN
        -- Outra chamada com a mesma chave gravou entre o SELECT e este INSERT.
        GET STACKED DIAGNOSTICS _constraint = CONSTRAINT_NAME;
        IF _idem_key IS NULL OR _constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN
          RAISE;
        END IF;
        SELECT fl.id, fl.updated_at, fl.tipo, fl.valor, fl.conta_id, fl.data_competencia,
               fl.descricao, fl.categoria_id
          INTO _existing
        FROM public.fin_lancamentos fl
        WHERE fl.company_id = _company_id AND fl.idempotency_key = _idem_key;
        IF NOT FOUND THEN
          RAISE;
        END IF;
        _replay := true;
      END;
    END IF;

    IF _replay THEN
      -- Só é reenvio se descrever a MESMA operação.
      IF _existing.tipo IS DISTINCT FROM p_tipo
         OR round(_existing.valor, 2) IS DISTINCT FROM round(p_valor, 2)
         OR _existing.conta_id IS DISTINCT FROM p_conta_id
         OR _existing.data_competencia IS DISTINCT FROM p_data_competencia
         OR _existing.descricao IS DISTINCT FROM p_descricao
         OR _existing.categoria_id IS DISTINCT FROM p_categoria_id THEN
        RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
      END IF;
      RETURN QUERY SELECT _existing.id, _existing.updated_at, true;
      RETURN;
    END IF;
  ELSE
    -- UPDATE
    UPDATE public.fin_lancamentos SET
      tipo = p_tipo,
      status = p_status,
      valor = p_valor,
      conta_id = p_conta_id,
      categoria_id = p_categoria_id,
      centro_custo_id = p_centro_custo_id,
      data_competencia = p_data_competencia,
      data_vencimento = p_data_vencimento,
      data_pagamento = p_data_pagamento,
      descricao = p_descricao,
      observacoes = p_observacoes,
      forma_pagamento = p_forma_pagamento,
      recorrente = p_recorrente,
      recorrencia_config = p_recorrencia_config,
      justificativa_edicao = p_justificativa_edicao,
      cmv_incluir = _cmv_titulo,
      updated_at = now()
    WHERE fin_lancamentos.id = p_id AND company_id = _company_id
    RETURNING fin_lancamentos.id, fin_lancamentos.updated_at
    INTO _v_id, _v_updated_at;
  END IF;

  -- Rateios: apaga e reinsere; a linha que já era deste lançamento mantém id e
  -- created_at (a decisão do CMV é da linha e precisa de identificador estável).
  IF _v_id IS NOT NULL THEN
    DELETE FROM public.fin_lancamento_rateios WHERE lancamento_id = _v_id AND company_id = _company_id;

    IF _tem_rateio THEN
      FOR _r IN SELECT * FROM jsonb_to_recordset(_rateios) AS x(
        id uuid, categoria_id uuid, centro_custo_id text, valor numeric, percentual numeric, observacao text, cmv_incluir boolean
      ) LOOP
        _line_id := NULL;
        _line_created := NULL;
        IF p_id IS NOT NULL AND _r.id IS NOT NULL AND NOT (_r.id = ANY(_usados)) THEN
          SELECT o.id, o.created_at INTO _line_id, _line_created
          FROM jsonb_to_recordset(_old_rateios) AS o(id uuid, created_at timestamptz)
          WHERE o.id = _r.id;
        END IF;
        IF _line_id IS NULL THEN
          _line_id := gen_random_uuid();
          _line_created := now();
        END IF;
        _usados := _usados || _line_id;

        INSERT INTO public.fin_lancamento_rateios (
          id, lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id, cmv_incluir, created_at
        ) VALUES (
          _line_id, _v_id, _r.categoria_id, NULLIF(_r.centro_custo_id, '')::uuid, _r.valor, _r.percentual,
          NULLIF(_r.observacao, ''), _company_id,
          CASE
            WHEN NOT _despesa THEN NULL
            WHEN _cmv_cliente THEN _r.cmv_incluir
            WHEN p_id IS NULL THEN NULL
            ELSE public._fin_cmv_heranca(_old_set, _r.categoria_id)
          END,
          _line_created
        );
      END LOOP;
    END IF;

    -- Na criação _existing não tem a linha inteira (só o SELECT da chave), então
    -- a auditoria de cada caminho fica num ramo próprio.
    IF p_id IS NULL THEN
      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
      VALUES (
        'lancamentos', _v_id, 'criar',
        jsonb_build_object(
          'tipo', p_tipo, 'status', p_status, 'valor', p_valor,
          'conta_id', p_conta_id, 'categoria_id', p_categoria_id,
          'data_competencia', p_data_competencia, 'descricao', p_descricao,
          'origem', p_origem, 'rateios', jsonb_array_length(_rateios),
          'cmv', public._fin_cmv_retrato_lancamento(_company_id, _v_id)
        ),
        _user_id, _company_id
      );
    ELSE
      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
      VALUES (
        'lancamentos', _v_id, 'editar',
        jsonb_build_object(
          'tipo', _existing.tipo, 'status', _existing.status, 'valor', _existing.valor,
          'conta_id', _existing.conta_id, 'categoria_id', _existing.categoria_id,
          'data_competencia', _existing.data_competencia, 'descricao', _existing.descricao,
          'cmv', _cmv_antes
        ),
        jsonb_build_object(
          'tipo', p_tipo, 'status', p_status, 'valor', p_valor,
          'conta_id', p_conta_id, 'categoria_id', p_categoria_id,
          'data_competencia', p_data_competencia, 'descricao', p_descricao,
          'rateios', jsonb_array_length(_rateios),
          'cmv', public._fin_cmv_retrato_lancamento(_company_id, _v_id)
        ),
        coalesce(p_justificativa_edicao, ''),
        _user_id, _company_id
      );
    END IF;
  END IF;

  RETURN QUERY SELECT _v_id, _v_updated_at, false;
END;
$function$;

-- ─── Lançamento conciliado: reclassificação com decisão e competência ────────
-- Continua sem desfazer a conciliação: categoria, centro de custo, rateio,
-- observações, a decisão do CMV e a DATA DE COMPETÊNCIA (com justificativa). A
-- data do banco (data_pagamento) nunca muda; se o lançamento não tem, a
-- competência antiga vira data_pagamento antes da troca — o reconhecimento da
-- linha já conciliada usa data_pagamento || data_competencia.
-- Corpo a partir do banco vivo (pg_get_functiondef, 2026-10-05).
DROP FUNCTION IF EXISTS public._guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text);

CREATE FUNCTION public._guarded_update_reconciled_classification(
  p_id uuid,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_justificativa_edicao text DEFAULT NULL::text,
  p_cmv jsonb DEFAULT NULL::jsonb,
  p_data_competencia date DEFAULT NULL::date
)
RETURNS TABLE(id uuid, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_lanc public.fin_lancamentos%ROWTYPE;
  v_rateios jsonb;
  v_rateio_count integer;
  v_rateio_sum numeric;
  v_invalid_count integer;
  v_header_categoria_id uuid;
  v_header_centro_custo_id uuid;
  v_updated_at timestamptz;
  v_antes jsonb;
  v_depois jsonb;
  -- CMV Financeiro e competência
  v_cmv_cliente boolean := p_cmv IS NOT NULL;
  v_despesa boolean;
  v_cmv_titulo boolean;
  v_cmv_antes jsonb;
  v_old_rateios jsonb;
  v_old_set jsonb;
  v_usados uuid[] := '{}';
  v_r record;
  v_line_id uuid;
  v_line_created timestamptz;
  v_competencia date;
  v_pagamento date;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario nao autenticado';
  END IF;

  IF NOT public.has_any_permission(v_user_id, ARRAY[
    'financeiro:lancamentos:edit',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:edit necessario';
  END IF;

  SELECT l.*
  INTO v_lanc
  FROM public.fin_lancamentos l
  WHERE l.id = p_id
    AND l.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lancamento nao encontrado';
  END IF;

  IF v_lanc.conciliado IS NOT TRUE THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: lancamento nao esta conciliado';
  END IF;

  IF v_lanc.tipo = 'TRANSFERENCIA' THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: transferencia nao possui classificacao contabil';
  END IF;

  IF v_lanc.origem IN ('espelho_cp', 'espelho_cr') THEN
    RAISE EXCEPTION 'ORIGEM_INVALIDA: edite a conta a pagar/receber de origem';
  END IF;

  IF p_expected_updated_at IS NOT NULL
     AND v_lanc.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  IF NULLIF(btrim(p_justificativa_edicao), '') IS NULL THEN
    RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA';
  END IF;

  IF p_rateios IS NULL OR jsonb_typeof(p_rateios) <> 'array' THEN
    RAISE EXCEPTION 'RATEIO_INVALIDO: rateios deve ser um array';
  END IF;

  IF p_cmv IS NOT NULL AND (
    jsonb_typeof(p_cmv) <> 'object'
    OR (p_cmv ? 'incluir' AND jsonb_typeof(p_cmv->'incluir') NOT IN ('boolean', 'null'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;
  v_despesa := v_lanc.tipo = 'DESPESA';

  v_rateios := p_rateios;
  v_rateio_count := jsonb_array_length(v_rateios);

  IF v_rateio_count = 0 THEN
    IF p_categoria_id IS NULL THEN
      RAISE EXCEPTION 'CATEGORIA_OBRIGATORIA';
    END IF;

    PERFORM 1
    FROM public.fin_categorias c
    WHERE c.id = p_categoria_id
      AND c.company_id = v_company_id
      AND c.ativo = true
      AND c.tipo = lower(v_lanc.tipo);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CATEGORIA_INVALIDA: categoria inativa, de outro tipo ou empresa';
    END IF;

    IF p_centro_custo_id IS NOT NULL THEN
      PERFORM 1
      FROM public.fin_centros_custo cc
      WHERE cc.id = p_centro_custo_id
        AND cc.company_id = v_company_id
        AND cc.ativo = true;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'CENTRO_CUSTO_INVALIDO';
      END IF;
    END IF;

    v_header_categoria_id := p_categoria_id;
    v_header_centro_custo_id := p_centro_custo_id;
  ELSE
    SELECT
      count(*) FILTER (
        WHERE r.categoria_id IS NULL
           OR r.valor IS NULL
           OR r.valor <= 0
           OR c.id IS NULL
           OR (r.centro_custo_id IS NOT NULL AND cc.id IS NULL)
      ),
      COALESCE(sum(r.valor), 0)
    INTO v_invalid_count, v_rateio_sum
    FROM jsonb_to_recordset(v_rateios) AS r(
      categoria_id uuid,
      centro_custo_id uuid,
      valor numeric,
      percentual numeric,
      observacao text
    )
    LEFT JOIN public.fin_categorias c
      ON c.id = r.categoria_id
     AND c.company_id = v_company_id
     AND c.ativo = true
     AND c.tipo = lower(v_lanc.tipo)
    LEFT JOIN public.fin_centros_custo cc
      ON cc.id = r.centro_custo_id
     AND cc.company_id = v_company_id
     AND cc.ativo = true;

    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'RATEIO_INVALIDO: categoria, centro de custo ou valor invalido';
    END IF;

    IF abs(v_rateio_sum - v_lanc.valor) >= 0.01 THEN
      RAISE EXCEPTION 'RATEIO_INCOMPLETO: total (%) difere do lancamento (%)',
        v_rateio_sum, v_lanc.valor;
    END IF;

    IF v_rateio_count = 1 THEN
      SELECT r.categoria_id, r.centro_custo_id
      INTO v_header_categoria_id, v_header_centro_custo_id
      FROM jsonb_to_record(v_rateios->0) AS r(
        categoria_id uuid,
        centro_custo_id uuid
      );
    ELSE
      v_header_categoria_id := NULL;
      v_header_centro_custo_id := NULL;
    END IF;
  END IF;

  -- Competência: só a data de competência muda; a data do banco fica.
  v_competencia := COALESCE(p_data_competencia, v_lanc.data_competencia);
  v_pagamento := CASE
    WHEN v_competencia IS DISTINCT FROM v_lanc.data_competencia
      THEN COALESCE(v_lanc.data_pagamento, v_lanc.data_competencia)
    ELSE v_lanc.data_pagamento
  END;

  -- Decisão do CMV: estado anterior (auditoria e herança do cliente antigo).
  v_cmv_antes := public._fin_cmv_retrato_lancamento(v_company_id, p_id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'categoria_id', r.categoria_id, 'cmv_incluir', r.cmv_incluir, 'created_at', r.created_at
  )), '[]'::jsonb)
  INTO v_old_rateios
  FROM public.fin_lancamento_rateios r
  WHERE r.lancamento_id = p_id AND r.company_id = v_company_id;
  v_old_set := CASE WHEN jsonb_array_length(v_old_rateios) > 0 THEN v_old_rateios
    ELSE jsonb_build_array(jsonb_build_object('categoria_id', v_lanc.categoria_id, 'cmv_incluir', v_lanc.cmv_incluir)) END;
  v_cmv_titulo := CASE
    WHEN NOT v_despesa OR v_rateio_count > 0 THEN NULL
    WHEN v_cmv_cliente THEN
      CASE WHEN jsonb_typeof(p_cmv->'incluir') = 'boolean' THEN (p_cmv->>'incluir')::boolean END
    ELSE public._fin_cmv_heranca(v_old_set, v_header_categoria_id)
  END;

  v_antes := jsonb_build_object(
    'categoria_id', v_lanc.categoria_id,
    'centro_custo_id', v_lanc.centro_custo_id,
    'observacoes', v_lanc.observacoes,
    'data_competencia', v_lanc.data_competencia,
    'data_pagamento', v_lanc.data_pagamento,
    'cmv', v_cmv_antes,
    'rateios', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'categoria_id', r.categoria_id,
        'centro_custo_id', r.centro_custo_id,
        'valor', r.valor,
        'percentual', r.percentual,
        'observacao', r.observacao
      ) ORDER BY r.created_at, r.id)
      FROM public.fin_lancamento_rateios r
      WHERE r.lancamento_id = p_id
        AND r.company_id = v_company_id
    ), '[]'::jsonb)
  );

  UPDATE public.fin_lancamentos l
  SET categoria_id = v_header_categoria_id,
      centro_custo_id = v_header_centro_custo_id,
      observacoes = public.strip_html(p_observacoes),
      justificativa_edicao = btrim(p_justificativa_edicao),
      data_competencia = v_competencia,
      data_pagamento = v_pagamento,
      cmv_incluir = v_cmv_titulo,
      updated_at = now()
  WHERE l.id = p_id
    AND l.company_id = v_company_id
  RETURNING l.updated_at INTO v_updated_at;

  DELETE FROM public.fin_lancamento_rateios r
  WHERE r.lancamento_id = p_id
    AND r.company_id = v_company_id;

  IF v_rateio_count > 0 THEN
    FOR v_r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      id uuid, categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric, observacao text, cmv_incluir boolean
    ) LOOP
      v_line_id := NULL;
      v_line_created := NULL;
      IF v_r.id IS NOT NULL AND NOT (v_r.id = ANY(v_usados)) THEN
        SELECT o.id, o.created_at INTO v_line_id, v_line_created
        FROM jsonb_to_recordset(v_old_rateios) AS o(id uuid, created_at timestamptz)
        WHERE o.id = v_r.id;
      END IF;
      IF v_line_id IS NULL THEN
        v_line_id := gen_random_uuid();
        v_line_created := now();
      END IF;
      v_usados := v_usados || v_line_id;

      INSERT INTO public.fin_lancamento_rateios (
        id, lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id, cmv_incluir, created_at
      ) VALUES (
        v_line_id, p_id, v_r.categoria_id, v_r.centro_custo_id, v_r.valor,
        round((v_r.valor / v_lanc.valor) * 100, 4), public.strip_html(v_r.observacao), v_company_id,
        CASE
          WHEN NOT v_despesa THEN NULL
          WHEN v_cmv_cliente THEN v_r.cmv_incluir
          ELSE public._fin_cmv_heranca(v_old_set, v_r.categoria_id)
        END,
        v_line_created
      );
    END LOOP;
  END IF;

  v_depois := jsonb_build_object(
    'categoria_id', v_header_categoria_id,
    'centro_custo_id', v_header_centro_custo_id,
    'observacoes', public.strip_html(p_observacoes),
    'data_competencia', v_competencia,
    'data_pagamento', v_pagamento,
    'cmv', public._fin_cmv_retrato_lancamento(v_company_id, p_id),
    'rateios', v_rateios,
    'conciliado_preservado', true,
    'justificativa', btrim(p_justificativa_edicao)
  );

  INSERT INTO public.fin_audit_logs (
    entidade,
    entidade_id,
    acao,
    user_id,
    company_id,
    antes,
    depois
  ) VALUES (
    'lancamentos',
    p_id,
    'editar_classificacao_conciliado',
    v_user_id,
    v_company_id,
    v_antes,
    v_depois
  );

  RETURN QUERY SELECT p_id, v_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text, jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text, jsonb, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 5: Rodar e ver passar**

Run: `powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql`
Expected: `cmv_lancamentos_ephemeral: OK`.

Run: `bunx vitest run src/test/cmvLancamentosMigration.test.ts src/test/migrationsDataNegocioFuso.test.ts src/test/conciliacaoChaveOcorrenciaMigration.test.ts src/test/idempotenciaFinanceiroMigration.test.ts`
Expected: PASS. Os testes antigos leem os arquivos antigos, que não mudaram.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql supabase/tests/database/cmv_lancamentos_ephemeral.sql src/test/cmvLancamentosMigration.test.ts
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): conciliação, Livro Razão e reclassificação gravam a decisão e a competência

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 3: Banco — classificar lançamentos na revisão e "Aplicar padrões"

**Files:**
- Modify: `supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql` (inserir **antes** da linha `NOTIFY pgrst, 'reload schema';`)
- Modify: `supabase/tests/database/cmv_lancamentos_ephemeral.sql` (cenários antes do `RETURN`)
- Modify: `src/test/cmvLancamentosMigration.test.ts` (novo `describe` no fim)

**Interfaces:**
- Consumes: `_fin_cmv_linhas_fontes`, `_fin_cmv_retrato_lancamento` (Task 1); `_fin_cmv_retrato` (produção).
- Produces (usado pelas Tarefas 4 e 10):
  - `fin_cmv_classificar(p_itens jsonb, p_justificativa text DEFAULT NULL) RETURNS jsonb`, com a mesma assinatura. Cada item tem **exatamente um** documento: `conta_pagar_id` ou `lancamento_id`. Retorno: `{titulos, itens, atualizados: [{conta_pagar_id|lancamento_id, updated_at}]}`.
  - `fin_cmv_aplicar_padroes(p_desde date, p_simular boolean DEFAULT true, p_justificativa text DEFAULT NULL) RETURNS jsonb`:
    - prévia: `{simulado: true, desde, boleto: {documentos, linhas_sim, centavos_sim, linhas_nao, centavos_nao, linhas_sem_padrao, centavos_sem_padrao}, lancamento: {...mesmos campos}}`;
    - gravação: `{simulado: false, desde, documentos, linhas, centavos_sim, centavos_nao}`.

- [ ] **Step 1: Escrever os cenários de banco (antes do `RETURN 'cmv_lancamentos_ephemeral: OK';`)**

```sql
  -- 10. Classificação depois (revisão do CMV): lançamentos
  PERFORM set_config('test.permissions', 'financeiro:lancamentos:edit', false);
  r := fin_cmv_classificar(jsonb_build_array(jsonb_build_object('lancamento_id', v_pend, 'rateio_id', NULL, 'incluir', true,
    'expected_updated_at', (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend))));
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_pend), 'lançamento classificado por quem edita lançamentos');
  PERFORM cmv_assert((r->'atualizados'->0->>'lancamento_id')::uuid = v_pend AND (r->>'titulos')::int = 1, 'retorno identifica o lançamento');
  PERFORM cmv_assert(EXISTS (SELECT 1 FROM fin_audit_logs WHERE entidade = 'lancamentos' AND entidade_id = v_pend AND acao = 'cmv_classificar'), 'auditoria do lançamento');
  -- conciliado e REALIZADO sem justificativa de edição: classificar não esbarra no gatilho de edição
  PERFORM fin_cmv_classificar(jsonb_build_array(jsonb_build_object('lancamento_id', v_conc,
    'rateio_id', (SELECT id FROM fin_lancamento_rateios WHERE lancamento_id = v_conc AND categoria_id = c_escr), 'incluir', true,
    'expected_updated_at', (SELECT updated_at FROM fin_lancamentos WHERE id = v_conc))));
  PERFORM cmv_assert((SELECT bool_and(cmv_incluir) FROM fin_lancamento_rateios WHERE lancamento_id = v_conc), 'linha de rateio da conciliação classificada');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_rat, (SELECT updated_at FROM fin_lancamentos WHERE id = v_rat)), 'CMV_ALVO_INVALIDO%', 'lançamento rateado classificado pelo cabeçalho');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_espelho, (SELECT updated_at FROM fin_lancamentos WHERE id = v_espelho)), 'CMV_ALVO_INVALIDO: lançamento fora%', 'espelho de baixa não é classificável');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_receita, (SELECT updated_at FROM fin_lancamentos WHERE id = v_receita)), 'CMV_ALVO_INVALIDO: lançamento fora%', 'receita não é classificável');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_cancel, (SELECT updated_at FROM fin_lancamentos WHERE id = v_cancel)), 'STATUS_INVALIDO%', 'lançamento cancelado');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","conta_pagar_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"2026-01-01T00:00:00Z"}]')$q$,
    v_pend, v_bol), 'CMV_INVALIDO%', 'item com dois documentos');
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"2020-01-01T00:00:00Z"}]')$q$,
    v_pend), 'OPTIMISTIC_LOCK_CONFLICT%', 'versão antiga do lançamento');
  -- lote misturando boleto e lançamento exige gerenciar o CMV
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"},{"lancamento_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"}]')$q$,
    v_bol, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol), v_pend, (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend)),
    'PERMISSION_DENIED: financeiro:cmv:manage%', 'lote sem cmv:manage');
  PERFORM set_config('test.permissions', TUDO, false);
  -- lote misto com um item desatualizado: tudo ou nada
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"conta_pagar_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"%s"},{"lancamento_id":"%s","rateio_id":null,"incluir":false,"expected_updated_at":"2020-01-01T00:00:00Z"}]')$q$,
    v_bol, (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol), v_pend), 'OPTIMISTIC_LOCK_CONFLICT%', 'lote misto com versão antiga');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_contas_pagar WHERE id = v_bol), 'o boleto do lote recusado ficou como estava');
  r := fin_cmv_classificar(jsonb_build_array(
    jsonb_build_object('conta_pagar_id', v_bol, 'rateio_id', NULL, 'incluir', false, 'expected_updated_at', (SELECT updated_at FROM fin_contas_pagar WHERE id = v_bol)),
    jsonb_build_object('lancamento_id', v_pend, 'rateio_id', NULL, 'incluir', false, 'expected_updated_at', (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend))));
  PERFORM cmv_assert((r->>'titulos')::int = 2 AND (SELECT cmv_incluir IS FALSE FROM fin_contas_pagar WHERE id = v_bol)
    AND (SELECT cmv_incluir IS FALSE FROM fin_lancamentos WHERE id = v_pend), 'lote com as duas fontes');
  PERFORM set_config('test.company_id', B::text, false);
  PERFORM cmv_expect_error(format($q$SELECT public.fin_cmv_classificar('[{"lancamento_id":"%s","rateio_id":null,"incluir":true,"expected_updated_at":"%s"}]')$q$,
    v_pend, (SELECT updated_at FROM fin_lancamentos WHERE id = v_pend)), 'NOT_FOUND%', 'B não classifica lançamento da A');
  PERFORM set_config('test.company_id', A::text, false);

  -- 11. Aplicar padrões às pendentes (histórico)
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 11, '2026-09-14', '2026-09-14', 'REALIZADO', 'manual', A, c_peixes, 'Pendente peixe') RETURNING id INTO v_p_peixes;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 12, '2026-09-14', '2026-09-14', 'REALIZADO', 'manual', A, c_escr, 'Pendente escritório') RETURNING id INTO v_p_escr;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 13, '2026-09-14', '2026-09-14', 'REALIZADO', 'manual', A, c_sem, 'Pendente sem padrão') RETURNING id INTO v_p_sem;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, descricao)
  VALUES ('DESPESA', 14, '2026-08-01', '2026-08-01', 'REALIZADO', 'manual', A, c_peixes, 'Pendente antigo') RETURNING id INTO v_p_antigo;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, categoria_id, cmv_incluir, descricao)
  VALUES ('DESPESA', 15, '2026-09-15', '2026-09-15', 'REALIZADO', 'manual', A, c_peixes, false, 'Já decidido') RETURNING id INTO v_p_decidido;
  INSERT INTO fin_lancamentos (tipo, valor, data_competencia, data_pagamento, status, origem, company_id, descricao)
  VALUES ('DESPESA', 15, '2026-09-16', '2026-09-16', 'REALIZADO', 'manual', A, 'Pendente rateado') RETURNING id INTO v_p_rat;
  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, valor, company_id) VALUES (v_p_rat, c_peixes, 10, A), (v_p_rat, c_sem, 5, A);
  r := _guarded_create_conta_pagar(p_descricao => 'Boleto pendente', p_valor => 16, p_data_vencimento => '2026-09-30',
    p_data_competencia => '2026-09-15', p_categoria_id => c_peixes);
  v_bol_pend := (r->>'id')::uuid;

  PERFORM set_config('test.permissions', 'financeiro:cmv:view,financeiro:lancamentos:edit', false);
  PERFORM cmv_expect_error($q$SELECT public.fin_cmv_aplicar_padroes('2026-09-14')$q$, 'PERMISSION_DENIED%', 'aplicar padrões exige gerenciar o CMV, até na prévia');
  PERFORM set_config('test.permissions', TUDO, false);

  v_n := (SELECT count(*) FROM fin_lancamentos WHERE cmv_incluir IS NULL);
  r := fin_cmv_aplicar_padroes('2026-09-14', true);
  PERFORM cmv_assert((r->>'simulado')::boolean, 'prévia marcada como simulação');
  PERFORM cmv_assert((r->'lancamento'->>'documentos')::int = 3 AND (r->'lancamento'->>'linhas_sim')::int = 2
    AND (r->'lancamento'->>'centavos_sim')::bigint = 2100 AND (r->'lancamento'->>'linhas_nao')::int = 1
    AND (r->'lancamento'->>'linhas_sem_padrao')::int = 2 AND (r->'lancamento'->>'centavos_sem_padrao')::bigint = 1800,
    'prévia por fonte: lançamentos');
  PERFORM cmv_assert((r->'boleto'->>'documentos')::int = 1 AND (r->'boleto'->>'linhas_sim')::int = 1
    AND (r->'boleto'->>'centavos_sim')::bigint = 1600, 'prévia por fonte: boletos');
  PERFORM cmv_assert((SELECT count(*) FROM fin_lancamentos WHERE cmv_incluir IS NULL) = v_n, 'a prévia não grava nada');
  PERFORM cmv_expect_error($q$SELECT public.fin_cmv_aplicar_padroes('2026-09-14', false)$q$, 'JUSTIFICATIVA_OBRIGATORIA%', 'gravar exige justificativa');
  PERFORM cmv_expect_error($q$SELECT public.fin_cmv_aplicar_padroes(NULL, true)$q$, 'CMV_PERIODO_OBRIGATORIO%', 'data inicial obrigatória');

  r := fin_cmv_aplicar_padroes('2026-09-14', false, 'aplicação inicial');
  PERFORM cmv_assert((r->>'documentos')::int = 4 AND (r->>'linhas')::int = 4
    AND (r->>'centavos_sim')::bigint = 3700 AND (r->>'centavos_nao')::bigint = 1200, 'três lançamentos e um boleto classificados');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamentos WHERE id = v_p_peixes)
    AND (SELECT cmv_incluir IS FALSE FROM fin_lancamentos WHERE id = v_p_escr)
    AND (SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_p_sem)
    AND (SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_p_antigo), 'só pendentes com padrão e a partir da data');
  PERFORM cmv_assert((SELECT cmv_incluir IS FALSE FROM fin_lancamentos WHERE id = v_p_decidido), 'decisão já tomada não é trocada');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_lancamento_rateios WHERE lancamento_id = v_p_rat AND categoria_id = c_peixes)
    AND (SELECT cmv_incluir IS NULL FROM fin_lancamento_rateios WHERE lancamento_id = v_p_rat AND categoria_id = c_sem)
    AND (SELECT cmv_incluir IS NULL FROM fin_lancamentos WHERE id = v_p_rat), 'rateio: só a linha com padrão; cabeçalho intocado');
  PERFORM cmv_assert((SELECT cmv_incluir FROM fin_contas_pagar WHERE id = v_bol_pend), 'boleto pendente recebe o padrão');
  PERFORM cmv_assert((SELECT count(*) FROM fin_audit_logs WHERE acao = 'cmv_aplicar_padroes') = 4, 'auditoria por documento');
  PERFORM set_config('test.company_id', B::text, false);
  PERFORM cmv_assert((fin_cmv_aplicar_padroes('2020-01-01', false, 'x')->>'documentos')::int = 0, 'B não alcança a A');
  PERFORM set_config('test.company_id', A::text, false);
  PERFORM cmv_assert(has_function_privilege('authenticated', 'public.fin_cmv_aplicar_padroes(date,boolean,text)', 'EXECUTE'), 'authenticated executa aplicar padrões');
```

- [ ] **Step 2: Escrever o contrato do SQL**

Acrescente no fim de `src/test/cmvLancamentosMigration.test.ts`:

```ts
describe('migration CMV com lançamentos — classificação e padrões', () => {
  it('classificar aceita boleto OU lançamento, com lock, ordem de bloqueio e auditoria', () => {
    const c = corpo('fin_cmv_classificar');
    expect(plano(c)).toContain("(jsonb_typeof(e->'conta_pagar_id') IS NOT DISTINCT FROM 'string') = (jsonb_typeof(e->'lancamento_id') IS NOT DISTINCT FROM 'string')");
    const boletos = c.indexOf('FROM public.fin_contas_pagar cp');
    const lancamentos = c.indexOf('FROM public.fin_lancamentos l');
    expect(boletos).toBeGreaterThan(0);
    expect(lancamentos).toBeGreaterThan(boletos);
    expect(plano(c)).toContain('ORDER BY l.id FOR UPDATE');
    expect(c).toContain("'CMV_ALVO_INVALIDO: lançamento fora do CMV financeiro'");
    expect(plano(c)).toContain("VALUES ('lancamentos', v_lanc.id, 'cmv_classificar'");
    expect(plano(c)).toContain("'financeiro:cmv:manage', 'financeiro:lancamentos:edit', 'financeiro:conciliacao:reconcile'");
    expect(plano(c)).toContain("IF v_documentos > 1 THEN IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage'])");
  });

  it('aplicar padrões: só pendentes, prévia antes de qualquer escrita, justificativa e gerenciar o CMV', () => {
    const c = corpo('fin_cmv_aplicar_padroes');
    expect(plano(c)).toContain("ARRAY['financeiro:cmv:manage', 'system:global:manage']");
    expect(c.indexOf('RETURN (')).toBeGreaterThan(0);
    expect(c.indexOf('RETURN (')).toBeLessThan(c.indexOf('UPDATE public.'));
    expect(c).toContain('AND r.cmv_incluir IS NULL');
    expect(c).toContain('AND cp.cmv_incluir IS NULL');
    expect(c).toContain('AND l.cmv_incluir IS NULL');
    expect(c).toContain("'JUSTIFICATIVA_OBRIGATORIA'");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fin_cmv_aplicar_padroes(date, boolean, text) FROM PUBLIC, anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.fin_cmv_aplicar_padroes(date, boolean, text) TO authenticated, service_role;');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bunx vitest run src/test/cmvLancamentosMigration.test.ts`
Expected: FAIL (`função fin_cmv_aplicar_padroes não encontrada`).

Run: `powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql`
Expected: FAIL. A versão antiga de `fin_cmv_classificar` recusa `lancamento_id` com `CMV_INVALIDO`.

- [ ] **Step 4: Inserir as duas RPCs antes de `NOTIFY pgrst, 'reload schema';`**

```sql
-- ─── Classificação depois (revisão do CMV): boletos E lançamentos ────────────
-- p_itens: [{ conta_pagar_id | lancamento_id, rateio_id | null, incluir, expected_updated_at }]
-- Exatamente um documento por item. Só a decisão do CMV muda; tudo ou nada.
-- Ordem de bloqueio: boletos por id, depois lançamentos por id — a mesma de
-- fin_cmv_aplicar_padroes —, para dois lotes nunca se travarem.
CREATE OR REPLACE FUNCTION public.fin_cmv_classificar(
  p_itens jsonb,
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_total integer;
  v_documentos integer;
  v_lancamentos integer;
  v_cp record;
  v_lanc record;
  v_item record;
  v_antes jsonb;
  v_depois jsonb;
  v_tem_rateio boolean;
  v_now timestamptz := now();
  v_atualizados jsonb := '[]'::jsonb;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;
  v_total := jsonb_array_length(p_itens);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_LOTE_INVALIDO';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) e
    WHERE jsonb_typeof(e) <> 'object'
      OR NOT (e ? 'incluir')
      OR jsonb_typeof(e->'incluir') NOT IN ('boolean', 'null')
      OR (jsonb_typeof(e->'conta_pagar_id') IS NOT DISTINCT FROM 'string')
         = (jsonb_typeof(e->'lancamento_id') IS NOT DISTINCT FROM 'string')
      OR jsonb_typeof(e->'expected_updated_at') IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_INVALIDO';
  END IF;

  SELECT count(DISTINCT COALESCE(e->>'conta_pagar_id', e->>'lancamento_id')),
         count(DISTINCT e->>'lancamento_id')
  INTO v_documentos, v_lancamentos
  FROM jsonb_array_elements(p_itens) e;

  -- Um documento: quem edita aquele cadastro também classifica. Lote (revisão
  -- do histórico): só quem gerencia o CMV.
  IF v_documentos > 1 THEN
    IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage']) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:manage';
    END IF;
  ELSIF v_lancamentos = 1 THEN
    IF NOT public.has_any_permission(v_uid, ARRAY[
      'financeiro:cmv:manage', 'financeiro:lancamentos:edit', 'financeiro:conciliacao:reconcile',
      'finance:manage', 'system:global:manage'
    ]) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:lancamentos:edit';
    END IF;
  ELSIF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:cmv:manage', 'financeiro:pagar:edit', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:pagar:edit';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) e
    GROUP BY COALESCE(e->>'conta_pagar_id', e->>'lancamento_id'), e->>'rateio_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_ITEM_DUPLICADO';
  END IF;

  -- Boletos (mesma regra de antes).
  FOR v_cp IN
    SELECT cp.id, cp.status, cp.updated_at
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company_id
      AND cp.id IN (
        SELECT (e->>'conta_pagar_id')::uuid FROM jsonb_array_elements(p_itens) e
        WHERE jsonb_typeof(e->'conta_pagar_id') = 'string'
      )
    ORDER BY cp.id
    FOR UPDATE
  LOOP
    IF v_cp.status = 'CANCELADO' THEN
      RAISE EXCEPTION 'STATUS_INVALIDO: %', v_cp.status;
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_itens) e
      WHERE (e->>'conta_pagar_id')::uuid = v_cp.id
        AND (e->>'expected_updated_at')::timestamptz <> v_cp.updated_at
    ) THEN
      RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: %', v_cp.id;
    END IF;

    v_antes := public._fin_cmv_retrato(v_company_id, v_cp.id);
    v_tem_rateio := EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios r
      WHERE r.lancamento_id = v_cp.id AND r.company_id = v_company_id
    );

    FOR v_item IN
      SELECT NULLIF(e->>'rateio_id', '')::uuid AS rateio_id,
        CASE WHEN jsonb_typeof(e->'incluir') = 'boolean' THEN (e->>'incluir')::boolean END AS incluir
      FROM jsonb_array_elements(p_itens) e
      WHERE (e->>'conta_pagar_id')::uuid = v_cp.id
    LOOP
      IF v_item.rateio_id IS NULL THEN
        IF v_tem_rateio THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_ALVO_INVALIDO: boleto rateado classifica por linha';
        END IF;
        UPDATE public.fin_contas_pagar
        SET cmv_incluir = v_item.incluir
        WHERE id = v_cp.id AND company_id = v_company_id;
      ELSE
        UPDATE public.fin_lancamento_rateios
        SET cmv_incluir = v_item.incluir
        WHERE id = v_item.rateio_id AND lancamento_id = v_cp.id AND company_id = v_company_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'NOT_FOUND: linha de rateio';
        END IF;
      END IF;
    END LOOP;

    -- A decisão faz parte da versão do boleto: quem estiver editando em outra
    -- tela recebe conflito em vez de sobrescrever.
    UPDATE public.fin_contas_pagar
    SET updated_at = v_now
    WHERE id = v_cp.id AND company_id = v_company_id;

    v_depois := public._fin_cmv_retrato(v_company_id, v_cp.id);

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
    VALUES ('contas_pagar', v_cp.id, 'cmv_classificar', v_antes, v_depois,
      COALESCE(public.strip_html(p_justificativa), ''), v_uid, v_company_id);

    v_atualizados := v_atualizados || jsonb_build_object(
      'conta_pagar_id', v_cp.id,
      'updated_at', (SELECT cp.updated_at FROM public.fin_contas_pagar cp WHERE cp.id = v_cp.id AND cp.company_id = v_company_id)
    );
  END LOOP;

  -- Lançamentos (Livro Razão e conciliação).
  FOR v_lanc IN
    SELECT l.id, l.status, l.tipo, l.origem, l.referencia_modulo, l.updated_at
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.id IN (
        SELECT (e->>'lancamento_id')::uuid FROM jsonb_array_elements(p_itens) e
        WHERE jsonb_typeof(e->'lancamento_id') = 'string'
      )
    ORDER BY l.id
    FOR UPDATE
  LOOP
    IF v_lanc.status = 'CANCELADO' THEN
      RAISE EXCEPTION 'STATUS_INVALIDO: %', v_lanc.status;
    END IF;
    -- Mesma regra da apuração: espelho de baixa, encargo, receita e transferência
    -- não são despesas do CMV (o boleto de origem é que se classifica).
    IF v_lanc.tipo <> 'DESPESA'
       OR NULLIF(v_lanc.referencia_modulo, '') IS NOT NULL
       OR v_lanc.origem IN ('espelho_cp', 'espelho_cr', 'ajuste_pagamento') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_ALVO_INVALIDO: lançamento fora do CMV financeiro';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_itens) e
      WHERE (e->>'lancamento_id')::uuid = v_lanc.id
        AND (e->>'expected_updated_at')::timestamptz <> v_lanc.updated_at
    ) THEN
      RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: %', v_lanc.id;
    END IF;

    v_antes := public._fin_cmv_retrato_lancamento(v_company_id, v_lanc.id);
    v_tem_rateio := EXISTS (
      SELECT 1 FROM public.fin_lancamento_rateios r
      WHERE r.lancamento_id = v_lanc.id AND r.company_id = v_company_id
    );

    FOR v_item IN
      SELECT NULLIF(e->>'rateio_id', '')::uuid AS rateio_id,
        CASE WHEN jsonb_typeof(e->'incluir') = 'boolean' THEN (e->>'incluir')::boolean END AS incluir
      FROM jsonb_array_elements(p_itens) e
      WHERE (e->>'lancamento_id')::uuid = v_lanc.id
    LOOP
      IF v_item.rateio_id IS NULL THEN
        IF v_tem_rateio THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_ALVO_INVALIDO: lançamento rateado classifica por linha';
        END IF;
        UPDATE public.fin_lancamentos
        SET cmv_incluir = v_item.incluir
        WHERE id = v_lanc.id AND company_id = v_company_id;
      ELSE
        UPDATE public.fin_lancamento_rateios
        SET cmv_incluir = v_item.incluir
        WHERE id = v_item.rateio_id AND lancamento_id = v_lanc.id AND company_id = v_company_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'NOT_FOUND: linha de rateio';
        END IF;
      END IF;
    END LOOP;

    -- Só a versão muda: nenhum campo vigiado pelo gatilho de lançamento realizado.
    UPDATE public.fin_lancamentos
    SET updated_at = v_now
    WHERE id = v_lanc.id AND company_id = v_company_id;

    v_depois := public._fin_cmv_retrato_lancamento(v_company_id, v_lanc.id);

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
    VALUES ('lancamentos', v_lanc.id, 'cmv_classificar', v_antes, v_depois,
      COALESCE(public.strip_html(p_justificativa), ''), v_uid, v_company_id);

    v_atualizados := v_atualizados || jsonb_build_object(
      'lancamento_id', v_lanc.id,
      'updated_at', (SELECT l.updated_at FROM public.fin_lancamentos l WHERE l.id = v_lanc.id AND l.company_id = v_company_id)
    );
  END LOOP;

  IF jsonb_array_length(v_atualizados) <> v_documentos THEN
    RAISE EXCEPTION 'NOT_FOUND: documento';
  END IF;

  RETURN jsonb_build_object('titulos', v_documentos, 'itens', v_total, 'atualizados', v_atualizados);
END;
$$;

REVOKE ALL ON FUNCTION public.fin_cmv_classificar(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cmv_classificar(jsonb, text) TO authenticated, service_role;

-- ─── Aplicar o padrão da categoria às linhas pendentes (histórico) ───────────
-- Só linhas PENDENTES (cmv_incluir NULL) de categoria COM padrão, com competência
-- a partir de p_desde, de boletos e de lançamentos. Decisão já tomada nunca é
-- trocada e categoria sem padrão continua pendente. p_simular (padrão) só conta.
CREATE OR REPLACE FUNCTION public.fin_cmv_aplicar_padroes(
  p_desde date,
  p_simular boolean DEFAULT true,
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_doc record;
  v_antes jsonb;
  v_depois jsonb;
  v_n integer;
  v_sim bigint;
  v_nao bigint;
  v_documentos integer := 0;
  v_linhas integer := 0;
  v_total_sim bigint := 0;
  v_total_nao bigint := 0;
  v_now timestamptz := now();
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: financeiro:cmv:manage';
  END IF;
  IF p_desde IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMV_PERIODO_OBRIGATORIO';
  END IF;

  IF COALESCE(p_simular, true) THEN
    RETURN (
      WITH alvo AS (
        SELECT l.fonte, l.documento_id, round(l.valor * 100)::bigint AS centavos, c.cmv_sugerir
        FROM public._fin_cmv_linhas_fontes(v_company_id) l
        LEFT JOIN public.fin_categorias c ON c.id = l.categoria_id AND c.company_id = v_company_id
        WHERE l.cmv_incluir IS NULL AND l.data_competencia >= p_desde
      ),
      por_fonte AS (
        SELECT f.fonte, jsonb_build_object(
          'documentos', count(DISTINCT a.documento_id) FILTER (WHERE a.cmv_sugerir IS NOT NULL),
          'linhas_sim', count(a.documento_id) FILTER (WHERE a.cmv_sugerir IS TRUE),
          'centavos_sim', COALESCE(sum(a.centavos) FILTER (WHERE a.cmv_sugerir IS TRUE), 0),
          'linhas_nao', count(a.documento_id) FILTER (WHERE a.cmv_sugerir IS FALSE),
          'centavos_nao', COALESCE(sum(a.centavos) FILTER (WHERE a.cmv_sugerir IS FALSE), 0),
          'linhas_sem_padrao', count(a.documento_id) FILTER (WHERE a.cmv_sugerir IS NULL),
          'centavos_sem_padrao', COALESCE(sum(a.centavos) FILTER (WHERE a.cmv_sugerir IS NULL), 0)
        ) AS resumo
        FROM (VALUES ('boleto'), ('lancamento')) AS f(fonte)
        LEFT JOIN alvo a ON a.fonte = f.fonte
        GROUP BY f.fonte
      )
      SELECT jsonb_build_object(
        'simulado', true,
        'desde', p_desde,
        'boleto', (SELECT resumo FROM por_fonte WHERE fonte = 'boleto'),
        'lancamento', (SELECT resumo FROM por_fonte WHERE fonte = 'lancamento')
      )
    );
  END IF;

  IF NULLIF(btrim(p_justificativa), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'JUSTIFICATIVA_OBRIGATORIA';
  END IF;

  -- Ordem fixa: boletos, depois lançamentos, por id — a mesma de fin_cmv_classificar.
  FOR v_doc IN
    SELECT DISTINCT l.fonte, l.documento_id
    FROM public._fin_cmv_linhas_fontes(v_company_id) l
    JOIN public.fin_categorias c ON c.id = l.categoria_id AND c.company_id = v_company_id
    WHERE l.cmv_incluir IS NULL AND l.data_competencia >= p_desde AND c.cmv_sugerir IS NOT NULL
    ORDER BY l.fonte, l.documento_id
  LOOP
    IF v_doc.fonte = 'boleto' THEN
      PERFORM 1 FROM public.fin_contas_pagar cp
      WHERE cp.id = v_doc.documento_id AND cp.company_id = v_company_id FOR UPDATE;
      v_antes := public._fin_cmv_retrato(v_company_id, v_doc.documento_id);
    ELSE
      PERFORM 1 FROM public.fin_lancamentos l
      WHERE l.id = v_doc.documento_id AND l.company_id = v_company_id FOR UPDATE;
      v_antes := public._fin_cmv_retrato_lancamento(v_company_id, v_doc.documento_id);
    END IF;

    -- Linhas de rateio pendentes (boleto e lançamento usam a mesma tabela).
    WITH alteradas AS (
      UPDATE public.fin_lancamento_rateios r
      SET cmv_incluir = c.cmv_sugerir
      FROM public.fin_categorias c
      WHERE r.lancamento_id = v_doc.documento_id AND r.company_id = v_company_id
        AND r.cmv_incluir IS NULL
        AND c.id = r.categoria_id AND c.company_id = v_company_id AND c.cmv_sugerir IS NOT NULL
      RETURNING r.cmv_incluir, round(r.valor * 100)::bigint AS centavos
    )
    SELECT count(*), COALESCE(sum(centavos) FILTER (WHERE cmv_incluir), 0), COALESCE(sum(centavos) FILTER (WHERE NOT cmv_incluir), 0)
    INTO v_n, v_sim, v_nao
    FROM alteradas;
    v_linhas := v_linhas + v_n;
    v_total_sim := v_total_sim + v_sim;
    v_total_nao := v_total_nao + v_nao;

    -- Documento sem rateio: a decisão é do cabeçalho.
    IF v_doc.fonte = 'boleto' THEN
      WITH alterado AS (
        UPDATE public.fin_contas_pagar cp
        SET cmv_incluir = c.cmv_sugerir
        FROM public.fin_categorias c
        WHERE cp.id = v_doc.documento_id AND cp.company_id = v_company_id
          AND cp.cmv_incluir IS NULL
          AND c.id = cp.categoria_id AND c.company_id = v_company_id AND c.cmv_sugerir IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.fin_lancamento_rateios r
            WHERE r.lancamento_id = cp.id AND r.company_id = cp.company_id
          )
        RETURNING cp.cmv_incluir, round(cp.valor * 100)::bigint AS centavos
      )
      SELECT count(*), COALESCE(sum(centavos) FILTER (WHERE cmv_incluir), 0), COALESCE(sum(centavos) FILTER (WHERE NOT cmv_incluir), 0)
      INTO v_n, v_sim, v_nao
      FROM alterado;
      UPDATE public.fin_contas_pagar SET updated_at = v_now
      WHERE id = v_doc.documento_id AND company_id = v_company_id;
      v_depois := public._fin_cmv_retrato(v_company_id, v_doc.documento_id);
    ELSE
      WITH alterado AS (
        UPDATE public.fin_lancamentos l
        SET cmv_incluir = c.cmv_sugerir
        FROM public.fin_categorias c
        WHERE l.id = v_doc.documento_id AND l.company_id = v_company_id
          AND l.cmv_incluir IS NULL
          AND c.id = l.categoria_id AND c.company_id = v_company_id AND c.cmv_sugerir IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.fin_lancamento_rateios r
            WHERE r.lancamento_id = l.id AND r.company_id = l.company_id
          )
        RETURNING l.cmv_incluir, round(l.valor * 100)::bigint AS centavos
      )
      SELECT count(*), COALESCE(sum(centavos) FILTER (WHERE cmv_incluir), 0), COALESCE(sum(centavos) FILTER (WHERE NOT cmv_incluir), 0)
      INTO v_n, v_sim, v_nao
      FROM alterado;
      UPDATE public.fin_lancamentos SET updated_at = v_now
      WHERE id = v_doc.documento_id AND company_id = v_company_id;
      v_depois := public._fin_cmv_retrato_lancamento(v_company_id, v_doc.documento_id);
    END IF;
    v_linhas := v_linhas + v_n;
    v_total_sim := v_total_sim + v_sim;
    v_total_nao := v_total_nao + v_nao;

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
    VALUES (CASE WHEN v_doc.fonte = 'boleto' THEN 'contas_pagar' ELSE 'lancamentos' END,
      v_doc.documento_id, 'cmv_aplicar_padroes', v_antes, v_depois,
      public.strip_html(btrim(p_justificativa)), v_uid, v_company_id);
    v_documentos := v_documentos + 1;
  END LOOP;

  RETURN jsonb_build_object('simulado', false, 'desde', p_desde, 'documentos', v_documentos, 'linhas', v_linhas,
    'centavos_sim', v_total_sim, 'centavos_nao', v_total_nao);
END;
$$;

REVOKE ALL ON FUNCTION public.fin_cmv_aplicar_padroes(date, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cmv_aplicar_padroes(date, boolean, text) TO authenticated, service_role;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql`
Expected: `cmv_lancamentos_ephemeral: OK`.

Run: `bunx vitest run src/test/cmvLancamentosMigration.test.ts src/test/migrationsDataNegocioFuso.test.ts`
Expected: PASS.

Run: `powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_financeiro_ephemeral.sql`
Expected: `cmv_financeiro_ephemeral: OK`. O teste antigo não aplica a migration nova e deve seguir verde.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql supabase/tests/database/cmv_lancamentos_ephemeral.sql src/test/cmvLancamentosMigration.test.ts
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): classificação de lançamentos na revisão e "aplicar padrões" com prévia

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 4: Domínio e hook — contagem por fonte, lista por fonte, classificar lançamento, aplicar padrões

**Files:**
- Modify: `src/domain/financeiro/cmv/report.ts`
- Modify: `src/domain/financeiro/cmv/rateio.ts`
- Modify: `src/hooks/useCmvFinanceiro.ts`
- Test: `src/domain/financeiro/cmv/report.test.ts`, `src/domain/financeiro/cmv/rateio.test.ts`, `src/hooks/useCmvFinanceiro.test.ts`

**Interfaces:**
- Consumes: payload e RPCs das Tarefas 1 e 3.
- Produces (usado pelas Tarefas 5 a 10):
  - em `@/domain/financeiro/cmv`:
    - `CmvPayload.lancamentos: {data, quantidade}[]` e `CmvPayload.pendentesGeralPorFonte: {boleto: CmvContagem; lancamento: CmvContagem} | null`;
    - `CmvLado.lancamentos: number` e `CmvLado.documentos: number`;
    - `CmvReport.lancamentos` e `CmvReport.documentos` (`CmvIndicador`), além de `CmvReport.pendentesGeralPorFonte`;
    - `type CmvAvisoDecisao = 'sugerido' | 'redefinido'`;
    - `decisaoAoTrocarCategoria(anterior: CmvDecisao | undefined, categoriaId: string | null | undefined, padroes: ReadonlyMap<string, CmvDecisao>): { cmv_incluir: CmvDecisao; cmv_aviso?: CmvAvisoDecisao }`.
  - em `@/hooks/useCmvFinanceiro`:
    - `CmvConfig.recursos: { lancamentos: boolean }`;
    - `type CmvFonte = 'boleto' | 'lancamento'`;
    - `CmvLinhaDetalhe` ganha `fonte`, `documentoId`, `origem` e `contaNome`, e `contaPagarId` passa a `string | null`;
    - `CmvItemClassificacao`, união com `contaPagarId` **ou** `lancamentoId`;
    - `itemDaLinha(linha: CmvLinhaDetalhe, incluir: CmvDecisao): CmvItemClassificacao`;
    - `CmvPreviaFonte`, `CmvPreviaPadroes` e `CmvPadroesAplicados`;
    - `simularPadroesCmv(supabase, desde: string): Promise<CmvPreviaPadroes>`;
    - `aplicarPadroesCmv(supabase, desde: string, justificativa: string): Promise<CmvPadroesAplicados>`.

- [ ] **Step 1: Escrever os testes do domínio**

Em `src/domain/financeiro/cmv/report.test.ts`, troque a expectativa do insight de pendência (linha com `'2 boletos do período (R$ 123,45) aguardam classificação'`) por:

```ts
    expect(textos.some(t => t.startsWith('2 despesas do período (R$ 123,45) aguardam classificação'))).toBe(true);
```

e acrescente, dentro do `describe` principal do arquivo:

```ts
  it('lançamentos entram na contagem de despesas, separados dos boletos', () => {
    const r = buildCmvReport(parseCmvPayload(cmvPayloadCru({
      lancamentos: [{ data: '2026-09-08', quantidade: 2 }, { data: '2026-09-02', quantidade: 1 }],
    })), CMV_FILTRO_SEMANA);
    expect(r.boletos.atual).toBe(5);
    expect(r.lancamentos.atual).toBe(2);
    expect(r.documentos.atual).toBe(7);
    // semana anterior: 2 boletos + 1 lançamento
    expect(r.documentos.anterior).toBe(3);
  });

  it('banco sem o recurso (payload antigo) não quebra: sem lançamentos e sem pendência por fonte', () => {
    const r = buildCmvReport(parseCmvPayload(cmvPayloadCru()), CMV_FILTRO_SEMANA);
    expect(r.lancamentos.atual).toBe(0);
    expect(r.documentos.atual).toBe(r.boletos.atual);
    expect(r.pendentesGeralPorFonte).toBeNull();
  });

  it('pendência por fonte vem do servidor', () => {
    const r = buildCmvReport(parseCmvPayload(cmvPayloadCru({
      pendentes_geral_por_fonte: { boleto: { titulos: 3, centavos: 100 }, lancamento: { titulos: 4, centavos: 200 } },
    })), CMV_FILTRO_SEMANA);
    expect(r.pendentesGeralPorFonte).toEqual({ boleto: { titulos: 3, centavos: 100 }, lancamento: { titulos: 4, centavos: 200 } });
  });
```

Confira no topo do arquivo que `cmvPayloadCru` e `CMV_FILTRO_SEMANA` já vêm de `@/test/fixtures/cmvFinanceiro`; se faltar algum, acrescente-o a esse import.

O mesmo texto aparece em dois testes que dependem do motor:
- em `src/components/financeiro/cmv/CmvFinanceiroSection.test.tsx`, troque `/Apuração possivelmente incompleta: 2 boletos do período/` por `/Apuração possivelmente incompleta: 2 despesas do período/`;
- em `src/lib/cmvFinanceiroPdfExport.test.ts`, troque `'2 boletos do per'` por `'2 despesas do per'`.

Em `src/domain/financeiro/cmv/rateio.test.ts`, mude o import para `import { decisaoAoTrocarCategoria, decisaoSugerida, dividirCentavos, paraCentavos, resumirBoleto } from './rateio';` e acrescente:

```ts
describe('CMV Financeiro — decisão ao trocar a categoria', () => {
  const padroes = new Map<string, boolean | null>([['peixes', true], ['escr', false], ['sem', null]]);

  it('sem resposta anterior: o padrão da categoria, marcado como sugestão', () => {
    expect(decisaoAoTrocarCategoria(null, 'peixes', padroes)).toEqual({ cmv_incluir: true, cmv_aviso: 'sugerido' });
    expect(decisaoAoTrocarCategoria(undefined, 'escr', padroes)).toEqual({ cmv_incluir: false, cmv_aviso: 'sugerido' });
  });

  it('categoria sem padrão: em branco, sem aviso', () => {
    expect(decisaoAoTrocarCategoria(null, 'sem', padroes)).toEqual({ cmv_incluir: null, cmv_aviso: undefined });
    expect(decisaoAoTrocarCategoria(undefined, '', padroes)).toEqual({ cmv_incluir: null, cmv_aviso: undefined });
  });

  it('resposta anterior diferente da nova sugestão: troca com aviso, nunca em silêncio', () => {
    expect(decisaoAoTrocarCategoria(true, 'escr', padroes)).toEqual({ cmv_incluir: false, cmv_aviso: 'redefinido' });
    expect(decisaoAoTrocarCategoria(true, 'sem', padroes)).toEqual({ cmv_incluir: null, cmv_aviso: 'redefinido' });
  });
});
```

- [ ] **Step 2: Escrever os testes do hook**

Em `src/hooks/useCmvFinanceiro.test.ts`, troque o import por:

```ts
import {
  aplicarCmvSerie, aplicarPadroesCmv, classificarCmv, fetchCmvConfig, fetchCmvLinhas, fetchCmvReport,
  itemDaLinha, parseCmvConfig, parseCmvLista, simularPadroesCmv,
} from './useCmvFinanceiro';
```

e acrescente, dentro do `describe`:

```ts
  it('lista: item de lançamento identifica a fonte; item de boleto mantém o id do boleto', () => {
    const lista = parseCmvLista({ itens: [
      { fonte: 'lancamento', documento_id: 'l1', lancamento_id: 'l1', conta_pagar_id: null, origem: 'conciliacao', conta_nome: 'Banco', descricao: 'PIX', updated_at: 't' },
      { conta_pagar_id: 'b1', descricao: 'Boleto', updated_at: 't' },
    ] });
    expect(lista.itens[0]).toMatchObject({ fonte: 'lancamento', documentoId: 'l1', contaPagarId: null, origem: 'conciliacao', contaNome: 'Banco' });
    expect(lista.itens[1]).toMatchObject({ fonte: 'boleto', documentoId: 'b1', contaPagarId: 'b1', origem: null });
  });

  it('classificar envia lancamento_id para lançamento e conta_pagar_id para boleto', async () => {
    const cliente = new ClienteComThis({ fin_cmv_classificar: { titulos: 2, itens: 2 } });
    const [lanc, bol] = parseCmvLista({ itens: [
      { fonte: 'lancamento', documento_id: 'l1', rateio_id: null, descricao: 'PIX', updated_at: 't1' },
      { fonte: 'boleto', documento_id: 'b1', conta_pagar_id: 'b1', rateio_id: 'r1', descricao: 'Boleto', updated_at: 't2' },
    ] }).itens;
    await classificarCmv(como(cliente), [itemDaLinha(lanc, true), itemDaLinha(bol, false)]);
    expect(cliente.chamadas[0].args).toEqual({ p_itens: [
      { lancamento_id: 'l1', rateio_id: null, incluir: true, expected_updated_at: 't1' },
      { conta_pagar_id: 'b1', rateio_id: 'r1', incluir: false, expected_updated_at: 't2' },
    ], p_justificativa: null });
  });

  it('configuração informa o recurso de lançamentos; banco antigo responde sem ele', () => {
    expect(parseCmvConfig({ classificacao_ativa: true, categorias: [], recursos: { lancamentos: true } }).recursos.lancamentos).toBe(true);
    expect(parseCmvConfig({ classificacao_ativa: true, categorias: [] }).recursos.lancamentos).toBe(false);
  });

  it('aplicar padrões: prévia e gravação chamam a mesma RPC', async () => {
    const cliente = new ClienteComThis({ fin_cmv_aplicar_padroes: {
      simulado: true, desde: '2026-09-01',
      boleto: { documentos: 1, linhas_sim: 1, centavos_sim: 1600, linhas_nao: 0, centavos_nao: 0, linhas_sem_padrao: 0, centavos_sem_padrao: 0 },
      lancamento: { documentos: 3, linhas_sim: 2, centavos_sim: 2100, linhas_nao: 1, centavos_nao: 1200, linhas_sem_padrao: 2, centavos_sem_padrao: 1800 },
    } });
    const previa = await simularPadroesCmv(como(cliente), '2026-09-01');
    expect(previa.lancamento).toEqual({ documentos: 3, linhasSim: 2, centavosSim: 2100, linhasNao: 1, centavosNao: 1200, linhasSemPadrao: 2, centavosSemPadrao: 1800 });
    expect(cliente.chamadas[0].args).toEqual({ p_desde: '2026-09-01', p_simular: true, p_justificativa: null });

    const gravacao = new ClienteComThis({ fin_cmv_aplicar_padroes: { simulado: false, documentos: 4, linhas: 4, centavos_sim: 3700, centavos_nao: 1200 } });
    expect(await aplicarPadroesCmv(como(gravacao), '2026-09-01', '  revisão inicial ')).toEqual({ documentos: 4, linhas: 4, centavosSim: 3700, centavosNao: 1200 });
    expect(gravacao.chamadas[0].args).toEqual({ p_desde: '2026-09-01', p_simular: false, p_justificativa: 'revisão inicial' });
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bunx vitest run src/domain/financeiro/cmv src/hooks/useCmvFinanceiro.test.ts`
Expected: FAIL (`decisaoAoTrocarCategoria`, `itemDaLinha`, `simularPadroesCmv` não exportados; `r.lancamentos` indefinido; texto "despesas").

- [ ] **Step 4: Implementar no domínio**

Em `src/domain/financeiro/cmv/rateio.ts`, acrescente depois de `decisaoSugerida`:

```ts
/** Por que a decisão mudou ao escolher a categoria (o formulário mostra o aviso). */
export type CmvAvisoDecisao = 'sugerido' | 'redefinido';

/**
 * Decisão ao escolher/trocar a categoria de uma linha: o padrão da nova categoria.
 * Se havia uma resposta diferente, ela é trocada COM aviso — nunca em silêncio.
 */
export function decisaoAoTrocarCategoria(
  anterior: CmvDecisao | undefined,
  categoriaId: string | null | undefined,
  padroes: ReadonlyMap<string, CmvDecisao>,
): { cmv_incluir: CmvDecisao; cmv_aviso?: CmvAvisoDecisao } {
  const sugestao = decisaoSugerida(categoriaId, padroes);
  const antes = anterior ?? null;
  if (antes !== null && antes !== sugestao) return { cmv_incluir: sugestao, cmv_aviso: 'redefinido' };
  return { cmv_incluir: sugestao, cmv_aviso: sugestao !== null ? 'sugerido' : undefined };
}
```

Em `src/domain/financeiro/cmv/report.ts`:

1. Linha 9 do comentário do topo: troque `C  = soma das linhas de rateio incluídas, pela competência do boleto` por `C  = soma das linhas incluídas (boletos e lançamentos), pela competência`.
2. Em `CmvPayload`, depois de `boletos: ...;`, acrescente:

```ts
  /** Lançamentos (Livro Razão e conciliação) com linha incluída, por dia. Banco sem o recurso: vazio. */
  lancamentos: { data: string; quantidade: number }[];
```

   e, depois de `pendentesGeral: CmvContagem;`:

```ts
  /** Pendências por fonte; `null` quando o banco ainda não separa (antes da migration de lançamentos). */
  pendentesGeralPorFonte: { boleto: CmvContagem; lancamento: CmvContagem } | null;
```

3. Em `parseCmvPayload`, depois do bloco `boletos: ...`, acrescente:

```ts
    lancamentos: o.lancamentos == null ? [] : lista(o.lancamentos, 'lancamentos').map((item, i) => {
      const b = objeto(item, `lancamentos[${i}]`);
      return { data: data(b.data, 'lancamentos.data'), quantidade: inteiro(b.quantidade, 'lancamentos.quantidade') };
    }),
```

   e depois de `pendentesGeral: contagem(o.pendentes_geral, 'pendentes_geral'),`:

```ts
    pendentesGeralPorFonte: o.pendentes_geral_por_fonte == null ? null : (() => {
      const p = objeto(o.pendentes_geral_por_fonte, 'pendentes_geral_por_fonte');
      return {
        boleto: contagem(p.boleto, 'pendentes_geral_por_fonte.boleto'),
        lancamento: contagem(p.lancamento, 'pendentes_geral_por_fonte.lancamento'),
      };
    })(),
```

4. Em `CmvLado`, depois de `boletos: number;`:

```ts
  lancamentos: number;
  /** Boletos + lançamentos com linha incluída no CMV. */
  documentos: number;
```

5. Em `montarLado`:
   - no `return` do caso `faixa === null`, troque `boletos: 0,` por `boletos: 0, lancamentos: 0, documentos: 0,`;
   - logo antes do `return {` final, acrescente:

```ts
  const boletos = payload.boletos.filter(b => dentro(b.data, faixa)).reduce((s, b) => s + b.quantidade, 0);
  const lancamentos = payload.lancamentos.filter(b => dentro(b.data, faixa)).reduce((s, b) => s + b.quantidade, 0);
```

   - no objeto final, troque a linha `boletos: payload.boletos.filter(...)...,` por:

```ts
    boletos,
    lancamentos,
    documentos: boletos + lancamentos,
```

6. Em `CmvReport`, depois de `boletos: CmvIndicador;`:

```ts
  lancamentos: CmvIndicador;
  /** Despesas vinculadas ao CMV = boletos + lançamentos. */
  documentos: CmvIndicador;
```

   e depois de `pendentesGeral: CmvContagem;`:

```ts
  pendentesGeralPorFonte: { boleto: CmvContagem; lancamento: CmvContagem } | null;
```

7. Em `buildCmvReport`, depois da linha `boletos: indicador(atual.boletos, ...)`:

```ts
    lancamentos: indicador(atual.lancamentos, anterior.intervalo === null ? null : anterior.lancamentos),
    documentos: indicador(atual.documentos, anterior.intervalo === null ? null : anterior.documentos),
```

   e depois de `pendentesGeral: payload.pendentesGeral,`:

```ts
    pendentesGeralPorFonte: payload.pendentesGeralPorFonte,
```

8. As pendências agora incluem lançamentos. Em `montarInsights` e `montarAvisos`, nas duas frases que usam `atual.pendentes.titulos`, troque `plural(atual.pendentes.titulos, 'boleto', 'boletos')` por `plural(atual.pendentes.titulos, 'despesa', 'despesas')`. O aviso de `semCompetencia` continua "boleto", porque só boleto pode não ter competência.

- [ ] **Step 5: Implementar no hook**

Em `src/hooks/useCmvFinanceiro.ts`:

1. Em `MENSAGENS`, troque as linhas de `OPTIMISTIC_LOCK_CONFLICT`, `CMV_ALVO_INVALIDO` e `STATUS_INVALIDO` e acrescente duas, nesta ordem:

```ts
  [/OPTIMISTIC_LOCK_CONFLICT/, 'Este registro foi alterado por outra pessoa. Recarregue e tente de novo.'],
  [/CMV_DECISAO_OBRIGATORIA/, 'Informe se o boleto aparece no CMV financeiro.'],
  [/Could not find the function|PGRST202/, 'Recurso ainda não disponível neste ambiente. Tente de novo em alguns minutos.'],
  [/RATEIO_NAO_FECHA/, 'A soma do rateio precisa fechar com o valor do boleto.'],
  [/CMV_ALVO_INVALIDO: lançamento fora/, 'Este lançamento não entra no CMV financeiro (baixa de boleto, receita ou transferência).'],
  [/CMV_ALVO_INVALIDO/, 'Este documento tem rateio: classifique cada linha.'],
  [/CMV_LOTE_INVALIDO/, 'Selecione de 1 a 500 linhas por vez.'],
  [/CMV_PERIODO_LONGO/, 'O período máximo é de 12 meses.'],
  [/CMV_PERIODO_/, 'Período inválido.'],
  [/JUSTIFICATIVA_OBRIGATORIA/, 'Informe a justificativa.'],
  [/COMPETENCIA_INVALIDA/, 'Transferência não aceita competência própria.'],
  [/STATUS_INVALIDO/, 'Registro cancelado não pode ser classificado.'],
  [/PERMISSION_DENIED/, 'Você não tem permissão para esta ação.'],
  [/NOT_FOUND/, 'Registro não encontrado. Recarregue a tela.'],
```

2. `CmvConfig` e `parseCmvConfig`:

```ts
export interface CmvConfig {
  classificacaoAtiva: boolean;
  categorias: CmvCategoriaConfig[];
  /** O banco já aceita a decisão em Lançamentos e na Conciliação (migration de lançamentos). */
  recursos: { lancamentos: boolean };
}
```

   e, no `return` de `parseCmvConfig`, depois de `classificacaoAtiva`:

```ts
    recursos: {
      lancamentos: typeof o.recursos === 'object' && o.recursos !== null
        && (o.recursos as Record<string, unknown>).lancamentos === true,
    },
```

3. Lista por fonte. Substitua a interface `CmvLinhaDetalhe` por:

```ts
export type CmvFonte = 'boleto' | 'lancamento';

export interface CmvLinhaDetalhe {
  fonte: CmvFonte;
  /** Id do boleto (fonte boleto) ou do lançamento (fonte lançamento). */
  documentoId: string;
  /** Só boleto; `null` em lançamento. */
  contaPagarId: string | null;
  rateioId: string | null;
  descricao: string;
  fornecedor: string | null;
  /** Lançamento: 'manual' (Livro Razão) ou 'conciliacao'. `null` em boleto. */
  origem: string | null;
  /** Conta bancária do lançamento. */
  contaNome: string | null;
  dataCompetencia: string | null;
  dataVencimento: string | null;
  status: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  tituloCentavos: number;
  linhaCentavos: number;
  cmvIncluir: CmvDecisao;
  updatedAt: string;
  /** Boletos da mesma série de recorrência, contando este (1 = avulso ou lançamento). */
  serieBoletos: number;
}
```

   e o `flatMap` de `parseCmvLista` por:

```ts
    itens: itens.flatMap(item => {
      const l = item as Record<string, unknown>;
      const fonte: CmvFonte = l.fonte === 'lancamento' ? 'lancamento' : 'boleto';
      const documentoId = texto(l.documento_id) ?? texto(fonte === 'lancamento' ? l.lancamento_id : l.conta_pagar_id);
      if (!documentoId) return [];
      return [{
        fonte,
        documentoId,
        contaPagarId: fonte === 'boleto' ? documentoId : null,
        rateioId: texto(l.rateio_id),
        descricao: texto(l.descricao) ?? '(sem descrição)',
        fornecedor: texto(l.fornecedor),
        origem: texto(l.origem),
        contaNome: texto(l.conta_nome),
        dataCompetencia: texto(l.data_competencia),
        dataVencimento: texto(l.data_vencimento),
        status: texto(l.status) ?? '',
        categoriaId: texto(l.categoria_id),
        categoriaNome: texto(l.categoria_nome),
        tituloCentavos: Number(l.titulo_centavos) || 0,
        linhaCentavos: Number(l.linha_centavos) || 0,
        cmvIncluir: typeof l.cmv_incluir === 'boolean' ? l.cmv_incluir : null,
        updatedAt: texto(l.updated_at) ?? '',
        serieBoletos: Math.max(1, Number(l.serie_boletos) || 1),
      }];
    }),
```

4. Classificação. Substitua `CmvItemClassificacao` e `classificarCmv` por:

```ts
/** Um item da classificação: exatamente um documento (boleto OU lançamento). */
export type CmvItemClassificacao = {
  rateioId: string | null;
  incluir: CmvDecisao;
  expectedUpdatedAt: string;
} & ({ contaPagarId: string; lancamentoId?: never } | { lancamentoId: string; contaPagarId?: never });

/** Item de classificação a partir de uma linha da lista do CMV. */
export function itemDaLinha(linha: CmvLinhaDetalhe, incluir: CmvDecisao): CmvItemClassificacao {
  return linha.fonte === 'lancamento'
    ? { lancamentoId: linha.documentoId, rateioId: linha.rateioId, incluir, expectedUpdatedAt: linha.updatedAt }
    : { contaPagarId: linha.documentoId, rateioId: linha.rateioId, incluir, expectedUpdatedAt: linha.updatedAt };
}

export async function classificarCmv(supabase: Supabase, itens: CmvItemClassificacao[], justificativa?: string) {
  const { data, error } = await rpc(supabase)('fin_cmv_classificar', {
    p_itens: itens.map(i => ({
      ...(i.lancamentoId ? { lancamento_id: i.lancamentoId } : { conta_pagar_id: i.contaPagarId }),
      rateio_id: i.rateioId,
      incluir: i.incluir,
      expected_updated_at: i.expectedUpdatedAt,
    })),
    p_justificativa: justificativa?.trim() || null,
  });
  if (error) {
    console.error('[CMV Financeiro] Falha em fin_cmv_classificar:', error);
    throw error;
  }
  return data as { titulos: number; itens: number };
}
```

5. Aplicar padrões. Acrescente depois de `aplicarCmvSerie`:

```ts
export interface CmvPreviaFonte {
  documentos: number;
  linhasSim: number;
  centavosSim: number;
  linhasNao: number;
  centavosNao: number;
  linhasSemPadrao: number;
  centavosSemPadrao: number;
}

export interface CmvPreviaPadroes {
  desde: string;
  boleto: CmvPreviaFonte;
  lancamento: CmvPreviaFonte;
}

export interface CmvPadroesAplicados {
  documentos: number;
  linhas: number;
  centavosSim: number;
  centavosNao: number;
}

const numero = (v: unknown) => Number(v) || 0;

function previaFonte(raw: unknown): CmvPreviaFonte {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    documentos: numero(o.documentos),
    linhasSim: numero(o.linhas_sim),
    centavosSim: numero(o.centavos_sim),
    linhasNao: numero(o.linhas_nao),
    centavosNao: numero(o.centavos_nao),
    linhasSemPadrao: numero(o.linhas_sem_padrao),
    centavosSemPadrao: numero(o.centavos_sem_padrao),
  };
}

/** Prévia de "Aplicar padrões": quantas linhas pendentes viram Sim/Não a partir de `desde`. Não grava. */
export async function simularPadroesCmv(supabase: Supabase, desde: string): Promise<CmvPreviaPadroes> {
  const { data, error } = await rpc(supabase)('fin_cmv_aplicar_padroes', { p_desde: desde, p_simular: true, p_justificativa: null });
  if (error) throw error;
  const o = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return { desde, boleto: previaFonte(o.boleto), lancamento: previaFonte(o.lancamento) };
}

/** Grava o padrão da categoria nas linhas pendentes a partir de `desde` (com auditoria por documento). */
export async function aplicarPadroesCmv(supabase: Supabase, desde: string, justificativa: string): Promise<CmvPadroesAplicados> {
  const { data, error } = await rpc(supabase)('fin_cmv_aplicar_padroes', {
    p_desde: desde, p_simular: false, p_justificativa: justificativa.trim(),
  });
  if (error) {
    console.error('[CMV Financeiro] Falha em fin_cmv_aplicar_padroes:', error);
    throw error;
  }
  const o = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return { documentos: numero(o.documentos), linhas: numero(o.linhas), centavosSim: numero(o.centavos_sim), centavosNao: numero(o.centavos_nao) };
}
```

- [ ] **Step 6: Manter o diálogo do CMV compilando (ajuste mínimo; a Tarefa 10 o refaz)**

Em `src/components/financeiro/cmv/CmvBoletosDialog.tsx`:
- acrescente `itemDaLinha` ao import de `@/hooks/useCmvFinanceiro`;
- faça as trocas exatas:

| Antes | Depois |
|---|---|
| `const chaveLinha = (l: Pick<CmvLinhaDetalhe, 'contaPagarId' \| 'rateioId'>) => \`${l.contaPagarId}:${l.rateioId ?? ''}\`;` | `const chaveLinha = (l: Pick<CmvLinhaDetalhe, 'fonte' \| 'documentoId' \| 'rateioId'>) => \`${l.fonte}:${l.documentoId}:${l.rateioId ?? ''}\`;` |
| `await classificarCmv(supabase, [{`<br>`  contaPagarId: linha.contaPagarId, rateioId: linha.rateioId, incluir, expectedUpdatedAt: linha.updatedAt,`<br>`}]);` | `await classificarCmv(supabase, [itemDaLinha(linha, incluir)]);` |
| `l.contaPagarId !== linha.contaPagarId` | `l.documentoId !== linha.documentoId` |
| `titulos: new Set(linhas.map(l => l.contaPagarId)).size,` | `titulos: new Set(linhas.map(l => l.documentoId)).size,` |
| `previa.linhas.map(l => ({ contaPagarId: l.contaPagarId, rateioId: l.rateioId, incluir, expectedUpdatedAt: l.updatedAt })),` | `previa.linhas.map(l => itemDaLinha(l, incluir)),` |
| `aplicarCmvSerie(supabase, referencia.contaPagarId, {` | `aplicarCmvSerie(supabase, referencia.documentoId, {` |
| `onClick={() => abrirBoleto(linha.contaPagarId)}` | `onClick={() => abrirBoleto(linha.documentoId)}` |

- [ ] **Step 7: Rodar e ver passar**

Run: `bunx vitest run src/domain/financeiro/cmv src/hooks/useCmvFinanceiro.test.ts src/components/financeiro/cmv src/lib/cmvFinanceiroPdfExport.test.ts`
Expected: PASS.

Run: `bunx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros.

- [ ] **Step 8: Commit**

```powershell
git add src/domain/financeiro/cmv/report.ts src/domain/financeiro/cmv/rateio.ts src/hooks/useCmvFinanceiro.ts src/domain/financeiro/cmv/report.test.ts src/domain/financeiro/cmv/rateio.test.ts src/hooks/useCmvFinanceiro.test.ts src/components/financeiro/cmv/CmvBoletosDialog.tsx src/components/financeiro/cmv/CmvFinanceiroSection.test.tsx src/lib/cmvFinanceiroPdfExport.test.ts
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): domínio e hook contam lançamentos e classificam por fonte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 5: Bibliotecas puras — payload do Livro Razão e da linha do extrato

**Files:**
- Create: `src/lib/cmvLancamentoPayload.ts`, `src/lib/cmvLancamentoPayload.test.ts`
- Create: `src/lib/conciliacaoCmv.ts`, `src/lib/conciliacaoCmv.test.ts`

**Interfaces:**
- Consumes: `decisaoAoTrocarCategoria`, `CmvAvisoDecisao`, `CmvDecisao` (Task 4).
- Produces:
  - `@/lib/cmvLancamentoPayload` (Tarefa 7):
    - `rateiosComCmv(linhas: readonly LinhaRateioCmv[], enviaCmv: boolean): RateioPayload[]`;
    - `cmvDoCabecalho(temRateio: boolean, decisao: CmvDecisao | undefined, enviaCmv: boolean): { p_cmv?: { incluir: CmvDecisao } }`.
  - `@/lib/conciliacaoCmv` (Tarefas 8 e 9):
    - tipos `RateioExtratoCmv` e `LinhaExtratoCmv`;
    - `rateioDaLinhaExtrato(l, centroPadrao: (categoriaId: string) => string | null, enviaCmv: boolean): ItemRateioImportacao[] | null`;
    - `competenciaDaLinhaExtrato(l, aceita: boolean): { p_data_competencia?: string }`;
    - `decisaoDaLinhaExtrato(l): CmvDecisao`;
    - `definirDecisaoDaLinha<T>(l: T, decisao: boolean): T`;
    - `trocarCategoriaDaLinha<T>(l: T, categoriaId: string, padroes: ReadonlyMap<string, CmvDecisao> | null): T`;
    - `resumoCmvRateio(linhas): { total: number; respondidas: number }`;
    - `datasDoLancamentoCriado({ dataCompetencia, dataPagamento, aceitaCompetencia }): { p_data: string; extra: { p_data_competencia?: string }; atualizaPagamento: boolean }`.

- [ ] **Step 1: Escrever os testes**

`src/lib/cmvLancamentoPayload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cmvDoCabecalho, rateiosComCmv } from './cmvLancamentoPayload';

describe('payload da decisão do CMV no Livro Razão', () => {
  const linhas = [
    { id: 'r1', categoria_id: 'peixes', centro_custo_id: '', valor: 70, percentual: 70, cmv_incluir: true },
    { categoria_id: 'escr', centro_custo_id: 'cc', valor: 30, percentual: 0, cmv_incluir: null },
  ];

  it('com o recurso, cada linha leva o id (preservado na edição) e a decisão', () => {
    expect(rateiosComCmv(linhas, true)).toEqual([
      { categoria_id: 'peixes', centro_custo_id: null, valor: 70, percentual: 70, observacao: null, id: 'r1', cmv_incluir: true },
      { categoria_id: 'escr', centro_custo_id: 'cc', valor: 30, percentual: null, observacao: null, id: null, cmv_incluir: null },
    ]);
  });

  it('sem o recurso, ou em receita, o payload é exatamente o de antes', () => {
    expect(rateiosComCmv(linhas, false)).toEqual([
      { categoria_id: 'peixes', centro_custo_id: null, valor: 70, percentual: 70, observacao: null },
      { categoria_id: 'escr', centro_custo_id: 'cc', valor: 30, percentual: null, observacao: null },
    ]);
  });

  it('p_cmv só vale sem rateio; com rateio vai nulo; sem o recurso não vai', () => {
    expect(cmvDoCabecalho(false, true, true)).toEqual({ p_cmv: { incluir: true } });
    expect(cmvDoCabecalho(true, true, true)).toEqual({ p_cmv: { incluir: null } });
    expect(cmvDoCabecalho(false, undefined, true)).toEqual({ p_cmv: { incluir: null } });
    expect(cmvDoCabecalho(false, true, false)).toEqual({});
  });
});
```

`src/lib/conciliacaoCmv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  competenciaDaLinhaExtrato, datasDoLancamentoCriado, decisaoDaLinhaExtrato, definirDecisaoDaLinha,
  rateioDaLinhaExtrato, resumoCmvRateio, trocarCategoriaDaLinha, type LinhaExtratoCmv,
} from './conciliacaoCmv';

const padroes = new Map<string, boolean | null>([['peixes', true], ['escr', false], ['sem', null]]);
const linha = (over: Partial<LinhaExtratoCmv> = {}): LinhaExtratoCmv => ({ data: '2026-09-10', valor: 55, tipo: 'DESPESA', ...over });
const rateio = (categoria_id: string, valor: number, cmv_incluir?: boolean | null) =>
  ({ categoria_id, centro_custo_id: '', valor, percentual: 0, observacao: '', cmv_incluir });

describe('conciliação — decisão do CMV e competência da linha do extrato', () => {
  it('categoria única: a decisão da linha vai no item, com o centro de custo padrão da categoria', () => {
    expect(rateioDaLinhaExtrato(linha({ categoriaId: 'peixes', cmvIncluir: true }), () => 'cc1', true)).toEqual([
      { categoria_id: 'peixes', centro_custo_id: 'cc1', valor: 55, percentual: 100, observacao: null, cmv_incluir: true },
    ]);
  });

  it('rateio: cada linha leva a sua decisão', () => {
    const itens = rateioDaLinhaExtrato(linha({ rateioLinhas: [rateio('peixes', 40, true), rateio('escr', 15, false)] }), () => null, true);
    expect(itens?.map(i => i.cmv_incluir)).toEqual([true, false]);
  });

  it('receita, ou banco sem o recurso: o payload de antes, sem a chave da decisão', () => {
    expect(rateioDaLinhaExtrato(linha({ tipo: 'RECEITA', categoriaId: 'vendas', cmvIncluir: true }), () => null, true)?.[0]).not.toHaveProperty('cmv_incluir');
    expect(rateioDaLinhaExtrato(linha({ categoriaId: 'peixes', cmvIncluir: true }), () => null, false)?.[0]).not.toHaveProperty('cmv_incluir');
  });

  it('sem categoria: null (a RPC exige categoria e a tela já barra antes)', () => {
    expect(rateioDaLinhaExtrato(linha(), () => null, true)).toBeNull();
  });

  it('linha salva antes do recurso (sem os campos novos) segue pendente e sem competência própria', () => {
    expect(rateioDaLinhaExtrato(linha({ categoriaId: 'peixes' }), () => null, true)?.[0].cmv_incluir).toBeNull();
    expect(competenciaDaLinhaExtrato(linha(), true)).toEqual({});
  });

  it('competência só vai quando difere da data do banco, em despesa, e o banco aceita', () => {
    expect(competenciaDaLinhaExtrato(linha({ competencia: '2026-09-03' }), true)).toEqual({ p_data_competencia: '2026-09-03' });
    expect(competenciaDaLinhaExtrato(linha({ competencia: '2026-09-10' }), true)).toEqual({});
    expect(competenciaDaLinhaExtrato(linha({ competencia: '' }), true)).toEqual({});
    expect(competenciaDaLinhaExtrato(linha({ competencia: '2026-09-03' }), false)).toEqual({});
    expect(competenciaDaLinhaExtrato(linha({ tipo: 'RECEITA', competencia: '2026-09-03' }), true)).toEqual({});
  });

  it('trocar a categoria na linha: ela vale (o rateio de uma linha salvo antes sai) e a decisão é sugerida de novo', () => {
    const antes = linha({ categoriaId: 'peixes', rateioLinhas: [rateio('peixes', 55, true)] });
    const depois = trocarCategoriaDaLinha(antes, 'escr', padroes);
    expect(depois.rateioLinhas).toBeUndefined();
    expect(depois).toMatchObject({ categoriaId: 'escr', cmvIncluir: false, cmvAviso: 'redefinido' });
    expect(trocarCategoriaDaLinha(linha(), 'sem', padroes)).toMatchObject({ categoriaId: 'sem', cmvIncluir: null });
    // classificação desligada (sem padrões): a resposta da linha não muda sozinha
    expect(trocarCategoriaDaLinha(linha({ cmvIncluir: true }), 'escr', null)).toMatchObject({ categoriaId: 'escr', cmvIncluir: true });
    // receita nunca recebe sugestão
    expect(trocarCategoriaDaLinha(linha({ tipo: 'RECEITA' }), 'peixes', padroes).cmvIncluir).toBeUndefined();
  });

  it('a decisão exibida e a gravada são a mesma: com rateio de uma linha, a da linha do rateio', () => {
    const umaLinha = linha({ rateioLinhas: [rateio('peixes', 55, null)] });
    const respondida = definirDecisaoDaLinha(umaLinha, true);
    expect(decisaoDaLinhaExtrato(respondida)).toBe(true);
    expect(rateioDaLinhaExtrato(respondida, () => null, true)?.[0].cmv_incluir).toBe(true);
    expect(decisaoDaLinhaExtrato(definirDecisaoDaLinha(linha(), false))).toBe(false);
  });

  it('resumo do rateio com várias linhas', () => {
    expect(resumoCmvRateio([rateio('a', 1, true), rateio('b', 1, null), rateio('c', 1, false)])).toEqual({ total: 3, respondidas: 2 });
  });

  it('datas do diálogo "Criar": a data do banco no p_data e a competência à parte', () => {
    expect(datasDoLancamentoCriado({ dataCompetencia: '2026-09-03', dataPagamento: '2026-09-10', aceitaCompetencia: true }))
      .toEqual({ p_data: '2026-09-10', extra: { p_data_competencia: '2026-09-03' }, atualizaPagamento: false });
    expect(datasDoLancamentoCriado({ dataCompetencia: '2026-09-10', dataPagamento: '2026-09-10', aceitaCompetencia: true }))
      .toEqual({ p_data: '2026-09-10', extra: {}, atualizaPagamento: false });
    expect(datasDoLancamentoCriado({ dataCompetencia: '2026-09-03', dataPagamento: '', aceitaCompetencia: true }))
      .toEqual({ p_data: '2026-09-03', extra: {}, atualizaPagamento: false });
    // banco sem o recurso: exatamente o fluxo de antes
    expect(datasDoLancamentoCriado({ dataCompetencia: '2026-09-03', dataPagamento: '2026-09-10', aceitaCompetencia: false }))
      .toEqual({ p_data: '2026-09-03', extra: {}, atualizaPagamento: true });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/lib/cmvLancamentoPayload.test.ts src/lib/conciliacaoCmv.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`src/lib/cmvLancamentoPayload.ts`:

```ts
/**
 * Decisão "Aparecer no CMV financeiro?" das despesas do Livro Razão, no formato
 * de `_guarded_upsert_lancamento` e `_guarded_update_reconciled_classification`.
 *
 * Só vai ao servidor quando `enviaCmv`: o banco tem o recurso (`recursos.lancamentos`),
 * a despesa é DESPESA e, na edição, as decisões foram lidas ao abrir. Sem isso o
 * payload é o de antes e o servidor preserva (herda) as decisões que já existem.
 */
import type { CmvDecisao } from '@/domain/financeiro/cmv';

export interface LinhaRateioCmv {
  /** Id da linha já gravada: o servidor mantém o identificador na edição. */
  id?: string;
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  cmv_incluir?: CmvDecisao;
}

export interface RateioPayload {
  categoria_id: string;
  centro_custo_id: string | null;
  valor: number;
  percentual: number | null;
  observacao: null;
  id?: string | null;
  cmv_incluir?: CmvDecisao;
}

export function rateiosComCmv(linhas: readonly LinhaRateioCmv[], enviaCmv: boolean): RateioPayload[] {
  return linhas.map(l => ({
    categoria_id: l.categoria_id,
    centro_custo_id: l.centro_custo_id || null,
    valor: Number(l.valor),
    percentual: l.percentual || null,
    observacao: null,
    ...(enviaCmv ? { id: l.id ?? null, cmv_incluir: l.cmv_incluir ?? null } : {}),
  }));
}

/** `p_cmv` = decisão da despesa SEM rateio; com rateio, a decisão é de cada linha. */
export function cmvDoCabecalho(temRateio: boolean, decisao: CmvDecisao | undefined, enviaCmv: boolean): { p_cmv?: { incluir: CmvDecisao } } {
  if (!enviaCmv) return {};
  return { p_cmv: { incluir: temRateio ? null : (decisao ?? null) } };
}
```

`src/lib/conciliacaoCmv.ts`:

```ts
/**
 * Conciliação Bancária × CMV Financeiro: decisão "Aparecer no CMV financeiro?" e
 * competência própria da linha do extrato que vira despesa nova.
 *
 * A data do banco (`data` da linha) é sempre o `p_data` de reconcile_import_lancamento:
 * é ela que entra na chave de idempotência e na checagem de duplicata. A competência
 * só muda a data de competência (DRE e CMV). Nada disso vai ao servidor quando o banco
 * ainda não tem o recurso (`recursos.lancamentos`).
 */
import { decisaoAoTrocarCategoria, type CmvAvisoDecisao, type CmvDecisao } from '@/domain/financeiro/cmv';

export interface RateioExtratoCmv {
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  observacao: string;
  cmv_incluir?: CmvDecisao;
  cmv_aviso?: CmvAvisoDecisao;
}

export interface LinhaExtratoCmv {
  data: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA';
  categoriaId?: string;
  rateioLinhas?: RateioExtratoCmv[];
  /** Decisão da linha sem rateio. Ausente em linha salva antes do recurso = pendente. */
  cmvIncluir?: CmvDecisao;
  cmvAviso?: CmvAvisoDecisao;
  /** Competência própria (yyyy-MM-dd); ausente = a data do banco. */
  competencia?: string;
}

export interface ItemRateioImportacao {
  categoria_id: string | null;
  centro_custo_id: string | null;
  valor: number;
  percentual: number | null;
  observacao: string | null;
  cmv_incluir?: CmvDecisao;
}

/** Rateio (ou categoria única) da linha no formato de `reconcile_import_lancamento`. `null` = sem categoria. */
export function rateioDaLinhaExtrato(
  l: LinhaExtratoCmv,
  centroPadrao: (categoriaId: string) => string | null,
  enviaCmv: boolean,
): ItemRateioImportacao[] | null {
  const comCmv = enviaCmv && l.tipo === 'DESPESA';
  if (l.rateioLinhas && l.rateioLinhas.length > 0) {
    return l.rateioLinhas.map(r => ({
      categoria_id: r.categoria_id || null,
      centro_custo_id: r.centro_custo_id || null,
      valor: r.valor,
      percentual: r.percentual || null,
      observacao: r.observacao || null,
      ...(comCmv ? { cmv_incluir: r.cmv_incluir ?? null } : {}),
    }));
  }
  if (l.categoriaId) {
    return [{
      categoria_id: l.categoriaId,
      centro_custo_id: centroPadrao(l.categoriaId),
      valor: l.valor,
      percentual: 100,
      observacao: null,
      ...(comCmv ? { cmv_incluir: l.cmvIncluir ?? null } : {}),
    }];
  }
  return null;
}

/** `p_data_competencia` só quando difere da data do banco, em despesa, e o banco aceita o parâmetro. */
export function competenciaDaLinhaExtrato(l: LinhaExtratoCmv, aceita: boolean): { p_data_competencia?: string } {
  if (!aceita || l.tipo !== 'DESPESA' || !l.competencia || l.competencia === l.data) return {};
  return { p_data_competencia: l.competencia };
}

/** Decisão exibida na linha: com rateio de uma linha, a dessa linha; senão, a da linha do extrato. */
export function decisaoDaLinhaExtrato(l: LinhaExtratoCmv): CmvDecisao {
  if (l.rateioLinhas && l.rateioLinhas.length === 1) return l.rateioLinhas[0].cmv_incluir ?? null;
  return l.cmvIncluir ?? null;
}

/** Resposta dada na própria linha: grava onde a importação vai ler. */
export function definirDecisaoDaLinha<T extends LinhaExtratoCmv>(l: T, decisao: boolean): T {
  const rateioLinhas = l.rateioLinhas && l.rateioLinhas.length === 1
    ? [{ ...l.rateioLinhas[0], cmv_incluir: decisao, cmv_aviso: undefined }]
    : l.rateioLinhas;
  return { ...l, rateioLinhas, cmvIncluir: decisao, cmvAviso: undefined };
}

/**
 * Trocar a categoria no seletor da linha. A categoria visível passa a valer: um
 * rateio de uma linha salvo antes era usado na importação em silêncio, ignorando o
 * que a tela mostrava. Com `padroes` (classificação ativa), a decisão é sugerida de
 * novo pelo padrão da categoria; sem eles, a resposta da linha não muda sozinha.
 */
export function trocarCategoriaDaLinha<T extends LinhaExtratoCmv>(
  l: T,
  categoriaId: string,
  padroes: ReadonlyMap<string, CmvDecisao> | null,
): T {
  const base: T = { ...l, categoriaId, rateioLinhas: undefined };
  if (!padroes || l.tipo !== 'DESPESA') return base;
  const { cmv_incluir, cmv_aviso } = decisaoAoTrocarCategoria(decisaoDaLinhaExtrato(l), categoriaId, padroes);
  return { ...base, cmvIncluir: cmv_incluir, cmvAviso: cmv_aviso };
}

export function resumoCmvRateio(linhas: readonly RateioExtratoCmv[]): { total: number; respondidas: number } {
  return { total: linhas.length, respondidas: linhas.filter(r => (r.cmv_incluir ?? null) !== null).length };
}

/**
 * Datas do lançamento criado pelo diálogo "Criar" (destino lançamento). Com o banco
 * atualizado, a data do banco (pagamento) vai em `p_data` e a competência em
 * `p_data_competencia`. Sem ele, o fluxo antigo: competência em `p_data` e a data
 * de pagamento corrigida depois por UPDATE.
 */
export function datasDoLancamentoCriado({ dataCompetencia, dataPagamento, aceitaCompetencia }: {
  dataCompetencia: string;
  dataPagamento: string;
  aceitaCompetencia: boolean;
}): { p_data: string; extra: { p_data_competencia?: string }; atualizaPagamento: boolean } {
  if (!aceitaCompetencia) return { p_data: dataCompetencia, extra: {}, atualizaPagamento: true };
  const dataBanco = dataPagamento || dataCompetencia;
  return {
    p_data: dataBanco,
    extra: dataCompetencia && dataCompetencia !== dataBanco ? { p_data_competencia: dataCompetencia } : {},
    atualizaPagamento: false,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/lib/cmvLancamentoPayload.test.ts src/lib/conciliacaoCmv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/cmvLancamentoPayload.ts src/lib/cmvLancamentoPayload.test.ts src/lib/conciliacaoCmv.ts src/lib/conciliacaoCmv.test.ts
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): payload da decisão e da competência para Livro Razão e conciliação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 6: Formulário compartilhado — bloco do CMV na despesa de lançamento

**Files:**
- Modify: `src/components/financeiro/ContaFormDialog.tsx`
- Test: `src/components/financeiro/ContaFormCmv.test.tsx`

**Interfaces:**
- Consumes: `decisaoAoTrocarCategoria` (Task 4).
- Produces (Tarefa 7): a prop nova `competenciaNaReclassificacao?: boolean` em `ContaFormDialog`. Com `classificationOnly`, ela libera o campo "Data de competência".
- Comportamento:
  - com `variant="lancamento"` e `form.tipo === 'DESPESA'`, o bloco do CMV aparece pelas mesmas regras de Contas a Pagar (`cmv` não nulo e `cmv.ativo` ou decisão já existente);
  - nunca trava o salvar.

- [ ] **Step 1: Escrever os testes**

Em `src/components/financeiro/ContaFormCmv.test.tsx`, troque a função `Form` por:

```tsx
function Form({ initial = base, linhas = [], cmv = cmvAtivo, isEditing = false, variant = 'pagar', classificationOnly = false, competenciaNaReclassificacao = false }: {
  initial?: ContaFormData; linhas?: RateioLine[]; cmv?: ContaFormCmv | null; isEditing?: boolean;
  variant?: 'pagar' | 'receber' | 'lancamento'; classificationOnly?: boolean; competenciaNaReclassificacao?: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [rateio, setRateio] = useState(linhas);
  return (
    <>
      <ContaFormDialog
        open onOpenChange={() => {}} variant={variant} form={form} onFormChange={setForm}
        rateioLines={rateio} onRateioLinesChange={setRateio} categorias={categorias} centros={[]} contas={[]}
        isEditing={isEditing} saving={false} onSave={() => {}} onClose={() => {}} cmv={cmv}
        classificationOnly={classificationOnly} competenciaNaReclassificacao={competenciaNaReclassificacao}
      />
      <output data-testid="form">{JSON.stringify(form)}</output>
      <output data-testid="rateio">{JSON.stringify(rateio)}</output>
    </>
  );
}
```

e acrescente no fim do arquivo:

```tsx
describe('Lançamentos — "Aparecer no CMV financeiro?"', () => {
  const despesa: ContaFormData = { ...base, descricao: 'PIX mercado', valor: 55, tipo: 'DESPESA', status: 'REALIZADO', forma_pagamento: 'pix' };
  const formAtual = () => JSON.parse(screen.getByTestId('form').textContent!);

  it('despesa nova mostra a pergunta, sugere pelo padrão da categoria e não trava o salvar', () => {
    render(<Form variant="lancamento" initial={despesa} />);
    expect(screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' })).toBeInTheDocument();
    expect(salvar()).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'peixes' } });
    expect(formAtual()).toMatchObject({ categoria_id: 'peixes', cmv_incluir: true, cmv_aviso: 'sugerido' });
    expect(resumo('Total da despesa')).toBe('R$ 55,00');
    expect(screen.getByText(/O pagamento e o saldo da conta não mudam\./)).toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it('categoria sem padrão começa em branco e ainda assim salva', () => {
    render(<Form variant="lancamento" initial={despesa} />);
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'novo' } });
    expect(formAtual().cmv_incluir).toBeNull();
    expect(salvar()).toBeEnabled();
  });

  it('receita e transferência não têm a pergunta', () => {
    const { unmount } = render(<Form variant="lancamento" initial={{ ...despesa, tipo: 'RECEITA' }} />);
    expect(screen.queryByText('Aparecer no CMV financeiro?')).not.toBeInTheDocument();
    unmount();
    render(<Form variant="lancamento" initial={{ ...despesa, tipo: 'TRANSFERENCIA' }} />);
    expect(screen.queryByText('Aparecer no CMV financeiro?')).not.toBeInTheDocument();
  });

  it('sem o recurso no banco (cmv nulo) nada muda', () => {
    render(<Form variant="lancamento" initial={despesa} cmv={null} />);
    expect(screen.queryByText('Aparecer no CMV financeiro?')).not.toBeInTheDocument();
  });

  it('reclassificação de lançamento conciliado: competência liberada só com o recurso', () => {
    const { unmount } = render(<Form variant="lancamento" initial={despesa} isEditing classificationOnly competenciaNaReclassificacao />);
    expect(screen.getByLabelText('Data de competência *')).toBeEnabled();
    expect(screen.getByText(/competência, a resposta do CMV e observações podem ser alterados/)).toBeInTheDocument();
    unmount();
    render(<Form variant="lancamento" initial={despesa} isEditing classificationOnly />);
    expect(screen.getByLabelText('Data de competência *')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/components/financeiro/ContaFormCmv.test.tsx`
Expected: FAIL. Em lançamento a pergunta não aparece, e a prop `competenciaNaReclassificacao` não existe.

- [ ] **Step 3: Implementar em `ContaFormDialog.tsx`**

1. Import do domínio (linha 19):

```ts
import { decisaoAoTrocarCategoria, formatarCentavos, formatarData, resumirBoleto, type CmvDecisao } from '@/domain/financeiro/cmv';
```

2. Em `Props`, depois de `cmv?: ContaFormCmv | null;`:

```ts
  /** Reclassificação de lançamento conciliado pode ajustar a competência (banco com o recurso). */
  competenciaNaReclassificacao?: boolean;
```

   e, na desestruturação dos props, depois de `cmv = null,`:

```ts
  competenciaNaReclassificacao = false,
```

3. Troque o bloco `// ─── CMV financeiro ───` até o fim de `cmvAoTrocarCategoria` por:

```ts
  // ─── CMV financeiro ───
  // Boleto de Contas a Pagar e despesa do Livro Razão. Só o boleto exige a resposta;
  // no lançamento ela é sugerida pelo padrão da categoria e a pendência fica na revisão.
  const cmvDoc = variant === 'pagar' ? 'boleto' : 'despesa';
  const cmvVariante = variant === 'pagar' || (variant === 'lancamento' && form.tipo === 'DESPESA');
  const cmvTemDecisao = (form.cmv_incluir ?? null) !== null || rateioLines.some(l => (l.cmv_incluir ?? null) !== null);
  const mostrarCmv = cmvVariante && cmv !== null && (cmv.ativo || cmvTemDecisao);
  const [rateioRef, rateioEstreito] = useConteinerEstreito(mostrarCmv ? RATEIO_LIMITE_CMV_PX : RATEIO_LIMITE_PX, RATEIO_HISTERESE_PX);

  /** Trocar a categoria reaplica o padrão dela — e avisa, para a decisão não mudar em silêncio. */
  const cmvAoTrocarCategoria = (anterior: CmvDecisao | undefined, categoriaId: string): { cmv_incluir: CmvDecisao; cmv_aviso?: CmvAviso } =>
    cmv ? decisaoAoTrocarCategoria(anterior, categoriaId, cmv.padroes) : { cmv_incluir: anterior ?? null };
```

4. Troque a definição de `cmvBloqueiaSalvar` por:

```ts
  const cmvBloqueiaSalvar = variant === 'pagar' && mostrarCmv && Boolean(cmv?.ativo)
    && (isEditing ? cmvApagadaNaEdicao : cmvResumo.linhasPendentes > 0);
```

5. Troque a função `textoAvisoCmv` por:

```ts
  const textoAvisoCmv = (aviso?: CmvAviso) =>
    aviso === 'unificar' ? `O rateio tinha respostas diferentes: informe a ${variant === 'pagar' ? 'do boleto inteiro' : 'da despesa inteira'}.`
      : aviso === 'redefinido' ? 'Categoria trocada: decisão redefinida. Confira.'
      : aviso === 'sugerido' ? 'Sugestão do padrão da categoria.'
        : null;
```

6. Em `cmvResumoBloco`:
   - troque `<dt className="text-muted-foreground">Total do boleto</dt>` por `<dt className="text-muted-foreground">Total {cmvDoc === 'boleto' ? 'do boleto' : 'da despesa'}</dt>`;
   - troque o parágrafo `text-[11px]` inteiro por:

```tsx
      <p className="text-[11px] text-muted-foreground">
        {cmvCompetencia
          ? <>Competência usada no CMV: <strong className="text-foreground">{formatarData(cmvCompetencia)}</strong>{!form.data_competencia && ' (vencimento, pois a competência não foi informada)'}.</>
          : `Sem data de competência ${cmvDoc === 'boleto' ? 'o boleto' : 'a despesa'} não entra em nenhum período do CMV.`}
        {' '}{cmvDoc === 'boleto' ? 'A cobrança e o pagamento do boleto não mudam.' : 'O pagamento e o saldo da conta não mudam.'}
      </p>
```

7. No aviso de `classificationOnly`, troque o `<p className="mt-1 text-xs text-muted-foreground">` inteiro por:

```tsx
              <p className="mt-1 text-xs text-muted-foreground">
                {competenciaNaReclassificacao
                  ? 'Somente categoria, centro de custo, rateio, competência, a resposta do CMV e observações podem ser alterados. Valor, data do banco, conta, tipo e descrição bancária permanecem bloqueados.'
                  : 'Somente categoria, centro de custo, rateio e observações podem ser alterados. Valor, data, conta, tipo e descrição bancária permanecem bloqueados.'}
              </p>
```

8. No `DateInput` de competência (`id={id('competencia')}`), troque `disabled={classificationOnly}` por `disabled={classificationOnly && !competenciaNaReclassificacao}`.

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/components/financeiro/ContaFormCmv.test.tsx src/components/financeiro/ContaFormPagamento.test.tsx src/components/financeiro/FinanceiroCompartilhados.test.tsx src/components/financeiro/ContaDetailDialog.test.tsx`
Expected: PASS. Os testes de Contas a Pagar continuam iguais: boleto continua travando.

- [ ] **Step 5: Commit**

```powershell
git add src/components/financeiro/ContaFormDialog.tsx src/components/financeiro/ContaFormCmv.test.tsx
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): formulário pergunta "Aparecer no CMV financeiro?" na despesa de lançamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 7: Livro Razão — ler e enviar a decisão; abrir o lançamento vindo do CMV

**Files:**
- Modify: `src/components/financeiro/LivroRazaoSection.tsx`
- Modify: `src/components/FinanceiroView.tsx`
- Test: `src/components/financeiro/LivroRazaoSection.test.tsx`

**Interfaces:**
- Consumes:
  - `fetchCmvConfig` (Task 4), que nunca lança e devolve `null` sem o recurso;
  - `rateiosComCmv` e `cmvDoCabecalho` (Task 5);
  - a prop `competenciaNaReclassificacao` (Task 6);
  - as RPCs da Task 2.
- Produces (usado pela Tarefa 10):
  - o Livro Razão consome o registro de navegação `{ type: 'lancamento', id }`;
  - `FinanceiroView` atende à sub-aba `'lancamentos'` de `requestNavigation`.

- [ ] **Step 1: Escrever os testes**

Em `src/components/financeiro/LivroRazaoSection.test.tsx`:

1. Troque o objeto `supabase` por um construtor encadeável, porque o salvar consulta `.in().gte().lte().limit()`:

```ts
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'maybeSingle']) b[m] = () => b;
  b.then = (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: tableData[table] ?? [], error: null }).then(resolve, reject);
  return b;
}

const supabase = {
  from: (table: string) => builder(table),
  rpc: (name: string, params?: unknown) => state.rpc(name, params),
};
```

2. Troque o mock do formulário, para os testes alcançarem `form`, `cmv`, `onFormChange` e `onSave`:

```ts
type FormProps = {
  form: Record<string, unknown>;
  cmv: unknown;
  onFormChange: (f: Record<string, unknown>) => void;
  onSave: () => Promise<void> | void;
};
const formulario = vi.hoisted(() => ({ props: null as null | FormProps }));
vi.mock('@/components/financeiro/ContaFormDialog', () => ({
  default: (props: FormProps) => { formulario.props = props; return null; },
}));
```

3. No `beforeEach`, acrescente `formulario.props = null;`.

4. Acrescente no fim do arquivo:

```tsx
describe('Livro Razão — CMV financeiro na despesa nova', () => {
  const comConfig = (config: unknown) => {
    const base = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation((name: string, params?: unknown) =>
      name === 'get_fin_cmv_config' ? Promise.resolve({ data: config, error: null }) : base(name, params));
  };
  const novaDespesa = async () => {
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova Despesa/ }));
  };
  const salvarCom = async (campos: Record<string, unknown>) => {
    act(() => formulario.props!.onFormChange({ ...formulario.props!.form, ...campos }));
    await act(async () => { await formulario.props!.onSave(); });
    return state.rpc.mock.calls.find(([nome]) => nome === '_guarded_upsert_lancamento')?.[1] as Record<string, unknown> | undefined;
  };

  it('com o recurso no banco, o formulário recebe a configuração e o salvar envia a decisão', async () => {
    comConfig({ classificacao_ativa: true, categorias: [{ id: 'cat-peixe', nome: 'Peixes', cmv_sugerir: true }], recursos: { lancamentos: true } });
    await novaDespesa();
    await waitFor(() => expect(formulario.props?.cmv).toMatchObject({ ativo: true }));
    const args = await salvarCom({ descricao: 'PIX arroz', valor: 55, categoria_id: 'cat-peixe', cmv_incluir: true });
    expect(args).toMatchObject({ p_tipo: 'DESPESA', p_categoria_id: 'cat-peixe', p_rateios: [], p_cmv: { incluir: true } });
  });

  it('banco sem o recurso: formulário sem CMV e o payload de antes', async () => {
    comConfig({ classificacao_ativa: true, categorias: [] });
    await novaDespesa();
    await waitFor(() => expect(formulario.props).not.toBeNull());
    expect(formulario.props!.cmv).toBeNull();
    const args = await salvarCom({ descricao: 'PIX arroz', valor: 55, categoria_id: 'cat-peixe' });
    expect(args).toBeDefined();
    expect(args).not.toHaveProperty('p_cmv');
  });

  it('receita nunca envia a decisão', async () => {
    comConfig({ classificacao_ativa: true, categorias: [], recursos: { lancamentos: true } });
    await novaDespesa();
    await waitFor(() => expect(formulario.props?.cmv).not.toBeNull());
    const args = await salvarCom({ tipo: 'RECEITA', descricao: 'Venda', valor: 10, categoria_id: 'cat-venda', cmv_incluir: true });
    expect(args).not.toHaveProperty('p_cmv');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/components/financeiro/LivroRazaoSection.test.tsx`
Expected: os testes antigos passam com o mock novo. Os novos falham: `cmv` não chega ao formulário e não há `p_cmv`.

- [ ] **Step 3: Implementar em `LivroRazaoSection.tsx`**

1. Imports. Troque a linha do `ContaFormDialog` e acrescente três:

```ts
import ContaFormDialog, { type ContaFormCmv, type ContaFormData, type RateioLine } from './ContaFormDialog';
import { fetchCmvConfig } from '@/hooks/useCmvFinanceiro';
import { cmvDoCabecalho, rateiosComCmv } from '@/lib/cmvLancamentoPayload';
import { useNavigationRecord } from '@/hooks/useNavigationRequest';
```

2. Estado. Logo depois de `const [justificativa, setJustificativa] = useState('');`:

```ts
  // CMV Financeiro: só com o recurso no banco (recursos.lancamentos). Nulo = formulário e payload como antes.
  const [cmvForm, setCmvForm] = useState<ContaFormCmv | null>(null);
  // A edição só envia a decisão se a leu ao abrir; senão o servidor preserva a que existe.
  const cmvLidoNaEdicao = useRef(false);
  const competenciaNaAbertura = useRef<string | null>(null);
```

3. Em `load`, troque o `Promise.all` e o que vem depois dele por:

```ts
    const [_, catRes, ccRes, contRes, , , cmvConfig] = await Promise.all([
      loadPage(null, null),
      supabase.from('fin_categorias').select('id, nome, tipo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
      loadTotais(),
      loadSaldoAtual(),
      fetchCmvConfig(supabase),
    ]);
    setCategorias(buildCategoryOptions((catRes.data as CategoriaRef[]) || []));
    setCentros((ccRes.data as CentroCustoRef[]) || []);
    setContas((contRes.data as ContaRef[]) || []);
    setCmvForm(cmvConfig?.recursos.lancamentos
      ? { ativo: cmvConfig.classificacaoAtiva, padroes: new Map(cmvConfig.categorias.map(c => [c.id, c.cmvSugerir])) }
      : null);
```

4. Em `resetForm`, depois de `setJustificativa('');`:

```ts
    cmvLidoNaEdicao.current = false;
    competenciaNaAbertura.current = null;
```

5. Logo depois da linha `const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard(...)` e **antes** de `if (!canView) return <NoAccess />;`:

```ts
  // Vindo do CMV (lista de origem): abre o detalhe do lançamento, mesmo fora da página carregada.
  useNavigationRecord('financeiro', ['lancamento'], async ({ id }) => {
    const { data, error } = await supabase.from('fin_lancamentos').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      if (error) console.error('[LivroRazaoSection.navegacao]', error);
      toast.error('Lançamento não encontrado.');
      return;
    }
    const row = data as unknown as Omit<Lancamento, 'data_ledger' | 'saldo_apos'>;
    void openDetail({ ...row, data_ledger: row.data_pagamento || row.data_competencia, saldo_apos: null });
  });
```

6. Em `openEdit`, troque o trecho de `// Load rateios from database` até `setRateioLines(loadedRateios);` por:

```ts
    // Rateios e, com o recurso no banco, a decisão do CMV (linhas e cabeçalho).
    const comCmv = Boolean(cmvForm) && item.tipo === 'DESPESA';
    const [ratesRes, cabecalhoRes] = await Promise.all([
      supabase
        .from('fin_lancamento_rateios')
        .select(comCmv ? 'id, categoria_id, centro_custo_id, valor, percentual, cmv_incluir' : 'id, categoria_id, centro_custo_id, valor, percentual')
        .eq('lancamento_id', item.id),
      comCmv
        ? supabase.from('fin_lancamentos').select('cmv_incluir').eq('id', item.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (ratesRes.error) {
      toast.error('Erro ao carregar rateios: ' + ratesRes.error.message);
      return;
    }
    // Sem as colunas do CMV na leitura, o salvamento não pode enviar a decisão (gravaria "pendente" por cima).
    cmvLidoNaEdicao.current = comCmv && !cabecalhoRes.error;
    competenciaNaAbertura.current = item.data_competencia;
    const cmvCabecalho = (cabecalhoRes.data as unknown as { cmv_incluir?: boolean | null } | null)?.cmv_incluir ?? null;

    const loadedRateios: RateioLine[] = ((ratesRes.data || []) as any[]).map((r: any) => ({
      key: r.id,
      id: r.id,
      categoria_id: r.categoria_id,
      centro_custo_id: r.centro_custo_id || '',
      valor: r.valor,
      percentual: r.percentual,
      ...(cmvLidoNaEdicao.current ? { cmv_incluir: r.cmv_incluir ?? null } : {}),
    }));
    setRateioLines(loadedRateios);
```

   No `setForm` do ramo que **não** é transferência (o segundo), depois de `centro_custo_id: item.centro_custo_id || '',`:

```ts
        ...(cmvLidoNaEdicao.current ? { cmv_incluir: cmvCabecalho } : {}),
```

   O arquivo já usa `(r: any)` aqui, então o `any` não é novo.

7. Em `saveReconciledClassification`, troque o bloco `const rateiosPayload = ...` e a chamada da RPC por:

```ts
      // Decisão e competência só com o recurso no banco; a decisão, só se foi lida ao abrir.
      const enviaCmv = Boolean(cmvForm) && form.tipo === 'DESPESA' && cmvLidoNaEdicao.current;
      const competenciaMudou = Boolean(cmvForm) && Boolean(form.data_competencia)
        && form.data_competencia !== competenciaNaAbertura.current;

      const { error } = await callUntypedRpc('_guarded_update_reconciled_classification', {
        p_id: editId,
        p_categoria_id: rateioLines.length === 0 ? (form.categoria_id || null) : null,
        p_centro_custo_id: rateioLines.length === 0 ? (form.centro_custo_id || null) : null,
        p_observacoes: form.observacoes || null,
        p_rateios: rateiosComCmv(rateioLines, enviaCmv),
        p_expected_updated_at: editUpdatedAt,
        p_justificativa_edicao: justificativa.trim(),
        ...cmvDoCabecalho(rateioLines.length > 0, form.cmv_incluir, enviaCmv),
        ...(competenciaMudou ? { p_data_competencia: form.data_competencia } : {}),
      });
```

8. Em `save`, troque o bloco `const rateiosPayload = rateioLines.length > 0 ? ... : [];` por:

```ts
      // Decisão do CMV: só com o recurso, só despesa e, na edição, só se foi lida ao abrir.
      const enviaCmv = Boolean(cmvForm) && form.tipo === 'DESPESA' && (!editId || cmvLidoNaEdicao.current);
      const rateiosPayload = rateiosComCmv(rateioLines, enviaCmv);
```

   e, no objeto `rpcParams`, depois de `p_justificativa_edicao: justificativa.trim() || null,`:

```ts
        ...cmvDoCabecalho(rateioLines.length > 0, form.cmv_incluir, enviaCmv),
```

9. No `<ContaFormDialog ... />`, depois de `classificationOnly={editClassificationOnly}`:

```tsx
        cmv={editId && !cmvLidoNaEdicao.current ? null : cmvForm}
        competenciaNaReclassificacao={Boolean(cmvForm)}
```

- [ ] **Step 4: Sub-aba de Lançamentos atendida pela navegação**

Em `src/components/FinanceiroView.tsx`, troque o callback de `useNavigationSubtab('financeiro', ...)` por:

```ts
  useNavigationSubtab('financeiro', subtab => {
    if (subtab === 'pagar' && visibleSubtabs.includes('pagar')) handleTabSelect('pagar');
    // Vindo do CMV: abre Lançamentos (Livro Razão, a visão inicial), que consome o registro.
    if (subtab === 'lancamentos' && visibleSubtabs.includes('lancamentos')) handleTabSelect('lancamentos');
  });
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bunx vitest run src/components/financeiro/LivroRazaoSection.test.tsx`
Expected: PASS.

Run: `bunx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros.

- [ ] **Step 6: Commit**

```powershell
git add src/components/financeiro/LivroRazaoSection.tsx src/components/financeiro/LivroRazaoSection.test.tsx src/components/FinanceiroView.tsx
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): Livro Razão lê e envia a decisão do CMV e ajusta a competência do conciliado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 8: Conciliação Bancária — Sim/Não e competência na linha e no rateio

**Files:**
- Create: `src/components/financeiro/ConciliacaoLinhaCmv.tsx`, `src/components/financeiro/ConciliacaoLinhaCmv.test.tsx`
- Modify: `src/components/financeiro/ConciliacaoBancariaSection.tsx`
- Test: `src/components/financeiro/ConciliacaoBancariaSection.test.tsx`

**Interfaces:**
- Consumes:
  - `fetchCmvConfig` e `CmvConfig` (Task 4);
  - `decisaoAoTrocarCategoria` (Task 4);
  - as funções de `@/lib/conciliacaoCmv` (Task 5);
  - `CmvDecisaoToggle` (`{ value, onChange(bool), label, disabled?, size? }`).
- Produces (usado pela Tarefa 9):
  - `ConciliacaoBancariaSection` mantém `cmvConfig: CmvConfig | null` em estado;
  - a Tarefa 9 passa esse estado ao diálogo "Criar".

- [ ] **Step 1: Escrever os testes**

`src/components/financeiro/ConciliacaoLinhaCmv.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConciliacaoLinhaCmv from './ConciliacaoLinhaCmv';

const props = (over: Partial<Parameters<typeof ConciliacaoLinhaCmv>[0]> = {}) => ({
  mostrarCmv: true, decisao: null, onDecisao: vi.fn(), rateio: null, onAbrirRateio: vi.fn(),
  permiteCompetencia: true, dataBanco: '2026-09-10', competencia: undefined, onCompetencia: vi.fn(), rotulo: 'PIX ARROZ',
  ...over,
});

describe('linha do extrato — CMV e competência', () => {
  it('responde Sim na linha', () => {
    const p = props();
    render(<ConciliacaoLinhaCmv {...p} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sim' }));
    expect(p.onDecisao).toHaveBeenCalledWith(true);
  });

  it('competência começa na data do banco; outra data é enviada, a mesma volta a "sem ajuste"', () => {
    const p = props();
    render(<ConciliacaoLinhaCmv {...p} />);
    expect(screen.getByRole('button', { name: 'Alterar a competência de PIX ARROZ' })).toHaveTextContent('Competência: 10/09/2026');
    fireEvent.click(screen.getByRole('button', { name: 'Alterar a competência de PIX ARROZ' }));
    fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-09-03' } });
    expect(p.onCompetencia).toHaveBeenLastCalledWith('2026-09-03');
    fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-09-10' } });
    expect(p.onCompetencia).toHaveBeenLastCalledWith(undefined);
  });

  it('competência ajustada aparece marcada', () => {
    render(<ConciliacaoLinhaCmv {...props({ competencia: '2026-09-03' })} />);
    expect(screen.getByRole('button', { name: 'Alterar a competência de PIX ARROZ' })).toHaveTextContent('Competência: 03/09/2026 (ajustada)');
  });

  it('rateio com várias linhas: resumo que abre o rateio, sem Sim/Não na linha', () => {
    const p = props({ rateio: { total: 3, respondidas: 1 } });
    render(<ConciliacaoLinhaCmv {...p} />);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /CMV: 1 de 3 linhas do rateio respondidas/ }));
    expect(p.onAbrirRateio).toHaveBeenCalled();
  });

  it('sem pergunta e sem competência, não renderiza nada', () => {
    const { container } = render(<ConciliacaoLinhaCmv {...props({ mostrarCmv: false, permiteCompetencia: false })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

Em `src/components/financeiro/ConciliacaoBancariaSection.test.tsx`, acrescente no fim do arquivo (o helper `restaurar` e o `linha` já existem no arquivo):

```tsx
describe('Conciliação Bancária — CMV financeiro', () => {
  const configCmv = (recursos: boolean) => ({
    classificacao_ativa: true,
    categorias: [{ id: 'cat1', nome: 'Peixes', cmv_sugerir: true }],
    ...(recursos ? { recursos: { lancamentos: true } } : {}),
  });
  const comConfig = (config: unknown) => state.rpc.mockImplementation((nome: string) => {
    if (nome === 'get_fin_cmv_config') return Promise.resolve({ data: config, error: null });
    if (nome === 'reconcile_import_lancamento') return Promise.resolve({ data: { status: 'ok', lancamento_id: 'novo' }, error: null });
    return Promise.resolve({ data: state.saldoSistema, error: null });
  });
  const importacao = () =>
    state.rpc.mock.calls.find(([nome]) => nome === 'reconcile_import_lancamento')?.[1] as Record<string, unknown> | undefined;

  it('linha nova leva a decisão no item do rateio e a competência ajustada; p_data segue a data do banco', async () => {
    comConfig(configCmv(true));
    restaurar([linha({ descricao: 'PIX ARROZ', valor: 55, categoriaId: 'cat1', cmvIncluir: true, competencia: '2026-09-01' })]);
    render(<ConciliacaoBancariaSection />);
    expect(await screen.findByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — PIX ARROZ' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Processar' }));
    await waitFor(() => expect(importacao()).toBeDefined());
    expect(importacao()).toMatchObject({
      p_data: '2026-09-05', p_data_competencia: '2026-09-01',
      p_rateio_linhas: [expect.objectContaining({ categoria_id: 'cat1', cmv_incluir: true })],
    });
  });

  it('linha salva antes do recurso segue pendente e sem competência própria', async () => {
    comConfig(configCmv(true));
    restaurar([linha({ descricao: 'PIX ANTIGO', categoriaId: 'cat1' })]);
    render(<ConciliacaoBancariaSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Processar' }));
    await waitFor(() => expect(importacao()).toBeDefined());
    expect(importacao()).not.toHaveProperty('p_data_competencia');
    expect((importacao()!.p_rateio_linhas as Record<string, unknown>[])[0].cmv_incluir).toBeNull();
  });

  it('banco sem o recurso: nada novo na tela nem no payload', async () => {
    comConfig(configCmv(false));
    restaurar([linha({ descricao: 'PIX SEM RECURSO', categoriaId: 'cat1', cmvIncluir: true, competencia: '2026-09-01' })]);
    render(<ConciliacaoBancariaSection />);
    expect(await screen.findByText('PIX SEM RECURSO')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /Aparecer no CMV financeiro/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alterar a competência/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Processar' }));
    await waitFor(() => expect(importacao()).toBeDefined());
    expect(importacao()).not.toHaveProperty('p_data_competencia');
    expect((importacao()!.p_rateio_linhas as Record<string, unknown>[])[0]).not.toHaveProperty('cmv_incluir');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/components/financeiro/ConciliacaoLinhaCmv.test.tsx src/components/financeiro/ConciliacaoBancariaSection.test.tsx`
Expected: FAIL. O componente não existe e a tela não envia `cmv_incluir` nem `p_data_competencia`.

- [ ] **Step 3: Criar `ConciliacaoLinhaCmv.tsx`**

```tsx
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import CmvDecisaoToggle from '@/components/financeiro/cmv/CmvDecisaoToggle';
import { formatarData, type CmvAvisoDecisao, type CmvDecisao } from '@/domain/financeiro/cmv';

interface Props {
  /** Pergunta visível: despesa, banco com o recurso e classificação ativa (ou linha já respondida). */
  mostrarCmv: boolean;
  decisao: CmvDecisao;
  aviso?: CmvAvisoDecisao;
  onDecisao: (incluir: boolean) => void;
  /** Rateio com mais de uma linha: a resposta é por linha, dada no "Ratear". */
  rateio: { total: number; respondidas: number } | null;
  onAbrirRateio: () => void;
  /** Competência própria disponível (despesa e banco com o recurso). */
  permiteCompetencia: boolean;
  /** Data do banco (yyyy-MM-dd): é a competência quando nada é informado. */
  dataBanco: string;
  competencia: string | undefined;
  onCompetencia: (competencia: string | undefined) => void;
  /** Descrição da linha, para os rótulos acessíveis. */
  rotulo: string;
}

/**
 * Decisão do CMV financeiro e competência de uma linha do extrato que vira despesa
 * nova. A data do banco nunca muda: a competência só muda o período (DRE e CMV).
 */
export default function ConciliacaoLinhaCmv({
  mostrarCmv, decisao, aviso, onDecisao, rateio, onAbrirRateio,
  permiteCompetencia, dataBanco, competencia, onCompetencia, rotulo,
}: Props) {
  const id = useId();
  const [editando, setEditando] = useState(false);
  if (!mostrarCmv && !permiteCompetencia) return null;
  const propria = competencia && competencia !== dataBanco ? competencia : null;
  const link = 'rounded text-left text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      {mostrarCmv && (rateio ? (
        <button type="button" onClick={onAbrirRateio} className={link}>
          CMV: {rateio.respondidas} de {rateio.total} linhas do rateio respondidas
        </button>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Aparecer no CMV?</span>
          <CmvDecisaoToggle size="sm" value={decisao} onChange={onDecisao} label={`Aparecer no CMV financeiro? — ${rotulo}`} />
          {aviso === 'redefinido' && <span className="text-warning">Categoria trocada: confira.</span>}
        </span>
      ))}
      {permiteCompetencia && (editando ? (
        <span className="inline-flex items-center gap-1.5">
          <Label htmlFor={`${id}-competencia`} className="text-xs text-muted-foreground">Competência</Label>
          <DateInput
            id={`${id}-competencia`}
            value={competencia ?? dataBanco}
            onValueChange={v => onCompetencia(v && v !== dataBanco ? v : undefined)}
            className="h-7 w-[9.5rem] text-xs"
          />
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditando(false)}>OK</Button>
        </span>
      ) : (
        <button type="button" onClick={() => setEditando(true)} className={link} aria-label={`Alterar a competência de ${rotulo}`}>
          Competência: {formatarData(propria ?? dataBanco)}{propria ? ' (ajustada)' : ''}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Ligar na `ConciliacaoBancariaSection.tsx`**

1. Imports, junto aos outros de `@/...`:

```ts
import { fetchCmvConfig, type CmvConfig } from '@/hooks/useCmvFinanceiro';
import { decisaoAoTrocarCategoria, type CmvAvisoDecisao, type CmvDecisao } from '@/domain/financeiro/cmv';
import CmvDecisaoToggle from '@/components/financeiro/cmv/CmvDecisaoToggle';
import ConciliacaoLinhaCmv from '@/components/financeiro/ConciliacaoLinhaCmv';
import {
  competenciaDaLinhaExtrato, decisaoDaLinhaExtrato, definirDecisaoDaLinha, rateioDaLinhaExtrato,
  resumoCmvRateio, trocarCategoriaDaLinha,
} from '@/lib/conciliacaoCmv';
```

2. Em `interface LinhaExtrato`, depois de `ocorrencia?: number;`:

```ts
  /** CMV financeiro: decisão da linha sem rateio (ausente = pendente). */
  cmvIncluir?: CmvDecisao;
  cmvAviso?: CmvAvisoDecisao;
  /** Competência própria (yyyy-MM-dd); ausente = a data do banco (`data`). */
  competencia?: string;
```

   Em `interface RateioLinha`, depois de `observacao: string;`:

```ts
  cmv_incluir?: CmvDecisao;
  cmv_aviso?: CmvAvisoDecisao;
```

3. Estado. Logo depois de `const [centrosCusto, setCentrosCusto] = useState<CentroCustoRef[]>([]);`:

```ts
  // CMV Financeiro da unidade. Os controles novos só existem com `recursos.lancamentos`.
  const [cmvConfig, setCmvConfig] = useState<CmvConfig | null>(null);
  const cmvRecurso = cmvConfig?.recursos.lancamentos === true;
  // Sugestão pelo padrão da categoria só com a classificação ativa.
  const cmvPadroes = useMemo(
    () => (cmvRecurso && cmvConfig?.classificacaoAtiva ? new Map(cmvConfig.categorias.map(c => [c.id, c.cmvSugerir])) : null),
    [cmvConfig, cmvRecurso],
  );
```

4. No `useEffect` que carrega contas e categorias, troque o `Promise.all([...]).then(([catRes, ccRes]) => {...})` por:

```ts
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, parent_id, centro_custo_padrao_id, excluir_dos_totais').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      fetchCmvConfig(supabase),
    ]).then(([catRes, ccRes, cmvRes]) => {
      setCategorias(buildCategoryOptions(catRes.data || []));
      setCentrosCusto(ccRes.data || []);
      setCmvConfig(cmvRes);
    });
```

5. Funções do rateio:
   - em `openRateio`, troque o `setRateioLinhas([{ categoria_id: '', ... }])` do `else` por:

```ts
      // A 1ª linha começa com a categoria e a resposta que a linha já tinha.
      setRateioLinhas([{ categoria_id: linha.categoriaId || '', centro_custo_id: '', valor: linha.valor, percentual: 100, observacao: '', cmv_incluir: decisaoDaLinhaExtrato(linha) }]);
```

   - em `addRateioLinha`, acrescente `cmv_incluir: null` ao objeto novo;
   - em `updateRateioLinha`, dentro do `if (field === 'categoria_id') {`, depois da linha do centro de custo:

```ts
        if (cmvPadroes && linhas[rateioDialog.linhaIndex]?.tipo === 'DESPESA') {
          Object.assign(linha, decisaoAoTrocarCategoria(linha.cmv_incluir, String(value), cmvPadroes));
        }
```

   - logo depois de `updateRateioLinha`:

```ts
  const setRateioCmv = (idx: number, incluir: boolean) =>
    setRateioLinhas(prev => prev.map((l, i) => (i === idx ? { ...l, cmv_incluir: incluir, cmv_aviso: undefined } : l)));
```

6. Troque `buildRateioPayload` inteira por:

```ts
  /** Rateio (ou categoria única) da linha, no formato que a RPC de importação espera. */
  const buildRateioPayload = (l: LinhaExtrato) =>
    rateioDaLinhaExtrato(l, categoriaId => categorias.find(c => c.id === categoriaId)?.centro_custo_padrao_id || null, cmvRecurso);
```

7. Nas duas chamadas de `supabase.rpc('reconcile_import_lancamento', {...})`, em `forcarImportarDuplicata` e no laço de `importarEConciliar`, acrescente `...competenciaDaLinhaExtrato(l, cmvRecurso),` como última propriedade do objeto:
   - a do lote já fecha com `} as any);`;
   - feche a de `forcarImportarDuplicata` do mesmo jeito (`} as any);`), porque o tipo gerado da RPC ainda não tem `p_data_competencia`.

8. Troque `setLinhaCategoria` por:

```ts
  const setLinhaCategoria = (i: number, categoriaId: string) =>
    setLinhas(prev => prev.map((l, j) => (j === i ? trocarCategoriaDaLinha(l, categoriaId, cmvPadroes) : l)));
```

9. Logo depois da função `categoriaLinha`:

```tsx
  /** Pergunta do CMV e competência da linha que vira despesa nova (com o recurso no banco). */
  const cmvLinha = (linha: LinhaExtrato, i: number, e: EstadoLinha) => {
    if (!cmvRecurso || e.isAutomatic || e.hasMatch || e.isDone || e.isInactive || linha.tipo !== 'DESPESA') return null;
    const multi = linha.rateioLinhas && linha.rateioLinhas.length > 1 ? linha.rateioLinhas : null;
    const respondida = decisaoDaLinhaExtrato(linha) !== null || (linha.rateioLinhas ?? []).some(r => (r.cmv_incluir ?? null) !== null);
    return (
      <ConciliacaoLinhaCmv
        mostrarCmv={cmvConfig?.classificacaoAtiva === true || respondida}
        decisao={decisaoDaLinhaExtrato(linha)}
        aviso={linha.cmvAviso}
        onDecisao={incluir => setLinhas(prev => prev.map((l, j) => (j === i ? definirDecisaoDaLinha(l, incluir) : l)))}
        rateio={multi ? resumoCmvRateio(multi) : null}
        onAbrirRateio={() => openRateio(i)}
        permiteCompetencia
        dataBanco={linha.data}
        competencia={linha.competencia}
        onCompetencia={competencia => setLinhas(prev => prev.map((l, j) => (j === i ? { ...l, competencia } : l)))}
        rotulo={linha.descricao}
      />
    );
  };
```

10. Nos **dois** lugares onde `{categoriaLinha(linha, i, e)}` é renderizado (tabela e lista em cartões; procure por `categoriaLinha(linha, i, e)`), acrescente logo depois:

```tsx
                                  {cmvLinha(linha, i, e)}
```

11. No diálogo de rateio:
   - antes do `return (` do componente, junto às outras derivações do rateio, ou logo antes do bloco `{/* ========== RATEIO DIALOG ========== */}` se elas ficam no corpo, acrescente:

```ts
  const rateioLinhaCmv = rateioDialog.linhaIndex >= 0 ? linhas[rateioDialog.linhaIndex] : undefined;
  const rateioMostraCmv = cmvRecurso && rateioLinhaCmv?.tipo === 'DESPESA'
    && (cmvConfig?.classificacaoAtiva === true || rateioLinhas.some(r => (r.cmv_incluir ?? null) !== null));
```

   - dentro de `{rateioLinhas.map((rl, idx) => (<li ...>`, depois do `<div>` do botão de remover (último filho do `<li>`):

```tsx
                    {rateioMostraCmv && (
                      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-12">
                        <span className="text-xs text-muted-foreground">Aparecer no CMV financeiro?</span>
                        <CmvDecisaoToggle
                          size="sm" value={rl.cmv_incluir ?? null} onChange={v => setRateioCmv(idx, v)}
                          label={`Aparecer no CMV financeiro? — linha ${idx + 1} do rateio`}
                        />
                        {rl.cmv_aviso === 'redefinido' && <span className="text-xs text-warning">Categoria trocada: confira.</span>}
                      </div>
                    )}
```

   O `const` precisa ficar antes de qualquer `return` antecipado do componente, como os outros valores derivados do arquivo. Se `rateioLinhaTipo` já existe com o mesmo cálculo, reaproveite-o no lugar de `rateioLinhaCmv?.tipo`.

- [ ] **Step 5: Rodar e ver passar**

Run: `bunx vitest run src/components/financeiro/ConciliacaoLinhaCmv.test.tsx src/components/financeiro/ConciliacaoBancariaSection.test.tsx src/components/financeiro/ConciliacaoParts.test.tsx src/lib/conciliacaoCmv.test.ts`
Expected: PASS. Os testes antigos da conciliação continuam iguais: o mock padrão não devolve `recursos`.

Run: `bunx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros.

- [ ] **Step 6: Commit**

```powershell
git add src/components/financeiro/ConciliacaoLinhaCmv.tsx src/components/financeiro/ConciliacaoLinhaCmv.test.tsx src/components/financeiro/ConciliacaoBancariaSection.tsx src/components/financeiro/ConciliacaoBancariaSection.test.tsx
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): conciliação pergunta "Aparecer no CMV?" e aceita competência própria por linha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 9: Diálogo "Criar" da conciliação — Sim/Não e datas certas

**Files:**
- Modify: `src/components/financeiro/CriarLancamentoExtratoDialog.tsx`
- Modify: `src/components/financeiro/ConciliacaoBancariaSection.tsx` (passar `cmvConfig`)
- Create: `src/components/financeiro/CriarLancamentoExtratoDialog.test.tsx`

**Interfaces:**
- Consumes:
  - `CmvConfig` e `decisaoAoTrocarCategoria` (Task 4);
  - `datasDoLancamentoCriado` (Task 5);
  - o estado `cmvConfig` da seção (Task 8).
- Produces: a prop nova `cmvConfig?: CmvConfig | null` do diálogo. Nulo ou sem `recursos.lancamentos` = o diálogo funciona como antes.

- [ ] **Step 1: Escrever o teste**

`src/components/financeiro/CriarLancamentoExtratoDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CriarLancamentoExtratoDialog from './CriarLancamentoExtratoDialog';
import type { CmvConfig } from '@/hooks/useCmvFinanceiro';

const state = vi.hoisted(() => ({ rpc: vi.fn(), updates: [] as { table: string; payload: Record<string, unknown> }[] }));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) b[m] = () => b;
  b.update = (payload: Record<string, unknown>) => { state.updates.push({ table, payload }); return b; };
  b.then = (resolve: (r: unknown) => unknown) => Promise.resolve({
    data: table === 'fin_categorias'
      ? [{ id: 'cat1', nome: 'Peixes', tipo: 'despesa', codigo: null, parent_id: null, centro_custo_padrao_id: null }]
      : [],
    error: null,
  }).then(resolve);
  return b;
}
const supabase = { from: (t: string) => builder(t), rpc: (n: string, p?: unknown) => state.rpc(n, p) };

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/dataEvents', () => ({ useEmitDataEvent: () => () => undefined }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/financeiro/SupplierCombobox', () => ({ default: () => null }));
vi.mock('@/components/financeiro/CategoryCombobox', () => ({
  default: ({ value, onValueChange, options }: { value: string; onValueChange: (v: string) => void; options: { id: string; nome: string }[] }) => (
    <select aria-label="Categoria" value={value} onChange={e => onValueChange(e.target.value)}>
      <option value="">—</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  ),
}));

const linha = { data: '2026-09-10', descricao: 'PIX ARROZ', valor: 55, tipo: 'DESPESA' as const };
const config = (lancamentos: boolean): CmvConfig => ({
  classificacaoAtiva: true,
  categorias: [{ id: 'cat1', nome: 'Peixes', codigo: null, parentId: null, grupo: null, ativo: true, cmvSugerir: true, updatedAt: '' }],
  recursos: { lancamentos },
});

beforeEach(() => {
  state.updates = [];
  state.rpc.mockReset();
  state.rpc.mockImplementation((nome: string) => Promise.resolve(
    nome === 'reconcile_import_lancamento' ? { data: { status: 'ok', lancamento_id: 'l1' }, error: null } : { data: null, error: null },
  ));
});

async function criarCom(cfg: CmvConfig) {
  render(<CriarLancamentoExtratoDialog open onOpenChange={() => {}} linha={linha} contaBancariaId="conta-1" onCreated={() => {}} cmvConfig={cfg} />);
  await screen.findByRole('option', { name: 'Peixes' });
  fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'cat1' } });
  fireEvent.change(screen.getByLabelText('Data Competência'), { target: { value: '2026-09-03' } });
  fireEvent.click(screen.getByRole('button', { name: /Criar e Conciliar/ }));
  await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('reconcile_import_lancamento', expect.anything()));
  return state.rpc.mock.calls.find(([n]) => n === 'reconcile_import_lancamento')![1] as Record<string, unknown>;
}

describe('Criar a partir do extrato — CMV e datas', () => {
  it('com o recurso: data do banco no p_data, competência à parte e a decisão sugerida pelo padrão', async () => {
    const args = await criarCom(config(true));
    const grupo = screen.getByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' });
    expect(within(grupo).getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'true');
    expect(args).toMatchObject({
      p_data: '2026-09-10', p_data_competencia: '2026-09-03',
      p_rateio_linhas: [expect.objectContaining({ categoria_id: 'cat1', cmv_incluir: true })],
    });
    await waitFor(() => expect(state.updates.length).toBeGreaterThan(0));
    expect(state.updates.some(u => 'data_pagamento' in u.payload)).toBe(false);
  });

  it('banco sem o recurso: exatamente o fluxo de antes', async () => {
    const args = await criarCom(config(false));
    expect(screen.queryByRole('radiogroup', { name: 'Aparecer no CMV financeiro?' })).not.toBeInTheDocument();
    expect(args).toMatchObject({ p_data: '2026-09-03' });
    expect(args).not.toHaveProperty('p_data_competencia');
    expect((args.p_rateio_linhas as Record<string, unknown>[])[0]).not.toHaveProperty('cmv_incluir');
    await waitFor(() => expect(state.updates.some(u => u.payload.data_pagamento === '2026-09-10')).toBe(true));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/components/financeiro/CriarLancamentoExtratoDialog.test.tsx`
Expected: FAIL. Sem a prop, não há pergunta, e `p_data` recebe a competência.

- [ ] **Step 3: Implementar em `CriarLancamentoExtratoDialog.tsx`**

1. Imports. Troque a linha do React por `import { useState, useEffect, useMemo, useRef } from 'react';` e acrescente:

```ts
import CmvDecisaoToggle from '@/components/financeiro/cmv/CmvDecisaoToggle';
import { decisaoAoTrocarCategoria, type CmvDecisao } from '@/domain/financeiro/cmv';
import type { CmvConfig } from '@/hooks/useCmvFinanceiro';
import { datasDoLancamentoCriado } from '@/lib/conciliacaoCmv';
```

2. Em `interface RateioItem`, depois de `observacao: string;`, acrescente `cmv_incluir?: CmvDecisao;`.

3. Em `Props`, depois de `onCreated: ...;`:

```ts
  /** CMV Financeiro da unidade; nulo ou sem `recursos.lancamentos` = o diálogo funciona como antes. */
  cmvConfig?: CmvConfig | null;
```

   e, na assinatura do componente, acrescente `cmvConfig = null` aos props desestruturados.

4. Depois de `const salvandoRef = useRef(false);`:

```ts
  // O tipo gerado da RPC ainda não tem p_data_competencia.
  const callRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  // CMV Financeiro: só com o recurso no banco, no destino "Lançamento" de despesa.
  const [cmvIncluir, setCmvIncluir] = useState<CmvDecisao>(null);
  const cmvRecurso = cmvConfig?.recursos.lancamentos === true;
  const cmvPadroes = useMemo(
    () => (cmvRecurso && cmvConfig?.classificacaoAtiva ? new Map(cmvConfig.categorias.map(c => [c.id, c.cmvSugerir])) : null),
    [cmvConfig, cmvRecurso],
  );
  const enviaCmv = cmvRecurso && destino === 'lancamento' && tipo === 'DESPESA';
  const mostrarCmv = enviaCmv
    && (cmvConfig?.classificacaoAtiva === true || cmvIncluir !== null || rateioLinhas.some(r => (r.cmv_incluir ?? null) !== null));
  const sugerirCmv = (anterior: CmvDecisao | undefined, categoria: string): CmvDecisao =>
    cmvPadroes && tipo === 'DESPESA' ? decisaoAoTrocarCategoria(anterior, categoria, cmvPadroes).cmv_incluir : (anterior ?? null);
```

5. No `useEffect` de pré-preenchimento (`// Pre-fill from extrato line`), acrescente `setCmvIncluir(null);` junto aos outros resets.

6. Rateio:
   - em `addRateioLinha`, acrescente `cmv_incluir: null` ao objeto;
   - em `updateRateioLinha`, dentro de `if (field === 'categoria_id') {`, depois da linha do centro de custo, acrescente `item.cmv_incluir = sugerirCmv(item.cmv_incluir, String(value));`;
   - no botão "Ratear", troque o objeto semeado por `{ categoria_id: categoriaId || '', centro_custo_id: '', valor, percentual: 100, observacao: '', cmv_incluir: cmvIncluir }`.

7. `handleSave`:
   - em `rateioPayload`, acrescente ao objeto mapeado `...(enviaCmv ? { cmv_incluir: r.cmv_incluir ?? null } : {}),`;
   - em `singleRateioPayload`, depois de `observacao: null,`, acrescente `...(enviaCmv ? { cmv_incluir: cmvIncluir } : {}),`;
   - troque o cálculo de `ocorrenciaEnviada` por:

```ts
      // Destino lançamento: a data do banco vai em p_data (chave e duplicata) e a competência à parte.
      const datasLanc = datasDoLancamentoCriado({ dataCompetencia, dataPagamento, aceitaCompetencia: cmvRecurso });
      const dataEnviada = destino === 'lancamento' ? datasLanc.p_data : dataCompetencia;
      const ocorrenciaEnviada = linha && ocorrencia != null
        && dataEnviada === linha.data && descricao === linha.descricao
        && valor === linha.valor && tipoEnviado === linha.tipo
        ? ocorrencia
        : undefined;
```

   - no ramo `if (destino === 'lancamento') {`, troque a chamada `supabase.rpc('reconcile_import_lancamento', {...})` por:

```ts
        const { data, error } = await callRpc('reconcile_import_lancamento', {
          p_data: datasLanc.p_data,
          p_descricao: descricao,
          p_valor: valor,
          p_tipo: tipo,
          p_conta_id: contaBancariaId,
          p_user_id: user?.id,
          p_rateio_linhas: effectivePayload,
          p_external_id: linha?.fitId || null,
          p_occurrence_index: ocorrenciaEnviada ?? 0,
          ...datasLanc.extra,
        });
```

   - no mesmo ramo, troque o bloco do UPDATE por:

```ts
        // Datas e observações que a RPC não grava. Com o banco atualizado a data do banco
        // já foi no p_data; só o fluxo antigo corrige data_pagamento aqui.
        if (importResult?.lancamento_id && (dataVencimento || (datasLanc.atualizaPagamento && dataPagamento) || observacoes)) {
          const updatePayload: any = {};
          if (dataVencimento) updatePayload.data_vencimento = dataVencimento;
          if (datasLanc.atualizaPagamento && dataPagamento) updatePayload.data_pagamento = dataPagamento;
          if (observacoes) updatePayload.observacoes = observacoes;
          if (Object.keys(updatePayload).length > 0) {
            await supabase.from('fin_lancamentos').update(updatePayload).eq('id', importResult.lancamento_id);
          }
        }
```

     O `any` já existia aqui. O ramo de conta a pagar/receber não muda.

8. Render:
   - no `CategoryCombobox` de categoria única, troque `onValueChange={setCategoriaId}` por `onValueChange={v => { setCategoriaId(v); setCmvIncluir(atual => sugerirCmv(atual, v)); }}`;
   - logo depois desse `CategoryCombobox`, ainda dentro do ramo `!useRateio ? (...)`, envolva-o num fragmento com:

```tsx
              <>
                <CategoryCombobox ... />
                {mostrarCmv && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-foreground">Aparecer no CMV financeiro?</span>
                    <CmvDecisaoToggle size="sm" value={cmvIncluir} onChange={setCmvIncluir} label="Aparecer no CMV financeiro?" />
                  </div>
                )}
              </>
```

   - em cada `<li>` do rateio, depois do `<div>` do botão de remover:

```tsx
                      {mostrarCmv && (
                        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-12">
                          <span className="text-xs text-muted-foreground">Aparecer no CMV financeiro?</span>
                          <CmvDecisaoToggle
                            size="sm" value={rl.cmv_incluir ?? null}
                            onChange={v => setRateioLinhas(prev => prev.map((l, i) => (i === idx ? { ...l, cmv_incluir: v } : l)))}
                            label={`Aparecer no CMV financeiro? — linha ${idx + 1} do rateio`}
                          />
                        </div>
                      )}
```

- [ ] **Step 4: Passar a configuração a partir da conciliação**

Em `ConciliacaoBancariaSection.tsx`, no `<CriarLancamentoExtratoDialog ... />`, acrescente a prop `cmvConfig={cmvConfig}`.

- [ ] **Step 5: Rodar e ver passar**

Run: `bunx vitest run src/components/financeiro/CriarLancamentoExtratoDialog.test.tsx src/components/financeiro/ConciliacaoBancariaSection.test.tsx`
Expected: PASS.

Run: `bunx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros.

- [ ] **Step 6: Commit**

```powershell
git add src/components/financeiro/CriarLancamentoExtratoDialog.tsx src/components/financeiro/CriarLancamentoExtratoDialog.test.tsx src/components/financeiro/ConciliacaoBancariaSection.tsx
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): "Criar" da conciliação pergunta o CMV e grava data do banco e competência separadas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 10: Telas do CMV e PDF — despesas, origem, classificar lançamento e "Aplicar padrões"

**Files:**
- Modify (reescrita completa): `src/components/financeiro/cmv/CmvBoletosDialog.tsx`
- Create: `src/components/financeiro/cmv/CmvAplicarPadroesDialog.tsx`, `src/components/financeiro/cmv/CmvAplicarPadroesDialog.test.tsx`
- Modify:
  - em `src/components/financeiro/cmv/`: `CmvFinanceiroSection.tsx`, `CmvRegrasVinculo.tsx`, `CmvCards.tsx`, `CmvComparativo.tsx`, `CmvVisaoGeral.tsx`, `CmvAnaliseCategoria.tsx`, `cmvCharts.tsx` e `CmvExportSheet.tsx`;
  - `src/lib/cmvFinanceiroPdfExport.ts`.
- Test: `src/components/financeiro/cmv/CmvFinanceiroSection.test.tsx`, `src/lib/cmvFinanceiroPdfExport.test.ts`

**Interfaces:**
- Consumes:
  - de `@/hooks/useCmvFinanceiro` (Task 4): `itemDaLinha`, `CmvLinhaDetalhe` com `fonte`, `documentoId`, `origem` e `contaNome`, `simularPadroesCmv` e `aplicarPadroesCmv`;
  - de `CmvReport` (Task 4): `documentos`, `lancamentos` e `pendentesGeralPorFonte`;
  - o registro de navegação `lancamento` (Task 7).
- Produces: os textos finais da tela e do PDF.

- [ ] **Step 1: Atualizar e escrever os testes**

Em `src/components/financeiro/cmv/CmvFinanceiroSection.test.tsx`:

1. Acrescente `waitFor` ao import de `@testing-library/react`. No `vi.hoisted`, acrescente `lista: null as null | Record<string, unknown>,` e `classificar: vi.fn(),`. No `beforeEach`, acrescente `state.lista = null;` e `state.classificar.mockReset();`.
2. No mock de `@/hooks/useCmvFinanceiro`:
   - troque o `return` de `useCmvLinhas` por `return { data: state.lista ?? { totalLinhas: 0, totalTitulos: 0, totalCentavos: 0, itens: [] }, isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() };`;
   - acrescente `classificarCmv: (...args: unknown[]) => state.classificar(...args),`.
3. Troque os textos:

| Antes | Depois |
|---|---|
| `card('Boletos vinculados ao CMV')).getByText('5')` | `card('Despesas vinculadas ao CMV')).getByText('5')` |
| `card('Boletos vinculados ao CMV')).getByText('2 boletos')` | `card('Despesas vinculadas ao CMV')).getByText('2 despesas')` |
| `'Boletos de origem — Peixes'` | `'Despesas de origem — Peixes'` |
| `{ name: 'Ver boletos' }` | `{ name: 'Ver despesas' }` |
| `'Boletos pendentes de classificação'` | `'Despesas pendentes de classificação'` |
| `/O padrão será sugerido em novos lançamentos\. Alterações não modificam boletos já cadastrados\./` | `/O padrão será sugerido em novos lançamentos\. Alterações não modificam despesas já cadastradas\./` |
| `'Nenhum boleto incluído no CMV neste período'` | `'Nenhuma despesa incluída no CMV neste período'` |

4. Acrescente, dentro do `describe`:

```tsx
  it('lista de origem mostra a origem do lançamento, abre no Livro Razão e classifica pelo lançamento', async () => {
    state.permissoes.add('financeiro:lancamentos:view');
    state.permissoes.add('financeiro:lancamentos:edit');
    state.lista = {
      totalLinhas: 1, totalTitulos: 1, totalCentavos: 5500,
      itens: [{
        fonte: 'lancamento', documentoId: 'l1', contaPagarId: null, rateioId: null, descricao: 'PIX ARROZ', fornecedor: null,
        origem: 'conciliacao', contaNome: 'Banco A', dataCompetencia: '2026-09-08', dataVencimento: null, status: 'REALIZADO',
        categoriaId: CAT.peixes, categoriaNome: 'Peixes', tituloCentavos: 5500, linhaCentavos: 5500, cmvIncluir: null,
        updatedAt: 't1', serieBoletos: 1,
      }],
    };
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    const linha = screen.getByText(/Pendentes de classificação no período/).closest('li')!;
    fireEvent.click(within(linha).getByRole('button', { name: 'Ver despesas' }));
    const dialogo = screen.getByRole('dialog', { name: 'Despesas pendentes de classificação' });
    expect(within(dialogo).getByText('Conciliação · Banco A')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Abrir PIX ARROZ em Lançamentos' })).toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: /Série/ })).not.toBeInTheDocument();
    fireEvent.click(within(within(dialogo).getByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — PIX ARROZ' })).getByRole('radio', { name: 'Sim' }));
    await waitFor(() => expect(state.classificar).toHaveBeenCalledWith(expect.anything(), [
      { lancamentoId: 'l1', rateioId: null, incluir: true, expectedUpdatedAt: 't1' },
    ]));
  });

  it('Regras de vínculo: pedir a resposta vale para as novas despesas e há "Aplicar padrões"', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    fireEvent.click(screen.getByRole('tab', { name: /Regras de vínculo/ }));
    expect(screen.getByText('Pedir a resposta nas novas despesas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar padrões às pendentes' })).toBeInTheDocument();
  });
```

Em `src/lib/cmvFinanceiroPdfExport.test.ts`, troque `'Nenhum boleto inclu'` por `'Nenhuma despesa inclu'`.

`src/components/financeiro/cmv/CmvAplicarPadroesDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CmvAplicarPadroesDialog from './CmvAplicarPadroesDialog';

const state = vi.hoisted(() => ({ rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
const supabase = { rpc(fn: string, args?: unknown) { const r = Promise.resolve(state.rpc(fn, args)); return Object.assign(r, { abortSignal: () => r }); } };
vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/formatters', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/formatters')>()),
  todayBR: () => '2026-09-20',
}));

const previa = {
  simulado: true, desde: '2026-09-01',
  boleto: { documentos: 1, linhas_sim: 1, centavos_sim: 1600, linhas_nao: 0, centavos_nao: 0, linhas_sem_padrao: 0, centavos_sem_padrao: 0 },
  lancamento: { documentos: 3, linhas_sim: 2, centavos_sim: 2100, linhas_nao: 1, centavos_nao: 1200, linhas_sem_padrao: 2, centavos_sem_padrao: 1800 },
};

beforeEach(() => {
  state.rpc.mockReset();
  state.rpc.mockImplementation((_fn: string, args: { p_simular: boolean }) => (args.p_simular
    ? { data: previa, error: null }
    : { data: { simulado: false, documentos: 4, linhas: 4, centavos_sim: 3700, centavos_nao: 1200 }, error: null }));
});

describe('Aplicar padrões às pendentes', () => {
  it('só aplica depois da prévia e com justificativa; trocar a data pede outra prévia', async () => {
    const onAplicado = vi.fn();
    render(<CmvAplicarPadroesDialog open onOpenChange={() => {}} onAplicado={onAplicado} />);
    const aplicar = screen.getByRole('button', { name: 'Aplicar' });
    expect(aplicar).toBeDisabled();
    expect(screen.getByLabelText('Competência a partir de')).toHaveValue('2026-09-01');

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText('Lançamentos e conciliação')).toBeInTheDocument();
    expect(screen.getByText('2 · R$ 21,00')).toBeInTheDocument();
    expect(aplicar).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Justificativa (fica na auditoria)'), { target: { value: 'revisão inicial' } });
    expect(aplicar).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Competência a partir de'), { target: { value: '2026-08-01' } });
    expect(screen.queryByText('Lançamentos e conciliação')).not.toBeInTheDocument();
    expect(aplicar).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await screen.findByText('Lançamentos e conciliação');
    fireEvent.change(screen.getByLabelText('Justificativa (fica na auditoria)'), { target: { value: 'revisão inicial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(onAplicado).toHaveBeenCalled());
    expect(state.rpc).toHaveBeenLastCalledWith('fin_cmv_aplicar_padroes', { p_desde: '2026-08-01', p_simular: false, p_justificativa: 'revisão inicial' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/components/financeiro/cmv src/lib/cmvFinanceiroPdfExport.test.ts`
Expected: FAIL nos textos novos, na lista por fonte e no diálogo inexistente.

- [ ] **Step 3: Reescrever `CmvBoletosDialog.tsx`**

Substitua o arquivo inteiro por:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Loader2, Repeat } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { requestNavigation } from '@/hooks/useNavigationRequest';
import { formatarCentavos, formatarData, type CmvDecisao } from '@/domain/financeiro/cmv';
import {
  CMV_QUERY_ROOT, aplicarCmvSerie, classificarCmv, itemDaLinha, mensagemErroCmv, useCmvLinhas,
  type CmvLinhaDetalhe, type CmvSituacao,
} from '@/hooks/useCmvFinanceiro';
import CmvDecisaoToggle from './CmvDecisaoToggle';

export interface CmvBoletosAlvo {
  titulo: string;
  descricao: string;
  inicio: string | null;
  fim: string | null;
  situacao: CmvSituacao;
  categoriaId: string | null;
  soDireto?: boolean;
}

interface Props {
  alvo: CmvBoletosAlvo | null;
  onClose: () => void;
  companyId: string | null | undefined;
  /** Pode alterar a decisão de um boleto (Contas a Pagar → editar, ou gerenciar o CMV). */
  canClassificar: boolean;
  /** Pode alterar a decisão de um lançamento (Livro Razão → editar, conciliar, ou gerenciar o CMV). */
  canClassificarLancamento: boolean;
  /** Pode aplicar a decisão em lote (revisão do histórico). */
  canLote: boolean;
  /** Pode abrir o boleto em Contas a Pagar. */
  canAbrirBoleto: boolean;
  /** Pode abrir o lançamento no Livro Razão. */
  canAbrirLancamento: boolean;
}

const PAGINA = 50;
const chaveLinha = (l: Pick<CmvLinhaDetalhe, 'fonte' | 'documentoId' | 'rateioId'>) => `${l.fonte}:${l.documentoId}:${l.rateioId ?? ''}`;

const SITUACAO_TEXTO: Record<'sim' | 'nao' | 'pendente', string> = {
  sim: 'Sim (entra no CMV)',
  nao: 'Não (fora do CMV)',
  pendente: 'Pendente de classificação',
};

function textoDecisao(decisao: CmvDecisao): string {
  return decisao === true ? SITUACAO_TEXTO.sim : decisao === false ? SITUACAO_TEXTO.nao : SITUACAO_TEXTO.pendente;
}

/** De onde veio a despesa, para a pessoa reconhecer a linha. */
function origemDaLinha(l: CmvLinhaDetalhe): string {
  if (l.fonte === 'boleto') return l.fornecedor ? `Boleto · ${l.fornecedor}` : 'Boleto';
  const origem = l.origem === 'conciliacao' ? 'Conciliação' : 'Lançamento';
  return l.contaNome ? `${origem} · ${l.contaNome}` : origem;
}

/**
 * Despesas (boletos e lançamentos) e rateios por trás de um número do relatório, e
 * revisão de pendências. A decisão de uma linha é gravada na hora; o lote passa por
 * prévia e confirmação.
 */
export default function CmvBoletosDialog({
  alvo, onClose, companyId, canClassificar, canClassificarLancamento, canLote, canAbrirBoleto, canAbrirLancamento,
}: Props) {
  const supabase = useSupabase();
  const toast = useScopedToast();
  const queryClient = useQueryClient();
  const emitDataEvent = useEmitDataEvent();
  const { executar: trava } = useTravaEnvio();
  const [pagina, setPagina] = useState(0);
  const [selecionadas, setSelecionadas] = useState<Map<string, CmvLinhaDetalhe>>(() => new Map());
  const [salvando, setSalvando] = useState<string | null>(null);
  const [lote, setLote] = useState<{ incluir: boolean } | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [serie, setSerie] = useState<CmvLinhaDetalhe | null>(null);

  useEffect(() => {
    setPagina(0);
    setSelecionadas(new Map());
    setLote(null);
    setSerie(null);
    setJustificativa('');
  }, [alvo]);

  const params = useMemo(() => ({
    inicio: alvo?.inicio ?? null,
    fim: alvo?.fim ?? null,
    situacao: alvo?.situacao ?? 'incluido' as CmvSituacao,
    categoriaId: alvo?.categoriaId ?? null,
    soDireto: alvo?.soDireto ?? false,
    limite: PAGINA,
    offset: pagina * PAGINA,
  }), [alvo, pagina]);

  const query = useCmvLinhas({ companyId, params, enabled: alvo !== null });
  const lista = query.data;
  const itens = lista?.itens ?? [];
  const totalPaginas = lista ? Math.max(1, Math.ceil(lista.totalLinhas / PAGINA)) : 1;

  // A seleção guarda a linha como estava ao ser marcada; a cada recarga, as que
  // estão na página trocam pela versão nova (o `updatedAt` é o lock do documento).
  useEffect(() => {
    if (!lista) return;
    setSelecionadas(atual => {
      let mudou = false;
      const proximo = new Map(atual);
      for (const linha of lista.itens) {
        const chave = chaveLinha(linha);
        const antiga = proximo.get(chave);
        if (antiga && antiga !== linha) { proximo.set(chave, linha); mudou = true; }
      }
      return mudou ? proximo : atual;
    });
  }, [lista]);

  // Espera a recarga: até lá a linha ainda carrega a versão antiga do documento.
  const aposGravar = async () => {
    emitDataEvent('financeiro:pagar');
    emitDataEvent('financeiro:lancamentos');
    await queryClient.invalidateQueries({ queryKey: CMV_QUERY_ROOT });
  };

  const classificarLinha = async (linha: CmvLinhaDetalhe, incluir: boolean) => {
    if (linha.cmvIncluir === incluir) return;
    await trava(async () => {
      setSalvando(chaveLinha(linha));
      try {
        await classificarCmv(supabase, [itemDaLinha(linha, incluir)]);
        toast.success(incluir ? 'Linha incluída no CMV financeiro.' : 'Linha retirada do CMV financeiro.');
        // O documento mudou de versão: as linhas dele saem da seleção do lote.
        setSelecionadas(atual => {
          const proximo = new Map([...atual].filter(([, l]) => l.documentoId !== linha.documentoId));
          return proximo.size === atual.size ? atual : proximo;
        });
        await aposGravar();
      } catch (error) {
        toast.error(mensagemErroCmv(error));
        void query.refetch();
      } finally {
        setSalvando(null);
      }
    });
  };

  const alternarSelecao = (linha: CmvLinhaDetalhe, marcada: boolean) => {
    setSelecionadas(atual => {
      const proximo = new Map(atual);
      if (marcada) proximo.set(chaveLinha(linha), linha); else proximo.delete(chaveLinha(linha));
      return proximo;
    });
  };
  const todasDaPagina = itens.length > 0 && itens.every(l => selecionadas.has(chaveLinha(l)));
  const alternarPagina = (marcada: boolean) => {
    setSelecionadas(atual => {
      const proximo = new Map(atual);
      for (const linha of itens) {
        if (marcada) proximo.set(chaveLinha(linha), linha); else proximo.delete(chaveLinha(linha));
      }
      return proximo;
    });
  };

  const previa = useMemo(() => {
    const linhas = [...selecionadas.values()];
    return {
      linhas,
      titulos: new Set(linhas.map(l => l.documentoId)).size,
      centavos: linhas.reduce((s, l) => s + l.linhaCentavos, 0),
    };
  }, [selecionadas]);

  const aplicarLote = async () => {
    if (!lote) return;
    const incluir = lote.incluir;
    await trava(async () => {
      setSalvando('lote');
      try {
        const resultado = await classificarCmv(supabase, previa.linhas.map(l => itemDaLinha(l, incluir)), justificativa);
        toast.success(`${resultado.itens} ${resultado.itens === 1 ? 'linha classificada' : 'linhas classificadas'} em ${resultado.titulos} ${resultado.titulos === 1 ? 'despesa' : 'despesas'}.`);
        setSelecionadas(new Map());
        setLote(null);
        setJustificativa('');
        await aposGravar();
      } catch (error) {
        toast.error(`${mensagemErroCmv(error)} Nada foi alterado e a seleção foi limpa: selecione de novo.`);
        setLote(null);
        // A seleção pode conter linha com versão antiga: repetir o mesmo lote falharia de novo.
        setSelecionadas(new Map());
        void query.refetch();
      } finally {
        setSalvando(null);
      }
    });
  };

  const aplicarSerie = async () => {
    if (!serie) return;
    const referencia = serie;
    await trava(async () => {
      setSalvando('serie');
      try {
        const resultado = await aplicarCmvSerie(supabase, referencia.documentoId, { expectedUpdatedAt: referencia.updatedAt });
        toast.success(resultado.titulosAlterados === 0
          ? 'As outras parcelas da série já estavam com esta resposta.'
          : `${resultado.titulosAlterados} ${resultado.titulosAlterados === 1 ? 'parcela da série atualizada' : 'parcelas da série atualizadas'}.`);
        setSerie(null);
        // As parcelas mudaram de versão: a seleção do lote pode estar velha.
        setSelecionadas(new Map());
        await aposGravar();
      } catch (error) {
        toast.error(`${mensagemErroCmv(error)} Nada foi alterado.`);
        setSerie(null);
        void query.refetch();
      } finally {
        setSalvando(null);
      }
    });
  };

  const abrirDocumento = (linha: CmvLinhaDetalhe) => {
    onClose();
    if (linha.fonte === 'boleto') {
      requestNavigation({ tab: 'financeiro', subtab: 'pagar', record: { type: 'conta_pagar', id: linha.documentoId } });
    } else {
      requestNavigation({ tab: 'financeiro', subtab: 'lancamentos', record: { type: 'lancamento', id: linha.documentoId } });
    }
  };
  const podeClassificar = (l: CmvLinhaDetalhe) =>
    (l.fonte === 'boleto' ? canClassificar : canClassificarLancamento) && l.status !== 'CANCELADO';
  const podeAbrir = (l: CmvLinhaDetalhe) => (l.fonte === 'boleto' ? canAbrirBoleto : canAbrirLancamento);
  const colunaAbrir = canAbrirBoleto || canAbrirLancamento;
  const colunas = 7 + (canLote ? 1 : 0) + (colunaAbrir ? 1 : 0);

  return (
    <>
      <Dialog open={alvo !== null} onOpenChange={aberto => { if (!aberto) onClose(); }}>
        <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{alvo?.titulo}</DialogTitle>
            <DialogDescription>{alvo?.descricao}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
            {lista && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                <strong className="font-semibold text-foreground">{lista.totalTitulos}</strong> {lista.totalTitulos === 1 ? 'despesa' : 'despesas'},{' '}
                <strong className="font-semibold text-foreground">{lista.totalLinhas}</strong> {lista.totalLinhas === 1 ? 'linha' : 'linhas'},{' '}
                total de <strong className="font-semibold tabular-nums text-foreground">{formatarCentavos(lista.totalCentavos)}</strong>.
              </p>
            )}

            {canLote && selecionadas.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-border bg-primary-soft p-3 text-sm">
                <span className="text-primary-ink">
                  {previa.linhas.length} {previa.linhas.length === 1 ? 'linha selecionada' : 'linhas selecionadas'} ({formatarCentavos(previa.centavos)})
                </span>
                <span className="ml-auto flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => setLote({ incluir: true })}>Marcar como Sim</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setLote({ incluir: false })}>Marcar como Não</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelecionadas(new Map())}>Limpar seleção</Button>
                </span>
              </div>
            )}

            {query.isError ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
                <p>{mensagemErroCmv(query.error, 'Não foi possível carregar as despesas.')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Tentar novamente</Button>
              </div>
            ) : query.isPending ? (
              <div className="space-y-2" role="status" aria-label="Carregando despesas">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : itens.length === 0 ? (
              <EmptyState title="Nenhuma despesa neste recorte" description="Não há linhas com esta situação no intervalo consultado." compact />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[1020px] border-collapse text-sm">
                  <caption className="sr-only">Despesas e linhas do recorte</caption>
                  <thead>
                    <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                      {canLote && (
                        <th scope="col" className="w-10 px-3 py-2 text-left">
                          <Checkbox checked={todasDaPagina} onCheckedChange={v => alternarPagina(v === true)} aria-label="Selecionar todas as linhas desta página" />
                        </th>
                      )}
                      <th scope="col" className="px-3 py-2 text-left font-medium">Descrição / origem</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Competência</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Vencimento</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Situação</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Categoria</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Valor do documento</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Valor da linha</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Aparecer no CMV?</th>
                      {colunaAbrir && <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Abrir</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map(linha => {
                      const chave = chaveLinha(linha);
                      const origem = origemDaLinha(linha);
                      return (
                        <tr key={chave} className="border-b border-border last:border-0">
                          {canLote && (
                            <td className="px-3 py-2">
                              <Checkbox
                                checked={selecionadas.has(chave)} onCheckedChange={v => alternarSelecao(linha, v === true)}
                                aria-label={`Selecionar ${linha.descricao}`}
                              />
                            </td>
                          )}
                          <th scope="row" className="max-w-[16rem] px-3 py-2 text-left font-normal">
                            <span className="block truncate font-medium text-foreground" title={linha.descricao}>{linha.descricao}</span>
                            <span className="block truncate text-xs text-muted-foreground" title={origem}>{origem}</span>
                          </th>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {linha.dataCompetencia ? formatarData(linha.dataCompetencia) : <span className="font-medium text-warning">Sem competência</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{linha.dataVencimento ? formatarData(linha.dataVencimento) : '—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={linha.status} size="xs" /></td>
                          <td className="max-w-[12rem] truncate px-3 py-2" title={linha.categoriaNome ?? 'Sem categoria'}>{linha.categoriaNome ?? <span className="text-muted-foreground">Sem categoria</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{formatarCentavos(linha.tituloCentavos)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-foreground">{formatarCentavos(linha.linhaCentavos)}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {podeClassificar(linha) ? (
                              <span className="inline-flex items-center gap-2">
                                <CmvDecisaoToggle
                                  size="sm" value={linha.cmvIncluir} disabled={salvando !== null}
                                  onChange={v => void classificarLinha(linha, v)}
                                  label={`Aparecer no CMV financeiro? — ${linha.descricao}`}
                                />
                                {salvando === chave && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Salvando" />}
                                {linha.cmvIncluir === null && salvando !== chave && <span className="text-xs font-medium text-warning">Pendente</span>}
                                {canLote && linha.fonte === 'boleto' && linha.serieBoletos > 1 && linha.cmvIncluir !== null && (
                                  <Button
                                    type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={salvando !== null}
                                    onClick={() => setSerie(linha)}
                                    title={`Aplicar esta resposta às outras ${linha.serieBoletos - 1} parcelas da série`}
                                    aria-label={`Aplicar a resposta de ${linha.descricao} às outras ${linha.serieBoletos - 1} parcelas da série`}
                                  >
                                    <Repeat className="h-3.5 w-3.5" aria-hidden="true" />Série
                                  </Button>
                                )}
                              </span>
                            ) : (
                              <span className={linha.cmvIncluir === null ? 'font-medium text-warning' : undefined}>{textoDecisao(linha.cmvIncluir)}</span>
                            )}
                          </td>
                          {colunaAbrir && (
                            <td className="px-3 py-2">
                              {podeAbrir(linha) && (
                                <Button
                                  type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirDocumento(linha)}
                                  aria-label={`Abrir ${linha.descricao} em ${linha.fonte === 'boleto' ? 'Contas a Pagar' : 'Lançamentos'}`}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {itens.length === 0 && <tr><td colSpan={colunas} /></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {lista && lista.totalLinhas > PAGINA && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3 text-sm">
              <span className="text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
              <span className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={pagina === 0 || query.isFetching} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
                <Button type="button" variant="outline" size="sm" disabled={pagina + 1 >= totalPaginas || query.isFetching} onClick={() => setPagina(p => p + 1)}>Próxima</Button>
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={lote !== null} onOpenChange={aberto => { if (!aberto && salvando === null) setLote(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lote?.incluir ? 'Incluir no CMV financeiro?' : 'Deixar fora do CMV financeiro?'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Esta ação altera <strong className="text-foreground">{previa.linhas.length}</strong> {previa.linhas.length === 1 ? 'linha' : 'linhas'} de{' '}
                  <strong className="text-foreground">{previa.titulos}</strong> {previa.titulos === 1 ? 'despesa' : 'despesas'}, somando{' '}
                  <strong className="tabular-nums text-foreground">{formatarCentavos(previa.centavos)}</strong>.
                </p>
                <p>Só a decisão do CMV muda: valor, categoria, cobrança e pagamento ficam como estão. A alteração fica registrada na auditoria e pode ser revertida linha a linha.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cmv-lote-justificativa" className="text-xs text-muted-foreground">Observação para a auditoria (opcional)</Label>
            <Textarea id="cmv-lote-justificativa" value={justificativa} onChange={e => setJustificativa(e.target.value)} maxLength={300} rows={2} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={salvando !== null} onClick={e => { e.preventDefault(); void aplicarLote(); }}>
              {salvando === 'lote' ? 'Aplicando…' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={serie !== null} onOpenChange={aberto => { if (!aberto && salvando === null) setSerie(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar à série toda?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">{serie?.fornecedor || serie?.descricao}</strong> faz parte de uma série de{' '}
                  <strong className="text-foreground">{serie?.serieBoletos}</strong> boletos. As outras parcelas, de todos os meses, recebem a mesma resposta deste boleto para cada categoria.
                </p>
                <p>Só a decisão do CMV muda: valor, categoria, cobrança e pagamento ficam como estão. Parcela cancelada não é alterada. A alteração fica registrada na auditoria e pode ser revertida linha a linha.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={salvando !== null} onClick={e => { e.preventDefault(); void aplicarSerie(); }}>
              {salvando === 'serie' ? 'Aplicando…' : 'Aplicar à série'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 4: Criar `CmvAplicarPadroesDialog.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { todayBR } from '@/lib/formatters';
import { formatarCentavos } from '@/domain/financeiro/cmv';
import {
  aplicarPadroesCmv, mensagemErroCmv, simularPadroesCmv, type CmvPreviaFonte, type CmvPreviaPadroes,
} from '@/hooks/useCmvFinanceiro';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Depois de gravar: recarregar o relatório e as telas que mostram a decisão. */
  onAplicado: () => void;
}

const inicioDoMes = () => `${todayBR().slice(0, 7)}-01`;

/**
 * Preenche as linhas PENDENTES com o padrão da categoria (boletos e lançamentos), a
 * partir de uma data de competência. Sempre passa por prévia; decisão já tomada
 * nunca muda e categoria sem padrão continua pendente.
 */
export default function CmvAplicarPadroesDialog({ open, onOpenChange, onAplicado }: Props) {
  const supabase = useSupabase();
  const toast = useScopedToast();
  const { executar, enviando } = useTravaEnvio();
  const [desde, setDesde] = useState(inicioDoMes);
  const [previa, setPrevia] = useState<CmvPreviaPadroes | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [justificativa, setJustificativa] = useState('');

  useEffect(() => {
    if (!open) return;
    setDesde(inicioDoMes());
    setPrevia(null);
    setJustificativa('');
  }, [open]);

  // A prévia vale para a data em que foi feita: trocar a data pede outra.
  const trocarDesde = (valor: string) => {
    setDesde(valor);
    setPrevia(null);
  };

  const verPrevia = async () => {
    setCarregando(true);
    try {
      setPrevia(await simularPadroesCmv(supabase, desde));
    } catch (error) {
      console.error('[CMV Financeiro] Falha na prévia de aplicar padrões:', error);
      toast.error(mensagemErroCmv(error));
    } finally {
      setCarregando(false);
    }
  };

  const linhasQueMudam = previa
    ? previa.boleto.linhasSim + previa.boleto.linhasNao + previa.lancamento.linhasSim + previa.lancamento.linhasNao
    : 0;

  const aplicar = () => void executar(async () => {
    try {
      const r = await aplicarPadroesCmv(supabase, desde, justificativa);
      toast.success(r.documentos === 0
        ? 'Nada a aplicar: as pendências mudaram desde a prévia.'
        : `${r.linhas} ${r.linhas === 1 ? 'linha classificada' : 'linhas classificadas'} em ${r.documentos} ${r.documentos === 1 ? 'despesa' : 'despesas'}.`);
      onAplicado();
      onOpenChange(false);
    } catch (error) {
      toast.error(`${mensagemErroCmv(error)} Nada foi alterado.`);
    }
  });

  const linhaPrevia = (rotulo: string, f: CmvPreviaFonte) => (
    <tr className="border-b border-border last:border-0">
      <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">{rotulo}</th>
      <td className="px-3 py-2 text-right tabular-nums">{f.linhasSim} · {formatarCentavos(f.centavosSim)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{f.linhasNao} · {formatarCentavos(f.centavosNao)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{f.linhasSemPadrao} · {formatarCentavos(f.centavosSemPadrao)}</td>
    </tr>
  );

  return (
    <Dialog open={open} onOpenChange={aberto => { if (!enviando) onOpenChange(aberto); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aplicar padrões às pendentes</DialogTitle>
          <DialogDescription>
            As linhas sem resposta recebem o padrão da categoria (Sim ou Não), a partir da data de competência escolhida. Decisões já tomadas não mudam e categorias sem padrão continuam pendentes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="cmv-padroes-desde" className="text-xs text-muted-foreground">Competência a partir de</Label>
              <DateInput id="cmv-padroes-desde" value={desde} onValueChange={trocarDesde} className="h-9 w-44" />
            </div>
            <Button type="button" variant="outline" onClick={() => void verPrevia()} disabled={!desde || carregando || enviando}>
              {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Ver prévia
            </Button>
          </div>
          {previa && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <caption className="sr-only">Prévia: linhas e valores que recebem o padrão da categoria</caption>
                <thead>
                  <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                    <th scope="col" className="px-3 py-2 text-left font-medium">Origem</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Viram Sim</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Viram Não</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Continuam pendentes</th>
                  </tr>
                </thead>
                <tbody>
                  {linhaPrevia('Boletos', previa.boleto)}
                  {linhaPrevia('Lançamentos e conciliação', previa.lancamento)}
                </tbody>
              </table>
            </div>
          )}
          {previa && linhasQueMudam > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="cmv-padroes-justificativa" className="text-xs text-muted-foreground">Justificativa (fica na auditoria)</Label>
              <Textarea id="cmv-padroes-justificativa" value={justificativa} onChange={e => setJustificativa(e.target.value)} maxLength={300} rows={2} />
            </div>
          )}
          {previa && linhasQueMudam === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma linha pendente com padrão a partir desta data.</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={aplicar} disabled={!previa || linhasQueMudam === 0 || !justificativa.trim() || enviando}>
            {enviando ? 'Aplicando…' : 'Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Textos e ligações nas demais telas e no PDF**

`CmvFinanceiroSection.tsx`:
1. Depois de `const canPagarEdit = useCan('financeiro:pagar:edit');`:

```ts
  const canLancView = useCan('financeiro:lancamentos:view');
  const canLancEdit = useCan('financeiro:lancamentos:edit');
  const canConciliar = useCan('financeiro:conciliacao:reconcile');
```

2. Troque `SITUACAO_TITULO` por:

```ts
const SITUACAO_TITULO: Record<CmvSituacao, string> = {
  incluido: 'Despesas incluídas no CMV',
  fora: 'Despesas fora do CMV',
  pendente: 'Despesas pendentes de classificação',
  sem_competencia: 'Boletos sem data de competência',
  todos: 'Despesas e classificação no CMV',
};
```

3. Em `abrirCategoria`:
   - `titulo: \`Boletos de origem — ${linha.nome}\`` vira `titulo: \`Despesas de origem — ${linha.nome}\``;
   - a `descricao` vira `\`Linhas incluídas no CMV (boletos, lançamentos e conciliação), com competência em ${formatarIntervalo(faixaDoRelatorio)}.\``.
4. Em `abrirLista`, troque `'Todos os boletos da unidade com esta situação, de qualquer competência.'` por `'Todas as despesas da unidade com esta situação, de qualquer competência.'`.
5. O `subtitle` do `PageHeader` vira `"Custo das mercadorias pelas despesas marcadas para o CMV (boletos, lançamentos e conciliação, por competência) sobre o faturamento do Fechamento de Caixa."`.
6. No `<CmvRegrasVinculo ... />`, acrescente `pendentesGeralPorFonte={report.pendentesGeralPorFonte}`.
7. No `<CmvBoletosDialog ... />`, acrescente `canClassificarLancamento={canManage || canLancEdit || canConciliar}` e `canAbrirLancamento={canLancView}`.

`CmvRegrasVinculo.tsx`:
1. Imports:
   - acrescente `import CmvAplicarPadroesDialog from './CmvAplicarPadroesDialog';`;
   - acrescente `CMV_QUERY_ROOT` ao import de `@/hooks/useCmvFinanceiro`, se ainda não estiver lá.
2. Em `Props`, depois de `pendentesGeral`:

```ts
  pendentesGeralPorFonte: { boleto: CmvContagem; lancamento: CmvContagem } | null;
```

   Desestruture `pendentesGeralPorFonte` e acrescente o estado `const [aplicarAberto, setAplicarAberto] = useState(false);`.
3. Em `alterarAtivacao`:
   - os toasts viram `'Classificação ativada: as novas despesas passam a pedir a resposta Sim/Não.'` e `'Classificação desativada: Contas a Pagar, Lançamentos e Conciliação voltam ao comportamento anterior.'`;
   - depois de `emitDataEvent('financeiro:pagar');`, acrescente `emitDataEvent('financeiro:lancamentos');` e `emitDataEvent('financeiro:conciliacao');`.
4. Textos:

| Antes | Depois |
|---|---|
| `A escolha é feita em cada linha de rateio do boleto. Quando um boleto tem mais de uma categoria, só as linhas marcadas para aparecer no CMV financeiro entram no cálculo — cada linha com a sua decisão.` | `A escolha é feita em cada linha de rateio da despesa — boleto de Contas a Pagar, lançamento do Livro Razão ou linha da Conciliação Bancária. Quando uma despesa tem mais de uma categoria, só as linhas marcadas para aparecer no CMV financeiro entram no cálculo — cada linha com a sua decisão.` |
| `O padrão será sugerido em novos lançamentos. Alterações não modificam boletos já cadastrados.` | `O padrão será sugerido em novos lançamentos. Alterações não modificam despesas já cadastradas.` |
| `A resposta “Aparecer no CMV financeiro?” fica gravada em cada linha de rateio do boleto e é ela que a apuração usa. Edite em Contas a Pagar ou clique numa categoria do relatório para conferir os boletos.` | `A resposta “Aparecer no CMV financeiro?” fica gravada em cada linha da despesa e é ela que a apuração usa. Edite em Contas a Pagar, no Livro Razão ou clique numa categoria do relatório para conferir as despesas.` |
| `Pedir a resposta nos novos boletos` | `Pedir a resposta nas novas despesas` |
| `'Ativo: o formulário de Contas a Pagar exige Sim ou Não em cada linha de um boleto novo. Boletos antigos continuam editáveis com a pendência visível.'` | `'Ativo: Contas a Pagar exige Sim ou Não em cada linha de um boleto novo; Lançamentos e a Conciliação mostram a pergunta já preenchida pelo padrão da categoria, sem travar o salvar.'` |
| `'Desativado: o formulário de Contas a Pagar funciona como antes e os boletos novos ficam pendentes de classificação.'` | `'Desativado: Contas a Pagar, Lançamentos e Conciliação funcionam como antes e as despesas novas ficam pendentes de classificação.'` |
| `Nada do histórico é classificado automaticamente. Revise os boletos pendentes, selecione as linhas e confirme a prévia; cada alteração fica na auditoria com o antes e o depois.` | `Nada do histórico é classificado sem alguém confirmar. Aplique o padrão da categoria às pendentes (com prévia) ou revise linha a linha; cada alteração fica na auditoria com o antes e o depois.` |

5. No bloco "Pendentes de classificação (todo o histórico)", depois do `<dd>` dos centavos:

```tsx
              {pendentesGeralPorFonte && (
                <dd className="text-xs tabular-nums text-muted-foreground">
                  {pendentesGeralPorFonte.boleto.titulos} {pendentesGeralPorFonte.boleto.titulos === 1 ? 'boleto' : 'boletos'} ·{' '}
                  {pendentesGeralPorFonte.lancamento.titulos} {pendentesGeralPorFonte.lancamento.titulos === 1 ? 'lançamento' : 'lançamentos'}
                </dd>
              )}
```

6. Entre os botões "Revisar pendências" e "Ver boletos sem competência":

```tsx
            {canRevisar && (
              <Button type="button" variant="outline" size="sm" onClick={() => setAplicarAberto(true)}>Aplicar padrões às pendentes</Button>
            )}
```

7. Antes do `</div>` final do componente:

```tsx
      <CmvAplicarPadroesDialog
        open={aplicarAberto}
        onOpenChange={setAplicarAberto}
        onAplicado={() => {
          void queryClient.invalidateQueries({ queryKey: CMV_QUERY_ROOT });
          emitDataEvent('financeiro:pagar');
          emitDataEvent('financeiro:lancamentos');
        }}
      />
```

8. Em `ExemploPratico`, depois do parágrafo `O boleto continua valendo ...`, acrescente `<p>Vale igual para um PIX lançado no Livro Razão ou criado pela Conciliação Bancária: cada linha com a sua resposta, na data de competência.</p>`.

`CmvCards.tsx`:
- troque a desestruturação por `const { faturamento, cmv, percentual, documentos, atual, anterior } = report;`;
- troque o `plural` por `const plural = (n: number | null) => (n === null ? '—' : \`${n} ${n === 1 ? 'despesa' : 'despesas'}\`);`;
- troque o 5º card por:

```tsx
      <CmvIndicadorCard
        rotulo="Despesas vinculadas ao CMV"
        valor={documentos.atual === null ? '—' : String(documentos.atual)}
        icone={FileText}
        estilo="info"
        variacao={documentos.variacaoPercentual === null ? null : formatarVariacao(documentos.variacaoPercentual)}
        direcao={direcaoDe(documentos.variacaoPercentual)}
        tom="neutro"
        contexto={contexto}
        rodape={semAnterior ? '—' : plural(anterior.documentos)}
        observacao={`${atual.boletos} ${atual.boletos === 1 ? 'boleto' : 'boletos'} · ${atual.lancamentos} ${atual.lancamentos === 1 ? 'lançamento' : 'lançamentos'}`}
      />
```

`CmvComparativo.tsx`:
- na desestruturação, troque `boletos` por `documentos`;
- troque a linha do comparativo por:

```ts
    {
      rotulo: 'Despesas vinculadas ao CMV',
      atual: documentos.atual === null ? '—' : String(documentos.atual), anterior: documentos.anterior === null ? '—' : String(documentos.anterior),
      diferenca: documentos.diferenca === null ? '—' : `${documentos.diferenca > 0 ? '+' : ''}${documentos.diferenca}`,
      variacao: formatarVariacao(documentos.variacaoPercentual),
    },
```

Textos (troca exata):

| Arquivo | Antes | Depois |
|---|---|---|
| `CmvVisaoGeral.tsx` | ``title={`Ver boletos de ${grupo.nome}`}`` | ``title={`Ver despesas de ${grupo.nome}`}`` |
| `CmvVisaoGeral.tsx` | `Ver boletos` (texto do botão de pendências) | `Ver despesas` |
| `CmvVisaoGeral.tsx` | `Soma das categorias marcadas para o CMV nos boletos de Contas a Pagar, pela` | `Soma das categorias marcadas para o CMV nas despesas — boletos de Contas a Pagar, lançamentos e conciliação —, pela` |
| `CmvVisaoGeral.tsx` | `Mantenha os boletos com categoria, competência e a resposta do CMV preenchidas para um indicador mais preciso.` | `Mantenha as despesas com categoria, competência e a resposta do CMV preenchidas para um indicador mais preciso.` |
| `CmvVisaoGeral.tsx` | `title="Nenhum boleto incluído no CMV neste período"` | `title="Nenhuma despesa incluída no CMV neste período"` |
| `CmvAnaliseCategoria.tsx` | `title="Nenhum boleto incluído no CMV neste período" description="Marque os boletos em Contas a Pagar ou revise as pendências de classificação."` | `title="Nenhuma despesa incluída no CMV neste período" description="Marque as despesas em Contas a Pagar, no Livro Razão ou na Conciliação, ou revise as pendências de classificação."` |
| `CmvAnaliseCategoria.tsx` | ``title={`Ver boletos de ${linha.nome}`}`` | ``title={`Ver despesas de ${linha.nome}`}`` |
| `cmvCharts.tsx` | ``aria-label={`Ver boletos de ${fatia.nome}`}`` | ``aria-label={`Ver despesas de ${fatia.nome}`}`` |
| `cmvCharts.tsx` | ``aria-label={`Ver boletos de ${grupo.nome}: `` | ``aria-label={`Ver despesas de ${grupo.nome}: `` |
| `CmvExportSheet.tsx` | `'Os boletos mudaram depois que o relatório foi carregado. Feche o painel, atualize a tela e exporte de novo.'` | `'As despesas mudaram depois que o relatório foi carregado. Feche o painel, atualize a tela e exporte de novo.'` |

`src/lib/cmvFinanceiroPdfExport.ts`:
1. Em `CmvPdfBoleto`, depois de `descricao: string;`:

```ts
  /** Ausente em linha antiga = boleto. */
  fonte?: 'boleto' | 'lancamento';
  origem?: string | null;
  contaNome?: string | null;
```

2. Em `STATUS_ROTULO`, acrescente `REALIZADO: 'Realizado', PREVISTO: 'Previsto',`.
3. Textos:

| Antes | Depois |
|---|---|
| `descricao: 'Faturamento, CMV, % CMV, variação e boletos vinculados'` | `descricao: 'Faturamento, CMV, % CMV, variação e despesas vinculadas'` |
| `rotulo: 'Boletos de origem', descricao: 'Todas as linhas de rateio incluídas no CMV do período'` | `rotulo: 'Despesas de origem', descricao: 'Todas as linhas incluídas no CMV do período (boletos, lançamentos e conciliação)'` |
| `'Custo das mercadorias pelos boletos de Contas a Pagar (competência) sobre o faturamento do Fechamento de Caixa.'` | `'Custo das mercadorias pelas despesas marcadas para o CMV (boletos, lançamentos e conciliação, por competência) sobre o faturamento do Fechamento de Caixa.'` |
| `'CMV: linhas de rateio marcadas para o CMV nos boletos de Contas a Pagar, pela data de competência. Faturamento: bruto do Fechamento de Caixa. % CMV = CMV ÷ faturamento.'` | `'CMV: linhas marcadas para o CMV nas despesas (boletos de Contas a Pagar, lançamentos e conciliação), pela data de competência. Faturamento: bruto do Fechamento de Caixa. % CMV = CMV ÷ faturamento.'` |
| `'Nenhum boleto incluído no CMV neste período.'` (2 lugares) | `'Nenhuma despesa incluída no CMV neste período.'` |
| `` `Boletos de origem — linhas incluídas no CMV (${linhas.length})` `` | `` `Despesas de origem — linhas incluídas no CMV (${linhas.length})` `` |
| `['Fornecedor / boleto', 'Competência', 'Vencimento', 'Situação', 'Categoria', 'Valor do boleto', 'Valor incluído']` | `['Origem / descrição', 'Competência', 'Vencimento', 'Situação', 'Categoria', 'Valor do documento', 'Valor incluído']` |
| `CMV por competência dos boletos; faturamento do Fechamento de Caixa` | `CMV por competência das despesas; faturamento do Fechamento de Caixa` |
| `` `CMV Financeiro por competência dos boletos sobre o faturamento `` | `` `CMV Financeiro por competência das despesas sobre o faturamento `` |

4. No card do PDF (no bloco dos cards, onde `const { faturamento, cmv, percentual, boletos, anterior } = report;`):
   - troque `boletos` por `documentos` na desestruturação;
   - o item do card vira:

```ts
      rotulo: 'Despesas vinculadas ao CMV', valor: documentos.atual === null ? '-' : String(documentos.atual),
      variacao: base(documentos.variacaoPercentual === null ? null : formatarVariacao(documentos.variacaoPercentual)),
      rodape: semAnterior ? '-' : `Anterior: ${anterior.documentos} ${anterior.documentos === 1 ? 'despesa' : 'despesas'}`,
```

5. No comparativo do PDF (onde `const { atual, anterior, faturamento, cmv, percentual, boletos } = report;`):
   - troque `boletos` por `documentos`;
   - a linha vira:

```ts
      ['Despesas vinculadas ao CMV', documentos.atual === null ? '-' : String(documentos.atual), documentos.anterior === null ? '-' : String(documentos.anterior),
        documentos.diferenca === null ? '-' : `${documentos.diferenca > 0 ? '+' : ''}${documentos.diferenca}`, formatarVariacao(documentos.variacaoPercentual)],
```

6. Em `drawBoletos`, troque a primeira célula da linha (`l.fornecedor ? \`${l.fornecedor} · ${l.descricao}\` : l.descricao,`) por:

```ts
        l.fonte === 'lancamento'
          ? `${l.origem === 'conciliacao' ? 'Conciliação' : 'Lançamento'}${l.contaNome ? ` · ${l.contaNome}` : ''} · ${l.descricao}`
          : (l.fornecedor ? `${l.fornecedor} · ${l.descricao}` : l.descricao),
```

- [ ] **Step 6: Rodar e ver passar**

Run: `bunx vitest run src/components/financeiro/cmv src/lib/cmvFinanceiroPdfExport.test.ts src/hooks/useCmvFinanceiro.test.ts src/domain/financeiro/cmv`
Expected: PASS.

Run: `bunx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros.

Run: `Select-String -Path src/components/financeiro/cmv/*.tsx, src/lib/cmvFinanceiroPdfExport.ts -Pattern 'oleto' | Select-Object Path, LineNumber, Line`
Expected: só sobram usos que falam **de boleto mesmo**:
- série de parcelas e "boleto de exemplo";
- "sem data de competência" (só boleto);
- `Boleto ·` da origem;
- `canAbrirBoleto` e o nome do componente/tipo `CmvBoletosDialog`/`CmvBoletosAlvo`/`CmvPdfBoleto`;
- o id de bloco `'boletos'` do PDF.

- [ ] **Step 7: Commit**

```powershell
git add src/components/financeiro/cmv src/lib/cmvFinanceiroPdfExport.ts src/lib/cmvFinanceiroPdfExport.test.ts
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
feat(cmv): tela e PDF tratam despesas de boletos e lançamentos, com "aplicar padrões"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 11: Regras e checkpoint — CLAUDE.md/AGENTS.md e documentos do CMV

**Files:**
- Modify: `CLAUDE.md` e, em seguida, `AGENTS.md` (os dois são mantidos idênticos)
- Modify: `docs/cmv-financeiro/PLANO.md`, `docs/cmv-financeiro/PROGRESSO.md`

**Interfaces:** nenhuma de código. Pela regra do próprio CLAUDE.md: substituir o texto antigo, sem empilhar "REVISÃO", e remover o item concluído da lista "Pendente".

- [ ] **Step 1: Editar `CLAUDE.md`**

1. Na regra que começa com `- **Conciliação Bancária (OFX/OFC)** —`, acrescente no fim da mesma linha:
   ` A data da linha do extrato é sempre o `p_data` de `reconcile_import_lancamento` (chave de idempotência e checagem de duplicata); competência própria só por `p_data_competencia`, que muda apenas `data_competencia`.`
2. Substitua a linha que começa com `- **Editar lançamento conciliado sem desconciliar é só reclassificação**` por:

```markdown
- **Editar lançamento conciliado sem desconciliar é só reclassificação** — usar `_guarded_update_reconciled_classification`, que preserva `fin_conciliacao_vinculos` e permite apenas categoria, centro de custo, rateio, observações, a decisão do CMV e a **data de competência**, com justificativa. A data do banco (`data_pagamento`) nunca muda; se o lançamento não tem `data_pagamento`, a competência antiga vira `data_pagamento` antes da troca, porque o reconhecimento de linha já conciliada usa `data_pagamento || data_competencia`. Valor, conta, tipo, status e descrição bancária exigem desconciliação, e espelhos CP/CR são editados no título de origem.
```

3. Substitua a linha que começa com `- **CMV Financeiro (Financeiro → CMV) é indicador gerencial, não o CMV de estoque**` por:

```markdown
- **CMV Financeiro (Financeiro → CMV) é indicador gerencial, não o CMV de estoque** — numerador = linhas com `cmv_incluir = true`, pela **data de competência**, de duas fontes (`_fin_cmv_linhas_fontes`): (1) boletos de Contas a Pagar (`AGUARDANDO_APROVACAO`/`APROVADO`/`PAGO`; baixa, pagamento parcial, estorno e vencimento não mudam valor nem período; cada parcela é um título próprio) e (2) despesas de `fin_lancamentos` — Livro Razão e Conciliação: `DESPESA`, não `CANCELADO`, `referencia_modulo` vazio (espelho de baixa, encargo da baixa e título criado do extrato nunca contam: o boleto já conta) e, se `origem='conciliacao'`, conciliada. Denominador = `faturamento_bruto` do Fechamento de Caixa (dia sem linha é "sem fechamento", nunca zero). A decisão mora em `fin_lancamento_rateios.cmv_incluir` e, só para documento **sem** rateio, em `fin_contas_pagar.cmv_incluir`/`fin_lancamentos.cmv_incluir`; `NULL` = pendente e nunca é assumido como Sim. `fin_categorias.cmv_sugerir` só sugere (lançamento novo, linha do extrato e "Aplicar padrões", sempre com prévia) — nenhuma apuração lê essa coluna. O servidor devolve fatos por dia em centavos (`get_fin_cmv_financeiro`, contrato `cmv-financeiro/v1`, que só ganha campos) e `src/domain/financeiro/cmv` é a única implementação de totais/%/variações, usada pela tela e pelo PDF. Não reutilizar `metas_cmv`, Edge `cmv` nem DRE/DFC aqui, e não ler este indicador neles. Decisões e limites: `docs/cmv-financeiro/PLANO.md`.
```

4. Substitua a linha que começa com ``- **`_guarded_update_conta_pagar` apaga e reinsere o rateio`` por:

```markdown
- **`_guarded_update_conta_pagar`, `_guarded_upsert_lancamento` e `_guarded_update_reconciled_classification` apagam e reinserem o rateio, mas com o MESMO `id`/`created_at` quando o cliente devolve o `id` da linha** — a decisão do CMV é persistida por linha de rateio; RPC nova que regrave rateio precisa preservar o id e a coluna `cmv_incluir`. Cliente sem `p_cmv` (legado/integração) segue aceito: cria pendente e, na edição, herda a decisão da mesma categoria do próprio documento (`_fin_cmv_heranca`). Só boleto exige a resposta (`CMV_DECISAO_OBRIGATORIA`); lançamento e conciliação nunca travam o salvar. Depois de gravado, a decisão muda por `fin_cmv_classificar` (boleto ou lançamento; lock otimista por documento, auditoria antes/depois; lote exige `financeiro:cmv:manage`). `cmv_incluir` e `fin_config.cmv_financeiro_ativo` só são gravados pelas RPCs: os triggers `trg_fin_cmv_guard_*` (em `fin_contas_pagar`, `fin_lancamentos`, `fin_lancamento_rateios` e `fin_config`) recusam a escrita direta de `authenticated` — RPC nova que grave essas colunas precisa ser `SECURITY DEFINER`.
```

5. Em "Pendente / Em Aberto":
   - **remova** a linha `- [ ] Conciliação: permitir override de competência no lançamento criado pela conciliação (...)`;
   - substitua a linha que começa com `- [ ] CMV Financeiro (no ar desde 2026-10-03, nenhuma unidade ativada)` por:

```markdown
- [ ] CMV Financeiro: depois da migration `20261005120000_cmv_financeiro_lancamentos`, rodar "Aplicar padrões às pendentes" (com prévia) nas unidades ativas para as despesas de Lançamentos/Conciliação; conceder `financeiro:cmv:*` além de admin/diretor/gerente_geral a quem deve ver; definir padrões e ligar a classificação nas demais unidades — roteiro em `docs/cmv-financeiro/PROGRESSO.md`
```

- [ ] **Step 2: Replicar em `AGENTS.md` e conferir**

Run:

```powershell
Copy-Item CLAUDE.md AGENTS.md
(Get-FileHash CLAUDE.md).Hash -eq (Get-FileHash AGENTS.md).Hash
git diff --stat CLAUDE.md AGENTS.md
```

Expected: `True`, e as duas com o mesmo número de linhas alteradas.

- [ ] **Step 3: `docs/cmv-financeiro/PLANO.md`**

Acrescente no fim:

```markdown
## 6. Extensão (2026-10-05): despesas de Lançamentos e da Conciliação

Spec: [`../superpowers/specs/2026-10-05-cmv-financeiro-lancamentos-design.md`](../superpowers/specs/2026-10-05-cmv-financeiro-lancamentos-design.md) · Plano: [`../superpowers/plans/2026-10-05-cmv-financeiro-lancamentos.md`](../superpowers/plans/2026-10-05-cmv-financeiro-lancamentos.md)

1. **Fonte única.** `_fin_cmv_linhas_fontes` = boletos (regra do §3, inalterada) + despesas de `fin_lancamentos` (`DESPESA`, não `CANCELADO`, sem `referencia_modulo`, conciliada quando vem da conciliação). Relatório, lista, classificação, "Aplicar padrões" e PDF leem dela.
2. **Decisão.** Linha de rateio (`fin_lancamento_rateios.cmv_incluir`) ou, sem rateio, `fin_lancamentos.cmv_incluir`. Livro Razão e conciliação **não exigem** a resposta (a linha nasce sugerida pelo padrão da categoria quando a classificação está ativa); a pendência aparece na revisão.
3. **Sem dupla contagem.** O espelho da baixa do boleto (`referencia_modulo = 'contas_pagar'`) fica fora: o boleto conta pela própria competência.
4. **Competência na conciliação.** `p_data` continua a data do banco (chave e duplicata). `p_data_competencia` muda só `data_competencia` (DRE e CMV); caixa, saldos e Livro Razão não mudam. A reclassificação de lançamento conciliado também ajusta a competência.
5. **Histórico.** Nada é classificado pela migration. "Aplicar padrões às pendentes" (Regras de vínculo) grava o padrão da categoria só nas linhas pendentes a partir de uma data, depois de prévia, com justificativa e auditoria por documento; exige `financeiro:cmv:manage`.
6. **Compatibilidade.** O contrato do relatório continua `v1` (só ganha `lancamentos` e `pendentes_geral_por_fonte`). As três RPCs com parâmetro novo têm default: o cliente antigo segue funcionando. O frontend só mostra os controles com `get_fin_cmv_config().recursos.lancamentos`.

Limites (aceitos): conta a pagar criada a partir do extrato continua como boleto (com rateio, aparece sem categoria e pendente); parcela gerada por `gerar_parcela_recorrente` nasce pendente; compra lançada como boleto **e** paga na conciliação como "criar lançamento" conta duas vezes (como na DRE).
```

- [ ] **Step 4: `docs/cmv-financeiro/PROGRESSO.md`**

1. Na seção "Estado atual", troque a frase `Nenhuma unidade está com a classificação ligada e nada do histórico foi classificado` por `Em 2026-10-05 a Ren Sushi já estava com a classificação ligada e 121 padrões de categoria (a Aoi Sushi, com 93 padrões, ainda desligada)`. Nada mais muda nesse parágrafo.
2. Acrescente no fim:

```markdown
## Extensão: despesas de Lançamentos e Conciliação (2026-10-05)

Spec e plano em `docs/superpowers/` (links no PLANO.md §6). Branch `feat/cmv-financeiro-lancamentos`, a partir do PR #144 (Redesign V2).

### Entregue
- Migration `supabase/migrations/20261005120000_cmv_financeiro_lancamentos.sql`:
  - coluna `fin_lancamentos.cmv_incluir` e a trava de escrita direta;
  - `_fin_cmv_linhas_lancamentos`, `_fin_cmv_linhas_fontes`, `_fin_cmv_retrato_lancamento` e `_fin_cmv_heranca`;
  - payload, lista e config com as duas fontes;
  - `reconcile_import_lancamento` (+ `p_data_competencia`), `_guarded_upsert_lancamento` (+ `p_cmv`) e `_guarded_update_reconciled_classification` (+ `p_cmv`, `p_data_competencia`);
  - `fin_cmv_classificar` (boleto ou lançamento) e `fin_cmv_aplicar_padroes` (nova).
- Teste de banco real: `supabase/tests/database/cmv_lancamentos_ephemeral.sql`, rodado por `run_ephemeral.ps1`.
- Telas:
  - Livro Razão: pergunta, competência na reclassificação e abertura vinda do CMV;
  - Conciliação: Sim/Não e competência na linha e no rateio; diálogo "Criar";
  - CMV: "despesas", origem, classificar lançamento e "Aplicar padrões";
  - PDF.

### Ativação (requer autorização)
1. **Migration.** Remove e recria três funções (`DROP FUNCTION`): o conector MCP deve recusar, então ela é rodada pelo SQL Editor. Depois:
   - conferir uma assinatura por função, grants, triggers e o md5 dos corpos contra o banco descartável;
   - registrar a versão `20261005120000` com o nome do arquivo.
2. **Frontend.** O PR entra depois do #144. Antes da migration, a tela publicada continua igual (sem `recursos`); depois dela, o cliente antigo continua salvando (parâmetros novos têm default).
3. **Por unidade.** Em CMV → Regras de vínculo:
   - conferir os padrões das categorias de mercadoria;
   - rodar "Aplicar padrões às pendentes" a partir da data desejada (prévia antes);
   - revisar o que ficou pendente (categorias sem padrão).

### Reversão
- Desligar "Pedir a resposta nas novas despesas" tira a pergunta das telas.
- Revert do PR não exige mexer no banco.
- As colunas não são removidas.
- As decisões gravadas em lançamentos só passam a ser ignoradas se a migration for revertida, recriando `_fin_cmv_payload`/`_fin_cmv_lista` de `20261003203219` e `20261003140000`.
```

- [ ] **Step 5: Commit**

```powershell
git add CLAUDE.md AGENTS.md docs/cmv-financeiro/PLANO.md docs/cmv-financeiro/PROGRESSO.md
git diff --cached | Select-String -Pattern 'eyJ|sb_secret_|password|api_key'
git commit -m @'
docs(cmv): regras e checkpoint do CMV com despesas de lançamentos e conciliação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

### Task 12: Verificação final, revisão e publicação (com o usuário)

**Files:** nenhum novo. Esta tarefa roda a validação inteira e conduz a publicação. Cada passo que muda algo fora da worktree (push, PR, banco de produção) **para e pede autorização ao usuário**.

- [ ] **Step 1: Validação completa**

```powershell
bunx vitest run
bunx tsc --noEmit -p tsconfig.app.json
bunx eslint src/lib/cmvLancamentoPayload.ts src/lib/conciliacaoCmv.ts src/components/financeiro/ConciliacaoLinhaCmv.tsx src/components/financeiro/cmv/CmvAplicarPadroesDialog.tsx src/components/financeiro/cmv/CmvBoletosDialog.tsx src/components/financeiro/LivroRazaoSection.tsx src/components/financeiro/ConciliacaoBancariaSection.tsx src/components/financeiro/CriarLancamentoExtratoDialog.tsx src/components/financeiro/ContaFormDialog.tsx src/hooks/useCmvFinanceiro.ts src/domain/financeiro/cmv/report.ts src/domain/financeiro/cmv/rateio.ts
bunx vite build
bun run rbac:lint
powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_lancamentos_ephemeral.sql
powershell -File supabase/tests/database/run_ephemeral.ps1 supabase/tests/database/cmv_financeiro_ephemeral.sql
```

Expected:
- vitest: todos verdes. O baseline anterior era de 169 arquivos, mais os novos desta branch e os do #144; registre os números;
- tsc limpo;
- eslint sem erros nos arquivos tocados (avisos preexistentes de `any` nos arquivos antigos podem aparecer; registre);
- build ok;
- rbac:lint PASS;
- os dois bancos imprimem `...: OK`.

Se algo falhar, use superpowers:systematic-debugging antes de corrigir.

- [ ] **Step 2: Revisão do branch inteiro**

Use superpowers:requesting-code-review (base `origin/release/redesign-v2-f01-f05b`). Pontos que a revisão deve olhar:
- ausência de dupla contagem (espelho/encargo/título do extrato);
- `p_data` sempre a data do banco;
- trava de escrita direta;
- herança do cliente antigo;
- lock e ordem de bloqueio;
- payload sem chaves novas quando o banco não tem o recurso.

Corrija os achados confirmados (superpowers:receiving-code-review) e repita o Step 1.

- [ ] **Step 3: Atualizar o checkpoint com o resultado da validação**

Em `docs/cmv-financeiro/PROGRESSO.md` (seção da extensão), acrescente o bloco `### Validação` com a saída resumida do Step 1, no mesmo formato da "Fase 6 — Revisão". Commit `docs(cmv): validação da extensão de lançamentos`.

- [ ] **Step 4: Publicar a branch e abrir o PR — PEDIR AUTORIZAÇÃO ANTES**

Com o "ok" do usuário:

```powershell
git push -u origin feat/cmv-financeiro-lancamentos
gh pr create --base release/redesign-v2-f01-f05b --head feat/cmv-financeiro-lancamentos --title "feat(cmv): despesas de Lançamentos e Conciliação no CMV Financeiro" --body-file "$env:TEMP\pr-cmv-lancamentos.md"
```

- Escreva antes o corpo em `$env:TEMP\pr-cmv-lancamentos.md`, fora do repositório.
- O corpo resume a spec, a validação e a ordem de publicação, e termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Quando o #144 for mergeado, retarget para `main` (`gh pr edit --base main`) e confira que o diff ficou só com esta branch.

- [ ] **Step 5: Aplicar a migration em produção — PEDIR AUTORIZAÇÃO ANTES**

1. Avisar o usuário: a migration tem `DROP FUNCTION` (três assinaturas substituídas), e o conector MCP recusou esse tipo de migration em 2026-10-03.
2. Pedir que ele rode o arquivo no SQL Editor do projeto `wuzxpbixprrgssoeeaez`. Opcionalmente, tentar antes `apply_migration`, se ele preferir.
3. Conferir por MCP (somente leitura):

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef,
  md5(replace(p.prosrc, E'\r', '')) as corpo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'reconcile_import_lancamento', '_guarded_upsert_lancamento', '_guarded_update_reconciled_classification',
  'fin_cmv_classificar', 'fin_cmv_aplicar_padroes', 'get_fin_cmv_config',
  '_fin_cmv_linhas_lancamentos', '_fin_cmv_linhas_fontes', '_fin_cmv_retrato_lancamento', '_fin_cmv_heranca',
  '_fin_cmv_payload', '_fin_cmv_lista'
) order by 1;
select tgname from pg_trigger where tgrelid = 'public.fin_lancamentos'::regclass and tgname = 'trg_fin_cmv_guard_decisao';
select has_function_privilege('authenticated', 'public._fin_cmv_linhas_fontes(uuid)', 'EXECUTE') as helper_aberto,
       has_function_privilege('authenticated', 'public.fin_cmv_aplicar_padroes(date,boolean,text)', 'EXECUTE') as rpc_aberta;
```

   Esperado:
   - uma linha por função;
   - o trigger presente;
   - `helper_aberto = false` e `rpc_aberta = true`;
   - md5 iguais aos do banco descartável. Para obtê-los, rode a mesma consulta no `psql` do `run_ephemeral.ps1` com um `SELECT` a mais no fim do script de teste, só localmente e sem commit.
4. Registrar a versão (escrita, com o "ok" do usuário): `insert into supabase_migrations.schema_migrations (version, name) values ('20261005120000', 'cmv_financeiro_lancamentos');`
5. Ensaio sem gravar, como admin da Ren Sushi, numa transação revertida. Use o procedimento da série em `PROGRESSO.md`, "Depois da publicação", com os mesmos `set_config` de `request.jwt.claims` e `request.headers`:
   - `get_fin_cmv_financeiro` da semana atual: o valor do CMV não muda (nada classificado ainda);
   - `fin_cmv_aplicar_padroes(<início do mês>, true)`: a prévia faz sentido com os padrões da unidade.

- [ ] **Step 6: Merge — PEDIR AUTORIZAÇÃO ANTES**

Só depois do #144 em `main`, com o PR verde e o "ok" do usuário: `gh pr merge --merge`. Depois do deploy, o usuário roda "Aplicar padrões às pendentes" na Ren Sushi (Tarefa 11, PROGRESSO.md, "Ativação").

---

## Self-review (feito ao escrever o plano)

- **Cobertura da spec:**
  - §3 regra de apuração: Tasks 1 e 3;
  - §4 persistência e trava: Task 1;
  - §5.1 conciliação: Tasks 2, 5 e 8;
  - §5.2 Livro Razão: Tasks 2, 5, 6 e 7;
  - §5.3 reclassificação: Tasks 2, 6 e 7;
  - §6 competência: Tasks 2, 5, 8 e 9;
  - §7.1 classificar: Tasks 3, 4 e 10;
  - §7.2 aplicar padrões: Tasks 3, 4 e 10;
  - §8 contrato: Tasks 1 e 4;
  - §9 telas: Task 10;
  - §10 limites: Task 11;
  - §11 testes: em todas as tarefas;
  - §12 publicação: Task 12.
- **Tipos entre tarefas:**
  - `CmvLinhaDetalhe.fonte/documentoId` vêm da Task 4 e são usados nas Tasks 4 e 10;
  - `itemDaLinha` vem da Task 4 e é usado nas Tasks 4 e 10;
  - `decisaoAoTrocarCategoria` vem da Task 4 e é usado nas Tasks 5, 6, 8 e 9;
  - `datasDoLancamentoCriado` vem da Task 5 e é usado na Task 9;
  - `competenciaNaReclassificacao` vem da Task 6 e é usado na Task 7;
  - `cmvConfig` da seção vem da Task 8 e é usado na Task 9.
- **Ordem de commits:** cada tarefa termina com `tsc` limpo e testes verdes. A Task 4 ajusta o mínimo do `CmvBoletosDialog`, que a Task 10 reescreve.

