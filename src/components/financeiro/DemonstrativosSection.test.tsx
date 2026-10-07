import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DRESection from './DRESection';
import DFCSection from './DFCSection';

/**
 * Cliente falso do DRE/DFC (Redesign V2, Fase 06A): responde só às duas leituras e registra TODA
 * chamada — as telas não têm escrita. Exportadores substituídos por espiões: a entrada precisa ser a
 * mesma de antes (os arquivos saem iguais).
 */
const state = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  respostas: [] as Array<{ data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>>,
  perms: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  pdf: vi.fn(),
  excel: vi.fn(),
}));

const supabase = {
  rpc(name: string, args: unknown) {
    state.rpcCalls.push({ name, args });
    return Promise.resolve(state.respostas.shift() ?? { data: null, error: { message: 'sem resposta' } });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions', () => ({ useCan: (perm: string) => state.perms.has(perm) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined }));
vi.mock('@/lib/exportDemonstrativo', () => ({ exportDemonstrativoPDF: state.pdf, exportDemonstrativoExcel: state.excel }));

const cat = (id: string, nome: string, tipo: 'receita' | 'despesa', parent_id: string | null = null, extra = {}) => ({
  id, nome, codigo: '', tipo, parent_id, ordem: 0, grupo: null, system_key: null,
  excluir_dos_totais: false, ativo: true, updated_at: '2026-01-01T00:00:00Z', ...extra,
});
const CATEGORIAS = [
  cat('r', 'Receitas operacionais', 'receita'),
  cat('r1', 'Vendas no salão', 'receita', 'r'),
  cat('d', 'Custo das mercadorias', 'despesa'),
  cat('d1', 'Pescados', 'despesa', 'd'),
  cat('n', 'DESPESAS NÃO OPERACIONAIS', 'despesa', null, { excluir_dos_totais: true }),
];
const VALORES = { r1: 98765.43, d1: 1234567.89, n: 30000 };
const ok = (data: unknown) => ({ data, error: null });

// cmdk (filtro de centro de custo) rola o item ativo para a vista; jsdom não implementa scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T15:00:00Z'));
  state.rpcCalls = [];
  state.respostas = [];
  state.perms = new Set(['financeiro:dre:view', 'financeiro:dre:export', 'financeiro:fluxo:view', 'financeiro:fluxo:export']);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe('DRE (V2)', () => {
  it('mostra o demonstrativo com período e regime, valores grandes e negativos, e só lê', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES }));
    render(<DRESection />);
    expect(await screen.findByText('out/26 · competência')).toBeInTheDocument();
    expect(screen.getByText('Apuração por competência · estrutura do Cadastro Base')).toBeInTheDocument();
    const resultado = screen.getByText('RESULTADO DO PERÍODO').closest('tr') as HTMLElement;
    expect(within(resultado).getByText('R$-1.135.802,46')).toBeInTheDocument();
    expect(state.rpcCalls).toEqual([{ name: 'get_fin_dre_summary', args: { p_inicio: '2026-10-01', p_fim: '2026-10-31' } }]);
  });

  it('exporta com a mesma entrada de antes', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES }));
    render(<DRESection />);
    await screen.findByText('out/26 · competência');
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    expect(state.pdf).toHaveBeenCalledWith({
      categorias: CATEGORIAS,
      lancamentos: Object.entries(VALORES).map(([id, valor]) => ({ id, categoria_id: id, valor, tipo: 'VIRTUAL', status: 'REALIZADO' })),
      rateios: [],
      titulo: 'DRE — Demonstrativo de Resultado',
      periodo: 'out/26',
      showPctReceita: true,
    });
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
    expect(state.excel).toHaveBeenCalledWith(state.pdf.mock.calls[0][0]);
  });

  it('falha de leitura vira erro com nova tentativa — nunca "Nenhuma categoria" nem R$ 0,00 — e bloqueia a exportação', async () => {
    state.respostas.push({ data: null, error: { message: 'falha' } });
    render(<DRESection />);
    expect(await screen.findByText('Não foi possível carregar o DRE')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma categoria cadastrada')).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeDisabled();
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES }));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('out/26 · competência')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/ })).toBeEnabled();
  });

  it('só a resposta mais recente entra na tela (troca rápida de mês)', async () => {
    let resolverAntiga: (v: { data: unknown; error: unknown }) => void = () => {};
    state.respostas.push(new Promise(resolve => { resolverAntiga = resolve; }));
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: { r1: 10, d1: 4 } }));
    render(<DRESection />);
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByText('set/26 · competência')).toBeInTheDocument();
    resolverAntiga(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES }));
    await waitFor(() => expect(screen.getByText('RESULTADO DO PERÍODO').closest('tr')).toHaveTextContent('R$6,00'));
    expect(screen.getByText('set/26 · competência')).toBeInTheDocument();
  });

  it('sem permissão mostra acesso restrito no lugar do demonstrativo', () => {
    state.perms = new Set();
    render(<DRESection />);
    expect(screen.getByText('Você não tem permissão para visualizar o DRE.')).toBeInTheDocument();
  });
});

