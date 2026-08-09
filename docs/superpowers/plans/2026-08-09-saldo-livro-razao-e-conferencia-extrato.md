# Saldo no Livro Razão + Conferência de Saldo ao Importar Extrato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a running-balance column + current-balance summary tile to the Livro Razão, and a mandatory bank-statement-ending-balance confirmation step (with system-calculated comparison) when importing an extrato for reconciliation.

**Architecture:** Three new/extended Postgres RPCs (`list_fin_lancamentos_cursor` gains `saldo_apos`; new `get_fin_saldo_atual` and `get_fin_saldo_conta_em`) reusing the existing `saldo_inicial + soma sinalizada de lançamentos REALIZADO/CONCILIADO` formula already used by `fin_contas_saldo_cache`/`refresh_saldo_cache`. Frontend: `LivroRazaoSection.tsx` gets a new table column + summary tile; `extratoParser.ts` gains OFX `<LEDGERBAL>` extraction + a pure date helper; a new `ConfirmarSaldoExtratoDialog.tsx` component is wired into `ConciliacaoBancariaSection.tsx`'s upload flow.

**Tech Stack:** React 18 + TypeScript, Supabase (Postgres/PostgREST, PL/pgSQL `SECURITY DEFINER` RPCs), Vitest, shadcn/ui.

Full design spec: `docs/superpowers/specs/2026-08-09-saldo-livro-razao-e-conferencia-extrato-design.md`

## Global Constraints

- Toda RPC nova é `SECURITY DEFINER`, chama `assert_tenant()` primeiro e checa permissão antes de qualquer leitura (`has_permission`/`has_any_permission`) — sem exceção.
- Migrations com `CREATE FUNCTION` **não podem** ser aplicadas via `supabase db push` (CLI v2.75 quebra em `CREATE FUNCTION` seguido de outro statement — GRANT, DO block, etc., com erro `42601`). Aplicar via `mcp__claude_ai_Supabase__apply_migration`, depois reconciliar o histórico: rodar `supabase migration list` para achar a version "fantasma" gravada como `now()`, então `supabase migration repair --status applied <version_do_arquivo> --status reverted <version_fantasma>`.
- Migration que cria/altera RPC com `JOIN` deve incluir um bloco `DO $$ ... PERFORM ... END $$;` usando o UUID sentinela `00000000-0000-0000-0000-000000000001` para forçar a resolução de colunas em tempo de aplicação (evita erro de coluna inexistente descoberto só em produção, silenciosamente).
- **Nunca** importar `formatDateBR` de `@/lib/formatters` para produzir uma data ISO (`yyyy-MM-dd`) que será enviada ao backend — essa versão retorna `dd/MM/yyyy` (só exibição). Para aritmética de datas ISO, usar componentes locais (`new Date(y, m-1, d)`), nunca `new Date(isoString)` (interpretado como UTC e desloca o dia no fuso BR).
- `tsc --noEmit` deve ficar limpo ao final de cada task de frontend.
- Sem tabela de histórico/auditoria nova (decisão explícita do usuário — YAGNI).
- Sem alteração em `fin_contas_saldo_cache`, `refresh_saldo_cache`, Dashboard Financeiro, DRE, DFC ou Projeção de Fluxo de Caixa.

---

### Task 1: `saldo_apos` em `list_fin_lancamentos_cursor`

**Files:**
- Create: `supabase/migrations/20260809140000_add_saldo_apos_list_fin_lancamentos_cursor.sql`

**Interfaces:**
- Produces: RPC `list_fin_lancamentos_cursor(p_start date, p_end date, p_status text, p_tipo text, p_conta_id uuid, p_search text, p_limit int, p_cursor_date date, p_cursor_id uuid, p_origem text) RETURNS json` — cada item do array `items` ganha o campo `saldo_apos: number | null`. Assinatura e demais campos retornados são idênticos aos de hoje (só adiciona um campo).

- [ ] **Step 1: Escrever a migration**

Conteúdo de `supabase/migrations/20260809140000_add_saldo_apos_list_fin_lancamentos_cursor.sql`:

