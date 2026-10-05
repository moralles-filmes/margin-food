import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LivroRazaoSection from '@/components/financeiro/LivroRazaoSection';
import { fmtBRL } from '@/lib/formatters';

const state = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  listError: null as null | { message: string },
  rpc: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const tableData: Record<string, unknown[]> = {
  fin_categorias: [],
  fin_centros_custo: [],
  fin_contas: [{ id: 'c1', nome: 'Banco Alfa' }],
};

const supabase = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({ order: () => Promise.resolve({ data: tableData[table] ?? [], error: null }) }),
    }),
  }),
  rpc: (name: string, params?: unknown) => state.rpc(name, params),
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));
vi.mock('@/hooks/useChavesPendentes', () => ({
  useChavesPendentes: () => ({ chave: vi.fn(), confirmar: vi.fn(), renovar: vi.fn() }),
}));
vi.mock('@/components/financeiro/ContaFormDialog', () => ({ default: () => null }));
vi.mock('@/components/financeiro/ContaDetailDialog', () => ({ default: () => null }));

const lancamento = (over: Record<string, unknown>) => ({
  id: 'x', tipo: 'DESPESA', status: 'REALIZADO', valor: 10, descricao: 'Lançamento', observacoes: null,
  conta_id: 'c1', conta_destino_id: null, categoria_id: null, centro_custo_id: null,
  data_competencia: '2026-03-10', data_ledger: '2026-03-10', data_vencimento: null, data_pagamento: '2026-03-10',
  forma_pagamento: 'pix', origem: 'manual', recorrente: false, recorrencia_config: null, conciliado: false,
  referencia_id: null, updated_at: '2026-03-10T12:00:00Z', saldo_apos: null, ...over,
});

beforeEach(() => {
  state.items = [
    lancamento({ id: 'l1', tipo: 'DESPESA', valor: 40, descricao: 'Compra de insumos', data_ledger: '2026-03-10', saldo_apos: 960 }),
    lancamento({ id: 'l2', tipo: 'RECEITA', status: 'PREVISTO', valor: 200, descricao: 'Venda prevista', data_ledger: '2026-03-09', origem: 'conciliacao', conciliado: true }),
  ];
  state.listError = null;
  state.rpc.mockReset();
  state.rpc.mockImplementation((name: string) => {
    if (name === 'list_fin_lancamentos_cursor') {
      return Promise.resolve(state.listError
        ? { data: null, error: state.listError }
        : { data: { items: state.items, has_more: false }, error: null });
    }
    if (name === 'get_fin_lancamentos_totais') {
      return Promise.resolve({ data: { total_receita: 200, total_despesa: 40, total_transferencia: 0, resultado: 160 }, error: null });
    }
    if (name === 'get_fin_saldo_atual') return Promise.resolve({ data: 1234.56, error: null });
    return Promise.resolve({ data: null, error: null });
  });
});

describe('Livro Razão (V2)', () => {
  it('saldo rotulado com a data do filtro, período nos totais e os mesmos parâmetros de antes', async () => {
    render(<LivroRazaoSection initialContaId="c1" initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText('Saldo em 31/03/2026')).toBeInTheDocument();
    expect(await screen.findByText('Banco Alfa · realizados até o fim do dia')).toBeInTheDocument();
    expect(screen.getByText(fmtBRL(1234.56))).toBeInTheDocument();
    expect(screen.getByText('01/03/2026 a 31/03/2026')).toBeInTheDocument();
    expect(screen.getByText('Entradas')).toBeInTheDocument();
    expect(screen.getByText('Resultado')).toBeInTheDocument();
    // A RPC de totais soma previstos; o saldo, só realizados.
    expect(screen.getAllByText('Realizados e previstos')).toHaveLength(3);

    expect(state.rpc).toHaveBeenCalledWith('list_fin_lancamentos_cursor', expect.objectContaining({
      p_start: '2026-03-01', p_end: '2026-03-31', p_tipo: null, p_conta_id: 'c1', p_origem: null,
      p_limit: 50, p_cursor_date: null, p_cursor_id: null,
    }));
    expect(state.rpc).toHaveBeenCalledWith('get_fin_saldo_atual', { p_conta_id: 'c1', p_data: '2026-03-31' });
  });

  it('cabeçalho do dia diz "fim do dia" sem filtro de linha e tipos aparecem como Receita/Despesa', async () => {
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect((await screen.findAllByText('Compra de insumos')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Saldo no fim do dia').length).toBeGreaterThan(0);
    expect(screen.getAllByText(fmtBRL(960)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Despesa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Receita').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Previsto').length).toBeGreaterThan(0);
    expect(screen.getAllByText(`- ${fmtBRL(40)}`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`+ ${fmtBRL(200)}`).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Editar lançamento Compra de insumos' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Editar classificação de Venda prevista' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Excluir lançamento Compra de insumos' }).length).toBeGreaterThan(0);
  });

  it('transferências com filtro de conta dizem que só as enviadas entram no total', async () => {
    render(<LivroRazaoSection initialTipo="TRANSFERENCIA" initialContaId="c1" initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText('Transferências enviadas pela conta')).toBeInTheDocument();
    expect(screen.getByText('As recebidas não entram neste total')).toBeInTheDocument();
  });

  it('resposta atrasada de um pedido antigo não sobrescreve a do pedido mais recente', async () => {
    let falharPedidoAntigo: (v: unknown) => void = () => undefined;
    let chamadas = 0;
    const base = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation((name: string, params?: unknown) => {
      if (name === 'get_fin_saldo_atual' && chamadas++ === 0) {
        return new Promise(resolve => { falharPedidoAntigo = resolve; });
      }
      return base(name, params);
    });
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText(fmtBRL(1234.56))).toBeInTheDocument();
    await act(async () => { falharPedidoAntigo({ data: null, error: { message: 'falhou' } }); });
    expect(screen.queryByText('Não foi possível carregar os totais')).toBeNull();
    expect(screen.getByText(fmtBRL(1234.56))).toBeInTheDocument();
  });

  it('com filtro de tipo o saldo do dia é o do último lançamento listado e o total é só daquele tipo', async () => {
    render(<LivroRazaoSection initialTipo="DESPESA" initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText('Total de saídas')).toBeInTheDocument();
    expect(screen.getAllByText('Saldo após o último lançamento listado').length).toBeGreaterThan(0);
    expect(screen.queryByText('Resultado')).toBeNull();
    expect(state.rpc).toHaveBeenCalledWith('list_fin_lancamentos_cursor', expect.objectContaining({ p_tipo: 'DESPESA' }));
  });

  it('erro da lista mostra estado de erro (não "nenhum lançamento") e tenta de novo', async () => {
    state.listError = { message: 'falhou' };
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText('Não foi possível carregar os lançamentos')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum lançamento encontrado')).toBeNull();

    state.listError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getAllByText('Compra de insumos').length).toBeGreaterThan(0));
  });

  it('lista vazia mostra o estado vazio', async () => {
    state.items = [];
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);
    expect(await screen.findByText('Nenhum lançamento encontrado')).toBeInTheDocument();
  });
});
