import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { formatDateISO } from '@/lib/datetime';
import DashboardCharts from './DashboardCharts';

// Dados sintéticos — nenhum valor das imagens de referência do redesign.
const state = vi.hoisted(() => ({
  canView: true,
  rpc: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  evolucao: [] as Array<Record<string, unknown>>,
  categorias: [] as Array<Record<string, unknown>>,
  fail: false,
  // Cliente estável, como o do CompanyScopeProvider: o `load` depende dele.
  client: {} as { rpc: (...args: unknown[]) => unknown },
}));
state.client.rpc = (...args: unknown[]) => state.rpc(...args);

vi.mock('@/permissions/hooks', () => ({ useCan: () => state.canView }));
vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => state.client }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined }));

const LONG_NAME = 'Insumos e matéria-prima do salão principal e da cozinha central';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 2, 15, 12));
  state.canView = true;
  state.fail = false;
  state.evolucao = [
    { mes: '2026-02', receitas: 1000, despesas: 1200, resultado: -200 },
    { mes: '2026-03', receitas: 800, despesas: 300, resultado: 500 },
  ];
  state.categorias = [
    { nome: LONG_NAME, valor: 500 },
    { nome: 'Pessoal', valor: 300 },
    { nome: 'Energia', valor: 200 },
  ];
  state.rpc.mockReset();
  state.rpc.mockImplementation(async (_name: string, params: { p_start: string }) => {
    if (state.fail) return { data: null, error: { message: 'falha simulada' } };
    return params.p_start === '2026-03-01'
      ? { data: { evolucao_mensal: [], despesas_por_categoria: state.categorias }, error: null }
      : { data: { evolucao_mensal: state.evolucao, despesas_por_categoria: [] }, error: null };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function renderCharts() {
  return render(
    <DashboardCharts
      periodStart="2026-03-01"
      periodEndExclusive="2026-04-01"
      periodLabel="Março de 2026"
      expenseAside={<div>explicação ao lado</div>}
    />,
  );
}

describe('DashboardCharts — Redesign V2', () => {
  it('mantém as duas chamadas e seus recortes (janela histórica × período do resumo)', async () => {
    renderCharts();
    await screen.findByText('Soma das 3 categorias');
    expect(state.rpc).toHaveBeenCalledTimes(2);
    // Janela: mesma fórmula de antes (depende do fuso do ambiente, por isso não é data fixa).
    expect(state.rpc).toHaveBeenCalledWith('get_fin_dashboard_charts', {
      p_start: formatDateISO(startOfMonth(subMonths(new Date(), 5))),
      p_end: formatDateISO(endOfMonth(new Date())),
    });
    expect(state.rpc).toHaveBeenCalledWith('get_fin_dashboard_charts', { p_start: '2026-03-01', p_end: '2026-03-31' });
  });

  it('identifica separadamente a janela do histórico e o período do resumo', async () => {
    renderCharts();
    await screen.findByText('Soma das 3 categorias');
    expect(screen.getByText(/últimos 6 meses até o mês atual \(out\/25 a mar\/26\)/)).toBeInTheDocument();
    expect(screen.getByText('Período do resumo: Março de 2026')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Janela do histórico' })).toBeInTheDocument();
  });

  it('com menos de 8 categorias a lista é completa: sem rótulo de Top N', async () => {
    renderCharts();
    await screen.findByText('Soma das 3 categorias');
    expect(screen.getByText('R$1.000,00')).toBeInTheDocument();
    expect(screen.getAllByText('Participação na soma').length).toBeGreaterThan(0);
    expect(screen.getByText('Percentuais sobre a soma das categorias listadas.')).toBeInTheDocument();
    expect(screen.queryByText(/Top 3/)).toBeNull();
    const rows = within(screen.getByRole('list', { name: 'Categorias de despesa' })).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText(LONG_NAME)).not.toHaveClass('truncate');
    expect(within(rows[0]).getAllByText('50,0%').length).toBeGreaterThan(0);
    expect(within(rows[1]).getByText(/R\$300,00/)).toBeInTheDocument();
    expect(within(rows[2]).getAllByText('20,0%').length).toBeGreaterThan(0);
    expect(screen.getByText('explicação ao lado')).toBeInTheDocument();
  });

  it('com 8 categorias (limite da RPC) rotula o recorte como Top 8 e não como total', async () => {
    state.categorias = Array.from({ length: 8 }, (_, i) => ({ nome: `Categoria ${i + 1}`, valor: (8 - i) * 100 }));
    renderCharts();
    await screen.findByText('Soma do Top 8');
    expect(screen.getByText('R$3.600,00')).toBeInTheDocument();
    expect(screen.getAllByText('Participação no Top 8').length).toBeGreaterThan(0);
    expect(screen.getByText(/não sobre toda a despesa realizada/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Top 8 categorias de despesa' })).getAllByRole('listitem')).toHaveLength(8);
  });

  it('avisa quando meses da janela não têm lançamento (não preenche com zero)', async () => {
    renderCharts();
    expect(await screen.findByText(/\(2 de 6 meses com dados\)/)).toBeInTheDocument();
  });

  it('sem categorias mantém a mensagem de vazio', async () => {
    state.categorias = [];
    renderCharts();
    expect(await screen.findByText('Sem despesas categorizadas no período')).toBeInTheDocument();
    expect(screen.queryByText(/^Soma d/)).toBeNull();
  });

  it('erro mostra estado de erro com nova tentativa, sem virar gráfico vazio', async () => {
    state.fail = true;
    renderCharts();
    const retry = await screen.findAllByRole('button', { name: /Tentar novamente/ });
    expect(retry.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Não foi possível carregar os gráficos').length).toBeGreaterThan(0);
    expect(state.toast.error).toHaveBeenCalledWith('Erro ao carregar gráficos do dashboard');
    expect(screen.queryByText('Sem despesas categorizadas no período')).toBeNull();
    // O card explicativo não depende desta consulta e continua visível.
    expect(screen.getByText('explicação ao lado')).toBeInTheDocument();

    state.fail = false;
    fireEvent.click(retry[0]);
    await screen.findByText('Soma das 3 categorias');
    expect(state.rpc).toHaveBeenCalledTimes(4);
  });

  it('sem permissão não renderiza nada', async () => {
    state.canView = false;
    const { container } = renderCharts();
    await waitFor(() => expect(state.rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
