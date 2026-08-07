# Seleção múltipla / exclusão em massa + categoria hierárquica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select + bulk delete (with "select all/deselect all") to the Categorias tree and to the "Lançamentos" tab of Conciliação Bancária, and make `CategoryCombobox` show category hierarchy (Categoria › Subcategoria) as grouped headers everywhere it's used.

**Architecture:** Three independent, additive changes on top of existing patterns — no new RPCs or migrations:
1. A new pure-function helper (`buildCategoryOptions`) computes a `groupLabel` breadcrumb for each category row from its `parent_id` chain. `CategoryCombobox` renders one `CommandGroup` per distinct `groupLabel`. Every place that fetches `fin_categorias` for a combobox pipes its rows through this helper.
2. `CadastroBaseTree` gets a `Set<string>` of selected leaf ids, a "select all / deselect all" toolbar, and a bulk-delete action that reuses the exact link-check + soft-delete logic the single-item delete already has, looped.
3. `ConciliacaoBancariaSection`'s "Lançamentos" tab gets the same selection + bulk-delete pattern, reusing the existing `_guarded_delete_lancamento` RPC and `mapFinanceiroDeleteError` helper, looped.

**Tech Stack:** React 18 + TypeScript, Supabase JS client (`@/integrations/supabase/client`), shadcn/ui (`Command`/`CommandGroup` from `cmdk`, `Checkbox`, `AlertDialog` via `useConfirmDialog`), `sonner` toasts, Vitest for pure-function unit tests.

## Global Constraints

