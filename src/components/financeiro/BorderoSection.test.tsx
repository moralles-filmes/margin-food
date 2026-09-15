import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BorderoSection from '@/components/financeiro/BorderoSection';
import { buildBorderoPdfModel } from '@/lib/borderoPdfExport';
import { buildBorderoReport, type BorderoPeriod, type BorderoReport } from '@/domain/financeiro/bordero';
import { borderoAccount, borderoItem, createBorderoPayload } from '@/test/fixtures/bordero';

type HookResult = {
  data?: BorderoReport;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

const state = vi.hoisted(() => ({
  canView: true,
  canExport: true,
  responses: new Map<string, Partial<HookResult>>(),
  calls: [] as Array<{ companyId: unknown; period: BorderoPeriod | null; enabled: boolean }>,
  refetch: vi.fn(),
  exportBorderoPdf: vi.fn(),
}));

vi.mock('@/permissions', () => ({
  useCan: (key: string) => (key.endsWith(':export') ? state.canExport : state.canView),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'store-a' } }) }));
vi.mock('@/contexts/CompanyScopeContext', () => ({
  useCompanyScope: () => ({ companyId: 'store-a' }),
  useSupabase: () => ({}),
}));
vi.mock('@/lib/datetime', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/datetime')>()),
  todayBR: () => '2026-09-02',
}));
vi.mock('@/lib/borderoPdfExport', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/borderoPdfExport')>()),
  exportBorderoPdf: state.exportBorderoPdf,
}));
vi.mock('@/hooks/useBordero', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBordero')>()),
  useBordero: (options: { companyId: unknown; period: BorderoPeriod | null; enabled: boolean }) => {
    state.calls.push(options);
    const key = options.period ? `${options.period.start}|${options.period.end}` : 'none';
    const response = state.responses.get(key);
    return {
      data: undefined,
      isPending: true,
      isFetching: Boolean(options.period),
      isError: false,
      error: null,
      refetch: state.refetch,
      ...response,
    };
  },
}));

const WEEK = '2026-08-31|2026-09-06';
const ready = (report: BorderoReport): Partial<HookResult> => ({ data: report, isPending: false, isFetching: false });
const weekReport = () => buildBorderoReport(createBorderoPayload());

beforeEach(() => {
  state.canView = true;
  state.canExport = true;
  state.responses.clear();
  state.calls.length = 0;
  state.refetch.mockReset();
  state.exportBorderoPdf.mockReset();
});

afterEach(() => vi.clearAllMocks());

function kpiValue(label: RegExp): string {
  const cards = screen.getAllByText(label)
    .map(element => element.closest('.animate-fade-up'))
    .filter((card): card is HTMLElement => card instanceof HTMLElement);
  expect(cards).toHaveLength(1);
  return within(cards[0]).getByText(/R\$/).textContent ?? '';
}

