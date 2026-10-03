import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CmvFinanceiroSection from './CmvFinanceiroSection';
import { buildCmvReport, parseCmvPayload, type CmvFiltro, type CmvReport } from '@/domain/financeiro/cmv';
import { CAT, CMV_FILTRO_SEMANA, cmvPayloadCru } from '@/test/fixtures/cmvFinanceiro';
import type { CmvListaParams } from '@/hooks/useCmvFinanceiro';

type HookResult = {
  data?: CmvReport;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

const state = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  respostas: new Map<string, Partial<HookResult>>(),
  chamadas: [] as Array<{ companyId: unknown; filtro: CmvFiltro; enabled: boolean }>,
  listas: [] as Array<{ params: CmvListaParams; enabled: boolean }>,
  refetch: vi.fn(),
}));

vi.mock('@/permissions', () => ({ useCan: (key: string) => state.permissoes.has(key) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'unidade-a' } }) }));
vi.mock('@/contexts/CompanyScopeContext', () => ({
  useCompanyScope: () => ({ companyId: 'unidade-a' }),
  useSupabase: () => ({}),
}));
vi.mock('@/lib/dataEvents', () => ({ useEmitDataEvent: () => vi.fn(), useDataEvent: () => undefined }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/datetime', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/datetime')>()),
  todayBR: () => '2026-09-09',
}));
vi.mock('@/hooks/useCmvFinanceiro', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useCmvFinanceiro')>()),
  useCmvReport: (options: { companyId: unknown; filtro: CmvFiltro; enabled: boolean }) => {
    state.chamadas.push(options);
    return {
      data: undefined, isPending: true, isFetching: true, isError: false, error: null, refetch: state.refetch,
      ...state.respostas.get(`${options.filtro.inicio}|${options.filtro.fim}`),
    };
  },
  useCmvConfig: () => ({ data: { classificacaoAtiva: false, categorias: [] }, isPending: false, isError: false, refetch: vi.fn() }),
  useCmvLinhas: (options: { params: CmvListaParams; enabled: boolean }) => {
    state.listas.push(options);
    return { data: { totalLinhas: 0, totalTitulos: 0, totalCentavos: 0, itens: [] }, isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn() };
  },
}));

const SEMANA = '2026-09-07|2026-09-13';
const pronto = (report: CmvReport): Partial<HookResult> => ({ data: report, isPending: false, isFetching: false });
const relatorioSemana = () => buildCmvReport(parseCmvPayload(cmvPayloadCru()), CMV_FILTRO_SEMANA);

function renderizar() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CmvFinanceiroSection />
    </QueryClientProvider>,
  );
}

const ultimaChamada = () => state.chamadas[state.chamadas.length - 1];

