import { describe, expect, it } from 'vitest';
import {
  competenciaDaLinhaExtrato, datasDoLancamentoCriado, decisaoDaLinhaExtrato, definirDecisaoDaLinha,
  rateioDaLinhaExtrato, resumoCmvRateio, trocarCategoriaDaLinha, type LinhaExtratoCmv,
} from './conciliacaoCmv';

const padroes = new Map<string, boolean | null>([['peixes', true], ['escr', false], ['sem', null]]);
const linha = (over: Partial<LinhaExtratoCmv> = {}): LinhaExtratoCmv => ({ data: '2026-09-10', valor: 55, tipo: 'DESPESA', ...over });
const rateio = (categoria_id: string, valor: number, cmv_incluir?: boolean | null) =>
  ({ categoria_id, centro_custo_id: '', valor, percentual: 0, observacao: '', cmv_incluir });

describe('conciliação — decisão do CMV e competência da linha do extrato', () => {
  it('categoria única: a decisão da linha vai no item, com o centro de custo padrão da categoria', () => {
    expect(rateioDaLinhaExtrato(linha({ categoriaId: 'peixes', cmvIncluir: true }), () => 'cc1', true)).toEqual([
      { categoria_id: 'peixes', centro_custo_id: 'cc1', valor: 55, percentual: 100, observacao: null, cmv_incluir: true },
    ]);
  });

  it('rateio: cada linha leva a sua decisão', () => {
    const itens = rateioDaLinhaExtrato(linha({ rateioLinhas: [rateio('peixes', 40, true), rateio('escr', 15, false)] }), () => null, true);
    expect(itens?.map(i => i.cmv_incluir)).toEqual([true, false]);
  });

  it('receita, ou banco sem o recurso: o payload de antes, sem a chave da decisão', () => {
    expect(rateioDaLinhaExtrato(linha({ tipo: 'RECEITA', categoriaId: 'vendas', cmvIncluir: true }), () => null, true)?.[0]).not.toHaveProperty('cmv_incluir');
    expect(rateioDaLinhaExtrato(linha({ categoriaId: 'peixes', cmvIncluir: true }), () => null, false)?.[0]).not.toHaveProperty('cmv_incluir');
  });

  it('sem categoria: null (a RPC exige categoria e a tela já barra antes)', () => {
    expect(rateioDaLinhaExtrato(linha(), () => null, true)).toBeNull();
  });

  it('linha salva antes do recurso (sem os campos novos) segue pendente e sem competência própria', () => {
    expect(rateioDaLinhaExtrato(linha({ categoriaId: 'peixes' }), () => null, true)?.[0].cmv_incluir).toBeNull();
    expect(competenciaDaLinhaExtrato(linha(), true)).toEqual({});
  });

  it('competência só vai quando difere da data do banco, em despesa, e o banco aceita', () => {
    expect(competenciaDaLinhaExtrato(linha({ competencia: '2026-09-03' }), true)).toEqual({ p_data_competencia: '2026-09-03' });
    expect(competenciaDaLinhaExtrato(linha({ competencia: '2026-09-10' }), true)).toEqual({});
    expect(competenciaDaLinhaExtrato(linha({ competencia: '' }), true)).toEqual({});
    expect(competenciaDaLinhaExtrato(linha({ competencia: '2026-09-03' }), false)).toEqual({});
    expect(competenciaDaLinhaExtrato(linha({ tipo: 'RECEITA', competencia: '2026-09-03' }), true)).toEqual({});
  });

  it('trocar a categoria na linha: ela vale (o rateio de uma linha salvo antes sai) e a decisão é sugerida de novo', () => {
    const antes = linha({ categoriaId: 'peixes', rateioLinhas: [rateio('peixes', 55, true)] });
    const depois = trocarCategoriaDaLinha(antes, 'escr', padroes);
    expect(depois.rateioLinhas).toBeUndefined();
    expect(depois).toMatchObject({ categoriaId: 'escr', cmvIncluir: false, cmvAviso: 'redefinido' });
    expect(trocarCategoriaDaLinha(linha(), 'sem', padroes)).toMatchObject({ categoriaId: 'sem', cmvIncluir: null });
    // classificação desligada (sem padrões): a resposta da linha não muda sozinha
    expect(trocarCategoriaDaLinha(linha({ cmvIncluir: true }), 'escr', null)).toMatchObject({ categoriaId: 'escr', cmvIncluir: true });
    // receita nunca recebe sugestão
    expect(trocarCategoriaDaLinha(linha({ tipo: 'RECEITA' }), 'peixes', padroes).cmvIncluir).toBeUndefined();
  });

  it('trocar a categoria com a classificação desligada não perde a decisão que vive só no rateio de uma linha', () => {
    const antes = linha({ categoriaId: 'peixes', rateioLinhas: [rateio('peixes', 55, true)] });
    const depois = trocarCategoriaDaLinha(antes, 'outra', null);
    expect(depois.rateioLinhas).toBeUndefined();
    expect(depois).toMatchObject({ categoriaId: 'outra', cmvIncluir: true });
    expect(decisaoDaLinhaExtrato(depois)).toBe(true);
    // a linha sem resposta nenhuma segue pendente
    expect(decisaoDaLinhaExtrato(trocarCategoriaDaLinha(linha({ rateioLinhas: [rateio('peixes', 55, null)] }), 'outra', null))).toBeNull();
  });

  it('não altera a linha recebida: devolve objetos novos mesmo com tudo congelado', () => {
    const congelada = Object.freeze(linha({
      categoriaId: 'peixes',
      rateioLinhas: Object.freeze([Object.freeze(rateio('peixes', 55, null))]) as unknown as LinhaExtratoCmv['rateioLinhas'],
    }));
    const respondida = definirDecisaoDaLinha(congelada, true);
    expect(respondida).not.toBe(congelada);
    expect(respondida.rateioLinhas).not.toBe(congelada.rateioLinhas);
    expect(decisaoDaLinhaExtrato(respondida)).toBe(true);
    expect(decisaoDaLinhaExtrato(congelada)).toBeNull();

    const trocada = trocarCategoriaDaLinha(congelada, 'escr', padroes);
    expect(trocada).not.toBe(congelada);
    expect(trocada).toMatchObject({ categoriaId: 'escr', cmvIncluir: false });
    expect(congelada.categoriaId).toBe('peixes');
    expect(congelada.rateioLinhas).toHaveLength(1);
  });

  it('a decisão exibida e a gravada são a mesma: com rateio de uma linha, a da linha do rateio', () => {
    const umaLinha = linha({ rateioLinhas: [rateio('peixes', 55, null)] });
    const respondida = definirDecisaoDaLinha(umaLinha, true);
    expect(decisaoDaLinhaExtrato(respondida)).toBe(true);
    expect(rateioDaLinhaExtrato(respondida, () => null, true)?.[0].cmv_incluir).toBe(true);
    expect(decisaoDaLinhaExtrato(definirDecisaoDaLinha(linha(), false))).toBe(false);
  });

  it('resumo do rateio com várias linhas', () => {
    expect(resumoCmvRateio([rateio('a', 1, true), rateio('b', 1, null), rateio('c', 1, false)])).toEqual({ total: 3, respondidas: 2 });
  });

  it('datas do diálogo "Criar": a data do banco no p_data e a competência à parte', () => {
    expect(datasDoLancamentoCriado({ dataBanco: '2026-09-10', dataCompetencia: '2026-09-03', aceitaCompetencia: true }))
      .toEqual({ p_data: '2026-09-10', extra: { p_data_competencia: '2026-09-03' }, atualizaPagamento: false });
    expect(datasDoLancamentoCriado({ dataBanco: '2026-09-10', dataCompetencia: '2026-09-10', aceitaCompetencia: true }))
      .toEqual({ p_data: '2026-09-10', extra: {}, atualizaPagamento: false });
    // competência apagada: a data do banco vale para os dois
    expect(datasDoLancamentoCriado({ dataBanco: '2026-09-10', dataCompetencia: '', aceitaCompetencia: true }))
      .toEqual({ p_data: '2026-09-10', extra: {}, atualizaPagamento: false });
    // banco sem o recurso: exatamente o fluxo de antes
    expect(datasDoLancamentoCriado({ dataBanco: '2026-09-10', dataCompetencia: '2026-09-03', aceitaCompetencia: false }))
      .toEqual({ p_data: '2026-09-03', extra: {}, atualizaPagamento: true });
  });
});
