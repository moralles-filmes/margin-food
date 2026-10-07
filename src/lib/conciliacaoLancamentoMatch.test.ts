import { describe, expect, it } from 'vitest';
import { avaliarLancamentoCandidato, casaSozinho, janelaCandidatos, valorDivergenteDoExtrato, type CandidatoLancamentoMatch } from './conciliacaoLancamentoMatch';

const linha = { tipo: 'DESPESA', valor: 100, data: '2026-09-05', descricao: 'Nota manual' };
const candidate = (overrides: Partial<CandidatoLancamentoMatch> = {}): CandidatoLancamentoMatch => ({
  tipo: linha.tipo, valor: linha.valor, data_competencia: linha.data, descricao: linha.descricao,
  conta_id: 'conta-1', ...overrides,
});
const evaluate = (overrides: Partial<CandidatoLancamentoMatch> = {}) => avaliarLancamentoCandidato(linha, candidate(overrides), 'conta-1');
const matches = (overrides: Partial<CandidatoLancamentoMatch> = {}) => {
  const result = evaluate(overrides);
  return result && casaSozinho(linha.valor, { origin: 'lancamento', valor: candidate(overrides).valor, ...result });
};

describe('avaliarLancamentoCandidato', () => {
  it('avalia nota manual da mesma conta com bônus e casa pelo valor exato', () => {
    expect(evaluate()).toEqual({ score: 110, data: linha.data, previsto: false, situacaoConta: 'mesma' });
    expect(matches()).toBe(true);
  });
  it.each([undefined, null])('trata status %s como realizado', status => {
    expect(evaluate({ status })?.previsto).toBe(false);
  });
  it.each(['CANCELADO', 'OUTRO', ''])('descarta status %s', status => {
    expect(evaluate({ status })).toBeNull();
  });
  it('descarta tipo diferente e score zero mesmo na mesma conta', () => {
    expect(evaluate({ tipo: 'RECEITA' })).toBeNull();
    expect(evaluate({ valor: 200 })).toBeNull();
    expect(evaluate({ data_competencia: '2026-08-01' })).toBeNull();
  });
  it('prioriza pagamento sobre competência no realizado', () => {
    expect(evaluate({ data_pagamento: '2026-09-04' })?.data).toBe('2026-09-04');
    expect(evaluate({ data_pagamento: '', data_vencimento: '2026-09-04' })?.data).toBe(linha.data);
  });
  it('avalia previsto exato, mas nunca casa sozinho', () => {
    expect(evaluate({ status: 'PREVISTO' })?.previsto).toBe(true);
    expect(matches({ status: 'PREVISTO' })).toBe(false);
  });
  it('descarta previsto de CP/CR e aceita referência vazia', () => {
    expect(evaluate({ status: 'PREVISTO', referencia_modulo: ' cp ' })).toBeNull();
    expect(evaluate({ status: 'PREVISTO', referencia_modulo: '  ' })).not.toBeNull();
    expect(evaluate({ referencia_modulo: 'cp' })).not.toBeNull();
  });
  it.each([
    { data_pagamento: linha.data, data_vencimento: '2026-09-04', data_competencia: '2026-08-01' },
    { data_pagamento: '2026-09-04', data_vencimento: linha.data, data_competencia: '2026-08-01' },
    { data_pagamento: '2026-09-04', data_vencimento: '2026-09-03', data_competencia: linha.data },
  ])('escolhe a data de maior score no previsto: %j', dates => {
    expect(evaluate({ status: 'PREVISTO', ...dates })?.data).toBe(linha.data);
  });
  it('desempata por pagamento, depois vencimento, ignorando datas vazias', () => {
    expect(evaluate({ status: 'PREVISTO', data_pagamento: '2026-09-04', data_vencimento: '2026-09-06', data_competencia: '2026-08-01' })?.data).toBe('2026-09-04');
    expect(evaluate({ status: 'PREVISTO', data_pagamento: '', data_vencimento: '2026-09-04', data_competencia: '2026-09-06' })?.data).toBe('2026-09-04');
  });
  it('mesma conta com valor 1% diferente continua sugestão', () => {
    expect(evaluate({ valor: 101 })).not.toBeNull();
    expect(matches({ valor: 101 })).toBe(false);
  });
  it('outra conta exige escolha mesmo com valor exato', () => {
    expect(evaluate({ conta_id: 'conta-2' })?.situacaoConta).toBe('outra');
    expect(matches({ conta_id: 'conta-2' })).toBe(false);
  });
  it.each([null, '', undefined])('sem conta (%s) casa com valor exato, sem bônus', conta_id => {
    expect(evaluate({ conta_id })).toMatchObject({ situacaoConta: 'sem_conta', score: 100 });
    expect(matches({ conta_id })).toBe(true);
  });
  it('sem conta nunca vira "mesma conta" quando a conta selecionada falta', () => {
    expect(avaliarLancamentoCandidato(linha, candidate({ conta_id: null }), null)?.situacaoConta).toBe('sem_conta');
  });
  it.each(['espelho_cp', 'espelho_cr', 'ajuste_pagamento', 'transferencia', 'conciliacao'])(
    'não oferece trazer de outra conta lançamento de origem %s',
    origem => {
      expect(evaluate({ conta_id: 'conta-2', origem })).toBeNull();
      expect(evaluate({ conta_id: 'conta-1', origem })).not.toBeNull();
      expect(evaluate({ conta_id: null, origem })).not.toBeNull();
    },
  );
  it('não oferece trazer de outra conta lançamento ligado a título', () => {
    expect(evaluate({ conta_id: 'conta-2', referencia_modulo: 'contas_pagar' })).toBeNull();
    expect(evaluate({ conta_id: 'conta-2', origem: 'manual' })?.situacaoConta).toBe('outra');
  });
});

