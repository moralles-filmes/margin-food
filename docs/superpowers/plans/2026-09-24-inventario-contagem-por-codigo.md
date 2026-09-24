# Inventário — Contagem via Código de Barras (Fase 1–3: leitor físico + manual) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose, right after filling in the existing inventory creation form, between "Contagem por Lista" (today's flow, untouched) and "Contagem via Código" — a new screen where scanning a barcode with a physical HID reader or typing it manually finds the product and adds +1 to its counted quantity, using the exact same persistence, optimistic lock, and finalization RPCs the list flow already uses.

**Architecture:** Extend the existing "complete" inventory flow (`inventarios` / `inventario_itens` / `update_contagem` / `finalize_inventory_atomic`) instead of building a parallel data model — confirmed in the Fase 0 audit that `create_quick_inventory_atomic` (Inventário Rápido) is architecturally incompatible (it finalizes atomically in one RPC call) and must stay untouched. A new `inventarios.metodo_contagem` column remembers which screen to reopen. A new tenant/permission-scoped RPC (`inventario_find_item_por_barcode`) resolves barcode → item *inside the currently open inventory* — the existing operational RPCs (`op_find_produto_por_barcode`) are gated by a different permission domain (`operacional:movimentacao:*` + setor ACL) and are not reused directly, but the pure barcode validation/dedupe module (`src/domain/estoque/barcode.ts`) and the HID-capture component (`LeitorCodigoBarras.tsx`) are reused as-is, unmodified, via cross-module import.

**Tech Stack:** React 18 + TypeScript 5, Supabase (Postgres RPC + Edge Function `inventario`), Vitest 4 + @testing-library/react 16 for hook tests.

**Spec:** The user's own pasted requirements (this conversation, 2026-09-24) plus the Fase 0 audit findings (three background Explore agents + live read-only Supabase queries) recorded earlier in this conversation. No separate spec file exists; this plan is the executable distillation of both.

## Global Constraints

- Do not modify `create_quick_inventory_atomic`, `QuickInventorySection.tsx`, or anything under `src/components/estoque-operacional/` other than importing `LeitorCodigoBarras` as-is.
- Do not change the behavior of the existing "Contagem por Lista" flow for any inventory that already exists or that a user creates choosing "Lista" — `metodo_contagem` defaults to `'lista'` everywhere so old rows and old code paths are unaffected.
- Every new/modified `SECURITY DEFINER` function uses `SET search_path = 'public'` (with `=`, not `TO`) — the repo's `check-sql-antipattern.mjs` hook only recognizes the `=` form.
- `create_inventory_atomic`'s parameter list is changing (`p_metodo_contagem` appended) — `DROP FUNCTION IF EXISTS` the old 7-arg signature before `CREATE OR REPLACE`, per this repo's documented rule: a different parameter list creates an overload instead of replacing the function.
- This repo's `supabase db push` is structurally blocked (see `CLAUDE.md`, "Aplicação de migrations"). Apply the migration via MCP `mcp__claude_ai_Supabase__apply_migration` (project id `wuzxpbixprrgssoeeaez`), then rename the local migration file to the exact version string the MCP call returns. Do **not** run `supabase db push`, `supabase migration repair`, or accept any repair the CLI suggests for this migration.
- Contagem in `inventario_itens.contagem_fisica` is stored in **base units**; the counting UI (both list and barcode) operates in **purchase units** (`unidade_compra`), converting with `hasDual ? Number((qtyCompra * fator).toFixed(4)) : qtyCompra` — the exact formula `InventoryItemRow.tsx` already uses. The barcode flow must reuse this formula, not invent a different one.
- `+1` per scan is a **purchase-unit** increment (one physical package/label), matching what the barcode is printed on.

## Review Focus

- Scanning a barcode that exists nowhere in `produto_codigos_barras` must show "Produto não encontrado" and leave the scanner usable — not crash, not close the screen (Task 6/7).
- Scanning a barcode that exists but whose product isn't part of *this* inventory's snapshot (e.g. activated after the inventory was created) must be distinguishable from "doesn't exist at all" (Task 1 RPC `not_in_inventory` status, Task 6).
- Two operators counting the same item at nearly the same time (one via Lista, one via Código) must not silently overwrite each other — the existing `update_contagem` optimistic lock (409 on stale `contagem_fisica`) must surface as a visible error in the barcode flow too, not a silent no-op (Task 4 test).
- The same barcode read twice in rapid HID bounce (<1200ms) must count once; the same barcode read twice *deliberately* (two physical units) must count twice (Task 4 test, reusing `ehLeituraDuplicada` exactly as `LeitorCodigoBarras`/`FluxoMovimentacao` already rely on it).
- Reopening an inventory created **before** this migration (`metodo_contagem` backfilled to `'lista'` by the column default) must land on the existing detail/list screen unchanged — not a blank/broken "Código" screen (Task 1 verification query, Task 5).

---

## Task 1: Migration — `metodo_contagem` column + barcode lookup RPC

**Files:**
- Create: `supabase/migrations/20260924120000_inventario_metodo_contagem_barcode.sql`

**Interfaces:**
- Produces: column `public.inventarios.metodo_contagem text NOT NULL DEFAULT 'lista'` (CHECK `IN ('lista','codigo')`); RPC `public.create_inventory_atomic(p_tipo text, p_data date, p_hora text, p_turno_id uuid, p_categorias text[] DEFAULT '{}', p_observacao text DEFAULT '', p_idempotency_key text DEFAULT NULL, p_metodo_contagem text DEFAULT 'lista') RETURNS uuid` (8th param added); RPC `public.inventario_find_item_por_barcode(p_inventario_id uuid, p_barcode text) RETURNS jsonb` — returns `{"status":"found", item_id, produto_id, nome_produto, sku, barcode, unidade_medida, unidade_compra, fator_conversao_padrao, saldo_teorico, contagem_fisica, classificacao}` or `{"status":"not_found"|"not_in_inventory"|"invalid", "barcode"?}`.

- [x] **Step 1: Write the migration file**

