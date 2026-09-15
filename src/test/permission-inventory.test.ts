import { describe, expect, it } from 'vitest';
import { classifyPermission, scanTypeScript } from '../../scripts/audit-permission-inventory';

describe('permission inventory evidence', () => {
  it('classifies canonical, legacy, global and unknown keys with explicit precedence', () => {
    expect(classifyPermission('estoque:catalogo:delete')).toBe('VÁLIDA');
    expect(classifyPermission('stock:delete')).toBe('LEGADA');
    expect(classifyPermission('system:admin')).toBe('LEGADA');
    expect(classifyPermission('system:global:manage')).toBe('GLOBAL');
    expect(classifyPermission('estoque:catalogo:admin')).toBe('FANTASMA');
    expect(classifyPermission(null)).toBe('NÃO ENCONTRADA');
    expect(classifyPermission('estoque:catalogo:edit', true)).toBe('DIVERGENTE');
  });
  it('keeps dynamic gates, literals, comments and callers separate with locations', () => {
    const rows = scanTypeScript('src/example.tsx', `// estoque:catalogo:delete\nfunction Page() {\n const allowed = useCan(key);\n const direct = useCan('estoque:catalogo:view');\n client.rpc('deactivate_produto', {p_produto_id: id});\n return <RequirePermission permission={dynamic} />;\n}`);
    expect(rows.find(r => r.kind === 'comment')).toMatchObject({ line: 1, lifecycle: 'comment' });
    expect(rows.find(r => r.kind === 'dynamic-gate')).toMatchObject({ line: 3, expression: 'key', classification: 'NÃO ENCONTRADA' });
    expect(rows.find(r => r.kind === 'literal')).toMatchObject({ line: 4, key: 'estoque:catalogo:view' });
    expect(rows.find(r => r.kind === 'caller')).toMatchObject({ line: 5, operation: 'rpc' });
    expect(rows.find(r => r.kind === 'dynamic-jsx')).toMatchObject({ line: 6 });
  });
  it('does not count tests or generated types as runtime authorization', () => {
    expect(scanTypeScript('src/test/a.test.ts', `can('stock:edit')`)[0].lifecycle).toBe('test');
    expect(scanTypeScript('src/integrations/supabase/types.ts', `type X = 'stock:edit'`)[0].lifecycle).toBe('type');
  });
});
