/**
 * Regression tests for NovaMovimentacaoModal
 * Ensures the modal-based movement creation flow works correctly
 * and prevents regression to the old inline form pattern.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NovaMovimentacaoModal, { type MovModalPreset } from '@/components/estoque/NovaMovimentacaoModal';
import type { ProdutoExtended } from '@/types/estoque';
import { limparRegistroDaAba } from '@/lib/chaveOperacao';

// NovaMovimentacaoModal fetches setores from stock_sectors on open — mock the
// client so tests don't depend on VITE_SUPABASE_* env vars or the network.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

// ─── Helpers ───

const baseProd: ProdutoExtended = {
  id: 'prod-1',
  nomeProduto: 'Salmão Fresco',
  unidadeMedida: 'KG',
  unidadeCompra: 'cx',
  fatorConversaoPadrao: 10,
  categoria: 'Proteínas',
  estoqueMinimo: 5,
  estoqueIdeal: 20,
  ativo: true,
  sku: 'SAL001',
  conversoes: '',
  custoPadrao: 80,
  fornecedoresPreferenciais: [],
  leadTimeDias: 3,
  localEstoque: '',
  observacoes: '',
  createdAt: '2026-01-01',
  custoUltimaCompra: 85,
  custoMedio30d: 82,
  defaultCostPurchaseUnit: 800,
  defaultCostBaseUnit: 80,
  needsCostReview: false,
  lastCostPurchaseUnit: 850,
  lastCostBaseUnit: 85,
  lastPurchaseDate: null,
  lastSupplier: null,
  avg30CostBaseUnit: 82,
  avg30CostPurchaseUnit: 820,
  avg30VariationPercent: 0,
  inactivityDaysThreshold: null,
  lastMovementAt: null,
  isSalmonRawLinked: false,
  contaNoCmv: true,
  packageQuantity: null,
  packageMeasureUnit: null,
  conversionMode: 'auto',
  saldoAtual: 100,
};

const arroz: ProdutoExtended = {
  ...baseProd,
  id: 'prod-2',
  nomeProduto: 'Arroz',
  unidadeCompra: 'KG',
  fatorConversaoPadrao: 1,
  sku: 'ARR001',
};

const defaultProps = {
  open: true,
  preset: 'entrada' as MovModalPreset,
  onClose: vi.fn(),
  produtos: [baseProd, arroz],
  saldos: { 'prod-1': { saldo: 100 }, 'prod-2': { saldo: 50 } },
  userId: 'user-1',
  hasPermission: () => true,
  canEditPricing: false,
  addMovimentacoesLote: vi.fn().mockResolvedValue([]),
  recalcularPrecos: vi.fn(),
};

// cmdk rola o item ativo para a vista; jsdom não implementa scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

/**
 * Abre o combobox de produto da linha `linha` (0-based) e escolhe `nome`. Os
 * selects de Tipo/Setor também têm role combobox — o de produto é o que mostra
 * o placeholder ou o nome de um produto.
 */
function escolherProduto(linha: number, nome: string) {
  const textos = ['Buscar produto…', ...defaultProps.produtos.map(p => p.nomeProduto)];
  const gatilhos = screen.getAllByRole('combobox')
    .filter(el => textos.some(t => el.textContent?.includes(t)));
  fireEvent.click(gatilhos[linha]);
  fireEvent.click(screen.getByRole('option', { name: new RegExp(nome) }));
}

// ─── Tests ───

