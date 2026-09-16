import { describe, expect, it } from 'vitest';
import { withCompanyId } from './companyPayload';

describe('company payload', () => {
  it('preserves the initiating company and overrides stale payload scope', () => {
    const original = { company_id: 'B', value: 5 };
    const pending = withCompanyId('A', original);
    expect(pending).toEqual({ company_id: 'A', value: 5 });
    expect(withCompanyId('B', original).company_id).toBe('B');
    expect(pending.company_id).toBe('A');
    expect(original.company_id).toBe('B');
  });
  it('scopes every row without mutating a batch', () => {
    const rows = [{ value: 1 }, { value: 2 }];
    expect(withCompanyId('A', rows)).toEqual(rows.map(row => ({ ...row, company_id: 'A' })));
    expect(rows).toEqual([{ value: 1 }, { value: 2 }]);
  });
  it('rejects missing scope before dispatch', () => {
    expect(() => withCompanyId(null, {})).toThrow('Unidade não selecionada');
    expect(() => withCompanyId(null, [])).toThrow('Unidade não selecionada');
  });
});