```sql
-- Contagem de inventário via código de barras: novo método de contagem +
-- RPC de busca de item por barcode, escopada ao inventário aberto (não ao
-- setor operacional — op_find_produto_por_barcode é de outro domínio de
-- permissão e não é reaproveitada aqui).

ALTER TABLE public.inventarios
  ADD COLUMN IF NOT EXISTS metodo_contagem text NOT NULL DEFAULT 'lista';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventarios_metodo_contagem_check'
  ) THEN
    ALTER TABLE public.inventarios
      ADD CONSTRAINT inventarios_metodo_contagem_check CHECK (metodo_contagem IN ('lista', 'codigo'));
  END IF;
END $$;

-- create_inventory_atomic ganha p_metodo_contagem (DEFAULT 'lista' preserva
-- todo caller existente, inclusive o Edge Function 'create' antes do Task 2).
-- Assinatura muda -> precisa DROP da antiga antes do CREATE OR REPLACE, senão
-- o Postgres cria um overload em vez de substituir.
DROP FUNCTION IF EXISTS public.create_inventory_atomic(text, date, text, uuid, text[], text, text);

CREATE OR REPLACE FUNCTION public.create_inventory_atomic(
  p_tipo text,
  p_data date,
  p_hora text,
  p_turno_id uuid,
  p_categorias text[] DEFAULT '{}'::text[],
  p_observacao text DEFAULT ''::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_metodo_contagem text DEFAULT 'lista'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_user_id uuid;
  v_inv_id uuid;
  v_itens_count int := 0;
  v_metodo text := CASE WHEN p_metodo_contagem IN ('lista', 'codigo') THEN p_metodo_contagem ELSE 'lista' END;
BEGIN
  BEGIN
    v_tenant := assert_tenant();
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro de Tenant: %', SQLERRM;
  END;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF NOT has_any_permission(v_user_id, ARRAY['inventario:criar:create', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Permissão negada: inventario:criar:create necessário';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_inv_id FROM inventarios WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_inv_id; END IF;
  END IF;

  INSERT INTO inventarios (
    company_id, tipo, data, hora, turno_id, categorias,
    responsavel_user_id, observacao, status, idempotency_key, metodo_contagem
  ) VALUES (
    v_tenant, p_tipo, p_data, p_hora::time, p_turno_id, COALESCE(p_categorias, '{}'),
    v_user_id, COALESCE(p_observacao, ''), 'RASCUNHO', p_idempotency_key, v_metodo
  ) RETURNING id INTO v_inv_id;

  IF p_tipo = 'completo' THEN
    INSERT INTO inventario_itens (company_id, inventario_id, produto_id, tipo_item, saldo_teorico, custo_snapshot)
    SELECT
      v_tenant, v_inv_id, p.id, 'geral',
      GREATEST(0, COALESCE(p.saldo_atual, 0)),
      COALESCE(
        NULLIF(p.default_cost_base_unit, 0),
        CASE
          WHEN COALESCE(p.fator_conversao_padrao, 0) > 0
            THEN p.custo_padrao / p.fator_conversao_padrao
          ELSE p.custo_padrao
        END,
        0
      )
    FROM produtos p
    WHERE p.ativo = true AND p.company_id = v_tenant;

    GET DIAGNOSTICS v_itens_count = ROW_COUNT;
  END IF;

  INSERT INTO audit_inventario_log (company_id, inventario_id, user_id, user_role, acao, depois)
  VALUES (
    v_tenant, v_inv_id, v_user_id,
    COALESCE((SELECT string_agg(role::text, ',') FROM user_roles WHERE user_id = v_user_id AND company_id = public.assert_tenant()), 'unknown'),
    'CRIACAO',
    jsonb_build_object('tipo', p_tipo, 'turno_id', p_turno_id, 'itens_count', v_itens_count, 'metodo_contagem', v_metodo)
  );

  RETURN v_inv_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_inventory_atomic(text, date, text, uuid, text[], text, text, text) TO authenticated;

-- Busca de item do inventário por código de barras — escopada ao inventário
-- aberto. Reaproveita produto_codigos_barras, mas com o gate de permissão do
-- módulo Inventário (inventario:detalhe:edit), diferente do domínio
-- operacional (operacional:movimentacao:* + setor).
CREATE OR REPLACE FUNCTION public.inventario_find_item_por_barcode(
  p_inventario_id uuid,
  p_barcode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid := public.assert_tenant();
  v_codigo text := nullif(regexp_replace(btrim(coalesce(p_barcode, '')), '[[:cntrl:]]', '', 'g'), '');
  v_item record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_permission(auth.uid(), ARRAY['inventario:detalhe:edit', 'inventario:criar:create', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: inventario:detalhe:edit' USING ERRCODE = '42501';
  END IF;
  IF v_codigo IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT
    ii.id AS item_id, ii.produto_id, p.nome_produto, coalesce(p.sku, '') AS sku,
    p.unidade_medida, coalesce(p.unidade_compra, p.unidade_medida) AS unidade_compra,
    coalesce(nullif(p.fator_conversao_padrao, 0), 1) AS fator_conversao_padrao,
    ii.saldo_teorico, ii.contagem_fisica, ii.classificacao
  INTO v_item
  FROM public.produto_codigos_barras pcb
  JOIN public.produtos p ON p.id = pcb.produto_id AND p.company_id = pcb.company_id
  JOIN public.inventario_itens ii ON ii.produto_id = p.id
    AND ii.inventario_id = p_inventario_id AND ii.company_id = pcb.company_id
  WHERE pcb.company_id = v_company_id AND pcb.codigo = v_codigo AND ii.deleted_at IS NULL
  LIMIT 1;

  IF v_item.item_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.produto_codigos_barras WHERE company_id = v_company_id AND codigo = v_codigo) THEN
      RETURN jsonb_build_object('status', 'not_in_inventory', 'barcode', v_codigo);
    END IF;
    RETURN jsonb_build_object('status', 'not_found', 'barcode', v_codigo);
  END IF;

  RETURN jsonb_build_object(
    'status', 'found',
    'item_id', v_item.item_id,
    'produto_id', v_item.produto_id,
    'nome_produto', v_item.nome_produto,
    'sku', v_item.sku,
    'barcode', v_codigo,
    'unidade_medida', v_item.unidade_medida,
    'unidade_compra', v_item.unidade_compra,
    'fator_conversao_padrao', v_item.fator_conversao_padrao,
    'saldo_teorico', v_item.saldo_teorico,
    'contagem_fisica', v_item.contagem_fisica,
    'classificacao', v_item.classificacao
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.inventario_find_item_por_barcode(uuid, text) TO authenticated;
```

- [x] **Step 2: Apply via MCP (not `supabase db push`)**

Call `mcp__claude_ai_Supabase__apply_migration` with `project_id: "wuzxpbixprrgssoeeaez"`, `name: "inventario_metodo_contagem_barcode"`, and the SQL body above. Record the `version` string it returns.