describe('casaSozinho', () => {
  it.each(['lancamento', 'conta_pagar', 'conta_receber'] as const)('exige score mínimo para %s', origin => {
    expect(casaSozinho(100, { origin, valor: 100, score: 59, jaNoRazao: true })).toBe(false);
    expect(casaSozinho(100, { origin, valor: 100, score: 60 })).toBe(true);
  });
  it.each(['conta_pagar', 'conta_receber'] as const)('preserva valor exato para %s', origin => {
    expect(casaSozinho(100, { origin, valor: 101, score: 90 })).toBe(false);
  });
  it('preserva espelho com valor aproximado', () => {
    expect(casaSozinho(100, { origin: 'lancamento', valor: 101, score: 90, jaNoRazao: true })).toBe(true);
  });
  it('rejeita diferença de um centavo', () => {
    expect(casaSozinho(0, { origin: 'lancamento', valor: 0.01, score: 90 })).toBe(false);
    // 10,10 - 10,09 = 0,00999… em ponto flutuante: a comparação é em centavos.
    expect(casaSozinho(10.09, { origin: 'lancamento', valor: 10.1, score: 90 })).toBe(false);
    expect(casaSozinho(10.1, { origin: 'conta_pagar', valor: 10.09, score: 90 })).toBe(false);
  });
});

describe('valorDivergenteDoExtrato', () => {
  it('lançamento manual precisa bater no centavo', () => {
    expect(valorDivergenteDoExtrato(350, { valor: 352, tipo: 'DESPESA', origem: 'manual' })).toBe(true);
    expect(valorDivergenteDoExtrato(10.09, { valor: 10.1, tipo: 'DESPESA', origem: 'manual' })).toBe(true);
    expect(valorDivergenteDoExtrato(350, { valor: 350, tipo: 'DESPESA', origem: 'manual' })).toBe(false);
    expect(valorDivergenteDoExtrato(0.3, { valor: 0.1 + 0.2, tipo: 'DESPESA' })).toBe(false);
  });
  it.each(['espelho_cp', 'espelho_cr', 'ajuste_pagamento', 'transferencia'])(
    'origem %s aceita valor diferente (a diferença já é lançamento de ajuste)',
    origem => expect(valorDivergenteDoExtrato(102, { valor: 100, tipo: 'DESPESA', origem })).toBe(false),
  );
  it('transferência aceita valor diferente', () => {
    expect(valorDivergenteDoExtrato(102, { valor: 100, tipo: 'TRANSFERENCIA', origem: 'manual' })).toBe(false);
  });
});

describe('janelaCandidatos', () => {
  it('retorna null para arquivo vazio', () => expect(janelaCandidatos([])).toBeNull());
  it('expande sete dias na virada de mês sem modificar a lista', () => {
    const dates = ['2026-10-01', '2026-09-28'];
    expect(janelaCandidatos(dates)).toEqual({ inicio: '2026-09-21', fim: '2026-10-08' });
    expect(dates).toEqual(['2026-10-01', '2026-09-28']);
  });
  it('expande na virada do ano', () => {
    expect(janelaCandidatos(['2026-01-01'])).toEqual({ inicio: '2025-12-25', fim: '2026-01-08' });
  });
});
