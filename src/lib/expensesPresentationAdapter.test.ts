import { describe, expect, it } from 'vitest';
import { createPresentationExpensesData } from '@/test/fixtures/presentationExpenses';
import {
  PresentationExpensesPayloadError,
  adaptPresentationExpensesPayload,
  createSafeExpensesPayloadDiagnostic,
} from '@/lib/expensesPresentationAdapter';

function transportPayload() {
  const data = structuredClone(createPresentationExpensesData());
  const flatten = (nodes: typeof data.tree): Array<Omit<(typeof data.tree)[number], 'children'>> => nodes.flatMap(node => [
    { categoryId: node.categoryId, parentId: node.parentId, name: node.name, order: node.order, operationalClass: node.operationalClass, directAmount: node.directAmount, amount: node.amount },
    ...flatten(node.children),
  ]);
  return { ...data, tree: flatten(data.tree) };
}

describe('contrato defensivo de Despesas da Apresentação Sócios', () => {
  it('aceita o contrato DFC, reconstrói a árvore e preserva a semântica inversa', () => {
    const parsed = adaptPresentationExpensesPayload(transportPayload());
    expect(parsed.source.report).toBe('DFC');
    expect(parsed.source.regime).toBe('caixa');
    expect(parsed.delta).toMatchObject({ meaning: 'reduction', favorability: 'favorable' });
    expect(parsed.tree[0].children).toHaveLength(2);
    expect(parsed.tree[1].categoryId).toBeNull();
    expect(JSON.stringify(parsed)).not.toMatch(/Infinity|NaN/);
  });

  it('recusa total hierárquico adulterado, janela móvel fora de ordem e aumento favorável', () => {
    const hierarchy = transportPayload();
    hierarchy.tree[0].amount = 999;
    expect(() => adaptPresentationExpensesPayload(hierarchy)).toThrow(/valores próprios e agregados/);
    const rolling = transportPayload();
    rolling.rollingThreeMonths[0].yearMonth = '2025-12';
    expect(() => adaptPresentationExpensesPayload(rolling)).toThrow(/janela terminando/);
    const semantics = transportPayload();
    semantics.delta.meaning = 'increase';
    expect(() => adaptPresentationExpensesPayload(semantics)).toThrow(/semântica inversa/);
  });

  it('diagnostica somente forma e contagens, sem valores financeiros ou nomes', () => {
    const payload = transportPayload();
    payload.current.total = Number.NaN;
    let caught: PresentationExpensesPayloadError | undefined;
    try { adaptPresentationExpensesPayload(payload); } catch (error) { caught = error as PresentationExpensesPayloadError; }
    expect(createSafeExpensesPayloadDiagnostic(payload, caught!)).toEqual({
      error: { name: 'PresentationExpensesPayloadError', path: 'payload.current.total' },
      payload: { type: 'object', contractVersionType: 'string', rollingPointCount: 3, historyCount: 36, treeNodeCount: 4 },
    });
  });
});
