import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrcamentoSection from '@/components/financeiro/OrcamentoSection';
import { fmtBRL } from '@/lib/formatters';

const state = vi.hoisted(() => ({
  supabase: { rpc: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  confirm: vi.fn(),
}));

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => state.supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));
vi.mock('@/hooks/useConfirmDialog', () => ({ useConfirmDialog: () => ({ confirm: state.confirm, ConfirmDialog: () => null }) }));

const LEITURA = 'get_fin_orcamento_arvore';
const escritas = () => state.supabase.rpc.mock.calls.map(([nome]) => nome as string).filter(nome => nome !== LEITURA);
const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });

function rowOf(label: string): HTMLElement {
  const row = screen.getByText(label).closest('tr');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

/** Folhas orçadas e não orçadas, pai com orçamento legado (bloqueia os filhos), realizado acima do orçado. */
const ARVORE = {
  regime: 'caixa',
  categorias: [
    { id: 'r', nome: 'Receitas operacionais', codigo: '1', tipo: 'receita', parent_id: null, ordem: 0 },
    { id: 'r1', nome: 'Vendas no salão', codigo: '1.01', tipo: 'receita', parent_id: 'r', ordem: 0 },
    { id: 'r2', nome: 'Encomendas', codigo: '1.02', tipo: 'receita', parent_id: 'r', ordem: 1 },
    { id: 'c', nome: 'Custo das mercadorias', codigo: '3', tipo: 'despesa', parent_id: null, ordem: 1 },
    { id: 'c1', nome: 'Pescados', codigo: '3.01', tipo: 'despesa', parent_id: 'c', ordem: 0 },
    { id: 'o', nome: 'Despesas operacionais', codigo: '4', tipo: 'despesa', parent_id: null, ordem: 2 },
    { id: 'o1', nome: 'Aluguel', codigo: '4.01', tipo: 'despesa', parent_id: 'o', ordem: 0 },
  ],
  orcamentos: [
    { id: 'b1', categoria_id: 'r1', valor_orcado: 90000, updated_at: '2026-10-01T00:00:00Z' },
    { id: 'b2', categoria_id: 'c1', valor_orcado: 300000, updated_at: '2026-10-01T00:00:00Z' },
    { id: 'b3', categoria_id: 'o', valor_orcado: 60000, updated_at: '2026-10-01T00:00:00Z' },
  ],
  valores_realizado: { r1: 98765.43, r2: 12000, c1: 345678.9, o1: 12000 },
  valores_sem_categoria: {},
};

beforeEach(() => {
  state.supabase.rpc.mockReset();
  state.confirm.mockReset();
  largura(1366);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Orçamento × Realizado', () => {
  it('soma o realizado sem categoria no total da seção, sem permitir orçar a linha', async () => {
    state.supabase.rpc.mockResolvedValue({
      data: {
        regime: 'caixa',
        categorias: [
          { id: 'c-vendas', nome: 'VENDAS', codigo: '1.01', tipo: 'receita', parent_id: null, ordem: 0 },
          { id: 'c-salmao', nome: 'SALMAO', codigo: '2.01.01', tipo: 'despesa', parent_id: null, ordem: 1 },
        ],
        orcamentos: [],
        valores_realizado: { 'c-vendas': 1000, 'c-salmao': 98776.97 },
        valores_sem_categoria: { despesa: 2174.1 },
      },
      error: null,
    });

    render(<OrcamentoSection />);

    await screen.findByText('Sem categoria');
    const semCategoria = rowOf('Sem categoria');
    expect(within(semCategoria).getByText(fmtBRL(2174.1))).toBeInTheDocument();
    expect(within(semCategoria).queryByRole('textbox')).toBeNull();

    const totalDespesas = rowOf('TOTAL DE DESPESAS');
    expect(within(totalDespesas).getByText(fmtBRL(100951.07))).toBeInTheDocument();
    expect(screen.getByText(/Caixa \(Livro Razão\)/)).toBeInTheDocument();
    expect(state.supabase.rpc).toHaveBeenCalledWith('get_fin_orcamento_arvore', expect.objectContaining({ p_mes: expect.any(String) }));
  });

  it('resumo rotulado com realizado × orçado, status da regra existente, cadeado no legado de pai', async () => {
    state.supabase.rpc.mockResolvedValue({ data: ARVORE, error: null });
    render(<OrcamentoSection />);
    await screen.findByText('Pescados');
    const resumo = screen.getByRole('region', { name: 'Resumo do mês' });
    expect(within(resumo).getByText('Receita realizada')).toBeInTheDocument();
    expect(within(resumo).getByText(fmtBRL(110765.43))).toBeInTheDocument();
    expect(within(resumo).getByText(`Orçado: ${fmtBRL(90000)} · 123,1% executado`)).toBeInTheDocument();
    expect(within(resumo).getByText(`Resultado projetado (orçado): ${fmtBRL(90000 - 360000)}`)).toBeInTheDocument();

    expect(within(rowOf('Pescados')).getByText('Estourado')).toBeInTheDocument();
    expect(within(rowOf('Vendas no salão')).getByText('Em linha')).toBeInTheDocument();
    // Pai com orçamento legado: valor + lixeira nomeada; filho bloqueado sem campo.
    expect(within(rowOf('Despesas operacionais')).getByRole('button', { name: 'Excluir orçamento de Despesas operacionais' })).toBeInTheDocument();
    expect(within(rowOf('Aluguel')).queryByRole('textbox')).toBeNull();
    expect(within(rowOf('Aluguel')).getByText('(orçamento definido em categoria superior)')).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('digitar um orçado conta em "Salvar (n)" e avisa, mas não grava; fechar a tela também não grava', async () => {
    state.supabase.rpc.mockResolvedValue({ data: ARVORE, error: null });
    const { unmount } = render(<OrcamentoSection />);
    const campo = await screen.findByRole('textbox', { name: 'Orçado de Encomendas' });
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '15000' } });
    fireEvent.blur(campo);
    expect(await screen.findByRole('button', { name: 'Salvar (1)' })).toBeEnabled();
    expect(screen.getByText('1 alteração(ões) ainda não salva(s). Trocar de mês descarta o que foi digitado.')).toBeInTheDocument();
    expect(screen.getByText('Os valores orçados incluem as alterações ainda não salvas.')).toBeInTheDocument();
    unmount();
    expect(escritas()).toEqual([]);
  });

  it('excluir orçamento legado: cancelar não grava e devolve o foco à lixeira', async () => {
    state.supabase.rpc.mockResolvedValue({ data: ARVORE, error: null });
    state.confirm.mockResolvedValue(false);
    render(<OrcamentoSection />);
    const lixeira = await screen.findByRole('button', { name: 'Excluir orçamento de Despesas operacionais' });
    lixeira.focus();
    fireEvent.click(lixeira);
    expect(state.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Excluir Orçamento', confirmLabel: 'Excluir', variant: 'destructive' }));
    lixeira.blur();
    await waitFor(() => expect(document.activeElement).toBe(lixeira));
    expect(escritas()).toEqual([]);
  });

  it('Copiar Mês abre com rótulo associado e fecha sem copiar, devolvendo o foco', async () => {
    state.supabase.rpc.mockResolvedValue({ data: ARVORE, error: null });
    render(<OrcamentoSection />);
    await screen.findByText('Pescados');
    const abrir = screen.getByRole('button', { name: /Copiar Mês/ });
    abrir.focus();
    fireEvent.click(abrir);
    const dialogo = await screen.findByRole('dialog', { name: 'Copiar Orçamento de Outro Mês' });
    expect(within(dialogo).getByRole('combobox', { name: 'Copiar de' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Copiar' })).toBeDisabled();
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(abrir));
    expect(escritas()).toEqual([]);
  });

  it('falha de leitura vira erro com nova tentativa; exportar e copiar ficam bloqueados', async () => {
    state.supabase.rpc.mockResolvedValue({ data: null, error: { message: 'falha' } });
    render(<OrcamentoSection />);
    expect(await screen.findByText('Não foi possível carregar o orçamento')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma categoria operacional cadastrada.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copiar Mês/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /PDF/ })).toBeDisabled();
    state.supabase.rpc.mockResolvedValue({ data: ARVORE, error: null });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })); });
    expect(await screen.findByText('Pescados')).toBeInTheDocument();
  });

  it('no celular vira lista com os mesmos campos por folha (sem tabela)', async () => {
    largura(390);
    state.supabase.rpc.mockResolvedValue({ data: ARVORE, error: null });
    render(<OrcamentoSection />);
    const lista = await screen.findByRole('list', { name: 'Orçamento por categoria' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(lista).getByRole('textbox', { name: 'Orçado de Vendas no salão' })).toBeInTheDocument();
    expect(within(lista).getByRole('textbox', { name: 'Orçado de Encomendas' })).toBeInTheDocument();
    expect(within(lista).getAllByText('Estourado').length).toBeGreaterThan(0);
  });
});
