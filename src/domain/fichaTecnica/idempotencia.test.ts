import { describe, expect, it } from 'vitest';
import { chaveCriacaoComponente, type ItemComponenteChave } from './idempotencia';

const campos = { tipo: 'PRE_PREPARO', nome: 'Molho', rendimento: 500, unidade_rendimento: 'g' };
const itens: ItemComponenteChave[] = [
  { produto_id: 'p1', componente_filho_id: null, quantidade: 100, unidade: 'g', origem: 'ESTOQUE_GERAL' },
  { produto_id: null, componente_filho_id: 'c1', quantidade: 2, unidade: 'un', origem: 'ESTOQUE_GERAL' },
];

describe('chaveCriacaoComponente', () => {
  it('o retry do mesmo formulário reaproveita a chave (o servidor devolve o componente já criado)', async () => {
    expect(await chaveCriacaoComponente('s1', { campos, itens }))
      .toBe(await chaveCriacaoComponente('s1', { campos: { ...campos }, itens: itens.map(i => ({ ...i })) }));
  });

  it('mudar um campo ou um item gera chave nova', async () => {
    const base = await chaveCriacaoComponente('s1', { campos, itens });
    expect(await chaveCriacaoComponente('s1', { campos: { ...campos, nome: 'Molho 2' }, itens })).not.toBe(base);
    expect(await chaveCriacaoComponente('s1', { campos, itens: [{ ...itens[0], quantidade: 101 }, itens[1]] })).not.toBe(base);
    expect(await chaveCriacaoComponente('s1', { campos, itens: itens.slice(0, 1) })).not.toBe(base);
  });

  it('semente nova = componente novo', async () => {
    expect(await chaveCriacaoComponente('s2', { campos, itens })).not.toBe(await chaveCriacaoComponente('s1', { campos, itens }));
  });
});