describe('Borderô — tela', () => {
  it('abre na semana atual (segunda a domingo) e consulta o backend com a unidade ativa', () => {
    state.responses.set(WEEK, ready(weekReport()));
    render(<BorderoSection />);
    expect(screen.getByRole('heading', { name: 'Borderô' })).toBeInTheDocument();
    expect(screen.getByTestId('bordero-period-label')).toHaveTextContent('31/08/2026 a 06/09/2026');
    expect(state.calls.at(-1)).toEqual({ companyId: 'store-a', period: { start: '2026-08-31', end: '2026-09-06' }, enabled: true });
  });

  it('TESTE 11 — valores da tela são exatamente os valores do PDF', () => {
    const report = weekReport();
    state.responses.set(WEEK, ready(report));
    render(<BorderoSection />);
    const model = buildBorderoPdfModel(report, { mode: 'week' });

    expect(kpiValue(/^Contas a vencer$/i)).toBe(model.summary.payable);
    expect(kpiValue(/^Saldo das contas$/i)).toBe(model.summary.balance);
    expect(kpiValue(/Saldo final provisionado/i)).toBe(model.summary.final);
    expect(screen.getByTestId('bordero-table-total')).toHaveTextContent(model.totals[0].value);
    expect(screen.getByTestId('bordero-period-label')).toHaveTextContent(model.periodLabel);
    expect([model.summary.payable, model.summary.balance, model.summary.final]).toEqual(['R$131.823,59', 'R$188.609,27', 'R$56.785,68']);

    for (const row of model.categoryRows.filter(entry => entry.depth === 0)) {
      const cell = screen.getByText(row.label);
      expect(within(cell.closest('tr') as HTMLElement).getByText(row.value)).toBeInTheDocument();
    }
  });

  it('TESTE 12 — alternar Semana → Mês → Período nunca deixa valores do filtro anterior', async () => {
    state.responses.set(WEEK, ready(weekReport()));
    state.responses.set('2026-09-10|2026-09-25', ready(buildBorderoReport(createBorderoPayload({
      period: { start: '2026-09-10', end: '2026-09-25' },
      items: [borderoItem('c-adm', 777_700)],
    }))));
    render(<BorderoSection />);
    expect(screen.getAllByText('R$131.823,59').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('radio', { name: 'Mês' }));
    expect(screen.getByTestId('bordero-period-label')).toHaveTextContent('01/09/2026 a 30/09/2026');
    expect(state.calls.at(-1)?.period).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(screen.getByRole('status', { name: 'Carregando borderô' })).toBeInTheDocument();
    expect(screen.queryByText('R$131.823,59')).not.toBeInTheDocument();
    expect(screen.queryByText('R$188.609,27')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Período' }));
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-09-10' } });
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-09-25' } });
    await waitFor(() => expect(screen.getByTestId('bordero-period-label')).toHaveTextContent('10/09/2026 a 25/09/2026'));
    expect(state.calls.at(-1)?.period).toEqual({ start: '2026-09-10', end: '2026-09-25' });
    expect(screen.getAllByText('R$7.777,00').length).toBeGreaterThan(0);
    expect(screen.queryByText('R$131.823,59')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-09-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('data final deve ser igual ou posterior');
    expect(state.calls.at(-1)?.period).toBeNull();
    expect(screen.queryByText('R$7.777,00')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Semana' }));
    fireEvent.click(screen.getByRole('button', { name: /Próxima semana/ }));
    expect(state.calls.at(-1)?.period).toEqual({ start: '2026-09-07', end: '2026-09-13' });
    expect(screen.queryByText('R$131.823,59')).not.toBeInTheDocument();
  });

  it('TESTE 8 — saldo final negativo tem texto e rótulo, não só cor', () => {
    state.responses.set(WEEK, ready(buildBorderoReport(createBorderoPayload({
      items: [borderoItem('c-adm', 5_000_000)],
      accounts: [borderoAccount('Banco', 2_000_000)],
    }))));
    render(<BorderoSection />);
    expect(kpiValue(/Saldo final provisionado · Negativo/i)).toBe('-R$30.000,00');
    expect(screen.getByText('Saldo insuficiente para cobrir os vencimentos do período')).toBeInTheDocument();
  });

  it('TESTE 9 — período sem contas mostra estado vazio e saldo final = saldo', () => {
    state.responses.set(WEEK, ready(buildBorderoReport(createBorderoPayload({
      items: [],
      accounts: [borderoAccount('Banco', 2_000_000)],
    }))));
    render(<BorderoSection />);
    expect(screen.getByText('Não existem contas a vencer para este período.')).toBeInTheDocument();
    expect(kpiValue(/^Contas a vencer$/i)).toBe('R$0,00');
    expect(kpiValue(/Saldo final provisionado/i)).toBe('R$20.000,00');
  });

  it('erro técnico não mostra R$0,00 e permite tentar novamente', () => {
    state.responses.set(WEEK, { isPending: false, isFetching: false, isError: true, error: new Error('rede') });
    render(<BorderoSection />);
    expect(screen.getByText('Não foi possível carregar o borderô')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it('TESTE 13 (cliente) — acesso negado pelo backend não exibe dados', () => {
    state.responses.set(WEEK, { isPending: false, isFetching: false, isError: true, error: { code: '42501', message: 'COMPANY_ACCESS_DENIED' } });
    render(<BorderoSection />);
    expect(screen.getByText('Acesso negado')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tentar novamente/ })).not.toBeInTheDocument();
  });

  it('sem permissão de visualização não consulta dados', () => {
    state.canView = false;
    render(<BorderoSection />);
    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(state.calls.every(call => call.enabled === false)).toBe(true);
  });

  it('exporta o PDF com o mesmo relatório exibido e mostra composição do saldo', async () => {
    const report = weekReport();
    state.responses.set(WEEK, ready(report));
    render(<BorderoSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Saldo das contas — ver composição' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('Banco A').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('R$18.609,27')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }));
    await waitFor(() => expect(state.exportBorderoPdf).toHaveBeenCalledTimes(1));
    expect(state.exportBorderoPdf).toHaveBeenCalledWith(report, { mode: 'week' });
  });

  it('sem permissão de exportação não mostra o botão', () => {
    state.canExport = false;
    state.responses.set(WEEK, ready(weekReport()));
    render(<BorderoSection />);
    expect(screen.queryByRole('button', { name: /Exportar PDF/ })).not.toBeInTheDocument();
  });

  it('drill-down lista fornecedor, vencimento e valor da categoria', () => {
    state.responses.set(WEEK, ready(weekReport()));
    render(<BorderoSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir CMV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Peixes e frutos do mar' }));
    const row = screen.getAllByText('Peixaria Atlantico', { selector: 'span' })[0].closest('tr') as HTMLElement;
    expect(within(row).getByText('31/08/2026')).toBeInTheDocument();
    expect(within(row).getByText('R$20.000,00')).toBeInTheDocument();
  });
});
