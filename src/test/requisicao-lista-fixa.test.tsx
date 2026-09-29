/**
 * Requisição por Lista Fixa — setores liberados e busca dentro da lista.
 *
 * Cobre o que não pode regredir:
 *   · o seletor só oferece setores cuja lista a RLS devolveu (lista em que o
 *     usuário não foi selecionado não chega ao cliente), mesmo que o setor do
 *     perfil seja outro;
 *   · sem nenhuma lista liberada, a tela explica em vez de mostrar setor vazio;
 *   · a busca filtra por nome (sem acento) e SKU, e quantidades digitadas em
 *     itens fora do filtro continuam na requisição;
 *   · Enter na busca vai para a quantidade do 1º item; Enter na última
 *     quantidade filtrada volta para a busca.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RequisicaoListaFixa from '@/components/estoque/RequisicaoListaFixa';
import type { ProdutoExtended } from '@/types/estoque';

// Toast estável como o hook real: a carga dos itens depende dele, e um objeto
// novo a cada render redispararia o efeito em loop.
const mockToast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => mockToast }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { sector: 'Bar' } }) }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));

const mockDb = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  eqCalls: [] as Array<[string, string, unknown]>,
}));

// Cliente estável: os efeitos dependem dele e rodariam a cada render.
const mockSupabase = vi.hoisted(() => ({
  from: (table: string) => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { mockDb.eqCalls.push([table, column, value]); return query; },
      order: () => query,
      then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: mockDb.tables[table] ?? [], error: null }).then(resolve),
    };
    return query;
  },
}));
vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => mockSupabase }));

const produtos = [
  { id: 'p-arroz', nomeProduto: 'Arroz Japonês 5 kg', sku: 'ARZ-01', unidadeCompra: 'UN', unidadeMedida: 'UN', ativo: true },
  { id: 'p-gluta', nomeProduto: 'Glutamato Monossódico', sku: 'GLU-01', unidadeCompra: 'UN', unidadeMedida: 'UN', ativo: true },
  { id: 'p-gergelim', nomeProduto: 'Gergelim branco', sku: 'GER-01', unidadeCompra: 'Pacote', unidadeMedida: 'KG', ativo: true },
] as unknown as ProdutoExtended[];

const itensCozinha = produtos.map((produto, index) => ({ id: `i-${produto.id}`, produto_id: produto.id, ordem: index + 1, observacao: '' }));

function renderTela() {
  render(<RequisicaoListaFixa produtos={produtos} saldos={{}} onSuccess={vi.fn()} onCancel={vi.fn()} />);
}

beforeEach(() => {
  mockDb.eqCalls = [];
  mockDb.tables = {
    stock_sectors: [{ name: 'Bar' }, { name: 'Cozinha restaurante' }, { name: 'Salão' }],
    // A RLS já filtrou: só a lista da cozinha está liberada para este usuário.
    listas_fixas_setor: [{ id: 'l-cozinha', setor: 'Cozinha restaurante' }],
    listas_fixas_setor_itens: itensCozinha,
  };
});

afterEach(cleanup);

describe('Requisição por Lista Fixa — setores liberados', () => {
  it('abre na lista liberada, e não no setor do perfil que não tem lista para o usuário', async () => {
    renderTela();
    await screen.findByLabelText('Quantidade de Arroz Japonês 5 kg');
    expect(screen.getByRole('combobox')).toHaveTextContent('Cozinha restaurante');
    expect(mockDb.eqCalls).toContainEqual(['listas_fixas_setor_itens', 'lista_fixa_id', 'l-cozinha']);
  });

  it('sem lista liberada, orienta a pedir liberação ou usar a requisição manual', async () => {
    mockDb.tables.listas_fixas_setor = [];
    renderTela();
    expect(await screen.findByText('Nenhuma lista fixa liberada para você')).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('Requisição por Lista Fixa — busca na lista', () => {
  it('filtra por nome sem acento e por SKU, mantendo as quantidades já digitadas', async () => {
    renderTela();
    fireEvent.change(await screen.findByLabelText('Quantidade de Glutamato Monossódico'), { target: { value: '2' } });

    const busca = screen.getByLabelText('Buscar na lista');
    fireEvent.change(busca, { target: { value: 'japones' } });
    expect(screen.getByLabelText('Quantidade de Arroz Japonês 5 kg')).toBeVisible();
    expect(screen.queryByLabelText('Quantidade de Glutamato Monossódico')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 de 3 itens • 1 preenchido(s)');

    fireEvent.change(screen.getByLabelText('Quantidade de Arroz Japonês 5 kg'), { target: { value: '3' } });
    expect(screen.getByRole('button', { name: /Pré-visualizar \(2\)/ })).toBeEnabled();

    fireEvent.change(busca, { target: { value: 'ger-01' } });
    expect(screen.getByLabelText('Quantidade de Gergelim branco')).toBeVisible();
    expect(screen.queryByLabelText('Quantidade de Arroz Japonês 5 kg')).not.toBeInTheDocument();

    fireEvent.change(busca, { target: { value: 'inexistente' } });
    expect(screen.getByText('Nenhum item da lista corresponde a “inexistente”.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca na lista' }));
    expect(screen.getByLabelText('Quantidade de Glutamato Monossódico')).toHaveValue('2');
    expect(screen.getByLabelText('Quantidade de Arroz Japonês 5 kg')).toHaveValue('3');
  });

  it('Enter na busca vai para a quantidade e, no último item filtrado, volta para a busca', async () => {
    renderTela();
    await screen.findByLabelText('Quantidade de Arroz Japonês 5 kg');

    const busca = screen.getByLabelText('Buscar na lista');
    fireEvent.change(busca, { target: { value: 'gluta' } });
    fireEvent.keyDown(busca, { key: 'Enter' });
    const quantidade = screen.getByLabelText('Quantidade de Glutamato Monossódico');
    expect(quantidade).toHaveFocus();

    fireEvent.change(quantidade, { target: { value: '5' } });
    fireEvent.keyDown(quantidade, { key: 'Enter' });
    await waitFor(() => expect(busca).toHaveFocus());
  });
});