- No new Supabase migrations, RPCs, or schema changes — every task reuses existing queries/RPCs.
- Bulk actions must have "excluir os válidos, avisar os bloqueados" semantics: never abort the whole batch because one item is blocked (decision confirmed with the user during design).
- Only leaf categories (`!hasChildren && depth > 0`, same rule as today's single-delete button) are selectable for bulk delete in the Categorias tree — no cascading delete.
- This codebase has no component-test harness (no `.test.tsx` files, no React Testing Library usage found) — its established verification pattern for UI work is `tsc --noEmit` + manual browser check (see CLAUDE.md history). Follow that pattern for the UI tasks (2, 4, 5). Vitest **is** set up for pure-function logic (see `src/domain/compras/cotacaoOptimizer.test.ts`) — use real TDD for the pure-function task (1).
- This project uses **Bun** as its package manager. Use `bun x <tool>` for one-off tool invocations (`bun x tsc --noEmit`, `bun x vitest run`, `bun x eslint .`) — **not** `npx`, which in this environment tries to fetch a decoy `tsc` package from the registry instead of resolving the locally installed one.
- Run `bun x tsc --noEmit` at the end of every task; it must be clean before moving on.
- Toasts: this file already uses `toast.success` / `toast.error` / `toast.warning` (sonner) — reuse the same three, don't introduce new toast styles.
- Known pre-existing baseline issue (not caused by this plan, do not try to fix it): `bun x vitest run` fails one suite, `src/test/nova-movimentacao-modal.test.tsx`, with `Error: supabaseUrl is required.` — a missing env var in this sandbox, unrelated to any code here. Baseline is otherwise 193 passed / 15 suites passed. If your task's test run shows exactly this one pre-existing failure and nothing else new, that's a clean pass for your purposes.

---

## File Structure

| File | Change |
|---|---|
| `src/lib/categoriaOptions.ts` | **Create.** `buildCategoryOptions()` pure function + `CategoriaHierarchyRow` type. |
| `src/lib/categoriaOptions.test.ts` | **Create.** Vitest unit tests for the helper. |
| `src/components/financeiro/CategoryCombobox.tsx` | **Modify.** Render options grouped by `groupLabel` instead of one flat list. |
| `src/components/financeiro/ConciliacaoBancariaSection.tsx` | **Modify (twice, unrelated regions).** (a) query gains `parent_id` + pipes through `buildCategoryOptions`; (b) "Lançamentos" tab gains multi-select + bulk delete. |
| `src/components/financeiro/CriarLancamentoExtratoDialog.tsx` | **Modify.** query gains `parent_id` + pipes through `buildCategoryOptions`. |
| `src/components/financeiro/ContasPagarSection.tsx` | **Modify.** query + local `Categoria` type gain `parent_id`; pipes through `buildCategoryOptions`. |
| `src/components/financeiro/ContasReceberSection.tsx` | **Modify.** Same as above. |
| `src/components/financeiro/LivroRazaoSection.tsx` | **Modify.** Same as above (local type is `CategoriaRef`). |
| `src/components/financeiro/CadastroBaseTree.tsx` | **Modify.** Adds `selectedIds` state, per-leaf checkboxes, "Selecionar Todas/Desmarcar/Excluir Selecionadas" toolbar, `handleBulkDelete`. |

**Note on scope vs. the approved spec:** the spec said "~7 call sites" for `CategoryCombobox`, based on an earlier survey that turned out to be imprecise. Ground truth (verified by `grep -rl CategoryCombobox src`): only 3 files actually render `<CategoryCombobox>` — `ConciliacaoBancariaSection.tsx`, `CriarLancamentoExtratoDialog.tsx`, and the shared `ContaFormDialog.tsx` (used by `ContasPagarSection`, `ContasReceberSection`, `LivroRazaoSection`, and Conciliação's own "editar lançamento" dialog). `CategorizacaoSection.tsx` and `OrcamentoSection.tsx` use a plain shadcn `<Select>` for category, not `CategoryCombobox` — they're out of scope (not touched by this plan; flag to the user separately if they still want those two converted to `CategoryCombobox`, which would be a different, bigger change). This plan updates all 5 real fetch sites that feed `CategoryCombobox`, which covers 100% of its actual usages including through `ContaFormDialog`.

---

### Task 1: `buildCategoryOptions` shared helper

**Files:**
- Create: `src/lib/categoriaOptions.ts`
- Test: `src/lib/categoriaOptions.test.ts`

**Interfaces:**
- Produces: `CategoriaHierarchyRow` interface `{ id: string; nome: string; parent_id: string | null; tipo?: string | null; codigo?: string | null }` and `buildCategoryOptions<T extends CategoriaHierarchyRow>(rows: T[]): (T & { groupLabel: string })[]`. Task 2 consumes the `groupLabel` field shape (via its own `CategoryOption` type, no import needed). Task 3 imports and calls `buildCategoryOptions` directly.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/categoriaOptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCategoryOptions } from './categoriaOptions';

describe('buildCategoryOptions', () => {
  it('gives an empty groupLabel to top-level categories (no parent)', () => {
    const rows = [{ id: '1', nome: 'CMV', parent_id: null }];
    const result = buildCategoryOptions(rows);
    expect(result[0].groupLabel).toBe('');
  });

  it('builds a "Categoria › Subcategoria" path for a 3-level chain', () => {
    const rows = [
      { id: 'cmv', nome: 'CMV', parent_id: null },
      { id: 'peixes', nome: 'PEIXES', parent_id: 'cmv' },
      { id: 'salmao', nome: 'SALMAO', parent_id: 'peixes' },
    ];
    const result = buildCategoryOptions(rows);
    const byId = Object.fromEntries(result.map(r => [r.id, r]));
    expect(byId.cmv.groupLabel).toBe('');
    expect(byId.peixes.groupLabel).toBe('CMV');
    expect(byId.salmao.groupLabel).toBe('CMV › PEIXES');
  });

  it('preserves the original fields of each row alongside groupLabel', () => {
    const rows = [{ id: '1', nome: 'CMV', codigo: '2', tipo: 'despesa', parent_id: null, centro_custo_padrao_id: null }];
    const result = buildCategoryOptions(rows);
    expect(result[0]).toMatchObject({
      id: '1', nome: 'CMV', codigo: '2', tipo: 'despesa',
      parent_id: null, centro_custo_padrao_id: null, groupLabel: '',
    });
  });

  it('stops gracefully when parent_id points to a row that is not in the list', () => {
    const rows = [{ id: 'salmao', nome: 'SALMAO', parent_id: 'peixes-nao-carregado' }];
    const result = buildCategoryOptions(rows);
    expect(result[0].groupLabel).toBe('');
  });

  it('does not loop forever when the parent_id chain has a cycle', () => {
    const rows = [
      { id: 'a', nome: 'A', parent_id: 'b' },
      { id: 'b', nome: 'B', parent_id: 'a' },
    ];
    const result = buildCategoryOptions(rows);
    const byId = Object.fromEntries(result.map(r => [r.id, r]));
    expect(byId.a.groupLabel).toBe('B');
    expect(byId.b.groupLabel).toBe('A');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun x vitest run src/lib/categoriaOptions.test.ts`
Expected: FAIL — `Cannot find module './categoriaOptions'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/categoriaOptions.ts`:

```ts
export interface CategoriaHierarchyRow {
  id: string;
  nome: string;
  parent_id: string | null;
  tipo?: string | null;
  codigo?: string | null;
}

/**
 * Anexa um `groupLabel` (breadcrumb "Categoria › Subcategoria", vazio para itens de topo)
 * a cada linha, calculado a partir da cadeia de `parent_id`. Usado para agrupar visualmente
 * o CategoryCombobox por hierarquia (ver CLAUDE.md — árvore de Categorias).
 */
export function buildCategoryOptions<T extends CategoriaHierarchyRow>(rows: T[]): (T & { groupLabel: string })[] {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(row.id, row);

  const ancestorNames = (row: T): string[] => {
    const names: string[] = [];
    const visited = new Set<string>([row.id]);
    let current = row.parent_id ? byId.get(row.parent_id) : undefined;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      names.unshift(current.nome);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return names;
  };

  return rows.map(row => ({ ...row, groupLabel: ancestorNames(row).join(' › ') }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun x vitest run src/lib/categoriaOptions.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categoriaOptions.ts src/lib/categoriaOptions.test.ts
git commit -m "feat(financeiro): adiciona buildCategoryOptions para hierarquia de categorias"
```

---

### Task 2: Grouped rendering in `CategoryCombobox`

**Files:**
- Modify: `src/components/financeiro/CategoryCombobox.tsx`

**Interfaces:**
- Consumes: nothing new (no import from Task 1 — `CategoryOption` just grows an optional `groupLabel?: string` field; the actual population happens in Task 3).
- Produces: no new exports; `CategoryOption` interface now has `groupLabel?: string`, which Task 3's callers rely on being rendered correctly.

- [ ] **Step 1: Update the `CategoryOption` interface**

In `src/components/financeiro/CategoryCombobox.tsx`, replace:

```tsx
interface CategoryOption {
  id: string;
  nome: string;
  tipo?: string;
  codigo?: string;
}
```

with:

```tsx
interface CategoryOption {
  id: string;
  nome: string;
  tipo?: string;
  codigo?: string;
  groupLabel?: string;
}
```

- [ ] **Step 2: Group options by `groupLabel` before rendering**

Still in `CategoryCombobox.tsx`, inside the component body, right after the existing `const selected = useMemo(...)` line, add:

```tsx
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, CategoryOption[]>();
    for (const opt of options) {
      const key = opt.groupLabel || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(opt);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [options]);
```

- [ ] **Step 3: Render one `CommandGroup` per group**

Replace the current single-group render:

```tsx
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt.id}
                  value={opt.codigo ? `${opt.codigo} ${opt.nome}` : opt.nome}
                  onSelect={() => {
                    onValueChange(opt.id === value ? '' : opt.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-3 w-3', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate text-xs">
                    {opt.codigo ? `${opt.codigo} — ${opt.nome}` : opt.nome}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
```

with:

```tsx
            {groupedOptions.map(([groupLabel, opts]) => (
              <CommandGroup key={groupLabel || '__root__'} heading={groupLabel || undefined}>
                {opts.map(opt => (
                  <CommandItem
                    key={opt.id}
                    value={opt.codigo ? `${opt.codigo} ${opt.nome}` : opt.nome}
                    onSelect={() => {
                      onValueChange(opt.id === value ? '' : opt.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-3 w-3', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate text-xs">
                      {opt.codigo ? `${opt.codigo} — ${opt.nome}` : opt.nome}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
```

(`useMemo` is already imported at the top of this file — `import { useState, useMemo } from 'react';` — no import changes needed.)

- [ ] **Step 4: Verify it compiles and doesn't regress current callers**

Run: `bun x tsc --noEmit`
Expected: no new errors. At this point no caller populates `groupLabel` yet (Task 3 does that), so every combobox in the app should look **exactly the same as before** — one flat, unheaded group. This is the backward-compatible checkpoint: confirm in the browser that a category picker (e.g. Contas a Pagar → Nova conta → Categoria) still opens and filters normally before moving on.

- [ ] **Step 5: Commit**

```bash
git add src/components/financeiro/CategoryCombobox.tsx
git commit -m "feat(financeiro): CategoryCombobox agrupa opcoes por groupLabel"
```

---

### Task 3: Wire `parent_id` + `buildCategoryOptions` into the 5 fetch sites

**Files:**
- Modify: `src/components/financeiro/ConciliacaoBancariaSection.tsx:24,193-199`
- Modify: `src/components/financeiro/CriarLancamentoExtratoDialog.tsx:16,77-85`
- Modify: `src/components/financeiro/ContasPagarSection.tsx:22,37,138-144`
- Modify: `src/components/financeiro/ContasReceberSection.tsx:22,37,133-138`
- Modify: `src/components/financeiro/LivroRazaoSection.tsx:22,53,203-210`

**Interfaces:**
- Consumes: `buildCategoryOptions` from `@/lib/categoriaOptions` (Task 1).
- Produces: none — this is the last hop; after this task, every `CategoryCombobox` in the app renders grouped by category hierarchy.

- [ ] **Step 1: `ConciliacaoBancariaSection.tsx`**

Add the import, right after the existing `mapFinanceiroDeleteError` import (around line 24):

```ts
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
```

Then update the category query and its consumer (around lines 193-199), replacing:

```ts
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
    ]).then(([catRes, ccRes]) => {
      setCategorias(catRes.data || []);
      setCentrosCusto(ccRes.data || []);
    });
```

with:

```ts
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
    ]).then(([catRes, ccRes]) => {
      setCategorias(buildCategoryOptions(catRes.data || []));
      setCentrosCusto(ccRes.data || []);
    });
```

This single change flows through to all 3 places this file uses categories: the inline picker (`categoriasForTipo`, ~line 1176), the rateio dialog (~line 1483), and the `categorias` prop passed into `<ContaFormDialog>` (~line 1776) — none of those call sites need their own edits, they all read from the same `categorias` state.

- [ ] **Step 2: `CriarLancamentoExtratoDialog.tsx`**

Add the import after the `CategoryCombobox` import (around line 16):

```ts
import CategoryCombobox from '@/components/financeiro/CategoryCombobox';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
```

Update the query (around lines 77-85), replacing:

```ts
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('suppliers').select('id, name').order('name'),
    ]).then(([catRes, ccRes, supRes]) => {
      setCategorias(catRes.data || []);
      setCentrosCusto(ccRes.data || []);
      setSuppliers((supRes.data || []).map((s: any) => ({ id: s.id, name: s.name })));
    });
```

with:

```ts
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('suppliers').select('id, name').order('name'),
    ]).then(([catRes, ccRes, supRes]) => {
      setCategorias(buildCategoryOptions(catRes.data || []));
      setCentrosCusto(ccRes.data || []);
      setSuppliers((supRes.data || []).map((s: any) => ({ id: s.id, name: s.name })));
    });
```

(`categorias` state here is `useState<any[]>([])`, so no type changes needed — `filteredCategorias`, used by both `CategoryCombobox` calls in this file, derives from `categorias` and keeps `groupLabel` automatically.)

- [ ] **Step 3: `ContasPagarSection.tsx`**

Add the import after `mapFinanceiroDeleteError` (around line 22):

```ts
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
```

Add `parent_id` to the local `Categoria` interface (line 37), replacing:

```ts
interface Categoria { id: string; nome: string; tipo: string; codigo: string | null; centro_custo_padrao_id: string | null; }
```

with:

```ts
interface Categoria { id: string; nome: string; tipo: string; codigo: string | null; parent_id: string | null; centro_custo_padrao_id: string | null; }
```

Update the query and its consumer (around lines 138-144), replacing:

```ts
    const [catRes, ccRes, contRes, supRes] = await Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
    ]);
    setCategorias((catRes.data as Categoria[]) || []);
```

with:

```ts
    const [catRes, ccRes, contRes, supRes] = await Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
    ]);
    setCategorias(buildCategoryOptions((catRes.data as Categoria[]) || []));
```

(This feeds `<ContaFormDialog categorias={categorias} .../>` around line 602 — no change needed there.)

- [ ] **Step 4: `ContasReceberSection.tsx`**

Same pattern as Step 3. Add the import after `mapFinanceiroDeleteError` (around line 22). Update the local `Categoria` interface (line 37) the same way. Update the query and consumer (around lines 133-138), replacing:

```ts
    const [catRes, ccRes, contRes] = await Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setCategorias((catRes.data as Categoria[]) || []);
```

with:

```ts
    const [catRes, ccRes, contRes] = await Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setCategorias(buildCategoryOptions((catRes.data as Categoria[]) || []));
```

(Feeds `<ContaFormDialog categorias={categorias} .../>` around line 551 — no change needed there.)

- [ ] **Step 5: `LivroRazaoSection.tsx`**

Add the import after `import * as XLSX from '@/lib/safeXlsx';` (around line 22):

```ts
import * as XLSX from '@/lib/safeXlsx';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
```

Add `parent_id` to the local `CategoriaRef` interface (line 53), replacing:

```ts
interface CategoriaRef { id: string; nome: string; tipo: string; centro_custo_padrao_id: string | null }
```

with:

```ts
interface CategoriaRef { id: string; nome: string; tipo: string; parent_id: string | null; centro_custo_padrao_id: string | null }
```

Update the query and consumer (around lines 203-210), replacing:

```ts
    const [_, catRes, ccRes, contRes] = await Promise.all([
      loadPage(null, null),
      supabase.from('fin_categorias').select('id, nome, tipo, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
      loadTotais(),
    ]);
    setCategorias((catRes.data as CategoriaRef[]) || []);
```

with:

```ts
    const [_, catRes, ccRes, contRes] = await Promise.all([
      loadPage(null, null),
      supabase.from('fin_categorias').select('id, nome, tipo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
      loadTotais(),
    ]);
    setCategorias(buildCategoryOptions((catRes.data as CategoriaRef[]) || []));
```

(Feeds `<ContaFormDialog categorias={categorias} .../>` around line 721 — no change needed there.)

- [ ] **Step 6: Verify compilation**

Run: `bun x tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 7: Manual verification (browser)**

Start the dev server (`bun run dev`), log in, and check the grouped dropdown in at least two of these spots:
1. Financeiro → Conciliação Bancária → aba "Importar" → pick a bank line with no match → open the inline category picker → confirm you see headings like "CMV › PEIXES" with SALMAO/TILAPIA/ATUM/PEIXES GERAIS underneath.
2. Financeiro → Contas a Pagar → "Nova Conta" (Boleto) → Categoria field → same check.
3. Type part of an item name (e.g. "salmao") in either picker and confirm only the matching group + item show up.

- [ ] **Step 8: Commit**

```bash
git add src/components/financeiro/ConciliacaoBancariaSection.tsx src/components/financeiro/CriarLancamentoExtratoDialog.tsx src/components/financeiro/ContasPagarSection.tsx src/components/financeiro/ContasReceberSection.tsx src/components/financeiro/LivroRazaoSection.tsx
git commit -m "feat(financeiro): seletor de categoria mostra hierarquia Categoria > Subcategoria"
```

---

### Task 4: Multi-select + bulk delete in the Categorias tree (`CadastroBaseTree.tsx`)

**Files:**
- Modify: `src/components/financeiro/CadastroBaseTree.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (fully independent).
- Produces: nothing consumed elsewhere — self-contained UI feature.

- [ ] **Step 1: Import `Checkbox`**

Add to the imports (after the `Skeleton` import, around line 15):

```tsx
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
```

- [ ] **Step 2: Add a `collectLeafIds` helper next to the other tree helpers**

Right after the `filterTree` function (after its closing `}` around line 99), add:

```ts
function collectLeafIds(nodes: CatNode[], depth = 0): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children.length === 0 && depth > 0) ids.push(node.id);
    ids.push(...collectLeafIds(node.children, depth + 1));
  }
  return ids;
}
```

This mirrors the exact leaf rule `TreeRow` already uses (`isLeaf = !hasChildren && depth > 0`) so bulk selection never includes a node the UI wouldn't otherwise let you delete one-by-one.

- [ ] **Step 3: Thread selection props through `TreeRow`**

In the `TreeRowProps` interface, add two props, right after `onDelete`:

```ts
  onDelete: (node: CatNode) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
```

Update the `TreeRow` function signature to destructure them:

```tsx
function TreeRow({
  node, depth, expanded, toggleExpand, onEdit, onAdd, onDelete, onMove,
  canEdit, canCreate, canDelete, saving, isFirst, isLast,
  dragCtx, onDragStart, onDragOver, onDragEnd, onDrop,
  selectedIds, onToggleSelect,
}: TreeRowProps) {
```

Insert a checkbox right after the expand/collapse `<button>` closes (after line 229, i.e. right before the `<span className="font-mono text-xs ...">{node.codigo}</span>` line):

```tsx
        {canDelete && isLeaf && (
          <Checkbox
            checked={selectedIds.has(node.id)}
            onCheckedChange={() => onToggleSelect(node.id)}
            disabled={saving}
            className="shrink-0"
            aria-label={`Selecionar ${node.nome}`}
          />
        )}

        <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">{node.codigo}</span>
```

Thread the two new props into the recursive call to `<TreeRow>` for children (inside the `{isExpanded && node.children.map(...)}` block, alongside the other passed props):

```tsx
          onDragEnd={onDragEnd}
          onDrop={onDrop}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
```

- [ ] **Step 4: Add `selectedIds` state and selection helpers to the main component**

Add state right after the `dragCtx` state declaration (after its closing `});`, around line 351):

```ts
  const [dragCtx, setDragCtx] = useState<DragContext>({
    dragId: null, dragTipo: null, dragParentId: null, dropTargetId: null,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

Add a toggle handler and a "select all" handler right after `collapseAll` (around line 383):

```ts
  const expandAll = () => setExpanded(new Set(items.map(i => i.id)));
  const collapseAll = () => setExpanded(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllLeaves = () => setSelectedIds(new Set(collectLeafIds(filteredTree)));
  const deselectAll = () => setSelectedIds(new Set());
```

- [ ] **Step 5: Add `handleBulkDelete`**

Right after `handleDelete` (after its closing `};`, around line 525), add:

```ts
  // ─── Bulk delete (multi-select) ───
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const ok = await confirm({
      title: 'Excluir categorias selecionadas',
      description: `Deseja desativar ${ids.length} categoria(s) selecionada(s)? Esta ação pode ser revertida.`,
      variant: 'destructive',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;

    setSaving(true);
    try {
      const excluidas: string[] = [];
      const bloqueadas: string[] = [];

      for (const id of ids) {
        const nome = items.find(i => i.id === id)?.nome || id;

        const [lancRes, rateioRes] = await Promise.all([
          supabase.from('fin_lancamentos').select('id').eq('categoria_id', id).limit(1),
          supabase.from('fin_lancamento_rateios').select('id').eq('categoria_id', id).limit(1),
        ]);
        if ((lancRes.data && lancRes.data.length > 0) || (rateioRes.data && rateioRes.data.length > 0)) {
          bloqueadas.push(`${nome} (vinculada a lançamentos)`);
          continue;
        }

        const { error } = await supabase.from('fin_categorias').update({ ativo: false }).eq('id', id);
        if (error) {
          bloqueadas.push(`${nome} (${error.message})`);
          continue;
        }
        excluidas.push(id);
      }

      setSelectedIds(new Set());

      if (bloqueadas.length === 0) {
        toast.success(`${excluidas.length} categoria(s) excluída(s)`);
      } else if (excluidas.length === 0) {
        toast.error(`Nenhuma categoria excluída. Bloqueadas: ${bloqueadas.join('; ')}`);
      } else {
        toast.warning(`${excluidas.length} excluída(s), ${bloqueadas.length} bloqueada(s): ${bloqueadas.join('; ')}`);
      }

      load();
      emitDataEvent('financeiro:cadastros');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 6: Add the toolbar buttons**

In the header toolbar (around lines 663-681), replace:

```tsx
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>Expandir Tudo</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Recolher</Button>
          {canExport && (
```

with:

```tsx
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={expandAll}>Expandir Tudo</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Recolher</Button>
          {canDelete && collectLeafIds(filteredTree).length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={selectAllLeaves}>Selecionar Todas</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>Desmarcar</Button>
            </>
          )}
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={saving}>
              <Trash2 className="w-4 h-4 mr-1" /> Excluir Selecionadas ({selectedIds.size})
            </Button>
          )}
          {canExport && (
```

- [ ] **Step 7: Pass the new props at the top-level `<TreeRow>` render**

In the `filteredTree.map((node, idx) => ( <TreeRow ... /> ))` block (around lines 712-734), add the two new props alongside the existing ones:

```tsx
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
```

- [ ] **Step 8: Verify compilation**

Run: `bun x tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 9: Manual verification (browser)**

Start the dev server, go to Financeiro → Estrutura de Categorias:
1. Confirm checkboxes appear only on leaf rows (items like SALMAO), not on CMV/PEIXES.
2. Click "Selecionar Todas" → all leaf checkboxes check, "Excluir Selecionadas (N)" button appears with the right count.
3. Click "Desmarcar" → all uncheck, bulk-delete button disappears.
4. Manually check 2 unrelated leaves with no linked lançamentos → click "Excluir Selecionadas (2)" → confirm dialog → confirm → both rows disappear, toast says "2 categoria(s) excluída(s)".
5. If you have a category with linked lançamentos, check it together with a free one and bulk-delete → confirm the free one is removed and a toast reports the other as blocked, without erroring out.

- [ ] **Step 10: Commit**

```bash
git add src/components/financeiro/CadastroBaseTree.tsx
git commit -m "feat(financeiro): selecao multipla e exclusao em massa na arvore de Categorias"
```

---

### Task 5: Multi-select + bulk delete in the "Lançamentos" tab (`ConciliacaoBancariaSection.tsx`)

**Files:**
- Modify: `src/components/financeiro/ConciliacaoBancariaSection.tsx`

**Interfaces:**
- Consumes: nothing from other tasks (touches a different region of the file than Task 3; both are safe to do in either order).
- Produces: nothing consumed elsewhere — self-contained UI feature.

- [ ] **Step 1: Add selection state**

Right after the `totalConciliadosConta` state (around line 136), add:

```ts
  const [totalPendentesConta, setTotalPendentesConta] = useState(0);
  const [totalConciliadosConta, setTotalConciliadosConta] = useState(0);
  const [selectedLancamentoIds, setSelectedLancamentoIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Extract the filtered-lançamentos list into a variable**

Right after the existing `const pendentes = lancamentos.filter(l => !l.conciliado).length;` line (around line 952), add:

```ts
  const pendentes = lancamentos.filter(l => !l.conciliado).length;
  const lancamentosFiltrados = lancamentos.filter(l => {
    if (filtro === 'pendentes') return !l.conciliado;
    if (filtro === 'conciliados') return !!l.conciliado;
    return true;
  });
```

- [ ] **Step 3: Add `toggleAllLancamentos` and `bulkDeleteLancamentos`**

Right after `deleteLancamentoConciliacao` (after its closing `};`, around line 429), add:

```ts
  const bulkDeleteLancamentos = async () => {
    if (selectedLancamentoIds.size === 0) return;
    const selecionados = lancamentos.filter(l => selectedLancamentoIds.has(l.id));

    const ok = await confirmDelete({
      title: 'Excluir lançamentos selecionados',
      description: `Tem certeza que deseja excluir ${selecionados.length} lançamento(s)? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'destructive',
    });
    if (!ok) return;

    setEditSaving(true);
    try {
      const excluidosIds: string[] = [];
      const bloqueados: string[] = [];

      for (const item of selecionados) {
        if (item.conciliado) {
          bloqueados.push(`${item.descricao} (desconcilie antes de excluir)`);
          continue;
        }
        if (item.origem === 'espelho_cp' || item.origem === 'espelho_cr') {
          bloqueados.push(`${item.descricao} (é espelho de Conta a Pagar/Receber)`);
          continue;
        }
        const { error } = await supabase.rpc('_guarded_delete_lancamento' as any, {
          p_id: item.id,
          p_expected_updated_at: item.updated_at,
        } as any);
        if (error) {
          console.error('[ConciliacaoBancariaSection.bulkDeleteLancamentos]', error);
          bloqueados.push(`${item.descricao} (${mapFinanceiroDeleteError(error)})`);
          continue;
        }
        excluidosIds.push(item.id);
      }

      if (excluidosIds.length > 0) {
        setLancamentos(prev => prev.filter(l => !excluidosIds.includes(l.id)));
      }
      setSelectedLancamentoIds(new Set());

      if (bloqueados.length === 0) {
        toast.success(`${excluidosIds.length} lançamento(s) excluído(s)`);
      } else if (excluidosIds.length === 0) {
        toast.error(`Nenhum lançamento excluído. Bloqueados: ${bloqueados.join('; ')}`);
      } else {
        toast.warning(`${excluidosIds.length} excluído(s), ${bloqueados.length} bloqueado(s): ${bloqueados.join('; ')}`);
      }

      emitDataEvent('financeiro:conciliacao');
      emitDataEvent('financeiro:lancamentos');
      refreshLockedLinhas();
      loadLancamentosCounts();
    } finally {
      setEditSaving(false);
    }
  };
```

Right after `conciliarTodos` (after its closing `};`, around line 445), add:

```ts
  const toggleAllLancamentos = (checked: boolean) => {
    if (!checked) { setSelectedLancamentoIds(new Set()); return; }
    const selectableIds = lancamentosFiltrados
      .filter(l => !l.conciliado && l.origem !== 'espelho_cp' && l.origem !== 'espelho_cr')
      .map(l => l.id);
    setSelectedLancamentoIds(new Set(selectableIds));
  };
```

(`lancamentosFiltrados` is declared later in the file as a `const`, but since these are all function declarations inside the same component body evaluated top-to-bottom on every render, and `toggleAllLancamentos` only *reads* `lancamentosFiltrados` when it's *called* — not when it's defined — this is safe. If you want to avoid relying on that, move this function down next to `lancamentosFiltrados` instead; both work.)

- [ ] **Step 4: Add the toolbar buttons**

In the "Lançamentos" tab toolbar (around lines 1283-1300), replace:

```tsx
            <div className="flex items-center gap-2">
              <Select value={filtro} onValueChange={v => setFiltro(v as 'pendentes' | 'conciliados' | 'todos')}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendentes">Pendentes</SelectItem>
                  <SelectItem value="conciliados">Conciliados</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadLancamentos}>
                <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
              </Button>
              {filtro === 'pendentes' && pendentes > 0 && (
                <Button size="sm" onClick={conciliarTodos}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Conciliar Todos
                </Button>
              )}
            </div>
```

with:

```tsx
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={filtro} onValueChange={v => setFiltro(v as 'pendentes' | 'conciliados' | 'todos')}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendentes">Pendentes</SelectItem>
                  <SelectItem value="conciliados">Conciliados</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadLancamentos}>
                <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
              </Button>
              {filtro === 'pendentes' && pendentes > 0 && (
                <Button size="sm" onClick={conciliarTodos}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Conciliar Todos
                </Button>
              )}
              {lancamentosFiltrados.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => toggleAllLancamentos(true)}>Selecionar Todos</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAllLancamentos(false)}>Desmarcar</Button>
                </>
              )}
              {selectedLancamentoIds.size > 0 && (
                <Button variant="destructive" size="sm" onClick={bulkDeleteLancamentos} disabled={editSaving}>
                  <Trash2 className="w-4 h-4 mr-1" /> Excluir Selecionados ({selectedLancamentoIds.size})
                </Button>
              )}
            </div>
```

- [ ] **Step 5: Add a selection column to the table**

Replace the table header (around lines 1303-1315):

```tsx
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">✓</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
```

with:

```tsx
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-10">✓</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
```

- [ ] **Step 6: Update the body — colSpan, row source, and the new checkbox cell**

Replace the table body opening (around lines 1316-1332):

```tsx
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : lancamentos.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {contaSel ? 'Nenhum lançamento encontrado' : 'Selecione uma conta bancária'}
                </TableCell></TableRow>
              ) : lancamentos
                  .filter(l => {
                    if (filtro === 'pendentes') return !l.conciliado;
                    if (filtro === 'conciliados') return !!l.conciliado;
                    return true;
                  })
                  .map(item => {
                const categoriaNome = categorias.find(c => c.id === item.categoria_id)?.nome;
                return (
                <TableRow key={item.id} className={item.conciliado ? 'opacity-80' : ''}>
                  <TableCell>
                    <Checkbox checked={!!item.conciliado} onCheckedChange={(v) => conciliar(item.id, !!v)} />
                  </TableCell>
```

with:

```tsx
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : lancamentos.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {contaSel ? 'Nenhum lançamento encontrado' : 'Selecione uma conta bancária'}
                </TableCell></TableRow>
              ) : lancamentosFiltrados.map(item => {
                const categoriaNome = categorias.find(c => c.id === item.categoria_id)?.nome;
                return (
                <TableRow key={item.id} className={item.conciliado ? 'opacity-80' : ''}>
                  <TableCell>
                    <Checkbox
                      checked={selectedLancamentoIds.has(item.id)}
                      onCheckedChange={(v) => setSelectedLancamentoIds(prev => {
                        const next = new Set(prev);
                        if (v) next.add(item.id); else next.delete(item.id);
                        return next;
                      })}
                      aria-label={`Selecionar ${item.descricao}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox checked={!!item.conciliado} onCheckedChange={(v) => conciliar(item.id, !!v)} />
                  </TableCell>
```

- [ ] **Step 7: Verify compilation**

Run: `bun x tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 8: Manual verification (browser)**

Financeiro → Conciliação Bancária → aba "Lançamentos":
1. Confirm there are now two checkbox columns per row: a new blank-header one (selection) and the existing "✓" one (conciliar toggle) — clicking one must not affect the other.
2. "Selecionar Todos" checks every row currently visible under the active filter (Pendentes/Conciliados/Todos) except ones that are conciliado or an espelho — "Excluir Selecionados (N)" appears with the right count.
3. "Desmarcar" clears the selection.
4. Select 2 unrelated pending lançamentos with no blockers → bulk delete → confirm → both disappear, toast says "2 lançamento(s) excluído(s)".
5. Select one conciliado lançamento (switch filtro to "Conciliados" or "Todos" first) together with a free pending one → bulk delete → confirm the free one is removed and the conciliado one is reported as blocked ("desconcilie antes de excluir"), no crash.

- [ ] **Step 9: Commit**

```bash
git add src/components/financeiro/ConciliacaoBancariaSection.tsx
git commit -m "feat(financeiro): selecao multipla e exclusao em massa na aba Lancamentos da Conciliacao"
```

---

### Task 6: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `bun x tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Full unit test run**

Run: `bun x vitest run`
Expected: all green except the one pre-existing, unrelated failure documented in Global Constraints (`src/test/nova-movimentacao-modal.test.tsx`, missing `SUPABASE_URL` env var). Confirm the 5 new `categoriaOptions.test.ts` cases pass and the pre-existing `cotacaoOptimizer.test.ts` suite still passes (make sure nothing was broken).

- [ ] **Step 3: Lint**

Run: `bun x eslint .`
Expected: no new errors introduced by this change (pre-existing warnings elsewhere in the repo, if any, are out of scope).

- [ ] **Step 4: End-to-end manual smoke test**

With the dev server running, re-walk the three features once end-to-end in the same session (not just per-task in isolation), since Tasks 1-3 and 4-5 touch overlapping files:
1. Estrutura de Categorias: select 2 leaves across two different subcategorias (e.g. one under CMV/PEIXES, one elsewhere), bulk-delete, confirm both gone.
2. Conciliação Bancária → Lançamentos: select 2 lançamentos, bulk-delete, confirm both gone; confirm the "✓" conciliar checkbox still works independently.
3. Open the category picker in Conciliação Bancária's "Importar" tab and in Contas a Pagar → confirm both show the same grouped hierarchy.

- [ ] **Step 5: Update CLAUDE.md**

Per this project's convention ("Após fazer qualquer alteração significativa, atualize a seção Pendente / Em Aberto deste arquivo"), add an entry to the "Pendente / Em Aberto" section of `CLAUDE.md` summarizing what shipped (bulk delete on Categorias tree + Lançamentos tab, hierarchical category picker) and noting the scope correction (CategorizacaoSection/OrcamentoSection still use plain `Select`, not `CategoryCombobox`).
