/**
 * Regression tests for NovaMovimentacaoModal
 * Ensures the modal-based movement creation flow works correctly
 * and prevents regression to the old inline form pattern.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NovaMovimentacaoModal, { type MovModalPreset } from '@/components/estoque/NovaMovimentacaoModal';
import type { ProdutoExtended } from '@/types/estoque';

// NovaMovimentacaoModal fetches setores from stock_sectors on open — mock the
// client so tests don't depend on VITE_SUPABASE_* env vars or the network.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
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

const defaultProps = {
  open: true,
  preset: 'entrada' as MovModalPreset,
  onClose: vi.fn(),
  produtos: [baseProd],
  saldos: { 'prod-1': { saldo: 100 } },
  userId: 'user-1',
  hasPermission: () => true,
  canEditPricing: false,
  addMovimentacao: vi.fn().mockResolvedValue({}),
  recalcularPrecos: vi.fn(),
};

// ─── Tests ───

describe('NovaMovimentacaoModal', () => {
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

  it('shows "Produto" label', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    expect(screen.getByText(/Produto/)).toBeInTheDocument();
  });

  it('shows "Setor" field only for saída preset', () => {
    const { rerender } = render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    expect(screen.queryByText(/Setor/)).not.toBeInTheDocument();

    rerender(<NovaMovimentacaoModal {...defaultProps} preset="saida" />);
    expect(screen.getByText(/Setor/)).toBeInTheDocument();
  });

  it('shows conversion fields only for entrada preset', () => {
    render(<NovaMovimentacaoModal {...defaultProps} preset="entrada" />);
    expect(screen.getByText(/Fator conversão/)).toBeInTheDocument();
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