describe('DFC (V2)', () => {
  it('saldo inicial, regime de caixa, nota legível e exportação igual', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES, saldo_inicial: 250000 }));
    render(<DFCSection />);
    expect(await screen.findByText('out/26 · caixa')).toBeInTheDocument();
    expect(screen.getByText('SALDO INICIAL').closest('tr')).toHaveTextContent('R$250.000,00');
    const nota = screen.getByText(/Valores apurados pela data de pagamento efetivo/);
    expect(nota.closest('p')?.className ?? '').not.toContain('text-[10px]');
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    expect(state.pdf).toHaveBeenCalledWith(expect.objectContaining({
      titulo: 'DFC — Demonstração de Fluxo de Caixa', periodo: 'out/26', isDFC: true, saldoInicial: 250000, showPctReceita: true, rateios: [],
    }));
    expect(screen.getByRole('columnheader', { name: '% Recebimentos' })).toBeInTheDocument();
    expect(state.rpcCalls.map(c => c.name)).toEqual(['get_fin_dfc_summary']);
  });

  it('mantém a própria permissão (financeiro:fluxo:view — PF-002)', () => {
    state.perms = new Set(['financeiro:dre:view']);
    render(<DFCSection />);
    expect(screen.getByText('Você não tem permissão para visualizar o DFC.')).toBeInTheDocument();
  });
});

