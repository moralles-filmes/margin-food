// ════════════════════════════════════════════════════════════════════════════
// Otimizador de Cotação (RFQ) — função pura, testável, client-side.
// ════════════════════════════════════════════════════════════════════════════
// Gera cenários de distribuição de compra entre fornecedores RESPEITANDO o
// pedido mínimo de cada um, com realocação inteligente. É a FONTE DA VERDADE dos
// números — a IA (fase futura) só anota/explica, nunca recalcula.
//
// Convenções: preço por unidade de compra; quantidade do item na mesma unidade;
// subtotal = preço × quantidade. Frete é custo fixo por fornecedor usado.

import type { CotacaoItem, CotacaoFornecedor, CotacaoResposta } from '@/types/cotacao';

export type ScenarioType =
  | 'MENOR_PRECO'
  | 'OTIMIZADA_PEDIDO_MINIMO'
  | 'MENOS_FORNECEDORES'
  | 'CUSTO_BENEFICIO';

export interface OptItem { id: string; nome: string; qty: number }
export interface OptSupplier { id: string; nome: string; minOrder: number; frete: number; prazo: number }
export interface OptQuote { price: number; available: boolean }

export interface SupplierLine { itemId: string; nome: string; qty: number; price: number; subtotal: number }
export interface SupplierBreakdown {
  supplierId: string;
  nome: string;
  lines: SupplierLine[];
  subtotal: number;
  frete: number;
  total: number;
  minOrder: number;
  meetsMin: boolean;
  minReachable: boolean;
}
export interface Reallocation { itemId: string; nome: string; fromNome: string | null; toNome: string | null; delta: number }
export interface Scenario {
  tipo: ScenarioType;
  /** itemId -> supplierId escolhido */
  assignment: Record<string, string>;
  perSupplier: SupplierBreakdown[];
  totalItens: number;
  totalFrete: number;
  totalGeral: number;
  suppliersUsed: number;
  economia: number;
  reallocations: Reallocation[];
  itemsSemResposta: { id: string; nome: string }[];
  warnings: string[];
}
export interface ScenarioSet {
  scenarios: Partial<Record<ScenarioType, Scenario>>;
  recomendado: ScenarioType;
}

export interface OptimizerInput {
  items: OptItem[];
  suppliers: OptSupplier[];
  /** quote[itemId][supplierId] */
  quotes: Record<string, Record<string, OptQuote>>;
}

const PRAZO_PENALTY = 0.005; // 0,5% por dia de prazo (custo-benefício)

