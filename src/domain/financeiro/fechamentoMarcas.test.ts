import { describe, expect, it } from 'vitest';
import { buildFechamentoMarcaPayload } from './fechamentoMarcas';

describe('buildFechamentoMarcaPayload', () => {
  it('soma valores em formato brasileiro e preserva cada marca', () => {
    const result = buildFechamentoMarcaPayload(
      [{ id: 'salao' }, { id: 'ren' }, { id: 'royal' }],
      { salao: '1.200,50', ren: '300,25', royal: '499,25' }
    );

    expect(result.total).toBe(2000);
    expect(result.items).toEqual([
      { marca_id: 'salao', valor: 1200.5 },
      { marca_id: 'ren', valor: 300.25 },
      { marca_id: 'royal', valor: 499.25 },
    ]);
  });

  it('aceita quantidade dinâmica de marcas e assume zero nos campos vazios', () => {
    const brands = Array.from({ length: 25 }, (_, index) => ({ id: `marca-${index}` }));
    const result = buildFechamentoMarcaPayload(brands, { 'marca-24': '50,00' });

    expect(result.items).toHaveLength(25);
    expect(result.items[0].valor).toBe(0);
    expect(result.total).toBe(50);
  });
});