describe('Recorte por centro de custo (DRE/DFC)', () => {
  const CENTROS = [{ id: 'cc-cozinha', nome: 'Cozinha' }, { id: 'cc-salao', nome: 'Salão' }];
  // Contrato do servidor: para cada categoria, a soma dos centros é o valor da categoria.
  const POR_CENTRO = {
    'cc-cozinha': { d1: 1000000 },
    'cc-salao': { r1: 98765.43, d1: 200000 },
    sem_centro: { d1: 34567.89, n: 30000 },
  };

  const escolherCentro = async (nome: string) => {
    fireEvent.click(screen.getByRole('combobox', { name: 'Centro de custo' }));
    fireEvent.click(await screen.findByRole('option', { name: nome }));
  };

  it('sem nenhum valor com centro de custo no período, o filtro não aparece', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES, centros_custo: [], valores_por_centro_custo: {} }));
    render(<DRESection />);
    await screen.findByText('out/26 · competência');
    expect(screen.queryByRole('combobox', { name: 'Centro de custo' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Recorte por centro de custo/)).not.toBeInTheDocument();
  });

  it('banco sem as chaves novas também não mostra o filtro', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES }));
    render(<DRESection />);
    await screen.findByText('out/26 · competência');
    expect(screen.queryByRole('combobox', { name: 'Centro de custo' })).not.toBeInTheDocument();
  });

  it('DRE: filtrar por centro mostra só os valores dele e leva o recorte ao export', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES, centros_custo: CENTROS, valores_por_centro_custo: POR_CENTRO }));
    render(<DRESection />);
    await screen.findByText('out/26 · competência');
    expect(screen.getByRole('combobox', { name: 'Centro de custo' })).toHaveTextContent('Todos os centros de custo');
    expect(screen.getByText('RESULTADO DO PERÍODO').closest('tr')).toHaveTextContent('R$-1.135.802,46');

    await escolherCentro('Cozinha');
    expect(await screen.findByText('out/26 · competência · Cozinha')).toBeInTheDocument();
    expect(screen.getByText('RESULTADO DO PERÍODO').closest('tr')).toHaveTextContent('R$-1.000.000,00');
    expect(screen.getByText(/Recorte por centro de custo/)).toBeInTheDocument();
    // % sobre a receita não se aplica a um recorte (o denominador seria só a receita do centro).
    expect(screen.queryByRole('columnheader', { name: '% Receita Líq.' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Sem receita no período/)).not.toBeInTheDocument();
    // A troca de recorte é feita no cliente: nenhuma leitura nova.
    expect(state.rpcCalls).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    expect(state.pdf).toHaveBeenCalledWith(expect.objectContaining({
      periodo: 'out/26 · Centro de custo: Cozinha',
      showPctReceita: false,
      lancamentos: [{ id: 'd1', categoria_id: 'd1', valor: 1000000, tipo: 'VIRTUAL', status: 'REALIZADO' }],
    }));
  });

  it('DRE: "Sem centro de custo" mostra o que não tem centro', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES, centros_custo: CENTROS, valores_por_centro_custo: POR_CENTRO }));
    render(<DRESection />);
    await screen.findByText('out/26 · competência');
    await escolherCentro('Sem centro de custo');
    expect(await screen.findByText('out/26 · competência · Sem centro de custo')).toBeInTheDocument();
    expect(screen.getByText('RESULTADO DO PERÍODO').closest('tr')).toHaveTextContent('R$-34.567,89');
  });

  it('DRE: o filtro continua visível com um centro escolhido num mês sem centro de custo', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES, centros_custo: CENTROS, valores_por_centro_custo: POR_CENTRO }));
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: { r1: 10, d1: 4 }, centros_custo: [], valores_por_centro_custo: {} }));
    render(<DRESection />);
    await screen.findByText('out/26 · competência');
    await escolherCentro('Cozinha');
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByText('set/26 · competência · Cozinha')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Centro de custo' })).toHaveTextContent('Cozinha');
    expect(screen.getByText('RESULTADO DO PERÍODO').closest('tr')).toHaveTextContent('R$0,00');
    expect(screen.getByText(/Este centro de custo não tem valores neste período/)).toBeInTheDocument();
  });

  it('DFC: com centro escolhido, saldo inicial e acumulado da empresa saem da tela e do export', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES, saldo_inicial: 250000, centros_custo: CENTROS, valores_por_centro_custo: POR_CENTRO }));
    render(<DFCSection />);
    await screen.findByText('out/26 · caixa');
    expect(screen.getByText('SALDO INICIAL')).toBeInTheDocument();

    await escolherCentro('Salão');
    expect(await screen.findByText('out/26 · caixa · Salão')).toBeInTheDocument();
    expect(screen.queryByText('SALDO INICIAL')).not.toBeInTheDocument();
    expect(screen.queryByText('SALDO ACUMULADO')).not.toBeInTheDocument();
    expect(screen.getByText('RESULTADO LÍQUIDO DO PERÍODO').closest('tr')).toHaveTextContent('R$-101.234,57');
    expect(screen.getByText(/Saldo inicial, saldo acumulado e a coluna de % sobre os recebimentos são da empresa inteira/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    expect(screen.queryByRole('columnheader', { name: '% Recebimentos' })).not.toBeInTheDocument();
    expect(state.pdf).toHaveBeenCalledWith(expect.objectContaining({ periodo: 'out/26 · Centro de custo: Salão', mostrarSaldo: false, showPctReceita: false }));
  });

  it('voltar para "Todos" restaura % e a tela de antes', async () => {
    state.respostas.push(ok({ categorias: CATEGORIAS, valores_por_categoria: VALORES, centros_custo: CENTROS, valores_por_centro_custo: POR_CENTRO }));
    render(<DRESection />);
    await screen.findByText('out/26 · competência');
    await escolherCentro('Cozinha');
    await screen.findByText('out/26 · competência · Cozinha');
    await escolherCentro('Todos os centros de custo');
    expect(await screen.findByText('out/26 · competência')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '% Receita Líq.' })).toBeInTheDocument();
    expect(screen.getByText('RESULTADO DO PERÍODO').closest('tr')).toHaveTextContent('R$-1.135.802,46');
    expect(screen.queryByText(/Recorte por centro de custo/)).not.toBeInTheDocument();
  });
});
