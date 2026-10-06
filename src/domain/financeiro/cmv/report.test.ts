import { describe, expect, it } from 'vitest';
import { CAT, CMV_FILTRO_SEMANA, cmvPayloadCru } from '@/test/fixtures/cmvFinanceiro';
import { corCategoriaCss, corCategoriaRgb } from './cores';
import {
  CMV_SEM_CATEGORIA_ID, CmvContractError, achatarCategorias, buildCmvReport,
  fatiasDaComposicao, formatarCentavos, formatarPercentual, formatarPontos, formatarVariacao,
  parseCmvPayload, razaoPercentual, variacaoPercentual,
} from './report';

const montar = (overrides: Record<string, unknown> = {}, filtro = CMV_FILTRO_SEMANA) =>
  buildCmvReport(parseCmvPayload(cmvPayloadCru(overrides)), filtro);

describe('CMV Financeiro — fórmulas', () => {
  it('CMV% é a razão dos totais e só existe com faturamento positivo', () => {
    expect(razaoPercentual(310000, 1000000)).toBeCloseTo(31, 10);
    expect(razaoPercentual(100, 0)).toBeNull();
    expect(razaoPercentual(100, -50)).toBeNull();
    expect(razaoPercentual(100, null)).toBeNull();
  });

  it('variação percentual exige base anterior positiva', () => {
    expect(variacaoPercentual(310000, 200000)).toBeCloseTo(55, 10);
    expect(variacaoPercentual(100, 0)).toBeNull();
    expect(variacaoPercentual(100, null)).toBeNull();
    expect(variacaoPercentual(null, 100)).toBeNull();
  });

  it('formatação nunca mostra NaN, Infinity ou 0% enganoso', () => {
    expect(formatarPercentual(null)).toBe('—');
    expect(formatarPercentual(Number.NaN)).toBe('—');
    expect(formatarPercentual(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatarPercentual(28.744)).toBe('28,74%');
    expect(formatarVariacao(null)).toBe('—');
    expect(formatarVariacao(14.06)).toBe('+14,1%');
    expect(formatarPontos(-8.48)).toBe('-8,48 p.p.');
    expect(formatarPontos(6)).toBe('+6,00 p.p.');
    expect(formatarCentavos(1238931)).toBe('R$ 12.389,31');
    expect(formatarCentavos(-35000)).toBe('-R$ 350,00');
    expect(formatarCentavos(null)).toBe('—');
  });
});

describe('CMV Financeiro — contrato do payload', () => {
  it('recusa versão desconhecida, data inválida e valor não inteiro', () => {
    expect(() => parseCmvPayload(cmvPayloadCru({ contrato: 'outro' }))).toThrow(CmvContractError);
    expect(() => parseCmvPayload(cmvPayloadCru({ hoje: '20/09/2026' }))).toThrow(CmvContractError);
    expect(() => parseCmvPayload(cmvPayloadCru({ faturamento: [{ data: '2026-09-08', centavos: 10.5 }] }))).toThrow(CmvContractError);
    expect(() => parseCmvPayload(null)).toThrow(CmvContractError);
  });

  it('recusa payload de outro período (resposta antiga não vira o filtro atual)', () => {
    expect(() => montar({}, { modo: 'semanal', inicio: '2026-09-14', fim: '2026-09-20' })).toThrow(CmvContractError);
  });
});

describe('CMV Financeiro — relatório', () => {
  it('cards saem dos totais do intervalo', () => {
    const r = montar();
    expect(r.faturamento).toMatchObject({ atual: 1000000, anterior: 800000, diferenca: 200000 });
    expect(r.faturamento.variacaoPercentual).toBeCloseTo(25, 10);
    expect(r.cmv).toMatchObject({ atual: 310000, anterior: 200000, diferenca: 110000 });
    expect(r.cmv.variacaoPercentual).toBeCloseTo(55, 10);
    expect(r.percentual.atual).toBeCloseTo(31, 10);
    expect(r.percentual.anterior).toBeCloseTo(25, 10);
    expect(r.percentual.pontos).toBeCloseTo(6, 10);
    expect(r.saldoAposCmvCentavos).toBe(690000);
  });

  it('conta boletos distintos, não linhas de rateio', () => {
    // dois rateios do mesmo boleto no mesmo dia continuam sendo 1 boleto
    const r = montar({
      cmv: [
        { data: '2026-09-08', categoria_id: CAT.salmao, centavos: 120000 },
        { data: '2026-09-08', categoria_id: CAT.bebidas, centavos: 60000 },
      ],
      boletos: [{ data: '2026-09-08', quantidade: 1 }],
    });
    expect(r.boletos.atual).toBe(1);
    expect(r.cmv.atual).toBe(180000);
  });

  it('% total não é a média dos percentuais das faixas', () => {
    const r = montar();
    const percentuais = r.serie.map(p => p.cmvPercentual).filter((v): v is number => v !== null);
    const media = percentuais.reduce((s, v) => s + v, 0) / percentuais.length;
    expect(r.percentual.atual).toBeCloseTo(31, 10);
    expect(media).not.toBeCloseTo(31, 1);
  });

  it('série diária cobre a semana inteira e reconcilia com os cards', () => {
    const r = montar();
    expect(r.granularidade).toBe('dia');
    expect(r.serie).toHaveLength(7);
    expect(r.serie.reduce((s, p) => s + (p.cmvCentavos ?? 0), 0)).toBe(r.cmv.atual);
    expect(r.serie.reduce((s, p) => s + (p.faturamentoCentavos ?? 0), 0)).toBe(r.faturamento.atual);
    // segunda-feira sem fechamento: faturamento nulo, não zero
    expect(r.serie[0]).toMatchObject({ faturamentoCentavos: null, cmvCentavos: 0, cmvPercentual: null });
    for (const ponto of r.serie) {
      expect(Object.values(ponto.porGrupo).reduce((s, v) => s + v, 0)).toBe(ponto.cmvCentavos);
    }
  });

  it('"sem fechamento" é diferente de "faturamento zero confirmado"', () => {
    const semFechamento = montar({ faturamento: [] });
    expect(semFechamento.atual.faturamentoCentavos).toBeNull();
    expect(semFechamento.percentual.atual).toBeNull();
    expect(semFechamento.atual.motivoSemPercentual).toMatch(/Sem fechamento/);
    expect(semFechamento.saldoAposCmvCentavos).toBeNull();

    const zero = montar({ faturamento: [{ data: '2026-09-08', centavos: 0 }] });
    expect(zero.atual.faturamentoCentavos).toBe(0);
    expect(zero.percentual.atual).toBeNull();
    expect(zero.atual.motivoSemPercentual).toMatch(/zero confirmado/);
  });

  it('sem base anterior: variação nula, diferença em reais indisponível só quando falta o lado', () => {
    const r = montar({
      faturamento: [{ data: '2026-09-08', centavos: 500000 }],
      cmv: [{ data: '2026-09-08', categoria_id: CAT.salmao, centavos: 100000 }],
      boletos: [{ data: '2026-09-08', quantidade: 1 }],
    });
    expect(r.faturamento.anterior).toBeNull();
    expect(r.faturamento.variacaoPercentual).toBeNull();
    expect(r.cmv.anterior).toBe(0);
    expect(r.cmv.diferenca).toBe(100000);
    expect(r.cmv.variacaoPercentual).toBeNull();
    expect(r.percentual.pontos).toBeNull();
  });

  it('dias sem fechamento e pendências viram aviso de incompletude', () => {
    const r = montar();
    expect(r.atual.diasSemFechamento).toEqual(['2026-09-07']);
    expect(r.atual.pendentes).toEqual({ titulos: 2, centavos: 12345 });
    expect(r.atual.fora).toEqual({ titulos: 1, centavos: 35000 });
    expect(r.avisos.map(a => a.tipo)).toEqual(expect.arrayContaining(['pendencia', 'sem_competencia', 'fechamento']));
    expect(r.semCompetencia).toEqual({ titulos: 1, centavos: 9900 });
  });

  it('período em andamento usa o mesmo corte para custo e faturamento e não soma dia futuro', () => {
    const r = montar({ hoje: '2026-09-10' });
    // hoje (10/09) tem fechamento → corte em 10/09; compara com 31/08–03/09
    expect(r.janelas).toMatchObject({ parcial: true, corte: '2026-09-10', diasEfetivos: 4 });
    expect(r.faturamento.atual).toBe(500000);
    expect(r.cmv.atual).toBe(260000);
    expect(r.boletos.atual).toBe(3);
    expect(r.anterior.intervalo).toEqual({ inicio: '2026-08-31', fim: '2026-09-03' });
    expect(r.serie.filter(p => p.futuro)).toHaveLength(3);
    expect(r.serie[4]).toMatchObject({ futuro: true, cmvCentavos: null, faturamentoCentavos: null });
    expect(r.avisos[0].tipo).toBe('parcial');
  });

  it('período futuro não inventa zero realizado', () => {
    const r = montar({ hoje: '2026-09-01' });
    expect(r.janelas.futuro).toBe(true);
    expect(r.cmv.atual).toBe(0);
    expect(r.faturamento.atual).toBeNull();
    expect(r.serie.every(p => p.futuro)).toBe(true);
    expect(r.avisos.map(a => a.tipo)).toEqual(['futuro']);
  });
});

describe('CMV Financeiro — categorias', () => {
  it('desce até o nível em que o CMV se divide e reconcilia grupos com o total', () => {
    const r = montar();
    expect(r.grupos.map(g => g.nome)).toEqual(['Peixes', 'Bebidas', 'Frutos do Mar', 'Sem categoria']);
    expect(r.grupos.reduce((s, g) => s + g.atualCentavos, 0)).toBe(r.cmv.atual);
    expect(r.grupos.reduce((s, g) => s + g.anteriorCentavos, 0)).toBe(r.cmv.anterior);
    expect(r.totalCategorias.atualCentavos).toBe(310000);
  });

  it('grupo soma os filhos uma única vez', () => {
    const peixes = montar().grupos[0];
    expect(peixes).toMatchObject({ atualCentavos: 200000, anteriorCentavos: 100000, diferencaCentavos: 100000 });
    expect(peixes.filhos.map(f => [f.nome, f.atualCentavos])).toEqual([['Salmão', 150000], ['Atum', 50000]]);
    expect(peixes.filhos.reduce((s, f) => s + f.atualCentavos, 0)).toBe(peixes.atualCentavos);
  });

  it('participação no CMV e peso no faturamento têm denominadores diferentes', () => {
    const peixes = montar().grupos[0];
    expect(peixes.participacao).toBeCloseTo((200000 / 310000) * 100, 10);
    expect(peixes.pesoFaturamento).toBeCloseTo(20, 10);
    expect(peixes.pesoFaturamentoAnterior).toBeCloseTo(12.5, 10);
  });

  it('categoria inativada continua rastreável; lançamento sem categoria vira grupo próprio', () => {
    const r = montar();
    const atum = r.grupos[0].filhos.find(f => f.nome === 'Atum');
    expect(atum).toMatchObject({ ativo: false, atualCentavos: 50000 });
    expect(r.grupos.find(g => g.id === CMV_SEM_CATEGORIA_ID)).toMatchObject({ atualCentavos: 10000, categoriaId: null });
  });

  it('valor lançado direto em categoria com filhos aparece em linha própria, sem duplicar o total', () => {
    const r = montar({
      cmv: [
        { data: '2026-09-08', categoria_id: CAT.peixes, centavos: 30000 },
        { data: '2026-09-08', categoria_id: CAT.salmao, centavos: 70000 },
        { data: '2026-09-09', categoria_id: CAT.bebidas, centavos: 20000 },
      ],
    });
    const peixes = r.grupos.find(g => g.nome === 'Peixes')!;
    expect(peixes.atualCentavos).toBe(100000);
    expect(peixes.filhos.map(f => [f.id, f.atualCentavos])).toEqual([
      [CAT.salmao, 70000],
      [`direto:${CAT.peixes}`, 30000],
    ]);
    expect(r.cmv.atual).toBe(120000);
  });

  it('cor vem do índice estável do cadastro: não muda com o período nem com o ranking', () => {
    const a = montar();
    const b = montar({ cmv: [{ data: '2026-09-08', categoria_id: CAT.bebidas, centavos: 999900 }, { data: '2026-09-09', categoria_id: CAT.peixes, centavos: 100 }] });
    const cor = (r: typeof a, nome: string) => r.grupos.find(g => g.nome === nome)!.cor;
    expect(cor(a, 'Bebidas')).toBe(cor(b, 'Bebidas'));
    expect(cor(a, 'Peixes')).toBe(cor(b, 'Peixes'));
    expect(new Set(a.grupos.map(g => g.cor)).size).toBe(a.grupos.length);
    expect(cor(a, 'Sem categoria')).toBeNull();
    expect(corCategoriaRgb(3)).toEqual(corCategoriaRgb(3));
    expect(corCategoriaCss(null)).toBe(corCategoriaCss(null));
    const cores = Array.from({ length: 12 }, (_, i) => corCategoriaCss(i));
    expect(new Set(cores).size).toBe(12);
  });

  it('achatar respeita expansão, "expandir todos" e busca sem mudar os totais', () => {
    const r = montar();
    expect(achatarCategorias(r.grupos).map(l => l.nome)).toEqual(['Peixes', 'Bebidas', 'Frutos do Mar', 'Sem categoria']);
    expect(achatarCategorias(r.grupos, { expandidas: new Set([CAT.peixes]) }).map(l => l.nome))
      .toEqual(['Peixes', 'Salmão', 'Atum', 'Bebidas', 'Frutos do Mar', 'Sem categoria']);
    expect(achatarCategorias(r.grupos, { expandirTudo: true })).toHaveLength(6);
    const busca = achatarCategorias(r.grupos, { filtro: l => l.nome === 'Atum' });
    expect(busca.map(l => l.nome)).toEqual(['Peixes', 'Atum']);
    expect(busca[0].atualCentavos).toBe(200000);
  });

  it('composição agrupa a cauda em "Outras" só na visualização e fecha com o total', () => {
    const r = montar();
    const fatias = fatiasDaComposicao(r.grupos, r.cmv.atual ?? 0, 3);
    expect(fatias.map(f => f.nome)).toEqual(['Peixes', 'Bebidas', 'Outras (2)']);
    expect(fatias.reduce((s, f) => s + f.centavos, 0)).toBe(r.cmv.atual);
    expect(r.composicaoEmRosca).toBe(true);
  });

  it('ajuste negativo é preservado e desliga a rosca', () => {
    const r = montar({
      cmv: [
        { data: '2026-09-08', categoria_id: CAT.salmao, centavos: 100000 },
        { data: '2026-09-09', categoria_id: CAT.bebidas, centavos: -20000 },
      ],
    });
    expect(r.cmv.atual).toBe(80000);
    expect(r.grupos.find(g => g.nome === 'Bebidas')!.atualCentavos).toBe(-20000);
    expect(r.composicaoEmRosca).toBe(false);
  });
});

describe('CMV Financeiro — insights', () => {
  it('são calculados dos dados e não afirmam causa', () => {
    const textos = montar().insights.map(i => i.texto);
    expect(textos[0]).toBe('Peixes tem a maior participação no CMV: 64,5% (R$ 2.000,00).');
    expect(textos).toContain('Peixes teve o maior aumento em reais: +R$ 1.000,00 (+100,0%) sobre o período anterior.');
    expect(textos).toContain('Bebidas teve a maior redução em reais: -R$ 400,00 (-40,0%) sobre o período anterior.');
    expect(textos).toContain('O % CMV subiu 6,00 p.p.: de 25,00% para 31,00%.');
    expect(textos.some(t => t.startsWith('2 despesas do período (R$ 123,45) aguardam classificação'))).toBe(true);
    expect(textos.join(' ')).not.toMatch(/NaN|Infinity|undefined|eficiência|oportunidade/);
  });

  it('lançamentos entram na contagem de despesas, separados dos boletos', () => {
    const r = buildCmvReport(parseCmvPayload(cmvPayloadCru({
      lancamentos: [{ data: '2026-09-08', quantidade: 2 }, { data: '2026-09-02', quantidade: 1 }],
    })), CMV_FILTRO_SEMANA);
    expect(r.boletos.atual).toBe(5);
    expect(r.lancamentos.atual).toBe(2);
    expect(r.documentos.atual).toBe(7);
    // semana anterior: 2 boletos + 1 lançamento
    expect(r.documentos.anterior).toBe(3);
  });

  it('banco sem o recurso (payload antigo) não quebra: sem lançamentos e sem pendência por fonte', () => {
    const r = buildCmvReport(parseCmvPayload(cmvPayloadCru()), CMV_FILTRO_SEMANA);
    expect(r.lancamentos.atual).toBe(0);
    expect(r.documentos.atual).toBe(r.boletos.atual);
    expect(r.pendentesGeralPorFonte).toBeNull();
  });

  it('pendência por fonte vem do servidor', () => {
    const r = buildCmvReport(parseCmvPayload(cmvPayloadCru({
      pendentes_geral_por_fonte: { boleto: { titulos: 3, centavos: 100 }, lancamento: { titulos: 4, centavos: 200 } },
    })), CMV_FILTRO_SEMANA);
    expect(r.pendentesGeralPorFonte).toEqual({ boleto: { titulos: 3, centavos: 100 }, lancamento: { titulos: 4, centavos: 200 } });
  });

  it('sem dados não gera frase fixa', () => {
    const r = montar({ cmv: [], boletos: [], qualidade: [], faturamento: [], categorias: [] });
    expect(r.insights.map(i => i.tipo)).toEqual(['fechamento']);
    expect(r.grupos).toEqual([]);
    expect(r.composicaoEmRosca).toBe(false);
  });
});