- [x] **Step 3: Rename the local file to the applied version**

```bash
mv supabase/migrations/20260924120000_inventario_metodo_contagem_barcode.sql \
   supabase/migrations/<version_from_step_2>_inventario_metodo_contagem_barcode.sql
```

- [x] **Step 4: Verify live state with read-only queries (via MCP `execute_sql`, project id `wuzxpbixprrgssoeeaez`)**

```sql
-- (a) column + constraint + default exist, and existing rows backfilled to 'lista'
SELECT metodo_contagem, count(*) FROM public.inventarios GROUP BY metodo_contagem;
-- expected: all 30 pre-existing rows show metodo_contagem = 'lista'

-- (b) old 7-arg create_inventory_atomic signature is gone, only the 8-arg one remains
SELECT pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'create_inventory_atomic';

-- (c) new RPC exists and is granted to authenticated
SELECT has_function_privilege('authenticated', 'inventario_find_item_por_barcode(uuid,text)', 'EXECUTE');
```

Expected: (a) shows only `'lista'` for existing rows, (b) shows exactly one row with 8 arguments ending in `p_metodo_contagem text DEFAULT 'lista'::text`, (c) returns `true`.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(inventario): metodo_contagem + RPC de busca por barcode"
```

---

## Task 2: Edge Function — `metodo_contagem` on create + `find_by_barcode` action

**Files:**
- Modify: `supabase/functions/inventario/index.ts:149-198` (the `create` action), and add a new action block after `update_contagem` (after line 273).

**Interfaces:**
- Consumes: RPCs from Task 1 (`create_inventory_atomic` with `p_metodo_contagem`, `inventario_find_item_por_barcode`).
- Produces: action `create` now accepts an optional `metodo_contagem: 'lista' | 'codigo'` in its payload (defaults to `'lista'`) and the returned `inventario` row includes `metodo_contagem`. New action `find_by_barcode` — payload `{ id: string, barcode: string }`, response is the RPC's jsonb verbatim (`{status, ...}`).

- [ ] **Step 1: Extend the `create` action**

In `supabase/functions/inventario/index.ts`, replace lines 149–198 with:

```ts
    if (action === 'create') {
      const deny = await requirePermission('inventario:criar:create')
      if (deny) return deny

      const ALLOWED_TIPOS = ['completo', 'parcial', 'ciclico']
      const ALLOWED_METODOS = ['lista', 'codigo']
      const { tipo, data: invData, hora, categorias, observacao, turno_id, idempotency_key, metodo_contagem } = payload
      if (!tipo || !ALLOWED_TIPOS.includes(tipo)) return json({ error: `Tipo inválido. Permitidos: ${ALLOWED_TIPOS.join(', ')}` }, 400)
      if (!invData || !hora) return json({ error: 'Campos obrigatórios: tipo, data, hora' }, 400)
      if (!turno_id) return json({ error: 'Turno é obrigatório' }, 400)

      // Validate date format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(invData)) return json({ error: 'Data inválida (formato: YYYY-MM-DD)' }, 400)
      // Validate time format (HH:mm or HH:mm:ss)
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) return json({ error: 'Hora inválida (formato: HH:mm)' }, 400)

      // Sanitize text inputs
      const safeObservacao = (observacao || '').slice(0, 500).replace(/<[^>]*>/g, '')
      const safeCategorias = (categorias || []).slice(0, 20).map((c: string) => String(c).slice(0, 100).replace(/<[^>]*>/g, ''))
      const safeMetodo = ALLOWED_METODOS.includes(metodo_contagem) ? metodo_contagem : 'lista'

      // H2: Use atomic RPC with idempotency
      const { data: rpcResult, error: rpcErr } = await userClient.rpc('create_inventory_atomic', {
        p_tipo: tipo,
        p_data: invData,
        p_hora: hora,
        p_turno_id: turno_id,
        p_categorias: safeCategorias,
        p_observacao: safeObservacao,
        p_idempotency_key: idempotency_key || null,
        p_metodo_contagem: safeMetodo,
      })
      if (rpcErr) throw rpcErr

      // Handle both return formats: plain UUID (new RPC) or object (legacy RPC)
      const inventarioId = typeof rpcResult === 'string' ? rpcResult : rpcResult?.inventario_id || rpcResult
      if (!inventarioId) throw new Error('RPC não retornou o ID do inventário')

      // Load the created inventory for response
      const { data: inv } = await adminClient.from('inventarios')
        .select('*').eq('id', inventarioId).eq('company_id', companyId).single()

      // Count items that were created
      const { count: itensCount } = await adminClient.from('inventario_itens')
        .select('id', { count: 'exact', head: true })
        .eq('inventario_id', inventarioId).eq('company_id', companyId)

      return json({
        inventario: inv,
        itensCount: itensCount || 0,
        idempotent: typeof rpcResult === 'object' ? (rpcResult?.idempotent || false) : false,
      })
    }
```

- [ ] **Step 2: Add the `find_by_barcode` action**

Insert this new block immediately after the closing `}` of the `update_contagem` action (after line 273, before `if (action === 'finalizar')`):

```ts
    if (action === 'find_by_barcode') {
      const deny = await requirePermission('inventario:detalhe:edit')
      if (deny) return deny

      const { id, barcode } = payload
      if (!id || typeof barcode !== 'string' || !barcode.trim()) {
        return json({ error: 'id e barcode são obrigatórios' }, 400)
      }

      const { data: rpcResult, error: rpcErr } = await userClient.rpc('inventario_find_item_por_barcode', {
        p_inventario_id: id,
        p_barcode: barcode,
      })
      if (rpcErr) throw rpcErr

      return json(rpcResult)
    }
```

- [ ] **Step 3: Deploy the Edge Function**

Use `mcp__claude_ai_Supabase__deploy_edge_function` for `inventario` with the updated file content (project id `wuzxpbixprrgssoeeaez`), or the project's standard Edge Function deploy path if the MCP tool is unavailable in this session.

- [ ] **Step 4: Manual smoke check**

Using the Supabase Studio SQL editor or a REST client with a real authenticated session (not this plan — do this by hand once deployed), call the `inventario` function with `{"action":"find_by_barcode","id":"<an existing inventario id>","barcode":"nonexistent-code"}` and confirm the response is `{"status":"not_found","barcode":"nonexistent-code"}`, not a 500.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/inventario/index.ts
git commit -m "feat(inventario): action find_by_barcode e metodo_contagem em create"
```

---

## Task 3: Store — `metodo_contagem` field + `findItemByBarcode`