```sql
-- ============================================================================
-- Livro Razão: saldo acumulado por linha (saldo_apos)
--
-- Adiciona `saldo_apos` a cada item de list_fin_lancamentos_cursor — o saldo
-- da conta imediatamente após aquele lançamento, estilo extrato bancário.
--
-- Regras (ver docs/superpowers/specs/2026-08-09-saldo-livro-razao-e-conferencia-extrato-design.md):
-- - Ignora os filtros de Tipo/Origem — eles só decidem o que é exibido, não a
--   verdade do saldo da conta.
-- - NÃO aplica a exclusão de origem='conciliacao' desconciliado (mesma regra
--   já usada em "Saldo em Caixa" — reflete dinheiro real movimentado).
-- - Com p_conta_id: escopo = saldo_inicial daquela conta + lançamentos
--   RECEITA/DESPESA/TRANSFERENCIA que a afetam (mesma fórmula assinada de
--   refresh_saldo_cache).
-- - Sem p_conta_id ("Todas contas"): escopo = soma de saldo_inicial de todas
--   as contas ativas + RECEITA/DESPESA de toda a empresa, excluindo
--   TRANSFERENCIA (movimento interno, não muda o total).
-- - Acumula na mesma ordem do cursor (data_competencia, id) para o saldo
--   decrescer de forma consistente com a ordem visual da tabela.
-- - Bound por p_end quando informado (nada depois de p_end é necessário para
--   o saldo das linhas visíveis).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_fin_lancamentos_cursor(
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_status text DEFAULT NULL::text,
  p_tipo text DEFAULT NULL::text,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _items json;
  _effective_limit int;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    WITH filtered AS (
      SELECT l.*
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.status != 'CANCELADO'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND (p_start IS NULL OR l.data_competencia >= p_start)
        AND (p_end IS NULL OR l.data_competencia <= p_end)
        AND (p_status IS NULL OR l.status = p_status)
        AND (p_tipo IS NULL OR l.tipo = p_tipo)
        AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
        AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
        AND (p_origem IS NULL OR l.origem = p_origem)
        AND (
          p_cursor_date IS NULL
          OR l.data_competencia < p_cursor_date
          OR (l.data_competencia = p_cursor_date AND l.id < p_cursor_id)
        )
      ORDER BY l.data_competencia DESC, l.id DESC
      LIMIT _effective_limit
    ),
    saldo_inicial_base AS (
      SELECT COALESCE(SUM(c.saldo_inicial), 0) AS v
      FROM public.fin_contas c
      WHERE c.company_id = v_company
        AND (p_conta_id IS NOT NULL OR c.ativo = true)
        AND (p_conta_id IS NULL OR c.id = p_conta_id)
    ),
    ledger AS (
      SELECT l.id, l.data_competencia,
        CASE
          WHEN p_conta_id IS NOT NULL THEN
            CASE
              WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
              WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
              WHEN l.tipo = 'RECEITA' THEN l.valor
              WHEN l.tipo = 'DESPESA' THEN -l.valor
              ELSE 0
            END
          ELSE
            CASE
              WHEN l.tipo = 'RECEITA' THEN l.valor
              WHEN l.tipo = 'DESPESA' THEN -l.valor
              ELSE 0
            END
        END AS delta
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.status IN ('REALIZADO', 'CONCILIADO')
        AND (p_conta_id IS NULL OR l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        AND (p_conta_id IS NOT NULL OR l.tipo != 'TRANSFERENCIA')
        AND (p_end IS NULL OR l.data_competencia <= p_end)
    ),
    running AS (
      SELECT led.id,
        (SELECT v FROM saldo_inicial_base) + SUM(led.delta) OVER (
          ORDER BY led.data_competencia ASC, led.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS saldo_apos
      FROM ledger led
    )
    SELECT
      f.id, f.tipo, f.valor, f.data_competencia, f.data_vencimento, f.data_pagamento,
      f.descricao, f.status,
      f.conta_id, f.conta_destino_id, f.categoria_id, f.centro_custo_id,
      f.forma_pagamento, f.recorrente, f.observacoes, f.created_at, f.updated_at,
      f.lancamento_pai_id, f.conciliado, f.referencia_modulo, f.referencia_id,
      f.origem, r.saldo_apos
    FROM filtered f
    LEFT JOIN running r ON r.id = f.id
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$function$;

-- Força resolução de colunas em tempo de migration (join novo).
DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM led.id, led.data_competencia, led.delta
  FROM (
    SELECT l.id, l.data_competencia,
      CASE WHEN l.tipo = 'RECEITA' THEN l.valor WHEN l.tipo = 'DESPESA' THEN -l.valor ELSE 0 END AS delta
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_sentinel AND l.status IN ('REALIZADO', 'CONCILIADO')
  ) led;

  PERFORM COALESCE(SUM(c.saldo_inicial), 0)
  FROM public.fin_contas c
  WHERE c.company_id = v_sentinel AND c.ativo = true;
END $$;
```

- [ ] **Step 2: Aplicar via MCP Supabase**

Chamar `mcp__claude_ai_Supabase__apply_migration` com `name: "add_saldo_apos_list_fin_lancamentos_cursor"` e o SQL acima (sem o cabeçalho de comentários é opcional, mas incluir é o padrão já usado no projeto).

- [ ] **Step 3: Reconciliar o histórico de migrations**

```bash
supabase migration list
```
Achar a version aplicada com timestamp de `now()` (não `20260809140000`) referente a essa mudança, então:
```bash
supabase migration repair --status applied 20260809140000
supabase migration repair --status reverted <version_fantasma_encontrada>
```

- [ ] **Step 4: Verificar via SQL**

Usar `mcp__claude_ai_Supabase__execute_sql` para confirmar que a função foi atualizada e que `saldo_apos` aparece no retorno para uma empresa/conta real (substituir `<company_id_real>` e `<conta_id_real>` por valores existentes no banco, obtidos via `SELECT id FROM companies LIMIT 1;` e `SELECT id FROM fin_contas WHERE company_id = '<company_id_real>' LIMIT 1;`):

