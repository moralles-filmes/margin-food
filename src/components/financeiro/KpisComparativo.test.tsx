import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KPIsSection from './KPIsSection';
import ComparativoSection from './ComparativoSection';

/**
 * Cliente falso dos KPIs e do Comparativo (Redesign V2, Fase 06A): as duas telas só leem; toda
 * chamada é registrada. A planilha é interceptada para provar que a entrada do Excel não mudou.
 */
const state = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  resposta: {} as Record<string, { data: unknown; error: unknown }>,
  perms: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  sheets: [] as unknown[],
}));

const supabase = {
  rpc(name: string, args: unknown) {
    state.rpcCalls.push({ name, args });
    return Promise.resolve(state.resposta[name] ?? { data: null, error: { message: 'sem resposta' } });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: (perm: string) => state.perms.has(perm) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined }));
vi.mock('@/lib/safeXlsx', () => ({
  utils: {
    book_new: () => ({}),
    json_to_sheet: (rows: unknown) => { state.sheets.push(rows); return {}; },
    book_append_sheet: () => undefined,
  },
  writeFile: () => undefined,
}));

const ok = (data: unknown) => ({ data, error: null });
const FORN = Array.from({ length: 8 }, (_, i) => ({ nome: `Fornecedor sintético ${i + 1} com razão social longa Ltda`, total: 100000 / (i + 1) }));
const KPIS = {
  receita_total: 1234567.89, despesa_total: 987654.32, margem: 20, ticket_medio: 89.9, inadimplencia: 4.2,
  total_vencido: 0, prazo_medio_pagamento: 0.4, prazo_medio_recebimento: -1.6,
  receita_por_mes: [{ mes: '2026-09', receita: 300000, despesa: 220000 }, { mes: '2026-10', receita: 204567.89, despesa: 157654.33 }],
  top_fornecedores: FORN,
};
const COMP = {
  periodo_a: { mes: '2026-10', receita: 112530.87, despesa: 98765.43, resultado: 13765.44, margem: 12.23, total_lancamentos: 342 },
  periodo_b: { mes: '2026-09', receita: 120000, despesa: 101234.56, resultado: 18765.44, margem: 15.64, total_lancamentos: 351 },
  variacoes: { receita_pct: -6.2242, despesa_pct: -2.4390, resultado_pct: -26.6449, margem_pp: -3.41, lancamentos_pct: -2.5641 },
  grafico: [
    { indicador: 'Receita', periodo_a: 112530.87, periodo_b: 120000 },
    { indicador: 'Despesa', periodo_a: 98765.43, periodo_b: 101234.56 },
    { indicador: 'Resultado', periodo_a: 13765.44, periodo_b: 18765.44 },
  ],
  breakdown_categorias: [
    { categoria: 'Pescados', valor_a: 45678.9, valor_b: 40000, variacao_pct: 14.1972 },
    { categoria: 'Manutenção', valor_a: 1500, valor_b: 0, variacao_pct: 0 },
    { categoria: 'Pessoal', valor_a: 30000, valor_b: 30000, variacao_pct: 0 },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T15:00:00Z'));
  state.rpcCalls = [];
  state.sheets = [];
  state.resposta = { get_fin_kpis: ok(KPIS), comparativo_periodos: ok(COMP) };
  state.perms = new Set(['financeiro:kpis:view', 'financeiro:kpis:export', 'financeiro:comparativo:view', 'financeiro:comparativo:export']);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe('KPIs (V2)', () => {
  it('cards com base e período da janela carregada; Top 8 com valores completos; só lê', async () => {
    render(<KPIsSection />);
    const grupo = await screen.findByRole('region', { name: 'Receitas e despesas' });
    expect(screen.getByText('01/05/2026 a 05/10/2026 · realizados pelo regime de caixa')).toBeInTheDocument();
    expect(within(grupo).getByText('R$1.234.567,89')).toBeInTheDocument();
    expect(within(grupo).getByText('(Receita − despesa) ÷ receita')).toBeInTheDocument();
    expect(screen.getByText('A receber com vencimento antes de hoje · toda a unidade')).toBeInTheDocument();
    expect(screen.getByText('-2 dias')).toBeInTheDocument();
    const top = screen.getByRole('list', { name: 'Fornecedores por volume pago' });
    expect(within(top).getAllByRole('listitem')).toHaveLength(8);
    expect(within(top).getByText('Fornecedor sintético 1 com razão social longa Ltda')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Top 8 fornecedores por volume' })).toBeInTheDocument();
    expect(state.rpcCalls).toEqual([{ name: 'get_fin_kpis', args: { p_meses: 6 } }]);
  });

  it('sem receita no período, margem e ticket médio não viram "0,00%"/R$ 0,00', async () => {
    state.resposta.get_fin_kpis = ok({ ...KPIS, receita_total: 0, despesa_total: 0, margem: 0, ticket_medio: 0, receita_por_mes: [], top_fornecedores: [] });
    render(<KPIsSection />);
    expect(await screen.findByText('Sem receita no período: a margem não se aplica')).toBeInTheDocument();
    expect(screen.getByText('Nenhum lançamento realizado no período')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma conta a pagar baixada no período')).toBeInTheDocument();
    expect(screen.queryByText('0,00%', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('erro vira estado de erro com nova tentativa', async () => {
    state.resposta.get_fin_kpis = { data: null, error: { message: 'falha' } };
    render(<KPIsSection />);
    expect(await screen.findByText('Erro ao carregar KPIs')).toBeInTheDocument();
    state.resposta.get_fin_kpis = ok(KPIS);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); });
    expect(await screen.findByText('R$1.234.567,89')).toBeInTheDocument();
  });

  it('Excel com as mesmas linhas de antes', async () => {
    render(<KPIsSection />);
    await screen.findByText('R$1.234.567,89');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Excel/ })); });
    expect(state.sheets[0]).toEqual([
      { Indicador: 'Receita Total', Valor: 1234567.89 },
      { Indicador: 'Despesa Total', Valor: 987654.32 },
      { Indicador: 'Margem (%)', Valor: 20 },
      { Indicador: 'Ticket Médio', Valor: 89.9 },
      { Indicador: 'Inadimplência (%)', Valor: 4.2 },
      { Indicador: 'Total Vencido', Valor: 0 },
      { Indicador: 'Prazo Médio Pgto (dias)', Valor: 0.4 },
      { Indicador: 'Prazo Médio Receb. (dias)', Valor: -1.6 },
    ]);
    expect(state.sheets[1]).toEqual([{ Mês: 'set/26', Receita: 300000, Despesa: 220000 }, { Mês: 'out/26', Receita: 204567.89, Despesa: 157654.33 }]);
  });

  it('sem permissão mostra acesso restrito', () => {
    state.perms = new Set();
    render(<KPIsSection />);
    expect(screen.getByText('Você não tem permissão para visualizar os KPIs.')).toBeInTheDocument();
  });
});