**Files:**
- Modify: `src/hooks/useInventarioStore.ts`

**Interfaces:**
- Consumes: Edge Function action `find_by_barcode` from Task 2.
- Produces: `Inventario.metodo_contagem: 'lista' | 'codigo'`; exported type `BarcodeLookupResult`; exported type `UpdateContagemResult`; `useInventarioStore()` return value gains `findItemByBarcode(inventarioId: string, barcode: string): Promise<BarcodeLookupResult>`. Consumed directly by Task 4's hook.

- [ ] **Step 1: Extend the `Inventario` interface**

In `src/hooks/useInventarioStore.ts`, add the field to the existing interface (after `tipo`):

```ts
export interface Inventario {
  id: string;
  tipo: 'completo' | 'parcial' | 'ciclico';
  metodo_contagem: 'lista' | 'codigo';
  status: 'RASCUNHO' | 'EM_CONTAGEM' | 'EM_REVISAO' | 'SOB_ANALISE' | 'FINALIZADO';
  // ...resto do arquivo permanece igual
```

- [ ] **Step 2: Add the `BarcodeLookupResult` and `UpdateContagemResult` types**

Add these two exported types right after the existing `AuditLog` interface (before `DashboardData`):

```ts
export type BarcodeLookupResult =
  | {
      status: 'found';
      item_id: string;
      produto_id: string;
      nome_produto: string;
      sku: string;
      barcode: string;
      unidade_medida: string;
      unidade_compra: string;
      fator_conversao_padrao: number;
      saldo_teorico: number;
      contagem_fisica: number | null;
      classificacao: 'NORMAL' | 'ALERTA' | 'CRITICO';
    }
  | { status: 'not_found'; barcode: string }
  | { status: 'not_in_inventory'; barcode: string }
  | { status: 'invalid' };

export interface UpdateContagemResult {
  diferenca_qtd: number;
  diferenca_percent: number;
  impacto_financeiro: number;
  classificacao: 'NORMAL' | 'ALERTA' | 'CRITICO';
}
```

- [ ] **Step 3: Add `findItemByBarcode`**

Add this `useCallback` right after `updateContagem` (after line 218, before `finalizar`):

```ts
  const findItemByBarcode = useCallback(async (inventarioId: string, barcode: string): Promise<BarcodeLookupResult> => {
    return (await invoke('find_by_barcode', { id: inventarioId, barcode })) as BarcodeLookupResult;
  }, [invoke]);
```

- [ ] **Step 4: Export it from the hook's return value**

In the `return { ... }` block at the end of the hook, add `findItemByBarcode` next to `updateContagem`:

```ts
    loadTurnos, loadList, loadInventario, createInventario, updateStatus, updateContagem, findItemByBarcode,
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck` (or the project's equivalent script — check `package.json` `scripts` for the exact name before running; do not guess a script that doesn't exist).
Expected: no new TypeScript errors in `useInventarioStore.ts` or its consumers.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useInventarioStore.ts
git commit -m "feat(inventario): findItemByBarcode e metodo_contagem no store"
```

---

## Task 4: Central counting hook — `useContagemPorCodigo`

**Files:**
- Create: `src/hooks/useContagemPorCodigo.ts`
- Test: `src/hooks/useContagemPorCodigo.test.ts`

**Interfaces:**
- Consumes: `BarcodeLookupResult`, `UpdateContagemResult` from Task 3 (imported as types only — no runtime dependency on Supabase, so this hook is testable with plain mocked functions).
- Produces: `useContagemPorCodigo({ inventarioId, buscarPorBarcode, salvarContagem })` returning `{ processarLeitura(raw: string): Promise<ResultadoLeitura>, desfazerUltimaLeitura(): Promise<boolean>, historico: LeituraHistorico[], processando: boolean }`. This is the single function that the physical scanner, manual entry, and (in a later plan) the camera all call — satisfying "uma função central" without duplicating business logic. Consumed by Task 6's `ContagemPorCodigo.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useContagemPorCodigo } from '@/hooks/useContagemPorCodigo';
import type { BarcodeLookupResult, UpdateContagemResult } from '@/hooks/useInventarioStore';

const inventarioId = 'inv-1';

function setup(overrides?: {
  buscarPorBarcode?: (inventarioId: string, barcode: string) => Promise<BarcodeLookupResult>;
  salvarContagem?: (itemId: string, contagemBase: number) => Promise<UpdateContagemResult | null>;
}) {
  const buscarPorBarcode = overrides?.buscarPorBarcode ?? vi.fn(async (): Promise<BarcodeLookupResult> => ({
    status: 'found',
    item_id: 'item-1',
    produto_id: 'produto-1',
    nome_produto: 'Coca-Cola 350ml',
    sku: 'COCA350',
    barcode: '7891234567890',
    unidade_medida: 'UN',
    unidade_compra: 'CX',
    fator_conversao_padrao: 12,
    saldo_teorico: 100,
    contagem_fisica: null,
    classificacao: 'NORMAL',
  }));
  const salvarContagem = overrides?.salvarContagem ?? vi.fn(async (): Promise<UpdateContagemResult> => ({
    diferenca_qtd: 12, diferenca_percent: 12, impacto_financeiro: 5, classificacao: 'NORMAL',
  }));
  const { result } = renderHook(() => useContagemPorCodigo({ inventarioId, buscarPorBarcode, salvarContagem }));
  return { result, buscarPorBarcode, salvarContagem };
}