```sql
select pg_get_functiondef('public.list_fin_lancamentos_cursor'::regproc);
```
Confirmar que o corpo contém `saldo_apos`. Depois simular a chamada como faria o frontend (ajustando `request.jwt.claims` para um usuário real de teste, seguindo o padrão já usado em verificações anteriores deste projeto) e conferir que cada item tem um `saldo_apos` numérico não nulo, decrescendo de forma consistente (ou nulo apenas se o lançamento estiver fora do escopo REALIZADO/CONCILIADO — não deveria ocorrer, já que a lista só mostra `status != 'CANCELADO'`, mas lançamentos com `status='PREVISTO'` aparecem na lista e não têm `saldo_apos` no ledger — nesse caso o `LEFT JOIN` retorna `NULL`, o que é esperado: um lançamento previsto não afeta o saldo real ainda).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260809140000_add_saldo_apos_list_fin_lancamentos_cursor.sql
git commit -m "feat(financeiro): adiciona saldo_apos em list_fin_lancamentos_cursor"
```

---

### Task 2: Nova RPC `get_fin_saldo_atual`

**Files:**
- Create: `supabase/migrations/20260809140100_add_get_fin_saldo_atual.sql`

**Interfaces:**
- Consumes: nenhuma (independente do Task 1).
- Produces: RPC `get_fin_saldo_atual(p_conta_id uuid DEFAULT NULL) RETURNS numeric` — saldo atual (agora) de uma conta específica, ou soma de todas as contas ativas quando `p_conta_id` é `NULL`.

- [ ] **Step 1: Escrever a migration**

Conteúdo de `supabase/migrations/20260809140100_add_get_fin_saldo_atual.sql`:

```sql
-- ============================================================================
-- get_fin_saldo_atual: saldo atual para o card de resumo do Livro Razão.
-- Reaproveita fin_contas_saldo_cache (já mantida por trigger) — sem recalcular.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_fin_saldo_atual(p_conta_id uuid DEFAULT NULL::uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company uuid;
  v_saldo numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_conta_id IS NOT NULL THEN
    SELECT sc.saldo INTO v_saldo
    FROM public.fin_contas_saldo_cache sc
    JOIN public.fin_contas c ON c.id = sc.conta_id
    WHERE sc.conta_id = p_conta_id AND c.company_id = v_company;
  ELSE
    SELECT COALESCE(SUM(sc.saldo), 0) INTO v_saldo
    FROM public.fin_contas_saldo_cache sc
    JOIN public.fin_contas c ON c.id = sc.conta_id
    WHERE c.company_id = v_company AND c.ativo = true;
  END IF;

  RETURN COALESCE(v_saldo, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_saldo_atual(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_saldo_atual(uuid) TO authenticated;

DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM COALESCE(SUM(sc.saldo), 0)
  FROM public.fin_contas_saldo_cache sc
  JOIN public.fin_contas c ON c.id = sc.conta_id
  WHERE c.company_id = v_sentinel AND c.ativo = true;
END $$;
```

- [ ] **Step 2: Aplicar via MCP Supabase**

`mcp__claude_ai_Supabase__apply_migration` com `name: "add_get_fin_saldo_atual"`.

- [ ] **Step 3: Reconciliar o histórico**

Mesmo processo do Task 1, Step 3, com `20260809140100`.

- [ ] **Step 4: Verificar via SQL**

```sql
select public.get_fin_saldo_atual(null);
```
(simulando um usuário real via `request.jwt.claims`, como no Task 1). Confirmar que o valor bate com `SELECT SUM(saldo) FROM fin_contas_saldo_cache sc JOIN fin_contas c ON c.id=sc.conta_id WHERE c.company_id='<company_id_real>' AND c.ativo=true;` rodado diretamente. Repetir passando o id de uma conta específica e comparar com `SELECT saldo FROM fin_contas_saldo_cache WHERE conta_id='<conta_id_real>';`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260809140100_add_get_fin_saldo_atual.sql
git commit -m "feat(financeiro): adiciona RPC get_fin_saldo_atual"
```

---

### Task 3: Coluna "Saldo" + card "Saldo atual" no Livro Razão

**Files:**
- Modify: `src/components/financeiro/LivroRazaoSection.tsx`

**Interfaces:**
- Consumes: `list_fin_lancamentos_cursor` retornando `saldo_apos` por item (Task 1); RPC `get_fin_saldo_atual(p_conta_id)` (Task 2).

- [ ] **Step 1: Adicionar `saldo_apos` à interface `Lancamento`**

Em `src/components/financeiro/LivroRazaoSection.tsx:31-52`, adicionar o campo:

```typescript
interface Lancamento {
  id: string;
  tipo: string;
  status: string;
  valor: number;
  descricao: string | null;
  observacoes: string | null;
  conta_id: string | null;
  conta_destino_id: string | null;
  categoria_id: string | null;
  centro_custo_id: string | null;
  data_competencia: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  origem: string;
  recorrente: boolean;
  recorrencia_config: Record<string, unknown> | null;
  conciliado: boolean | null;
  referencia_id: string | null;
  updated_at: string;
  saldo_apos: number | null;
}
```

- [ ] **Step 2: Adicionar estado e loader do saldo atual**

Em `src/components/financeiro/LivroRazaoSection.tsx:137` (logo após a declaração de `totais`), adicionar:

```typescript
const [saldoAtual, setSaldoAtual] = useState(0);
```

Em `src/components/financeiro/LivroRazaoSection.tsx:199` (logo após o fechamento de `loadTotais`), adicionar:

```typescript
const loadSaldoAtual = useCallback(async () => {
  const { data, error } = await supabase.rpc('get_fin_saldo_atual', {
    p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
  });
  if (error) { console.error('[LivroRazaoSection.loadSaldoAtual]', error); return; }
  setSaldoAtual(Number(data) || 0);
}, [filtroConta]);
```

- [ ] **Step 3: Chamar o loader junto com `load()` e no efeito de filtros**

Em `src/components/financeiro/LivroRazaoSection.tsx:204-214` (função `load`), adicionar `loadSaldoAtual()` ao array do `Promise.all`:

```typescript
const load = useCallback(async () => {
  setCursorDate(null);
  setCursorId(null);
  const [_, catRes, ccRes, contRes] = await Promise.all([
    loadPage(null, null),
    supabase.from('fin_categorias').select('id, nome, tipo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
    supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
    loadTotais(),
    loadSaldoAtual(),
  ]);
  setCategorias(buildCategoryOptions((catRes.data as CategoriaRef[]) || []));
  setCentros((ccRes.data as CentroCustoRef[]) || []);
  setContas((contRes.data as ContaRef[]) || []);
}, [loadPage, loadTotais, loadSaldoAtual]);
```

Em `src/components/financeiro/LivroRazaoSection.tsx:217`, atualizar o segundo `useEffect` para também chamar `loadSaldoAtual()`:

```typescript
useEffect(() => { setCursorDate(null); setCursorId(null); setItems([]); loadPage(null, null); loadTotais(); loadSaldoAtual(); }, [filtroTipo, filtroOrigem, filtroConta, filtroDataDe, filtroDataAte, loadPage, loadTotais, loadSaldoAtual]);
```

- [ ] **Step 4: Rodar `tsc --noEmit`**

```bash
bun x tsc --noEmit
```
Esperado: sem novos erros relacionados a este arquivo (erros pré-existentes em outros arquivos, se houver, não são desta task).

- [ ] **Step 5: Card "Saldo atual" na barra de resumo**

Em `src/components/financeiro/LivroRazaoSection.tsx:600-614`, adicionar um span fixo (fora do bloco condicional por `filtroTipo`) dentro da mesma div:

```tsx
<div className="flex items-center gap-4 flex-wrap text-sm bg-card border border-border rounded-lg px-4 py-2.5">
  {filtroTipo === 'todos' ? (
    <>
      <span className="text-muted-foreground">Entradas: <strong className="text-success">{fmt(totais.total_receita)}</strong></span>
      <span className="text-muted-foreground">Saidas: <strong className="text-destructive">{fmt(totais.total_despesa)}</strong></span>
      <span className="text-muted-foreground">Resultado: <strong className={totais.resultado >= 0 ? 'text-success' : 'text-destructive'}>{fmt(totais.resultado)}</strong></span>
    </>
  ) : filtroTipo === 'RECEITA' ? (
    <span className="text-muted-foreground">Total de entradas: <strong className="text-success">{fmt(totais.total_receita)}</strong></span>
  ) : filtroTipo === 'DESPESA' ? (
    <span className="text-muted-foreground">Total de saidas: <strong className="text-destructive">{fmt(totais.total_despesa)}</strong></span>
  ) : (
    <span className="text-muted-foreground">Total de transferencias: <strong className="text-foreground">{fmt(totais.total_transferencia)}</strong></span>
  )}
  <span className="text-muted-foreground ml-auto">Saldo atual: <strong className={saldoAtual >= 0 ? 'text-foreground' : 'text-destructive'}>{fmt(saldoAtual)}</strong></span>
</div>
```

- [ ] **Step 6: Coluna "Saldo" na tabela**

Em `src/components/financeiro/LivroRazaoSection.tsx:616-627` (cabeçalho da tabela), adicionar a coluna após "Valor":

```tsx
<TableHeader>
  <TableRow>
    <TableHead>Data</TableHead>
    <TableHead>Descricao</TableHead>
    <TableHead>Tipo</TableHead>
    <TableHead>Origem</TableHead>
    <TableHead>Valor</TableHead>
    <TableHead>Saldo</TableHead>
    <TableHead>Status</TableHead>
    <TableHead className="w-20">Acoes</TableHead>
  </TableRow>
</TableHeader>
```

Em `src/components/financeiro/LivroRazaoSection.tsx:668-671`, adicionar a célula correspondente logo após a célula de "Valor":

```tsx
<TableCell className={`font-bold ${item.tipo === 'RECEITA' ? 'text-success' : item.tipo === 'TRANSFERENCIA' ? 'text-foreground' : 'text-destructive'}`}>
  {item.tipo === 'RECEITA' ? '+' : item.tipo === 'TRANSFERENCIA' ? '' : '-'} {fmt(item.valor)}
</TableCell>
<TableCell className={item.saldo_apos != null && item.saldo_apos < 0 ? 'text-destructive font-medium' : 'text-foreground font-medium'}>
  {item.saldo_apos != null ? fmt(item.saldo_apos) : '—'}
</TableCell>
<TableCell><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[item.status] || ''}`}>{item.status}</span></TableCell>
```

Atualizar o `colSpan` da linha vazia em `src/components/financeiro/LivroRazaoSection.tsx:632` de `7` para `8`:

```tsx
<TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum lancamento encontrado</TableCell></TableRow>
```

Atualizar `SkeletonTableRows` em `src/components/financeiro/LivroRazaoSection.tsx:69-81` de `Array(7)` para `Array(8)`:

```tsx
function SkeletonTableRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i}>
          {[...Array(8)].map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
```

- [ ] **Step 7: Rodar `tsc --noEmit` de novo**

```bash
bun x tsc --noEmit
```
Esperado: limpo.

- [ ] **Step 8: Commit**

```bash
git add src/components/financeiro/LivroRazaoSection.tsx
git commit -m "feat(financeiro): coluna de saldo por lancamento + card de saldo atual no Livro Razao"
```

---

### Task 4: `extratoParser.ts` — extração de `<LEDGERBAL>` + helper de data

**Files:**
- Modify: `src/lib/extratoParser.ts`
- Create: `src/lib/extratoParser.test.ts`

**Interfaces:**
- Produces:
  - `ExtratoParseResult.saldoFinalArquivo?: { valor: number; data: string }` (novo campo opcional, populado só por `parseOFX` quando o arquivo tem `<LEDGERBAL>`).
  - `export function diaAnterior(iso: string): string` — recebe `'yyyy-MM-dd'`, retorna o dia anterior no mesmo formato, sem risco de shift de fuso (usa componentes locais, não `new Date(iso)`).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/lib/extratoParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseExtrato, diaAnterior } from './extratoParser';

const OFX_COM_LEDGERBAL = `
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BANKID>001
<ACCTID>12345-6
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260805120000
<TRNAMT>-150.00
<MEMO>Compra cartao
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>21302.42
<DTASOF>20260805120000
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const OFX_SEM_LEDGERBAL = `
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BANKID>001
<ACCTID>12345-6
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260805120000
<TRNAMT>200.00
<MEMO>Deposito
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe('parseExtrato — extração de LEDGERBAL (OFX)', () => {
  it('extrai valor e data do bloco <LEDGERBAL> quando presente', () => {
    const result = parseExtrato('extrato.ofx', OFX_COM_LEDGERBAL);
    expect(result.saldoFinalArquivo).toEqual({ valor: 21302.42, data: '2026-08-05' });
  });

  it('não popula saldoFinalArquivo quando o arquivo não tem <LEDGERBAL>', () => {
    const result = parseExtrato('extrato.ofx', OFX_SEM_LEDGERBAL);
    expect(result.saldoFinalArquivo).toBeUndefined();
  });

  it('CSV nunca popula saldoFinalArquivo (dado não padronizado nesse formato)', () => {
    const csv = '05/08/2026;Venda;150,00\n';
    const result = parseExtrato('extrato.csv', csv);
    expect(result.saldoFinalArquivo).toBeUndefined();
  });
});

describe('diaAnterior', () => {
  it('retorna o dia anterior dentro do mesmo mês', () => {
    expect(diaAnterior('2026-08-05')).toBe('2026-08-04');
  });

  it('cruza a virada de mês corretamente', () => {
    expect(diaAnterior('2026-08-01')).toBe('2026-07-31');
  });

  it('cruza a virada de ano corretamente', () => {
    expect(diaAnterior('2026-01-01')).toBe('2025-12-31');
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```bash
bun x vitest run src/lib/extratoParser.test.ts
```
Esperado: FAIL — `diaAnterior` não existe ainda e `saldoFinalArquivo` nunca é populado.

- [ ] **Step 3: Implementar `diaAnterior` e a extração de `<LEDGERBAL>`**

Em `src/lib/extratoParser.ts`, atualizar a interface `ExtratoParseResult` (linhas 26-29):

```typescript
export interface ExtratoParseResult {
  linhas: ExtratoLinha[];
  conta: ExtratoConta;
  /** Saldo final informado no próprio arquivo (só OFX, via <LEDGERBAL>). Ausente em CSV. */
  saldoFinalArquivo?: { valor: number; data: string };
}
```

Em `parseOFX` (linhas 33-96), adicionar a extração do bloco `<LEDGERBAL>` antes do `return`:

```typescript
function parseOFX(text: string): ExtratoParseResult {
  const linhas: ExtratoLinha[] = [];

  // Extrai identidade da conta do cabeçalho (<BANKACCTFROM> ou <CCACCTFROM> para cartões)
  const conta: ExtratoConta = {};
  const acctBlock =
    text.match(/<BANKACCTFROM>([\s\S]*?)<\/BANKACCTFROM>/i)?.[1] ||
    text.match(/<CCACCTFROM>([\s\S]*?)<\/CCACCTFROM>/i)?.[1] ||
    text.match(/<BANKACCTFROM>([\s\S]*?)(?=<STMTTRNRS|<STMTRS|<CCSTMTRS|$)/i)?.[1] ||
    text.match(/<CCACCTFROM>([\s\S]*?)(?=<STMTTRNRS|<STMTRS|<CCSTMTRS|$)/i)?.[1];

  if (acctBlock) {
    const getHeaderTag = (tag: string) => {
      const m = acctBlock.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const acctId = getHeaderTag('ACCTID');
    const branchId = getHeaderTag('BRANCHID');
    const bankId = getHeaderTag('BANKID');
    if (acctId) conta.numeroConta = acctId;
    if (branchId) conta.agencia = branchId;
    if (bankId) { conta.bankId = bankId; conta.banco = bankId; }
  } else {
    const getFlat = (tag: string) => {
      const m = text.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const acctId = getFlat('ACCTID');
    const branchId = getFlat('BRANCHID');
    const bankId = getFlat('BANKID');
    if (acctId) conta.numeroConta = acctId;
    if (branchId) conta.agencia = branchId;
    if (bankId) { conta.bankId = bankId; conta.banco = bankId; }
  }

  // Saldo final do extrato (<LEDGERBAL><BALAMT>/<DTASOF>) — usado na conferência de saldo ao importar
  let saldoFinalArquivo: { valor: number; data: string } | undefined;
  const ledgerBlock =
    text.match(/<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i)?.[1] ||
    text.match(/<LEDGERBAL>([\s\S]*?)(?=<AVAILBAL|<\/STMTRS|<\/CCSTMTRS|$)/i)?.[1];
  if (ledgerBlock) {
    const getLedgerTag = (tag: string) => {
      const m = ledgerBlock.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const balAmt = getLedgerTag('BALAMT');
    const dtAsOf = getLedgerTag('DTASOF');
    if (balAmt) {
      const valor = parseFloat(balAmt.replace(',', '.'));
      if (!isNaN(valor)) {
        const data = dtAsOf.length >= 8
          ? `${dtAsOf.slice(0, 4)}-${dtAsOf.slice(4, 6)}-${dtAsOf.slice(6, 8)}`
          : '';
        if (data) saldoFinalArquivo = { valor, data };
      }
    }
  }

  // Transações
  const transactions = text.split('<STMTTRN>').slice(1);
  for (const tx of transactions) {
    const getTag = (tag: string) => {
      const m = tx.match(new RegExp(`<${tag}>([^<\\n]+)`));
      return m ? m[1].trim() : '';
    };
    const dtposted = getTag('DTPOSTED');
    const trnamt = getTag('TRNAMT');
    const memo = getTag('MEMO') || getTag('NAME') || getTag('FITID');
    if (!dtposted || !trnamt) continue;
    const valor = parseFloat(trnamt.replace(',', '.'));
    const data =
      dtposted.length >= 8
        ? `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`
        : '';
    if (!data || isNaN(valor)) continue;
    linhas.push({
      data,
      descricao: memo || 'Sem descrição',
      valor: Math.abs(valor),
      tipo: valor >= 0 ? 'RECEITA' : 'DESPESA',
    });
  }

  return { linhas, conta, saldoFinalArquivo };
}
```

No final do arquivo (`src/lib/extratoParser.ts`), adicionar a nova função exportada:

```typescript
/**
 * Retorna a data anterior (1 dia) em ISO 'yyyy-MM-dd', usando componentes
 * locais — nunca `new Date(iso)`, que é interpretado como UTC meia-noite e
 * desloca o dia no fuso BR (mesmo bug documentado para rótulos de mês).
 */
export function diaAnterior(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
```

- [ ] **Step 4: Rodar os testes de novo**

```bash
bun x vitest run src/lib/extratoParser.test.ts
```
Esperado: PASS (7 testes).

- [ ] **Step 5: Rodar `tsc --noEmit`**

```bash
bun x tsc --noEmit
```
Esperado: limpo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/extratoParser.ts src/lib/extratoParser.test.ts
git commit -m "feat(financeiro): extrai LEDGERBAL do OFX e adiciona helper diaAnterior"
```

---

### Task 5: Nova RPC `get_fin_saldo_conta_em`

**Files:**
- Create: `supabase/migrations/20260809140200_add_get_fin_saldo_conta_em.sql`

**Interfaces:**
- Consumes: nenhuma (independente das outras tasks).
- Produces: RPC `get_fin_saldo_conta_em(p_conta_id uuid, p_data date) RETURNS numeric` — saldo da conta ao final de `p_data` (inclusive), considerando `saldo_inicial` + lançamentos REALIZADO/CONCILIADO daquela conta com `data_competencia <= p_data`. Lança `NOT_FOUND` se a conta não existe/não pertence ao tenant.

- [ ] **Step 1: Escrever a migration**

Conteúdo de `supabase/migrations/20260809140200_add_get_fin_saldo_conta_em.sql`:

```sql
-- ============================================================================
-- get_fin_saldo_conta_em: saldo de uma conta específica até uma data (inclusive).
-- Usado na conferência de saldo ao importar extrato — calcula o saldo "antes
-- do período do extrato" para somar com a movimentação líquida do arquivo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_fin_saldo_conta_em(p_conta_id uuid, p_data date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company uuid;
  v_saldo_inicial numeric;
  v_saldo numeric;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:conciliacao:view', 'financeiro:conciliacao:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT c.saldo_inicial INTO v_saldo_inicial
  FROM public.fin_contas c
  WHERE c.id = p_conta_id AND c.company_id = v_company;

  IF v_saldo_inicial IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'RECEITA' THEN l.valor
      WHEN l.tipo = 'DESPESA' THEN -l.valor
      ELSE 0
    END
  ), 0) INTO v_saldo
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
    AND l.data_competencia <= p_data;

  RETURN v_saldo;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_saldo_conta_em(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_saldo_conta_em(uuid, date) TO authenticated;

DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM COALESCE(SUM(
    CASE WHEN l.tipo = 'RECEITA' THEN l.valor WHEN l.tipo = 'DESPESA' THEN -l.valor ELSE 0 END
  ), 0)
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_sentinel
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.data_competencia <= '1900-01-31'::date;
END $$;
```

- [ ] **Step 2: Aplicar via MCP Supabase**

`mcp__claude_ai_Supabase__apply_migration` com `name: "add_get_fin_saldo_conta_em"`.

- [ ] **Step 3: Reconciliar o histórico**

Mesmo processo do Task 1, Step 3, com `20260809140200`.

- [ ] **Step 4: Verificar via SQL**

```sql
select public.get_fin_saldo_conta_em('<conta_id_real>', '2026-07-31');
```
(simulando um usuário real via `request.jwt.claims`). Comparar manualmente com `SELECT saldo_inicial FROM fin_contas WHERE id='<conta_id_real>';` + `SELECT SUM(...) FROM fin_lancamentos WHERE conta_id='<conta_id_real>' AND status IN ('REALIZADO','CONCILIADO') AND data_competencia <= '2026-07-31';` rodado à mão. Também testar com um `p_conta_id` de outra empresa (deve lançar `NOT_FOUND`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260809140200_add_get_fin_saldo_conta_em.sql
git commit -m "feat(financeiro): adiciona RPC get_fin_saldo_conta_em"
```

---

### Task 6: Componente `ConfirmarSaldoExtratoDialog`

**Files:**
- Create: `src/components/financeiro/ConfirmarSaldoExtratoDialog.tsx`

**Interfaces:**
- Consumes: RPC `get_fin_saldo_conta_em(p_conta_id, p_data)` (Task 5); `diaAnterior(iso)` de `src/lib/extratoParser.ts` (Task 4).
- Produces: componente `ConfirmarSaldoExtratoDialog` com props:
  ```typescript
  interface ConfirmarSaldoExtratoDialogProps {
    open: boolean;
    nomeArquivo: string;
    periodoInicio: string; // ISO 'yyyy-MM-dd'
    periodoFim: string;    // ISO 'yyyy-MM-dd'
    deltaExtrato: number;  // soma sinalizada das linhas do arquivo (receita +, despesa -)
    saldoSugerido?: { valor: number; data: string };
    contaId: string;
    onCancel: () => void;
    onConfirmed: () => void;
  }
  ```

- [ ] **Step 1: Criar o componente**

Conteúdo de `src/components/financeiro/ConfirmarSaldoExtratoDialog.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/brl-input';
import { supabase } from '@/integrations/supabase/client';
import { diaAnterior } from '@/lib/extratoParser';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { normalizeBRLMoneyToNumber, formatNumberToBRL } from '@/lib/money';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

interface ConfirmarSaldoExtratoDialogProps {
  open: boolean;
  nomeArquivo: string;
  periodoInicio: string;
  periodoFim: string;
  deltaExtrato: number;
  saldoSugerido?: { valor: number; data: string };
  contaId: string;
  onCancel: () => void;
  onConfirmed: () => void;
}

interface Divergencia {
  informado: number;
  calculado: number;
  diferenca: number;
}

const TOLERANCIA = 0.01;

export default function ConfirmarSaldoExtratoDialog({
  open, nomeArquivo, periodoInicio, periodoFim, deltaExtrato, saldoSugerido, contaId,
  onCancel, onConfirmed,
}: ConfirmarSaldoExtratoDialogProps) {
  const [valorInput, setValorInput] = useState(() =>
    saldoSugerido ? formatNumberToBRL(saldoSugerido.valor) : ''
  );
  const [loading, setLoading] = useState(false);
  const [divergencia, setDivergencia] = useState<Divergencia | null>(null);

  const handleConfirmarValor = async () => {
    const informado = normalizeBRLMoneyToNumber(valorInput);
    if (informado == null) {
      toast.error('Informe o saldo final do extrato.');
      return;
    }

    setLoading(true);
    try {
      const dataAnterior = diaAnterior(periodoInicio);
      const { data, error } = await supabase.rpc('get_fin_saldo_conta_em', {
        p_conta_id: contaId,
        p_data: dataAnterior,
      });
      if (error) {
        toast.error('Erro ao calcular saldo: ' + error.message);
        return;
      }
      const saldoBase = Number(data) || 0;
      const calculado = saldoBase + deltaExtrato;
      const diferenca = informado - calculado;

      if (Math.abs(diferenca) < TOLERANCIA) {
        toast.success('Saldo confere!');
        onConfirmed();
      } else {
        setDivergencia({ informado, calculado, diferenca });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        {!divergencia ? (
          <>
            <DialogHeader>
              <DialogTitle>Confirme o saldo do seu extrato</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Arquivo: <span className="font-medium text-foreground">{nomeArquivo}</span>
              </p>
              <p className="text-muted-foreground">
                Período importado: <span className="font-medium text-foreground">
                  {formatDateBR(parseLocalDate(periodoInicio))} a {formatDateBR(parseLocalDate(periodoFim))}
                </span>
              </p>
              <div>
                <Label>Saldo final em {formatDateBR(parseLocalDate(periodoFim))}</Label>
                <CurrencyInput
                  value={valorInput}
                  onValueChange={(raw) => setValorInput(raw)}
                  showPrefix
                  placeholder="0,00"
                  autoFocus
                />
                {saldoSugerido && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    ⚡ Valor sugerido pelo arquivo — confira antes de confirmar.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onCancel} disabled={loading}>Cancelar</Button>
              <Button onClick={handleConfirmarValor} disabled={loading}>
                {loading ? 'Verificando...' : 'Confirmar valor'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                Saldo não confere
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="text-muted-foreground">
                  Saldo informado: <span className="font-mono font-medium text-foreground">{fmtBRL(divergencia.informado)}</span>
                </p>
                <p className="text-muted-foreground">
                  Saldo calculado pelo sistema: <span className="font-mono font-medium text-foreground">{fmtBRL(divergencia.calculado)}</span>
                </p>
                <p className="text-muted-foreground">
                  Diferença: <span className="font-mono font-semibold text-destructive">{fmtBRL(divergencia.diferenca)}</span>
                </p>
              </div>
              <p className="text-muted-foreground text-xs">
                Isso indica que pode haver lançamento(s) incorreto(s) ou faltando antes de {formatDateBR(parseLocalDate(periodoInicio))}.
                Você pode continuar a conciliação mesmo assim e investigar depois, ou cancelar para corrigir antes.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onCancel}>Cancelar importação</Button>
              <Button variant="destructive" onClick={onConfirmed}>Continuar mesmo assim</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rodar `tsc --noEmit`**

```bash
bun x tsc --noEmit
```
Esperado: limpo (o componente ainda não é usado em lugar nenhum — sem erro de import quebrado).

- [ ] **Step 3: Commit**

```bash
git add src/components/financeiro/ConfirmarSaldoExtratoDialog.tsx
git commit -m "feat(financeiro): adiciona ConfirmarSaldoExtratoDialog"
```

---

### Task 7: Integrar o diálogo de conferência de saldo em `ConciliacaoBancariaSection`

**Files:**
- Modify: `src/components/financeiro/ConciliacaoBancariaSection.tsx`

**Interfaces:**
- Consumes: `ConfirmarSaldoExtratoDialog` (Task 6); `ExtratoParseResult.saldoFinalArquivo` (Task 4).

- [ ] **Step 1: Importar o novo componente**

Em `src/components/financeiro/ConciliacaoBancariaSection.tsx:20-26` (bloco de imports), adicionar:

```typescript
import ConfirmarSaldoExtratoDialog from '@/components/financeiro/ConfirmarSaldoExtratoDialog';
```

- [ ] **Step 2: Estender o estado `contaMismatch` para carregar `saldoFinalArquivo` e o nome do arquivo**

Em `src/components/financeiro/ConciliacaoBancariaSection.tsx:174-178`, trocar:

```typescript
  // Dialogo de alerta quando o extrato não pertence à conta selecionada
  const [contaMismatch, setContaMismatch] = useState<{
    open: boolean;
    parsed: LinhaExtrato[];
    extratoInfo: ExtratoConta;
  } | null>(null);
```

por:

```typescript
  // Dialogo de alerta quando o extrato não pertence à conta selecionada
  const [contaMismatch, setContaMismatch] = useState<{
    open: boolean;
    parsed: LinhaExtrato[];
    extratoInfo: ExtratoConta;
    saldoFinalArquivo?: { valor: number; data: string };
    fileName: string;
  } | null>(null);

  // Dialogo de conferência do saldo final do extrato (dispara após a checagem de conta)
  const [confirmSaldoDialog, setConfirmSaldoDialog] = useState<{
    open: boolean;
    parsed: LinhaExtrato[];
    nomeArquivo: string;
    periodoInicio: string;
    periodoFim: string;
    deltaExtrato: number;
    saldoSugerido?: { valor: number; data: string };
  } | null>(null);
```

- [ ] **Step 3: Adicionar o helper `openConfirmSaldo`**

Em `src/components/financeiro/ConciliacaoBancariaSection.tsx`, logo antes da função `handleFile` (linha 713), adicionar:

```typescript
  const openConfirmSaldo = (
    parsed: LinhaExtrato[],
    saldoFinalArquivo: { valor: number; data: string } | undefined,
    fileName: string,
  ) => {
    const datas = parsed.map(l => l.data).sort();
    setConfirmSaldoDialog({
      open: true,
      parsed,
      nomeArquivo: fileName,
      periodoInicio: datas[0],
      periodoFim: datas[datas.length - 1],
      deltaExtrato: parsed.reduce((sum, l) => sum + (l.tipo === 'RECEITA' ? l.valor : -l.valor), 0),
      saldoSugerido: saldoFinalArquivo,
    });
  };
```

- [ ] **Step 4: Atualizar `handleFile` para abrir o diálogo de saldo em vez de conciliar direto**

Em `src/components/financeiro/ConciliacaoBancariaSection.tsx:713-752`, o corpo atual é:

```typescript
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setLoading(true);
    try {
      const text = await file.text();
      const result = parseExtrato(file.name, text);
      const parsed: LinhaExtrato[] = result.linhas.map(l => ({ ...l, selecionada: true }));

      if (parsed.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo.');
        return;
      }

      // Verifica se o extrato pertence à conta selecionada
      const contaCadastro = contas.find(c => c.id === contaSel);
      const verdict = verifyContaExtrato(result.conta, contaCadastro);

      if (verdict.status === 'mismatch') {
        // Bloqueia — abre dialog com opção de override
        setContaMismatch({ open: true, parsed, extratoInfo: result.conta });
        return;
      }

      if (verdict.status === 'unverified' && (result.conta.numeroConta || result.conta.agencia)) {
        // O extrato tem info de conta mas não foi possível comparar (ex: cadastro sem nº/agência)
        toast.warning('Não foi possível confirmar a conta do extrato — verifique se a conta selecionada está correta.');
      }

      await processarLinhas(parsed);
    } catch (err) {
      console.error('[ConciliacaoBancariaSection.handleFile]', err);
      toast.error('Erro ao processar arquivo');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
      setNomeArquivo('');
    }
  };
```

Trocar por:

```typescript
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setLoading(true);
    try {
      const text = await file.text();
      const result = parseExtrato(file.name, text);
      const parsed: LinhaExtrato[] = result.linhas.map(l => ({ ...l, selecionada: true }));

      if (parsed.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo.');
        return;
      }

      // Verifica se o extrato pertence à conta selecionada
      const contaCadastro = contas.find(c => c.id === contaSel);
      const verdict = verifyContaExtrato(result.conta, contaCadastro);

      if (verdict.status === 'mismatch') {
        // Bloqueia — abre dialog com opção de override
        setContaMismatch({
          open: true, parsed, extratoInfo: result.conta,
          saldoFinalArquivo: result.saldoFinalArquivo, fileName: file.name,
        });
        return;
      }

      if (verdict.status === 'unverified' && (result.conta.numeroConta || result.conta.agencia)) {
        // O extrato tem info de conta mas não foi possível comparar (ex: cadastro sem nº/agência)
        toast.warning('Não foi possível confirmar a conta do extrato — verifique se a conta selecionada está correta.');
      }

      openConfirmSaldo(parsed, result.saldoFinalArquivo, file.name);
    } catch (err) {
      console.error('[ConciliacaoBancariaSection.handleFile]', err);
      toast.error('Erro ao processar arquivo');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
      setNomeArquivo('');
    }
  };
```

- [ ] **Step 5: Atualizar o botão "Importar mesmo assim" do diálogo de conta divergente**

Em `src/components/financeiro/ConciliacaoBancariaSection.tsx:1846-1857`, o bloco atual é:

```tsx
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={async () => {
                  const pending = contaMismatch.parsed;
                  setContaMismatch(null);
                  setLoading(true);
                  await processarLinhas(pending);
                  setLoading(false);
                }}
              >
                Importar mesmo assim
              </AlertDialogAction>
```

Trocar por:

```tsx
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                onClick={() => {
                  const pending = contaMismatch.parsed;
                  const saldoInfo = contaMismatch.saldoFinalArquivo;
                  const fname = contaMismatch.fileName;
                  setContaMismatch(null);
                  openConfirmSaldo(pending, saldoInfo, fname);
                }}
              >
                Importar mesmo assim
              </AlertDialogAction>
```

- [ ] **Step 6: Renderizar o novo diálogo**

Em `src/components/financeiro/ConciliacaoBancariaSection.tsx`, logo após o bloco `{/* ========== CONTA MISMATCH ALERT ========== */}` (depois da linha 1861, antes de `{/* ========== EDITAR LANÇAMENTO (aba Lançamentos) ========== */}`), adicionar:

```tsx
      {/* ========== CONFERÊNCIA DE SALDO DO EXTRATO ========== */}
      {confirmSaldoDialog && (
        <ConfirmarSaldoExtratoDialog
          open={confirmSaldoDialog.open}
          nomeArquivo={confirmSaldoDialog.nomeArquivo}
          periodoInicio={confirmSaldoDialog.periodoInicio}
          periodoFim={confirmSaldoDialog.periodoFim}
          deltaExtrato={confirmSaldoDialog.deltaExtrato}
          saldoSugerido={confirmSaldoDialog.saldoSugerido}
          contaId={contaSel}
          onCancel={() => setConfirmSaldoDialog(null)}
          onConfirmed={async () => {
            const pending = confirmSaldoDialog.parsed;
            setConfirmSaldoDialog(null);
            setLoading(true);
            await processarLinhas(pending);
            setLoading(false);
          }}
        />
      )}
```

- [ ] **Step 7: Rodar `tsc --noEmit`**

```bash
bun x tsc --noEmit
```
Esperado: limpo.

- [ ] **Step 8: Commit**

```bash
git add src/components/financeiro/ConciliacaoBancariaSection.tsx
git commit -m "feat(financeiro): conferencia de saldo do extrato antes de liberar a conciliacao"
```

---

### Task 8: Verificação manual em navegador

**Files:** nenhum (só verificação).

- [ ] **Step 1: Subir o dev server**

```bash
bun run dev
```

- [ ] **Step 2: Verificar o Livro Razão**

Navegar até Financeiro → Lançamentos → Livro Razão. Confirmar:
- Coluna "Saldo" aparece em cada linha, com valores plausíveis (decrescendo conforme desce a lista, já que está ordenada da data mais recente para a mais antiga).
- Card "Saldo atual" aparece na barra de resumo.
- Trocar o filtro de conta para uma conta específica: a coluna "Saldo" e o card mudam para refletir só aquela conta.
- Voltar para "Todas contas": valores voltam a refletir a soma de todas as contas ativas.
- Trocar os filtros de Tipo/Origem: a coluna "Saldo" não muda (mesma verdade, só o conjunto de linhas visíveis muda).

- [ ] **Step 3: Verificar a conferência de saldo ao importar extrato**

Navegar até Financeiro → Lançamentos → Conciliação Bancária → Importar Extrato. Importar um arquivo de teste (CSV ou OFX) para uma conta com lançamentos já existentes. Confirmar:
- O diálogo "Confirme o saldo do seu extrato" abre antes de qualquer sugestão de conciliação aparecer.
- Informar um valor que bate com o esperado (saldo da conta até o dia anterior ao período do arquivo + soma das linhas do arquivo) → toast de sucesso, segue direto para a tela de conciliação.
- Repetir a importação informando um valor propositalmente errado → diálogo de divergência aparece com os dois valores e a diferença; "Cancelar importação" descarta e volta ao estado inicial; "Continuar mesmo assim" segue para a conciliação normalmente.
- Se tiver um arquivo OFX real com `<LEDGERBAL>`, confirmar que o campo de saldo já vem pré-preenchido.

- [ ] **Step 4: Reportar quaisquer problemas encontrados e corrigi-los antes de considerar a feature concluída.**

---

## Self-Review

- **Cobertura do spec**: Parte 1 (coluna de saldo + card) → Tasks 1–3. Parte 2 (conferência de saldo ao importar) → Tasks 4–7. Verificação manual (item citado no spec como recomendado) → Task 8. Sem gaps.
- **Placeholders**: nenhum `TBD`/`TODO` — todo código é o código final.
- **Consistência de tipos**: `saldo_apos: number | null` (Task 1 SQL → Task 3 TS) consistente. `ExtratoParseResult.saldoFinalArquivo?: { valor: number; data: string }` (Task 4) usado identicamente em `ConfirmarSaldoExtratoDialogProps.saldoSugerido` (Task 6) e no `openConfirmSaldo`/`contaMismatch.saldoFinalArquivo` (Task 7). `diaAnterior(iso: string): string` (Task 4) consumido só pelo componente da Task 6, assinatura idêntica. RPC `get_fin_saldo_conta_em(p_conta_id uuid, p_data date)` (Task 5) chamada com `{ p_conta_id: contaId, p_data: dataAnterior }` (Task 6) — nomes de parâmetro batem.
