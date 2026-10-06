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