beforeEach(() => {
  state.permissoes = new Set(['financeiro:cmv:view', 'financeiro:cmv:export', 'financeiro:cmv:manage', 'financeiro:pagar:view', 'financeiro:pagar:edit']);
  state.respostas.clear();
  state.chamadas.length = 0;
  state.listas.length = 0;
  state.refetch.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('CMV Financeiro — tela', () => {
  it('abre na semana corrente, em Visão Geral, com os valores do relatório', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();

    expect(screen.getByRole('heading', { level: 1, name: 'CMV Financeiro' })).toBeInTheDocument();
    expect(ultimaChamada()).toMatchObject({ companyId: 'unidade-a', enabled: true, filtro: { modo: 'semanal', inicio: '2026-09-07', fim: '2026-09-13' } });
    expect(screen.getByRole('radio', { name: 'Semanal' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('tab', { name: 'Visão Geral' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText('07/09/2026 a 13/09/2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/31\/08\/2026 a 06\/09\/2026/).length).toBeGreaterThan(0);

    // "Sobre os dados" repete os títulos Faturamento/CMV Financeiro: o card é o que está num <article>.
    const card = (titulo: string) => screen.getAllByRole('heading', { level: 3, name: titulo })
      .map(h => h.closest('article')).find(Boolean)!;
    expect(within(card('Faturamento')).getByText('R$ 10.000,00')).toBeInTheDocument();
    expect(within(card('Faturamento')).getByText('+25,0%')).toBeInTheDocument();
    expect(within(card('CMV Financeiro')).getByText('R$ 3.100,00')).toBeInTheDocument();
    expect(within(card('% CMV')).getByText('31,00%')).toBeInTheDocument();
    expect(within(card('% CMV')).getByText('+6,00 p.p.')).toBeInTheDocument();
    expect(within(card('Variação do CMV em R$')).getByText('+R$ 1.100,00')).toBeInTheDocument();
    expect(within(card('Boletos vinculados ao CMV')).getByText('5')).toBeInTheDocument();
    expect(within(card('Boletos vinculados ao CMV')).getByText('2 boletos')).toBeInTheDocument();

    expect(screen.getByText('Faturamento × CMV × % CMV')).toBeInTheDocument();
    expect(screen.getByText('Composição do CMV por categoria')).toBeInTheDocument();
    expect(screen.getByText('Sobre os dados')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('avisa pendências, boletos sem competência e dias sem fechamento', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    // o primeiro aviso fica sempre à vista; os demais abrem sob demanda
    expect(screen.getByText(/Apuração possivelmente incompleta: 2 boletos do período/)).toBeInTheDocument();
    expect(screen.queryByText(/1 boleto sem data de competência/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Ver os \d avisos$/ }));
    expect(screen.getByText(/1 boleto sem data de competência/)).toBeInTheDocument();
    expect(screen.getByText(/1 dia sem fechamento de caixa no período atual/)).toBeInTheDocument();
  });

  it('trocar o filtro não mostra valor do filtro anterior enquanto carrega', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    fireEvent.click(screen.getByRole('radio', { name: 'Mensal' }));

    expect(ultimaChamada().filtro).toEqual({ modo: 'mensal', inicio: '2026-09-01', fim: '2026-09-30' });
    expect(screen.getByRole('status', { name: 'Carregando CMV Financeiro' })).toBeInTheDocument();
    expect(screen.queryByText('R$ 10.000,00')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeDisabled();
  });

  it('navega entre semanas e volta para a semana atual', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    expect(screen.getByRole('button', { name: 'Semana atual' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(ultimaChamada().filtro).toEqual({ modo: 'semanal', inicio: '2026-08-31', fim: '2026-09-06' });
    fireEvent.click(screen.getByRole('button', { name: 'Semana atual' }));
    expect(ultimaChamada().filtro).toEqual({ modo: 'semanal', inicio: '2026-09-07', fim: '2026-09-13' });
    fireEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    expect(ultimaChamada().filtro).toEqual({ modo: 'semanal', inicio: '2026-09-14', fim: '2026-09-20' });
  });

  it('o filtro permanece ao trocar de aba; Análise e Comparativo usam o mesmo relatório', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    fireEvent.click(screen.getByRole('tab', { name: 'Análise por Categoria' }));
    expect(screen.getByText('Demonstrativo de CMV por categoria')).toBeInTheDocument();
    expect(screen.getByText('Ranking de categorias no CMV')).toBeInTheDocument();
    expect(screen.getByText('Peixes tem a maior participação no CMV: 64,5% (R$ 2.000,00).')).toBeInTheDocument();
    expect(screen.getByText('Saldo após CMV, antes das demais despesas')).toBeInTheDocument();
    expect(screen.queryByText(/lucro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^DRE/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Comparativo' }));
    expect(screen.getByText('Resumo comparativo')).toBeInTheDocument();
    expect(screen.getByText('Detalhamento por faixa do período')).toBeInTheDocument();
    expect(new Set(state.chamadas.map(c => `${c.filtro.inicio}|${c.filtro.fim}`))).toEqual(new Set([SEMANA]));
    // cards continuam os mesmos em qualquer aba
    expect(screen.getAllByText('R$ 10.000,00').length).toBeGreaterThan(0);
  });

  it('demonstrativo expande, recolhe e busca sem alterar o total', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    fireEvent.click(screen.getByRole('tab', { name: 'Análise por Categoria' }));
    const tabela = screen.getByRole('table', { name: /Demonstrativo de CMV por categoria/ });
    expect(within(tabela).queryByText('Salmão')).not.toBeInTheDocument();
    fireEvent.click(within(tabela).getByRole('button', { name: 'Expandir Peixes' }));
    expect(within(tabela).getByText('Salmão')).toBeInTheDocument();
    expect(within(tabela).getByText('inativa')).toBeInTheDocument();
    fireEvent.click(within(tabela).getByRole('button', { name: 'Recolher Peixes' }));
    expect(within(tabela).queryByText('Salmão')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expandir todas' }));
    expect(within(tabela).getByText('Atum')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar categoria no demonstrativo'), { target: { value: 'salmao' } });
    expect(within(tabela).getByText('Salmão')).toBeInTheDocument();
    expect(within(tabela).queryByText('Bebidas')).not.toBeInTheDocument();
    expect(within(tabela).getByText('Total geral do CMV (sem o filtro da busca)')).toBeInTheDocument();
    expect(within(tabela).getAllByText('R$ 3.100,00').length).toBeGreaterThan(0);
  });

  it('abrir uma categoria consulta os boletos do mesmo intervalo e categoria', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    fireEvent.click(screen.getByRole('tab', { name: 'Análise por Categoria' }));
    const tabela = screen.getByRole('table', { name: /Demonstrativo de CMV por categoria/ });
    fireEvent.click(within(tabela).getByRole('button', { name: 'Peixes' }));
    expect(screen.getByRole('dialog', { name: 'Boletos de origem — Peixes' })).toBeInTheDocument();
    const consulta = state.listas.filter(l => l.enabled).pop()!;
    expect(consulta.params).toMatchObject({ inicio: '2026-09-07', fim: '2026-09-13', situacao: 'incluido', categoriaId: CAT.peixes, offset: 0 });
  });

  it('pendências abrem a lista de boletos pendentes do período', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    const linha = screen.getByText(/Pendentes de classificação no período/).closest('li')!;
    fireEvent.click(within(linha).getByRole('button', { name: 'Ver boletos' }));
    expect(screen.getByRole('dialog', { name: 'Boletos pendentes de classificação' })).toBeInTheDocument();
    expect(state.listas.filter(l => l.enabled).pop()!.params).toMatchObject({ situacao: 'pendente', inicio: '2026-09-07', fim: '2026-09-13', categoriaId: null });
  });

  it('Regras de vínculo: exemplo identificado, texto do padrão e revisão do histórico sem período', () => {
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    fireEvent.click(screen.getByRole('tab', { name: /Regras de vínculo/ }));
    expect(screen.getByText('Demonstração — não são dados da empresa')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.150,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.800,00')).toBeInTheDocument();
    expect(screen.getByText(/O padrão será sugerido em novos lançamentos\. Alterações não modificam boletos já cadastrados\./)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar pendências' }));
    expect(state.listas.filter(l => l.enabled).pop()!.params).toMatchObject({ situacao: 'pendente', inicio: null, fim: null });
  });

  it('sem permissão de leitura não consulta nem mostra dados', () => {
    state.permissoes = new Set(['financeiro:pagar:view']);
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    expect(screen.getByText('Acesso negado')).toBeInTheDocument();
    expect(state.chamadas.every(c => c.enabled === false)).toBe(true);
    expect(screen.queryByText('R$ 10.000,00')).not.toBeInTheDocument();
  });

  it('sem permissão de exportação o botão Exportar não existe', () => {
    state.permissoes.delete('financeiro:cmv:export');
    state.respostas.set(SEMANA, pronto(relatorioSemana()));
    renderizar();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
  });

  it('erro é recuperável e não exibe números', () => {
    state.respostas.set(SEMANA, { isPending: false, isFetching: false, isError: true, error: new Error('rede') });
    renderizar();
    expect(screen.getByText('Não foi possível carregar o CMV Financeiro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it('banco sem a migration mostra recurso não ativado, não erro', () => {
    state.respostas.set(SEMANA, { isPending: false, isFetching: false, isError: true, error: { code: 'PGRST202', message: 'Could not find the function' } });
    renderizar();
    expect(screen.getByText('CMV Financeiro ainda não ativado neste ambiente')).toBeInTheDocument();
  });

  it('período vazio não vira valor: sem fechamento mostra "—" e a justificativa', () => {
    const vazio = buildCmvReport(parseCmvPayload(cmvPayloadCru({ faturamento: [], cmv: [], boletos: [], qualidade: [], categorias: [] })), CMV_FILTRO_SEMANA);
    state.respostas.set(SEMANA, pronto(vazio));
    renderizar();
    const card = screen.getByRole('heading', { level: 3, name: '% CMV' }).closest('article')!;
    expect(within(card).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(card).getByText('Sem fechamento de caixa no período.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum boleto incluído no CMV neste período')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });
});