describe('useContagemPorCodigo', () => {
  it('conta a primeira leitura como +1 unidade de compra (produto dual-unit)', async () => {
    const { result, salvarContagem } = setup();
    let resultado: Awaited<ReturnType<typeof result.current.processarLeitura>> | undefined;
    await act(async () => { resultado = await result.current.processarLeitura('7891234567890'); });

    expect(resultado?.tipo).toBe('contabilizado');
    if (resultado?.tipo === 'contabilizado') {
      expect(resultado.item.quantidadeContadaCompra).toBe(1);
    }
    // contagem_fisica é base: 1 CX * fator 12 = 12 UN
    expect(salvarContagem).toHaveBeenCalledWith('item-1', 12);
    expect(result.current.historico).toHaveLength(1);
  });

  it('soma sobre a contagem já existente, não zera', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => ({
      status: 'found', item_id: 'item-1', produto_id: 'produto-1', nome_produto: 'Água 500ml', sku: '',
      barcode: '111', unidade_medida: 'UN', unidade_compra: 'UN', fator_conversao_padrao: 1,
      saldo_teorico: 50, contagem_fisica: 4, classificacao: 'NORMAL',
    }));
    const { result, salvarContagem } = setup({ buscarPorBarcode });
    await act(async () => { await result.current.processarLeitura('111'); });
    expect(salvarContagem).toHaveBeenCalledWith('item-1', 5);
  });

  it('produto não encontrado mantém o scanner utilizável, sem chamar salvarContagem', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => ({ status: 'not_found', barcode: '000' }));
    const { result, salvarContagem } = setup({ buscarPorBarcode });
    let resultado: Awaited<ReturnType<typeof result.current.processarLeitura>> | undefined;
    await act(async () => { resultado = await result.current.processarLeitura('000'); });
    expect(resultado).toEqual({ tipo: 'nao_encontrado', barcode: '000' });
    expect(salvarContagem).not.toHaveBeenCalled();
  });

  it('produto fora do inventário é distinguível de não encontrado', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => ({ status: 'not_in_inventory', barcode: '222' }));
    const { result } = setup({ buscarPorBarcode });
    let resultado: Awaited<ReturnType<typeof result.current.processarLeitura>> | undefined;
    await act(async () => { resultado = await result.current.processarLeitura('222'); });
    expect(resultado).toEqual({ tipo: 'fora_do_inventario', barcode: '222' });
  });

  it('ignora a mesma leitura em bounce (<1200ms), mas conta de novo se deliberada', async () => {
    vi.useFakeTimers();
    try {
      const { result, salvarContagem } = setup();
      await act(async () => { await result.current.processarLeitura('7891234567890'); });
      await act(async () => { await result.current.processarLeitura('7891234567890'); }); // bounce imediato
      expect(salvarContagem).toHaveBeenCalledTimes(1);

      await act(async () => { vi.advanceTimersByTime(1300); });
      await act(async () => { await result.current.processarLeitura('7891234567890'); }); // segunda unidade, deliberada
      expect(salvarContagem).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('conflito de lock otimista (salvarContagem retorna null) vira erro visível, sem entrar no histórico', async () => {
    const salvarContagem = vi.fn(async (): Promise<UpdateContagemResult | null> => null);
    const { result } = setup({ salvarContagem });
    let resultado: Awaited<ReturnType<typeof result.current.processarLeitura>> | undefined;
    await act(async () => { resultado = await result.current.processarLeitura('7891234567890'); });
    expect(resultado?.tipo).toBe('erro');
    expect(result.current.historico).toHaveLength(0);
  });

  it('desfazer última leitura restaura o valor anterior e some do histórico', async () => {
    const { result, salvarContagem } = setup();
    await act(async () => { await result.current.processarLeitura('7891234567890'); });
    expect(result.current.historico).toHaveLength(1);

    let desfeito = false;
    await act(async () => { desfeito = await result.current.desfazerUltimaLeitura(); });
    expect(desfeito).toBe(true);
    expect(salvarContagem).toHaveBeenLastCalledWith('item-1', 0); // contagem_fisica era null -> base 0
    expect(result.current.historico).toHaveLength(0);
  });

  it('desfazer sem histórico não chama salvarContagem', async () => {
    const { result, salvarContagem } = setup();
    let desfeito = true;
    await act(async () => { desfeito = await result.current.desfazerUltimaLeitura(); });
    expect(desfeito).toBe(false);
    expect(salvarContagem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useContagemPorCodigo.test.ts`
Expected: FAIL — `Cannot find module '@/hooks/useContagemPorCodigo'`.

- [ ] **Step 3: Implement the hook**

```ts
import { useCallback, useRef, useState } from 'react';
import { validarBarcode, mensagemBarcodeInvalido, ehLeituraDuplicada } from '@/domain/estoque/barcode';
import type { BarcodeLookupResult, UpdateContagemResult } from '@/hooks/useInventarioStore';

export interface ItemContabilizado {
  itemId: string;
  produtoId: string;
  nomeProduto: string;
  sku: string;
  barcode: string;
  unidadeCompra: string;
  quantidadeContadaCompra: number;
  diferencaQtdBase: number;
  diferencaPercent: number;
  impactoFinanceiro: number;
  classificacao: 'NORMAL' | 'ALERTA' | 'CRITICO';
}

export interface LeituraHistorico extends ItemContabilizado {
  id: string;
  quantidadeAnteriorBase: number;
  quantidadeNovaBase: number;
  em: number;
}

export type ResultadoLeitura =
  | { tipo: 'contabilizado'; item: ItemContabilizado }
  | { tipo: 'nao_encontrado'; barcode: string }
  | { tipo: 'fora_do_inventario'; barcode: string }
  | { tipo: 'invalido'; mensagem: string }
  | { tipo: 'erro'; mensagem: string };

interface Deps {
  inventarioId: string;
  buscarPorBarcode: (inventarioId: string, barcode: string) => Promise<BarcodeLookupResult>;
  salvarContagem: (itemId: string, contagemBase: number) => Promise<UpdateContagemResult | null>;
}

const HISTORICO_MAX = 10;

/**
 * Converte quantidade em unidade de compra para a unidade base salva em
 * contagem_fisica — mesma fórmula usada no onSave de InventoryItemRow.tsx.
 * Duplicada intencionalmente (1 linha) em vez de extraída para não tocar um
 * arquivo que já funciona.
 */
export function converterParaBase(quantidadeCompra: number, fator: number, hasDual: boolean): number {
  return hasDual ? Number((quantidadeCompra * fator).toFixed(4)) : quantidadeCompra;
}

export function useContagemPorCodigo({ inventarioId, buscarPorBarcode, salvarContagem }: Deps) {
  const [processando, setProcessando] = useState(false);
  const [historico, setHistorico] = useState<LeituraHistorico[]>([]);
  const ultimoCodigoRef = useRef<string | null>(null);
  const ultimoEmRef = useRef<number | null>(null);

  const processarLeitura = useCallback(async (raw: string): Promise<ResultadoLeitura> => {
    const { valido, codigo, motivo } = validarBarcode(raw);
    if (!valido) return { tipo: 'invalido', mensagem: mensagemBarcodeInvalido(motivo!) };

    const agora = Date.now();
    if (ehLeituraDuplicada(codigo, ultimoCodigoRef.current, ultimoEmRef.current, agora)) {
      ultimoEmRef.current = agora;
      return { tipo: 'invalido', mensagem: 'Leitura repetida ignorada.' };
    }
    ultimoCodigoRef.current = codigo;
    ultimoEmRef.current = agora;

    setProcessando(true);
    try {
      const lookup = await buscarPorBarcode(inventarioId, codigo);
      if (lookup.status === 'not_found') return { tipo: 'nao_encontrado', barcode: codigo };
      if (lookup.status === 'not_in_inventory') return { tipo: 'fora_do_inventario', barcode: codigo };
      if (lookup.status === 'invalid') return { tipo: 'invalido', mensagem: mensagemBarcodeInvalido('vazio') };

      const fator = lookup.fator_conversao_padrao || 1;
      const unidadeCompra = lookup.unidade_compra || lookup.unidade_medida;
      const hasDual = unidadeCompra.toUpperCase() !== lookup.unidade_medida.toUpperCase() && fator !== 1;
      const atualBase = lookup.contagem_fisica ?? 0;
      const atualCompra = hasDual ? atualBase / fator : atualBase;
      const novaCompra = atualCompra + 1;
      const novaBase = converterParaBase(novaCompra, fator, hasDual);

      const resultado = await salvarContagem(lookup.item_id, novaBase);
      if (!resultado) return { tipo: 'erro', mensagem: 'Não foi possível salvar a contagem. Tente novamente.' };

      const item: ItemContabilizado = {
        itemId: lookup.item_id,
        produtoId: lookup.produto_id,
        nomeProduto: lookup.nome_produto,
        sku: lookup.sku,
        barcode: codigo,
        unidadeCompra,
        quantidadeContadaCompra: novaCompra,
        diferencaQtdBase: resultado.diferenca_qtd,
        diferencaPercent: resultado.diferenca_percent,
        impactoFinanceiro: resultado.impacto_financeiro,
        classificacao: resultado.classificacao,
      };

      setHistorico(prev => [
        { ...item, id: crypto.randomUUID(), quantidadeAnteriorBase: atualBase, quantidadeNovaBase: novaBase, em: agora },
        ...prev,
      ].slice(0, HISTORICO_MAX));

      return { tipo: 'contabilizado', item };
    } finally {
      setProcessando(false);
    }
  }, [inventarioId, buscarPorBarcode, salvarContagem]);

  const desfazerUltimaLeitura = useCallback(async (): Promise<boolean> => {
    const [ultima] = historico;
    if (!ultima) return false;
    const resultado = await salvarContagem(ultima.itemId, ultima.quantidadeAnteriorBase);
    if (!resultado) return false;
    setHistorico(prev => prev.slice(1));
    return true;
  }, [historico, salvarContagem]);

  return { processarLeitura, desfazerUltimaLeitura, historico, processando };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useContagemPorCodigo.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useContagemPorCodigo.ts src/hooks/useContagemPorCodigo.test.ts
git commit -m "feat(inventario): hook central de contagem por codigo de barras"
```

---

## Task 5: `InventarioView.tsx` — method choice step + resume routing

**Files:**
- Modify: `src/components/InventarioView.tsx`

**Interfaces:**
- Consumes: `store.createInventario` (now accepting `metodo_contagem`), `store.findItemByBarcode`, `store.updateContagem` from Tasks 3–4.
- Produces: new `SubView` value `'contagem-codigo'`; `handleCreate` and `handleOpenDetail` route based on `metodo_contagem`. Consumed by Task 6 (renders `ContagemPorCodigo` when `subView === 'contagem-codigo'`).

- [ ] **Step 1: Extend `SubView` and add wizard step state**

```ts
type SubView = 'list' | 'create' | 'detail' | 'dashboard' | 'audit' | 'conferentes' | 'rapido' | 'contagem-codigo';
```

Add near the other `create form` state (after `formObs`, around line 96):

```ts
  const [createStep, setCreateStep] = useState<'form' | 'metodo'>('form');
```

- [ ] **Step 2: Rewrite `handleCreate` to take the method and route accordingly**

Replace the existing `handleCreate` (lines 116-127) with:

```ts
  const handleCreate = async (metodoContagem: 'lista' | 'codigo') => {
    if (!formTurno) { return; }
    const inv = await store.createInventario({
      tipo: formTipo,
      data: formData,
      hora: formHora,
      turno_id: formTurno,
      categorias: formTipo === 'parcial' ? formCategorias.split(',').map(c => c.trim()).filter(Boolean) : [],
      observacao: formObs,
      metodo_contagem: metodoContagem,
    });
    if (!inv) return;
    setCreateStep('form');
    if (metodoContagem === 'codigo') {
      await store.loadInventario(inv.id);
      setSubView('contagem-codigo');
    } else {
      setSubView('list');
    }
  };
```

- [ ] **Step 3: Update `createInventario`'s payload type in the store to accept `metodo_contagem`**

In `src/hooks/useInventarioStore.ts`, extend the `createInventario` parameter type (already touched in Task 3 — this is the same edit, done here since it's driven by this task's caller):

```ts
  const createInventario = useCallback(async (payload: {
    tipo: string;
    data: string;
    hora: string;
    turno_id: string;
    categorias?: string[];
    observacao?: string;
    metodo_contagem?: 'lista' | 'codigo';
  }) => {
```

(The body is unchanged — `payload` is already spread as-is into `invoke('create', { ...payload, idempotency_key })`, so `metodo_contagem` passes through automatically.)

- [ ] **Step 4: Update `handleOpenDetail` to route by `metodo_contagem`**

Replace lines 129-132:

```ts
  const handleOpenDetail = async (inv: Inventario) => {
    await store.loadInventario(inv.id);
    const aindaContando = inv.status === 'RASCUNHO' || inv.status === 'EM_CONTAGEM';
    setSubView(inv.metodo_contagem === 'codigo' && aindaContando ? 'contagem-codigo' : 'detail');
  };
```

- [ ] **Step 5: Replace the create-view render block with the two-step wizard**

Replace the `// ===== CREATE VIEW =====` block (lines 461-506) with:

```tsx
  // ===== CREATE VIEW =====
  if (subView === 'create') {
    if (createStep === 'metodo') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setCreateStep('form')}><ArrowLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-display font-bold text-foreground">Como deseja realizar a contagem?</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <button type="button" onClick={() => void handleCreate('lista')} disabled={store.savingCreate}
              className="rounded-2xl border-2 border-border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-primary-soft disabled:opacity-60">
              <ClipboardCheck className="h-8 w-8 text-primary" />
              <p className="mt-3 text-base font-semibold text-foreground">Contagem por Lista</p>
              <p className="mt-1 text-sm text-muted-foreground">Visualize os produtos do estoque e informe manualmente a quantidade encontrada.</p>
              <span className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Iniciar por lista</span>
            </button>
            <button type="button" onClick={() => void handleCreate('codigo')} disabled={store.savingCreate}
              className="rounded-2xl border-2 border-border bg-card p-6 text-left transition-colors hover:border-primary hover:bg-primary-soft disabled:opacity-60">
              <Zap className="h-8 w-8 text-primary" />
              <p className="mt-3 text-base font-semibold text-foreground">Contagem via Código</p>
              <p className="mt-1 text-sm text-muted-foreground">Conte os produtos utilizando um leitor de código de barras deste dispositivo.</p>
              <span className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Iniciar via código</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSubView('list')}><ArrowLeft className="w-4 h-4" /></Button>
          <h2 className="text-lg font-display font-bold text-foreground">Novo Inventário</h2>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={formTipo} onValueChange={setFormTipo}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completo">📦 Inventário Estoques</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Turno *</Label>
              <Select value={formTurno} onValueChange={setFormTurno}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione o turno" /></SelectTrigger>
                <SelectContent>
                  {store.turnos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome} ({t.hora_inicio}–{t.hora_fim})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs text-muted-foreground">Data</Label><DateInput value={formData} onValueChange={setFormData} className="bg-secondary border-border" /></div>
            <div><Label className="text-xs text-muted-foreground">Hora</Label><Input type="time" value={formHora} onChange={e => setFormHora(e.target.value)} className="bg-secondary border-border" /></div>
          </div>
          <div><Label className="text-xs text-muted-foreground">Observação</Label><Input value={formObs} onChange={e => setFormObs(e.target.value)} className="bg-secondary border-border" maxLength={500} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSubView('list')}>Cancelar</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setCreateStep('metodo')} disabled={!formTurno}>
              Continuar
            </Button>
          </div>
        </div>
      </div>
    );
  }
```

Note: `store.loading` / `store.savingCreate` spinner on the "Criar" button moved — the button on the info-form step is now just "Continuar" (no network call yet), and `store.savingCreate` now gates the two method cards instead.

- [ ] **Step 6: Reset `createStep` when leaving/entering the create flow**

Add to the existing `useEffect` that resets search/filter state (around line 110), or add a new one right after it:

```ts
  useEffect(() => {
    if (subView !== 'create') setCreateStep('form');
  }, [subView]);
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck` (verify the exact script name in `package.json` first).
Expected: no new errors. `Zap` is already imported in the icon list at the top of the file (line 22) — confirm it's there; if not, add it to the existing `lucide-react` import line.

- [ ] **Step 8: Commit**

```bash
git add src/components/InventarioView.tsx src/hooks/useInventarioStore.ts
git commit -m "feat(inventario): etapa de escolha Lista/Codigo na criacao"
```

---

## Task 6: `ContagemPorCodigo.tsx` — the scanning screen

**Files:**
- Create: `src/components/inventario/ContagemPorCodigo.tsx`
- Modify: `src/components/InventarioView.tsx` (render this component when `subView === 'contagem-codigo'`)

**Interfaces:**
- Consumes: `useContagemPorCodigo` (Task 4), `LeitorCodigoBarras` (imported unmodified from `@/components/estoque-operacional/LeitorCodigoBarras`), `Inventario`/`InventarioItem` types (Task 3).
- Produces: default export `ContagemPorCodigo(props)` — a full-screen counting UI.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ListChecks, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BarcodeLookupResult, Inventario, InventarioItem, UpdateContagemResult } from '@/hooks/useInventarioStore';
import { useContagemPorCodigo } from '@/hooks/useContagemPorCodigo';
import LeitorCodigoBarras from '@/components/estoque-operacional/LeitorCodigoBarras';
import { formatDisplayBR } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';

interface Props {
  inventario: Inventario;
  itens: InventarioItem[];
  canCount: boolean;
  onBack: () => void;
  onVerListaCompleta: () => void;
  onFinalizar: () => void;
  buscarPorBarcode: (inventarioId: string, barcode: string) => Promise<BarcodeLookupResult>;
  salvarContagem: (itemId: string, contagemBase: number) => Promise<UpdateContagemResult | null>;
}

const STATUS_LABEL: Record<Inventario['status'], string> = {
  RASCUNHO: 'Rascunho',
  EM_CONTAGEM: 'Em contagem',
  EM_REVISAO: 'Em revisão',
  SOB_ANALISE: 'Sob análise',
  FINALIZADO: 'Finalizado',
};

export default function ContagemPorCodigo({
  inventario, itens, canCount, onBack, onVerListaCompleta, onFinalizar, buscarPorBarcode, salvarContagem,
}: Props) {
  const [aviso, setAviso] = useState<string | undefined>();
  const [focoToken, setFocoToken] = useState(0);

  const { processarLeitura, desfazerUltimaLeitura, historico, processando } = useContagemPorCodigo({
    inventarioId: inventario.id, buscarPorBarcode, salvarContagem,
  });

  const totalItens = itens.length;
  const contados = itens.filter(i => i.contagem_fisica !== null).length;

  const tratarLeitura = async (raw: string) => {
    const resultado = await processarLeitura(raw);
    setFocoToken(v => v + 1);
    if (resultado.tipo === 'contabilizado') {
      setAviso(`✅ ${resultado.item.nomeProduto} — quantidade contada: ${resultado.item.quantidadeContadaCompra} ${resultado.item.unidadeCompra}`);
    } else if (resultado.tipo === 'nao_encontrado') {
      setAviso(`Produto não encontrado para o código ${resultado.barcode}.`);
    } else if (resultado.tipo === 'fora_do_inventario') {
      setAviso(`O código ${resultado.barcode} pertence a um produto fora deste inventário.`);
    } else {
      setAviso(resultado.mensagem);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-display font-bold text-foreground">
            Inventário: {formatDisplayBR(parseLocalDate(inventario.data))}
          </h2>
          <p className="text-xs text-muted-foreground">
            {STATUS_LABEL[inventario.status]} · {contados}/{totalItens} produtos contabilizados
          </p>
        </div>
      </div>

      {!canCount ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Você não tem permissão para contar itens deste inventário.
        </div>
      ) : (
        <LeitorCodigoBarras
          onLeitura={codigo => void tratarLeitura(codigo)}
          onLancarManualmente={() => setAviso('Digite o código no campo acima e pressione Enter.')}
          ocupado={processando}
          aviso={aviso}
          focoToken={focoToken}
        />
      )}

      {historico.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Últimos produtos contabilizados</p>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => void desfazerUltimaLeitura()} disabled={processando}>
              <Undo2 className="h-3.5 w-3.5" /> Desfazer última leitura
            </Button>
          </div>
          <ul className="space-y-1.5">
            {historico.map(h => (
              <li key={h.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-foreground">{h.nomeProduto}</span>
                <span className="shrink-0 font-mono text-success">+1 → {h.quantidadeContadaCompra} {h.unidadeCompra}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="h-12 flex-1 gap-1.5" onClick={onVerListaCompleta}>
          <ListChecks className="h-4 w-4" /> Ver lista completa
        </Button>
        <Button className="h-12 flex-1 gap-1.5" onClick={onFinalizar}>
          <CheckCircle2 className="h-4 w-4" /> Finalizar inventário
        </Button>
      </div>
    </div>
  );
}
```

`h.quantidadeContadaCompra` (inherited from `ItemContabilizado`, set in Task 4) already holds the post-scan purchase-unit quantity — no separate "new quantity" field is needed.

`onLancarManualmente` just shows a hint instead of opening a second input: the `LeitorCodigoBarras` field (reused unmodified) is already a plain, always-focused text input — typing a code and pressing Enter works today exactly the same way a physical reader "typing" into it does, so a second manual-entry UI would duplicate the same input for no behavioral difference.

Editing a scanned item's quantity by hand (the spec's "clicar em um produto contabilizado e ajustar manualmente") is intentionally not built inline here — `onVerListaCompleta` routes to the existing detail view, where `InventoryQuantityInput` (unmodified) already lets any counted item be corrected through the same `update_contagem` action this screen uses, so the capability exists without a second implementation.

- [ ] **Step 2: Wire it into `InventarioView.tsx`**

Add the import near the other sub-view imports (after `ExportListaContagemModal`, around line 29):

```ts
import ContagemPorCodigo from './inventario/ContagemPorCodigo';
```

Add this render block in `InventarioView.tsx` immediately before the `// ===== DETAIL VIEW =====` comment (before line 508):

```tsx
  // ===== CONTAGEM VIA CÓDIGO =====
  if (subView === 'contagem-codigo' && store.currentInventario) {
    return (
      <ContagemPorCodigo
        inventario={store.currentInventario}
        itens={store.currentItens}
        canCount={canEditDetail}
        onBack={() => setSubView('list')}
        onVerListaCompleta={() => setSubView('detail')}
        onFinalizar={() => setSubView('detail')}
        buscarPorBarcode={store.findItemByBarcode}
        salvarContagem={store.updateContagem}
      />
    );
  }
```

`onFinalizar` intentionally routes to the existing `'detail'` view rather than calling `store.finalizar` directly — finalization already has its own UI (partial-count confirmation dialog, anti-fraud block messaging) inside the detail view (`handleFinalizar`, lines 139+); reusing that screen means the barcode flow doesn't need a second finalize UI, exactly matching "mesmo processo de finalização".

- [ ] **Step 3: Add a way back from the detail view into the code screen while still counting**

In the detail view's header actions (`InventarioView.tsx`, inside the `<div className="flex gap-2">` block around line 554), add one more conditional button, right after the opening of that div:

```tsx
            {inv.metodo_contagem === 'codigo' && (inv.status === 'RASCUNHO' || inv.status === 'EM_CONTAGEM') && (
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setSubView('contagem-codigo')}>
                <Zap className="w-3.5 h-3.5" /> Leitor de Código
              </Button>
            )}
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck` then `npm run build` (verify exact script names in `package.json` first).
Expected: both succeed with no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/inventario/ContagemPorCodigo.tsx src/components/InventarioView.tsx
git commit -m "feat(inventario): tela de contagem via codigo de barras"
```

---

## Task 7: Regression checks

**Files:** none created — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test` (equivalent to `vitest run` per `package.json`).
Expected: all existing tests still pass, including `src/test/estoque-operacional-barcode.test.ts`, `src/test/estoque-operacional-domain.test.ts`, and the new `src/hooks/useContagemPorCodigo.test.ts`.

- [ ] **Step 2: Confirm `LeitorCodigoBarras.tsx` and `useMovimentacaoOperacional.ts` are untouched**

```bash
git diff --stat main -- src/components/estoque-operacional/ src/hooks/useMovimentacaoOperacional.ts
```

Expected: empty output — this plan never modifies either.

- [ ] **Step 3: Manual regression — existing inventories still open on Lista**

Using the running app (`npm run dev`), open Estoque → Inventário → Lista and open any of the 30 pre-existing inventories (all backfilled to `metodo_contagem = 'lista'` per Task 1 Step 4). Confirm it opens on the existing detail/list screen exactly as before, counts save the same way, and Finalizar still works.

- [ ] **Step 4: Manual regression — Movimentação Operacional barcode reading**

In Estoque Operacional → Movimentação, scan or type a known product barcode. Confirm product lookup, sector resolution, and the anti-duplicate-bounce behavior work exactly as before this plan (this module's code path was never touched, but this confirms the shared `barcode.ts` module wasn't broken by Task 4's new consumer).

- [ ] **Step 5: Manual regression — new "Contagem via Código" end to end**

Create a new inventory, choose "Contagem via Código", scan/type a known barcode 3 times for the same product (confirm quantity reaches 3, not more from any accidental double-fire), scan an unknown code (confirm "Produto não encontrado" without closing the scanner), use "Desfazer última leitura" (confirm the count decrements by exactly one), click "Ver lista completa" (confirm the manually-scanned quantities appear correctly converted to purchase units in the existing list view), and finalize (confirm the same finalize screen and stock adjustments as the Lista flow).

- [ ] **Step 6: Commit (only if Step 2/4 uncovered anything requiring a fix; otherwise no commit needed)**

If any regression was found and fixed, commit with `git commit -m "fix(inventario): <descrição da regressão corrigida>"`. If nothing needed fixing, this task ends without a commit.

---

## Explicitly out of scope for this plan

Camera-based scanning (Fase 4+ of the user's request — `BarcodeDetector`/`@zxing/browser`, torch, back-camera preference, MediaStream lifecycle) is a separate follow-up plan, written only after this plan's physical-scanner-and-manual flow is shipped and validated — matching the user's own instruction ("Fase 4 — CÂMERA: Somente depois do leitor físico funcionar dentro do Inventário"). The central hook (`useContagemPorCodigo.processarLeitura`) is already the integration point a camera component will call, so no rework is expected when that plan is written.
