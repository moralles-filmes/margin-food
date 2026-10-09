import { describe, expect, it } from 'vitest';
import { cmvDoCabecalho, conteudoChaveLancamento, rateiosComCmv } from './cmvLancamentoPayload';
import { jsonCanonico } from './chaveOperacao';

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

describe('conteúdo da chave de idempotência do Livro Razão', () => {
  const base = (sobre: { valor?: number; cabecalho?: boolean | null; linha?: boolean | null } = {}) => ({
    p_id: null,
    p_tipo: 'DESPESA',
    p_valor: sobre.valor ?? 100,
    p_categoria_id: null,
    p_descricao: 'Feira',
    p_rateios: rateiosComCmv([
      { id: 'r1', categoria_id: 'peixes', centro_custo_id: '', valor: 70, percentual: 70, cmv_incluir: sobre.linha ?? true },
      { categoria_id: 'escr', centro_custo_id: 'cc', valor: 30, percentual: 30, cmv_incluir: false },
    ], true),
    p_updated_at: null,
    ...cmvDoCabecalho(false, sobre.cabecalho ?? true, true),
  });

  it('a resposta do CMV (cabeçalho e linha) não entra: trocar Sim/Não depois de uma resposta perdida reenvia a mesma operação', () => {
    const a = conteudoChaveLancamento(base({ cabecalho: true, linha: true }));
    const b = conteudoChaveLancamento(base({ cabecalho: false, linha: null }));
    expect(jsonCanonico(a)).toBe(jsonCanonico(b));
    expect(a).not.toHaveProperty('p_cmv');
    for (const item of a.p_rateios as Record<string, unknown>[]) {
      expect(item).not.toHaveProperty('cmv_incluir');
      expect(item).not.toHaveProperty('id');
    }
  });

  it('o resto do conteúdo continua na chave: outro valor é outra operação', () => {
    expect(jsonCanonico(conteudoChaveLancamento(base({ valor: 100 }))))
      .not.toBe(jsonCanonico(conteudoChaveLancamento(base({ valor: 101 }))));
  });

  it('sem o recurso, o conteúdo é o mesmo de quando a resposta vai; nada além do CMV sai e o original não muda', () => {
    const semRecurso = {
      ...base(),
      p_rateios: rateiosComCmv([
        { id: 'r1', categoria_id: 'peixes', centro_custo_id: '', valor: 70, percentual: 70 },
        { categoria_id: 'escr', centro_custo_id: 'cc', valor: 30, percentual: 30 },
      ], false),
      p_cmv: undefined,
    };
    const comRecurso = base();
    expect(jsonCanonico(conteudoChaveLancamento(comRecurso))).toBe(jsonCanonico(conteudoChaveLancamento(semRecurso)));
    expect(conteudoChaveLancamento(comRecurso)).toMatchObject({ p_tipo: 'DESPESA', p_valor: 100, p_descricao: 'Feira', p_id: null });
    expect(comRecurso).toHaveProperty('p_cmv');
    expect(comRecurso.p_rateios[0]).toHaveProperty('cmv_incluir', true);
  });
});
