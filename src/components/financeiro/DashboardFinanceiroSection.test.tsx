import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardFinanceiroSection from './DashboardFinanceiroSection';

// Dados sintéticos — nenhum valor das imagens de referência do redesign.
type Summary = Record<string, number>;

const state = vi.hoisted(() => ({
  canView: true,
  canExport: true,
  summary: {} as Record<string, number>,
  rpc: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
  // Cliente estável, como o do CompanyScopeProvider: os callbacks de carga dependem dele.
  client: {} as { rpc: (...args: unknown[]) => unknown },
}));
state.client.rpc = (...args: unknown[]) => state.rpc(...args);

vi.mock('@/permissions/hooks', () => ({
  useCan: (key: string) => (key.endsWith(':export') ? state.canExport : state.canView),
}));
vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => state.client }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined }));

const BASE: Summary = {
  saldo_caixa: 5432.1,
  a_receber: 1500,
  a_pagar: 2750.25,
  a_pagar_vencido: 980.4,
  a_pagar_vencido_qtd: 3,
  receita: 12000,
  despesa: 9800.5,
  resultado: 2199.5,
  receita_prev: 10000,
  despesa_prev: 9000,
  resultado_prev: 1000,
};

beforeEach(() => {
  // Só o relógio é falso: as promessas e o waitFor continuam reais.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 2, 15, 12));
  state.canView = true;
  state.canExport = true;
  state.summary = { ...BASE };
  state.rpc.mockReset();
  state.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_fin_dashboard_summary') return { data: state.summary, error: null };
    return { data: { evolucao_mensal: [], despesas_por_categoria: [] }, error: null };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const LABELS_POSICAO = ['Saldo em Caixa', 'Contas a Receber', 'Contas a Pagar', 'Contas Vencidas'];
const LABELS_DESEMPENHO = ['Receita do Período', 'Despesa Realizada', 'Despesas Provisionadas', 'Resultado'];

function card(label: string): HTMLElement {
  const found = screen.getAllByRole('button').find(el => el.textContent?.startsWith(label));
  if (!found) throw new Error(`card ${label} não encontrado`);
  return found;
}

async function renderReady(onNavigate = vi.fn()) {
  render(<DashboardFinanceiroSection onNavigate={onNavigate} />);
  await screen.findByText('R$5.432,10');
  return onNavigate;
}

describe('DashboardFinanceiroSection — Redesign V2', () => {
  it('mantém o contrato da RPC do resumo (mês corrente, fim exclusivo)', async () => {
    await renderReady();
    expect(state.rpc).toHaveBeenCalledWith('get_fin_dashboard_summary', { p_start: '2026-03-01', p_end: '2026-04-01' });
  });

  it('oito indicadores, na ordem, em dois grupos de quatro', async () => {
    await renderReady();
    const posicao = within(screen.getByRole('region', { name: 'Posição Financeira' })).getAllByRole('button');
    const desempenho = within(screen.getByRole('region', { name: 'Desempenho do Período' })).getAllByRole('button');
    expect(posicao.map(el => LABELS_POSICAO.find(l => el.textContent?.startsWith(l)))).toEqual(LABELS_POSICAO);
    expect(desempenho.map(el => LABELS_DESEMPENHO.find(l => el.textContent?.startsWith(l)))).toEqual(LABELS_DESEMPENHO);
  });

  it('valores completos com centavos; saldo é o único card azul', async () => {
    await renderReady();
    expect(within(card('Saldo em Caixa')).getByText('R$5.432,10')).toBeInTheDocument();
    expect(within(card('Contas a Receber')).getByText('R$1.500,00')).toBeInTheDocument();
    expect(within(card('Contas a Pagar')).getByText('R$2.750,25')).toBeInTheDocument();
    expect(within(card('Contas Vencidas')).getByText('R$980,40')).toBeInTheDocument();
    expect(within(card('Receita do Período')).getByText('R$12.000,00')).toBeInTheDocument();
    expect(within(card('Despesa Realizada')).getByText('R$9.800,50')).toBeInTheDocument();
    expect(within(card('Resultado')).getByText('R$2.199,50')).toBeInTheDocument();
    const highlighted = screen.getAllByRole('button').filter(el => el.className.includes('bg-gradient-highlight'));
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toContain('Saldo em Caixa');
  });

  it('Despesas Provisionadas = realizada + a pagar, e a explicação mostra o mesmo total', async () => {
    await renderReady();
    expect(within(card('Despesas Provisionadas')).getByText('R$12.550,75')).toBeInTheDocument();
    const explicacao = screen.getByText('Entenda as despesas provisionadas').closest('.rounded-summary') as HTMLElement;
    expect(within(explicacao).getByText('R$12.550,75')).toBeInTheDocument();
    expect(within(explicacao).getByText('R$9.800,50')).toBeInTheDocument();
    expect(within(explicacao).getByText('R$2.750,25')).toBeInTheDocument();
    expect(within(explicacao).getByText(/não some com o card Despesa Realizada/)).toBeInTheDocument();
  });

  it('vencidas: "3 boletos" com destaque de perigo', async () => {
    await renderReady();
    expect(within(card('Contas Vencidas')).getByText('3 boletos · até hoje')).toBeInTheDocument();
    expect(card('Contas Vencidas')).toHaveClass('border-destructive-border');
  });

  it('vencidas zero não parece ocorrência crítica', async () => {
    state.summary = { ...BASE, a_pagar_vencido: 0, a_pagar_vencido_qtd: 0 };
    await renderReady();
    const vencidas = card('Contas Vencidas');
    expect(within(vencidas).getByText('R$0,00')).toBeInTheDocument();
    expect(within(vencidas).getByText('Nenhum boleto vencido até hoje')).toBeInTheDocument();
    expect(vencidas).not.toHaveClass('border-destructive-border');
  });

  it('resultado negativo mantém o sinal e o tom de perda; saldo negativo segue azul com sinal', async () => {
    state.summary = { ...BASE, saldo_caixa: -321.09, resultado: -1234.56 };
    render(<DashboardFinanceiroSection onNavigate={vi.fn()} />);
    const valor = await screen.findByText('R$-1.234,56');
    expect(valor).toHaveClass('text-destructive');
    const saldo = screen.getByText('R$-321,09');
    expect(saldo).toHaveClass('text-highlight-foreground');
  });

  it('comparativo com período anterior zerado mostra "Base zero", sem número inventado', async () => {
    state.summary = { ...BASE, receita_prev: 0, despesa_prev: 0, resultado_prev: 0 };
    await renderReady();
    for (const label of ['Receita do Período', 'Despesa Realizada', 'Resultado']) {
      expect(within(card(label)).getByText('Base zero')).toBeInTheDocument();
    }
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it('comparativo normal continua: receita +20,0%, despesa invertida', async () => {
    await renderReady();
    expect(within(card('Receita do Período')).getByText('20,0%')).toHaveClass('text-success');
    // Despesa subiu 8,9%: seta para cima, mas é ruim.
    expect(within(card('Despesa Realizada')).getByText('8,9%')).toHaveClass('text-destructive');
  });

  it('cada card navega com os mesmos parâmetros de antes', async () => {
    const onNavigate = await renderReady();
    const expected: Record<string, unknown> = {
      'Saldo em Caixa': { tab: 'fluxo' },
      'Contas a Receber': { tab: 'receber', status: 'A_RECEBER' },
      'Contas a Pagar': { tab: 'pagar' },
      'Contas Vencidas': { tab: 'pagar', status: 'VENCIDO' },
      'Receita do Período': { tab: 'lancamentos', tipo: 'RECEITA', dateFrom: '2026-03-01', dateTo: '2026-03-31' },
      'Despesa Realizada': { tab: 'lancamentos', tipo: 'DESPESA', dateFrom: '2026-03-01', dateTo: '2026-03-31' },
      'Despesas Provisionadas': { tab: 'pagar' },
      Resultado: { tab: 'dre' },
    };
    for (const [label, params] of Object.entries(expected)) {
      onNavigate.mockClear();
      fireEvent.click(card(label));
      expect(onNavigate).toHaveBeenCalledTimes(1);
      const call = onNavigate.mock.calls[0][0] as Record<string, unknown>;
      const defined = Object.fromEntries(Object.entries(call).filter(([, v]) => v !== undefined));
      expect(defined).toEqual(params);
    }
  });

  it('identifica o período do resumo, a janela do comparativo e o período em andamento', async () => {
    await renderReady();
    expect(within(screen.getByRole('region', { name: 'Desempenho do Período' })).getByText('Março de 2026')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Posição Financeira' })).getByText('Caixa e compromissos · Março de 2026')).toBeInTheDocument();
    // Mesma janela da RPC: p_start - (p_end - p_start) — não é "fevereiro inteiro".
    expect(screen.getByText(/29\/01\/2026 a 28\/02\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Período em andamento: receita, despesa e resultado vão até hoje/)).toBeInTheDocument();
    expect(screen.getByText(/Contas Vencidas: boletos aprovados ou aguardando aprovação/)).toBeInTheDocument();
  });

  it('se o resumo falhar após trocar de período, a legenda continua no período dos valores exibidos', async () => {
    await renderReady();
    state.rpc.mockImplementation(async (name: string) => name === 'get_fin_dashboard_summary'
      ? { data: null, error: { message: 'falha simulada' } }
      : { data: { evolucao_mensal: [], despesas_por_categoria: [] }, error: null });
    fireEvent.click(screen.getByRole('radio', { name: 'Dia' }));
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith('Erro ao carregar resumo do dashboard'));
    expect(within(card('Saldo em Caixa')).getByText('R$5.432,10')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Desempenho do Período' })).getByText('Março de 2026')).toBeInTheDocument();
    // Os gráficos carregam o período aplicado e o identificam como tal.
    expect(await screen.findByText('Período do resumo: 15/03/2026')).toBeInTheDocument();
  });

  // A RPC ainda é chamada sem permissão (efeito anterior ao `return`; o servidor nega) — PF-074, preexistente.
  it('sem permissão de visualizar mostra o aviso e nenhum card', () => {
    state.canView = false;
    render(<DashboardFinanceiroSection onNavigate={vi.fn()} />);
    expect(screen.getByText('Você não tem permissão para acessar esta seção.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Posição Financeira' })).toBeNull();
  });

  it('PDF e Excel só aparecem com permissão de exportar', async () => {
    state.canExport = false;
    await renderReady();
    expect(screen.queryByRole('button', { name: /PDF/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Excel/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Atualizar/ })).toBeInTheDocument();
  });

  it('carregando: grupos visíveis com skeletons, Atualizar desabilitado', async () => {
    let release: (v: unknown) => void = () => {};
    state.rpc.mockImplementation((name: string) => name === 'get_fin_dashboard_summary'
      ? new Promise(resolve => { release = resolve; })
      : Promise.resolve({ data: { evolucao_mensal: [], despesas_por_categoria: [] }, error: null }));
    render(<DashboardFinanceiroSection onNavigate={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Posição Financeira' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button').filter(el => el.textContent?.startsWith('Saldo em Caixa'))).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Atualizar/ })).toBeDisabled();
    release({ data: state.summary, error: null });
    await waitFor(() => expect(screen.getByText('R$5.432,10')).toBeInTheDocument());
  });
});
