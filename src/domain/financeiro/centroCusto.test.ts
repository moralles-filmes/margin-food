import { describe, expect, it } from 'vitest';
import {
  CENTRO_CUSTO_SEM,
  CENTRO_CUSTO_TODOS,
  mostrarFiltroCentroCusto,
  opcoesCentroCusto,
  ordenarDespesasPorCentro,
  registrarNomesCentroCusto,
  rotuloCentroCusto,
  valoresDoCentroCusto,
} from './centroCusto';

const COZINHA = { id: 'cc-cozinha', nome: 'Cozinha' };
const SALAO = { id: 'cc-salao', nome: 'Salão' };

// Formato devolvido por get_fin_dre_summary / get_fin_dfc_summary.
const base = { 'cat-receita': 1000, 'cat-insumos': 600, 'cat-aluguel': 200 };
const porCentro = {
  'cc-cozinha': { 'cat-insumos': 450 },
  'cc-salao': { 'cat-receita': 1000, 'cat-insumos': 50 },
  [CENTRO_CUSTO_SEM]: { 'cat-insumos': 100, 'cat-aluguel': 200 },
};

describe('valoresDoCentroCusto', () => {
  it('"Todos" é o próprio valor por categoria', () => {
    expect(valoresDoCentroCusto(base, porCentro, [COZINHA, SALAO], CENTRO_CUSTO_TODOS)).toBe(base);
  });

  it('devolve o recorte do centro escolhido, inclusive o "sem centro"', () => {
    expect(valoresDoCentroCusto(base, porCentro, [COZINHA, SALAO], 'cc-cozinha')).toEqual({ 'cat-insumos': 450 });
    expect(valoresDoCentroCusto(base, porCentro, [COZINHA, SALAO], CENTRO_CUSTO_SEM)).toEqual({ 'cat-insumos': 100, 'cat-aluguel': 200 });
  });

  it('centro sem valor no período fica vazio', () => {
    expect(valoresDoCentroCusto(base, porCentro, [COZINHA, SALAO], 'cc-delivery')).toEqual({});
  });

  it('período sem nenhum centro: tudo é "sem centro" e um centro específico não tem valor', () => {
    expect(valoresDoCentroCusto(base, {}, [], CENTRO_CUSTO_SEM)).toBe(base);
    expect(valoresDoCentroCusto(base, {}, [], 'cc-cozinha')).toEqual({});
    expect(valoresDoCentroCusto(base, undefined, [], CENTRO_CUSTO_TODOS)).toBe(base);
  });

  it('a soma dos centros fecha com cada categoria (contrato do servidor)', () => {
    const centros = [COZINHA.id, SALAO.id, CENTRO_CUSTO_SEM];
    for (const [cat, total] of Object.entries(base)) {
      const soma = centros.reduce((s, id) => s + (valoresDoCentroCusto(base, porCentro, [COZINHA, SALAO], id)[cat] ?? 0), 0);
      expect(soma).toBe(total);
    }
  });
});

describe('mostrarFiltroCentroCusto', () => {
  it('some quando o período não tem centro de custo e nada foi escolhido', () => {
    expect(mostrarFiltroCentroCusto([], CENTRO_CUSTO_TODOS)).toBe(false);
  });

  it('aparece quando o período tem centro de custo', () => {
    expect(mostrarFiltroCentroCusto([COZINHA], CENTRO_CUSTO_TODOS)).toBe(true);
  });

  it('continua visível com um recorte escolhido, mesmo num mês sem centro', () => {
    expect(mostrarFiltroCentroCusto([], 'cc-cozinha')).toBe(true);
    expect(mostrarFiltroCentroCusto([], CENTRO_CUSTO_SEM)).toBe(true);
  });
});

describe('opcoesCentroCusto', () => {
  it('Todos primeiro, centros do período e "Sem centro de custo" por último', () => {
    expect(opcoesCentroCusto([COZINHA, SALAO], CENTRO_CUSTO_TODOS, {})).toEqual([
      { value: CENTRO_CUSTO_TODOS, label: 'Todos os centros de custo' },
      { value: 'cc-cozinha', label: 'Cozinha' },
      { value: 'cc-salao', label: 'Salão' },
      { value: CENTRO_CUSTO_SEM, label: 'Sem centro de custo' },
    ]);
  });

  it('mantém o centro escolhido mesmo fora do período, com o nome já visto', () => {
    const opcoes = opcoesCentroCusto([SALAO], 'cc-cozinha', { 'cc-cozinha': 'Cozinha' });
    expect(opcoes.map(o => o.value)).toEqual([CENTRO_CUSTO_TODOS, 'cc-salao', 'cc-cozinha', CENTRO_CUSTO_SEM]);
    expect(opcoes[2].label).toBe('Cozinha');
  });

  it('centro escolhido sem nome conhecido ganha um rótulo neutro', () => {
    expect(opcoesCentroCusto([], 'cc-x', {})[1]).toEqual({ value: 'cc-x', label: 'Centro de custo removido' });
  });
});

describe('registrarNomesCentroCusto', () => {
  it('acumula nomes sem perder os já vistos', () => {
    const nomes = registrarNomesCentroCusto({ 'cc-cozinha': 'Cozinha' }, [SALAO]);
    expect(nomes).toEqual({ 'cc-cozinha': 'Cozinha', 'cc-salao': 'Salão' });
  });

  it('devolve o mesmo objeto quando nada mudou (não re-renderiza à toa)', () => {
    const nomes = { 'cc-cozinha': 'Cozinha' };
    expect(registrarNomesCentroCusto(nomes, [COZINHA])).toBe(nomes);
    expect(registrarNomesCentroCusto(nomes, [])).toBe(nomes);
  });

  it('atualiza um centro renomeado', () => {
    expect(registrarNomesCentroCusto({ 'cc-cozinha': 'Cozinha' }, [{ id: 'cc-cozinha', nome: 'Cozinha Quente' }]))
      .toEqual({ 'cc-cozinha': 'Cozinha Quente' });
  });
});

describe('rotuloCentroCusto', () => {
  it('rotula cada recorte', () => {
    expect(rotuloCentroCusto(CENTRO_CUSTO_TODOS, {})).toBe('');
    expect(rotuloCentroCusto(CENTRO_CUSTO_SEM, {})).toBe('Sem centro de custo');
    expect(rotuloCentroCusto('cc-cozinha', { 'cc-cozinha': 'Cozinha' })).toBe('Cozinha');
  });
});

describe('ordenarDespesasPorCentro', () => {
  it('ordena pelo maior valor e deixa "Sem centro de custo" por último', () => {
    const ordenado = ordenarDespesasPorCentro([
      { centro_custo_id: null, nome: 'Sem centro de custo', valor: 9000 },
      { centro_custo_id: 'cc-salao', nome: 'Salão', valor: 300 },
      { centro_custo_id: 'cc-cozinha', nome: 'Cozinha', valor: 1200 },
    ]);
    expect(ordenado).toEqual([
      { nome: 'Cozinha', valor: 1200 },
      { nome: 'Salão', valor: 300 },
      { nome: 'Sem centro de custo', valor: 9000 },
    ]);
  });

  it('não altera a lista recebida', () => {
    const rows = [
      { centro_custo_id: null, nome: 'Sem centro de custo', valor: 1 },
      { centro_custo_id: 'a', nome: 'A', valor: 2 },
    ];
    ordenarDespesasPorCentro(rows);
    expect(rows[0].centro_custo_id).toBeNull();
  });
});