// ── Construção da entrada a partir das linhas do banco ───────────────────────
export function buildOptimizerInput(
  itens: CotacaoItem[],
  fornecedores: CotacaoFornecedor[],
  respostas: CotacaoResposta[],
): OptimizerInput {
  const quotes: Record<string, Record<string, OptQuote>> = {};
  for (const it of itens) quotes[it.id] = {};
  for (const r of respostas) {
    if (!quotes[r.cotacao_item_id]) quotes[r.cotacao_item_id] = {};
    quotes[r.cotacao_item_id][r.cotacao_fornecedor_id] = {
      price: r.preco_unitario != null ? Number(r.preco_unitario) : NaN,
      available: r.disponivel !== false && r.preco_unitario != null,
    };
  }
  return {
    items: itens.map(it => ({ id: it.id, nome: it.produto_nome_snapshot, qty: Number(it.quantidade) || 0 })),
    suppliers: fornecedores.map(f => ({
      id: f.id,
      nome: f.supplier_nome_snapshot,
      minOrder: Number(f.pedido_minimo_snapshot) || 0,
      frete: Number(f.frete) || 0,
      prazo: f.prazo_entrega_dias != null ? Number(f.prazo_entrega_dias) : 0,
    })),
    quotes,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function availableSuppliers(input: OptimizerInput, itemId: string): { supplierId: string; price: number }[] {
  const row = input.quotes[itemId] ?? {};
  return Object.entries(row)
    .filter(([, q]) => q.available && Number.isFinite(q.price))
    .map(([supplierId, q]) => ({ supplierId, price: q.price }));
}

function supplierMap(input: OptimizerInput): Record<string, OptSupplier> {
  const m: Record<string, OptSupplier> = {};
  for (const s of input.suppliers) m[s.id] = s;
  return m;
}

function itemMap(input: OptimizerInput): Record<string, OptItem> {
  const m: Record<string, OptItem> = {};
  for (const it of input.items) m[it.id] = it;
  return m;
}

/** Atribui cada item ao fornecedor que minimiza a métrica. metric=price (menor preço). */
function assignByMetric(input: OptimizerInput, metric: (s: OptSupplier, price: number) => number): Record<string, string> {
  const sm = supplierMap(input);
  const assignment: Record<string, string> = {};
  for (const it of input.items) {
    const avail = availableSuppliers(input, it.id);
    if (avail.length === 0) continue;
    let best = avail[0]; let bestScore = metric(sm[avail[0].supplierId], avail[0].price);
    for (const a of avail.slice(1)) {
      const sc = metric(sm[a.supplierId], a.price);
      if (sc < bestScore) { best = a; bestScore = sc; }
    }
    assignment[it.id] = best.supplierId;
  }
  return assignment;
}

function priceFor(input: OptimizerInput, itemId: string, supplierId: string): number | null {
  const q = input.quotes[itemId]?.[supplierId];
  return q && q.available && Number.isFinite(q.price) ? q.price : null;
}

function computeBreakdown(input: OptimizerInput, assignment: Record<string, string>, unreachable: Set<string>): SupplierBreakdown[] {
  const sm = supplierMap(input);
  const im = itemMap(input);
  const bySupplier: Record<string, SupplierLine[]> = {};
  for (const [itemId, supplierId] of Object.entries(assignment)) {
    const price = priceFor(input, itemId, supplierId);
    if (price == null) continue;
    const it = im[itemId];
    (bySupplier[supplierId] ??= []).push({ itemId, nome: it.nome, qty: it.qty, price, subtotal: price * it.qty });
  }
  return Object.entries(bySupplier).map(([supplierId, lines]) => {
    const s = sm[supplierId];
    const subtotal = lines.reduce((a, l) => a + l.subtotal, 0);
    const frete = s.frete || 0;
    return {
      supplierId,
      nome: s.nome,
      lines,
      subtotal,
      frete,
      total: subtotal + frete,
      minOrder: s.minOrder,
      meetsMin: s.minOrder <= 0 || subtotal >= s.minOrder,
      minReachable: !unreachable.has(supplierId),
    };
  }).sort((a, b) => b.total - a.total);
}

/** Realoca itens para que todo fornecedor usado bata o pedido mínimo (heurístico). */
function balanceMinOrder(input: OptimizerInput, base: Record<string, string>): { assignment: Record<string, string>; unreachable: Set<string> } {
  const sm = supplierMap(input);
  const im = itemMap(input);
  const assignment = { ...base };
  const unreachable = new Set<string>();
  const maxIters = input.items.length * input.suppliers.length + 20;

  const subtotalOf = (supplierId: string): number =>
    Object.entries(assignment).reduce((acc, [itemId, sid]) => {
      if (sid !== supplierId) return acc;
      const p = priceFor(input, itemId, supplierId);
      return acc + (p != null ? p * im[itemId].qty : 0);
    }, 0);

  for (let iter = 0; iter < maxIters; iter++) {
    const used = [...new Set(Object.values(assignment))];
    const under = used
      .filter(sid => !unreachable.has(sid))
      .map(sid => ({ sid, gap: sm[sid].minOrder - subtotalOf(sid) }))
      .filter(x => sm[x.sid].minOrder > 0 && x.gap > 0.0001)
      .sort((a, b) => a.gap - b.gap);
    if (under.length === 0) break;

    const S = under[0].sid;
    const sItems = Object.keys(assignment).filter(itemId => assignment[itemId] === S);

    // Opção A — remover S: move cada item dele p/ próximo mais barato (≠ S)
    let dropFeasible = true;
    let dropDelta = 0;
    const dropPlan: Record<string, string> = {};
    for (const itemId of sItems) {
      const alts = availableSuppliers(input, itemId).filter(a => a.supplierId !== S);
      if (alts.length === 0) { dropFeasible = false; break; }
      const best = alts.reduce((m, a) => (a.price < m.price ? a : m), alts[0]);
      const sPrice = priceFor(input, itemId, S)!;
      dropDelta += (best.price - sPrice) * im[itemId].qty;
      dropPlan[itemId] = best.supplierId;
    }

    // Opção B — consolidar: traz itens de outros fornecedores p/ S até bater o mínimo
    const candidates = Object.keys(assignment)
      .filter(itemId => assignment[itemId] !== S)
      .map(itemId => {
        const sPrice = priceFor(input, itemId, S);
        if (sPrice == null) return null;
        const curPrice = priceFor(input, itemId, assignment[itemId])!;
        return { itemId, extra: (sPrice - curPrice) * im[itemId].qty, add: sPrice * im[itemId].qty };
      })
      .filter(Boolean)
      .sort((a, b) => a!.extra - b!.extra) as { itemId: string; extra: number; add: number }[];
    let consSubtotal = subtotalOf(S);
    let consDelta = 0;
    const consPlan: string[] = [];
    for (const c of candidates) {
      if (consSubtotal >= sm[S].minOrder) break;
      consSubtotal += c.add;
      consDelta += c.extra;
      consPlan.push(c.itemId);
    }
    const consolidateFeasible = consSubtotal >= sm[S].minOrder;

    // Decide a jogada mais barata viável
    if (dropFeasible && (!consolidateFeasible || dropDelta <= consDelta)) {
      for (const [itemId, to] of Object.entries(dropPlan)) assignment[itemId] = to;
    } else if (consolidateFeasible) {
      for (const itemId of consPlan) assignment[itemId] = S;
    } else {
      // Nem remover nem consolidar resolve → mínimo inatingível; aceita S como está
      unreachable.add(S);
    }
  }

  return { assignment, unreachable };
}

function maxAvailPrice(input: OptimizerInput, itemId: string): number | null {
  const avail = availableSuppliers(input, itemId);
  return avail.length ? Math.max(...avail.map(a => a.price)) : null;
}

function buildScenario(
  input: OptimizerInput,
  tipo: ScenarioType,
  assignment: Record<string, string>,
  unreachable: Set<string>,
  baseline: Record<string, string>,
): Scenario {
  const sm = supplierMap(input);
  const im = itemMap(input);
  const perSupplier = computeBreakdown(input, assignment, unreachable);
  const totalItens = perSupplier.reduce((a, s) => a + s.subtotal, 0);
  const totalFrete = perSupplier.reduce((a, s) => a + s.frete, 0);

  let economia = 0;
  for (const [itemId, supplierId] of Object.entries(assignment)) {
    const chosen = priceFor(input, itemId, supplierId);
    const worst = maxAvailPrice(input, itemId);
    if (chosen != null && worst != null) economia += (worst - chosen) * im[itemId].qty;
  }

  // Realocações vs baseline (menor preço absoluto)
  const reallocations: Reallocation[] = [];
  for (const it of input.items) {
    const from = baseline[it.id];
    const to = assignment[it.id];
    if (from && to && from !== to) {
      const pFrom = priceFor(input, it.id, from);
      const pTo = priceFor(input, it.id, to);
      reallocations.push({
        itemId: it.id, nome: it.nome,
        fromNome: sm[from]?.nome ?? null, toNome: sm[to]?.nome ?? null,
        delta: (pTo != null && pFrom != null) ? (pTo - pFrom) * it.qty : 0,
      });
    }
  }

  const itemsSemResposta = input.items
    .filter(it => availableSuppliers(input, it.id).length === 0)
    .map(it => ({ id: it.id, nome: it.nome }));

  const warnings: string[] = [];
  perSupplier.filter(s => !s.meetsMin && s.subtotal > 0).forEach(s =>
    warnings.push(`${s.nome} não bate o pedido mínimo (${s.subtotal.toFixed(2)} de ${s.minOrder.toFixed(2)})`));

  return {
    tipo, assignment, perSupplier,
    totalItens, totalFrete, totalGeral: totalItens + totalFrete,
    suppliersUsed: perSupplier.length,
    economia, reallocations, itemsSemResposta, warnings,
  };
}

/** Cenário "menos fornecedores": cobre o máximo de itens por fornecedor (menos entregas). */
function assignFewestSuppliers(input: OptimizerInput): Record<string, string> {
  const assignment: Record<string, string> = {};
  const remaining = new Set(input.items.filter(it => availableSuppliers(input, it.id).length > 0).map(it => it.id));
  while (remaining.size > 0) {
    let bestSupplier: string | null = null;
    let bestItems: string[] = [];
    for (const s of input.suppliers) {
      const covers = [...remaining].filter(itemId => priceFor(input, itemId, s.id) != null);
      if (covers.length > bestItems.length) { bestItems = covers; bestSupplier = s.id; }
    }
    if (!bestSupplier || bestItems.length === 0) break;
    for (const itemId of bestItems) { assignment[itemId] = bestSupplier; remaining.delete(itemId); }
  }
  return assignment;
}

// ── API principal ────────────────────────────────────────────────────────────
export function optimizeCotacao(input: OptimizerInput): ScenarioSet {
  const baseline = assignByMetric(input, (_s, price) => price); // menor preço absoluto
  const noUnreachable = new Set<string>();

  const menorPreco = buildScenario(input, 'MENOR_PRECO', baseline, noUnreachable, baseline);

  const balanced = balanceMinOrder(input, baseline);
  const otimizada = buildScenario(input, 'OTIMIZADA_PEDIDO_MINIMO', balanced.assignment, balanced.unreachable, baseline);

  const fewest = assignFewestSuppliers(input);
  const menosForn = buildScenario(input, 'MENOS_FORNECEDORES', fewest, noUnreachable, baseline);

  const cbBase = assignByMetric(input, (s, price) => price * (1 + (s.prazo || 0) * PRAZO_PENALTY));
  const cbBalanced = balanceMinOrder(input, cbBase);
  const custoBeneficio = buildScenario(input, 'CUSTO_BENEFICIO', cbBalanced.assignment, cbBalanced.unreachable, baseline);

  const scenarios: Partial<Record<ScenarioType, Scenario>> = {
    MENOR_PRECO: menorPreco,
    OTIMIZADA_PEDIDO_MINIMO: otimizada,
    MENOS_FORNECEDORES: menosForn,
    CUSTO_BENEFICIO: custoBeneficio,
  };
  const recomendado: ScenarioType = otimizada.suppliersUsed > 0 ? 'OTIMIZADA_PEDIDO_MINIMO' : 'MENOR_PRECO';
  return { scenarios, recomendado };
}

/** Recalcula um cenário a partir de uma atribuição manual (override do usuário). */
export function rebuildFromAssignment(input: OptimizerInput, assignment: Record<string, string>): Scenario {
  const baseline = assignByMetric(input, (_s, price) => price);
  // marca como inatingível quem não bate o mínimo (sem realocar — é escolha manual)
  const unreachable = new Set<string>();
  return buildScenario(input, 'MANUAL' as ScenarioType, assignment, unreachable, baseline);
}

export const SCENARIO_LABELS: Record<ScenarioType, string> = {
  MENOR_PRECO: 'Menor preço',
  OTIMIZADA_PEDIDO_MINIMO: 'Otimizada (pedido mínimo)',
  MENOS_FORNECEDORES: 'Menos fornecedores',
  CUSTO_BENEFICIO: 'Custo-benefício',
};