describe('Comparativo (V2)', () => {
  it('cinco indicadores com A, B e variação em % ou p.p.; categoria sem base', async () => {
    render(<ComparativoSection />);
    const grupo = await screen.findByRole('region', { name: 'Indicadores' });
    expect(screen.getByText('Out/2026 comparado com Set/2026 · regime de caixa')).toBeInTheDocument();
    expect(within(grupo).getByText('Receita · Out/2026')).toBeInTheDocument();
    expect(within(grupo).getByText('Set/2026: R$120.000,00')).toBeInTheDocument();
    expect(within(grupo).getByText('-6,22%')).toBeInTheDocument();
    expect(within(grupo).getByText('-3,4 p.p.')).toBeInTheDocument();
    expect(within(grupo).getByText('342')).toBeInTheDocument();
    const manutencao = screen.getByText('Manutenção').closest('tr') as HTMLElement;
    expect(within(manutencao).getByText('Sem base')).toBeInTheDocument();
    expect(within(screen.getByText('Pessoal').closest('tr') as HTMLElement).getByText('0,00%')).toBeInTheDocument();
    expect(state.rpcCalls).toEqual([{ name: 'comparativo_periodos', args: { p_mes_a: '2026-10', p_mes_b: '2026-09' } }]);
  });

  it('mês B sem movimento: variações "Sem base", nunca 0%', async () => {
    state.resposta.comparativo_periodos = ok({
      ...COMP,
      periodo_b: { mes: '2026-09', receita: 0, despesa: 0, resultado: 0, margem: 0, total_lancamentos: 0 },
      variacoes: { receita_pct: 0, despesa_pct: 0, resultado_pct: 0, margem_pp: 12.23, lancamentos_pct: 0 },
    });
    render(<ComparativoSection />);
    const grupo = await screen.findByRole('region', { name: 'Indicadores' });
    expect(within(grupo).getAllByText('Sem base')).toHaveLength(5);
    expect(within(grupo).getByText('Set/2026: —')).toBeInTheDocument();
  });

  it('mudar os meses sem comparar avisa e bloqueia a exportação; nada é lido até "Comparar"', async () => {
    render(<ComparativoSection />);
    await screen.findByRole('region', { name: 'Indicadores' });
    fireEvent.change(screen.getByLabelText('Período A · mês analisado'), { target: { value: '2026-08' } });
    expect(screen.getByText(/Os meses escolhidos mudaram: os valores abaixo ainda são de Out\/2026 × Set\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeDisabled();
    expect(state.rpcCalls).toHaveLength(1);
  });

  it('Excel com as mesmas linhas de antes ("pp" e "—" no arquivo)', async () => {
    render(<ComparativoSection />);
    await screen.findByRole('region', { name: 'Indicadores' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Excel/ })); });
    expect(state.sheets[0]).toEqual([
      { Indicador: 'Receita', 'Out/2026': 112530.87, 'Set/2026': 120000, Variação: '-6,22%' },
      { Indicador: 'Despesa', 'Out/2026': 98765.43, 'Set/2026': 101234.56, Variação: '-2,44%' },
      { Indicador: 'Resultado', 'Out/2026': 13765.44, 'Set/2026': 18765.44, Variação: '-26,64%' },
      { Indicador: 'Margem', 'Out/2026': '12,2%', 'Set/2026': '15,6%', Variação: '-3,4pp' },
      { Indicador: 'Lançamentos', 'Out/2026': 342, 'Set/2026': 351, Variação: '-2,56%' },
    ]);
    expect(state.sheets[1]).toEqual([
      { Categoria: 'Pescados', 'Out/2026': 45678.9, 'Set/2026': 40000, 'Variação %': '14,2' },
      { Categoria: 'Manutenção', 'Out/2026': 1500, 'Set/2026': 0, 'Variação %': '0' },
      { Categoria: 'Pessoal', 'Out/2026': 30000, 'Set/2026': 30000, 'Variação %': '0' },
    ]);
  });

  it('erro vira estado de erro; sem permissão, acesso restrito', async () => {
    state.resposta.comparativo_periodos = { data: null, error: { message: 'falha' } };
    const { unmount } = render(<ComparativoSection />);
    await waitFor(() => expect(screen.getByText('Erro ao carregar comparativo')).toBeInTheDocument());
    unmount();
    state.perms = new Set();
    render(<ComparativoSection />);
    expect(screen.getByText('Você não tem permissão para visualizar o comparativo.')).toBeInTheDocument();
  });
});