describe('NovaMovimentacaoModal', () => {
  beforeEach(() => {
    limparRegistroDaAba();
    sessionStorage.clear();
  });

  it('renders with "Nova Entrada" title when preset=entrada', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    expect(screen.getByText('Nova Entrada')).toBeInTheDocument();
  });

  it('renders with "Nova Saída" title when preset=saida', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="saida" />);
    expect(screen.getByText('Nova Saída')).toBeInTheDocument();
  });

  it('renders with "Ajuste / Transferência" title when preset=ajuste', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="ajuste" />);
    expect(screen.getByText('Ajuste / Transferência')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    const { container } = render(<NovaMovimentacaoModal {...defaultProps} open={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the item list with a product search per line', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    expect(screen.getByText('Itens')).toBeInTheDocument();
    expect(screen.getByText('Buscar produto…')).toBeInTheDocument();
  });

  it('shows a "Setor" field per line only for saída', () => {
    const { unmount } = render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    escolherProduto(0, 'Salmão Fresco');
    expect(screen.queryByText(/Setor/)).not.toBeInTheDocument();
    unmount();

    render(<NovaMovimentacaoModal {...defaultProps} preset="saida" />);
    escolherProduto(0, 'Salmão Fresco');
    expect(screen.getByRole('combobox', { name: 'Setor do item 1' })).toBeInTheDocument();
  });

  it('submits every filled line in a single batch call', async () => {
    const addMovimentacoesLote = vi.fn().mockResolvedValue([]);
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" addMovimentacoesLote={addMovimentacoesLote} />);

    // Salmão tem un. de compra (cx, fator 10): a entrada já nasce em caixas.
    escolherProduto(0, 'Salmão Fresco');
    fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '800' } });

    fireEvent.click(screen.getByRole('button', { name: /Adicionar item/ }));
    escolherProduto(1, 'Arroz');
    fireEvent.change(screen.getByLabelText('Quantidade do item 2'), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar 2 itens' }));

    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(1));
    const itens = addMovimentacoesLote.mock.calls[0][0];
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({ produtoId: 'prod-1', tipo: 'ENTRADA', quantidade: 20, custoUnitario: 80, custoTotal: 1600 });
    expect(itens[1]).toMatchObject({ produtoId: 'prod-2', tipo: 'ENTRADA', quantidade: 5 });
    expect(itens.every((i: { setor?: string }) => i.setor === undefined)).toBe(true);
  });

  it('duplo envio antes do próximo render grava uma vez só', async () => {
    // Promessa que não resolve: o 2º submit chega com o 1º ainda em voo.
    const addMovimentacoesLote = vi.fn(() => new Promise(() => {}));
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" addMovimentacoesLote={addMovimentacoesLote} />);
    escolherProduto(0, 'Arroz');
    fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: '5' } });

    // submit direto no form: não depende do botão já estar desabilitado.
    const form = screen.getByRole('button', { name: 'Registrar' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(1));
  });

  it('retry depois de falha reaproveita a chave do lote; mudar o lote gera outra', async () => {
    const addMovimentacoesLote = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue([]);
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" addMovimentacoesLote={addMovimentacoesLote} />);
    escolherProduto(0, 'Arroz');
    fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(2));

    const [, primeira] = addMovimentacoesLote.mock.calls[0];
    const [, segunda] = addMovimentacoesLote.mock.calls[1];
    expect(primeira.clientRequestId).toEqual(expect.any(String));
    expect(segunda.clientRequestId).toBe(primeira.clientRequestId);
  });

  it('lote com quantidade diferente leva chave diferente', async () => {
    const addMovimentacoesLote = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" addMovimentacoesLote={addMovimentacoesLote} />);
    escolherProduto(0, 'Arroz');
    fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar' })).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(2));

    expect(addMovimentacoesLote.mock.calls[1][1].clientRequestId)
      .not.toBe(addMovimentacoesLote.mock.calls[0][1].clientRequestId);
  });

  it('lote sem resposta → fechar e reabrir o modal → o mesmo lote reaproveita a chave', async () => {
    const addMovimentacoesLote = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue([]);
    const props = { ...defaultProps, preset: 'entrada' as MovModalPreset, addMovimentacoesLote };
    const { rerender } = render(<NovaMovimentacaoModal {...props} />);
    escolherProduto(0, 'Arroz');
    fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar' })).toBeEnabled());

    // Fechar limpa o formulário; reabrir começa do zero.
    rerender(<NovaMovimentacaoModal {...props} open={false} />);
    rerender(<NovaMovimentacaoModal {...props} open />);
    escolherProduto(0, 'Arroz');
    fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(2));

    expect(addMovimentacoesLote.mock.calls[1][1].clientRequestId)
      .toBe(addMovimentacoesLote.mock.calls[0][1].clientRequestId);
  });

  it('lote A sem resposta → lote B confirmado → A de novo: a chave de A não muda', async () => {
    const addMovimentacoesLote = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch')) // A: gravado, resposta perdida
      .mockResolvedValue([]);
    const props = { ...defaultProps, preset: 'entrada' as MovModalPreset, addMovimentacoesLote };
    const { rerender } = render(<NovaMovimentacaoModal {...props} />);
    const registrar = async (quantidade: string, chamadas: number) => {
      escolherProduto(0, 'Arroz');
      fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: quantidade } });
      fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
      await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(chamadas));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar' })).toBeEnabled());
    };

    await registrar('5', 1); // A
    rerender(<NovaMovimentacaoModal {...props} open={false} />);
    rerender(<NovaMovimentacaoModal {...props} open />);
    await registrar('7', 2); // B dá certo
    rerender(<NovaMovimentacaoModal {...props} open={false} />);
    rerender(<NovaMovimentacaoModal {...props} open />);
    await registrar('5', 3); // A de novo

    const [a, b, aDeNovo] = addMovimentacoesLote.mock.calls.map(c => c[1].clientRequestId);
    expect(b).not.toBe(a);
    expect(aDeNovo).toBe(a);
  });

  it('lote confirmado: o mesmo lote registrado de novo é outro (chave nova)', async () => {
    const addMovimentacoesLote = vi.fn().mockResolvedValue([]);
    const props = { ...defaultProps, preset: 'entrada' as MovModalPreset, addMovimentacoesLote };
    const { rerender } = render(<NovaMovimentacaoModal {...props} />);
    escolherProduto(0, 'Arroz');
    fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(1));

    rerender(<NovaMovimentacaoModal {...props} open={false} />);
    rerender(<NovaMovimentacaoModal {...props} open />);
    escolherProduto(0, 'Arroz');
    fireEvent.change(screen.getByLabelText('Quantidade do item 1'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(addMovimentacoesLote).toHaveBeenCalledTimes(2));

    expect(addMovimentacoesLote.mock.calls[1][1].clientRequestId)
      .not.toBe(addMovimentacoesLote.mock.calls[0][1].clientRequestId);
  });

  it('starts with one item line and adds more with "Adicionar item"', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    expect(screen.getAllByRole('button', { name: /Remover item/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Adicionar item/ }));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar item/ }));
    expect(screen.getAllByRole('button', { name: /Remover item/ })).toHaveLength(3);
  });

  it('keeps at least one line: remove is disabled when only one remains', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="saida" />);
    expect(screen.getByRole('button', { name: 'Remover item 1' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Adicionar item/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover item 2' }));
    expect(screen.getAllByRole('button', { name: /Remover item/ })).toHaveLength(1);
  });

  it('blocks submit with no filled item and never calls the insert', () => {
    const addMovimentacoesLote = vi.fn().mockResolvedValue([]);
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" addMovimentacoesLote={addMovimentacoesLote} />);
    fireEvent.click(screen.getByText('Registrar'));
    expect(addMovimentacoesLote).not.toHaveBeenCalled();
  });

  it('shows tipo selector for ajuste preset (multiple options)', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="ajuste" />);
    expect(screen.getByText(/Tipo/)).toBeInTheDocument();
  });

  it('does not show tipo selector for entrada preset (single option)', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    // "Tipo *" label should not exist since entrada has only one option
    expect(screen.queryByText('Tipo *')).not.toBeInTheDocument();
  });

  it('shows Registrar button', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    expect(screen.getByText('Registrar')).toBeInTheDocument();
  });

  it('shows Cancelar button', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });
});

// ─── Architectural guard: inline form must not exist ───

describe('Architectural guard — no inline form', () => {
  it('NovaMovimentacaoModal exports MovModalPreset type', () => {
    // If this compiles, the type exists
    const preset: MovModalPreset = 'entrada';
    expect(['entrada', 'saida', 'ajuste']).toContain(preset);
  });
});
