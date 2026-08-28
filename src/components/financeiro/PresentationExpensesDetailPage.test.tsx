import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PresentationExpensesDetailPage from '@/components/financeiro/PresentationExpensesDetailPage';
import { createPresentationExpensesData } from '@/test/fixtures/presentationExpenses';

vi.mock('@/hooks/usePresentationExpenseDetails', () => ({
  usePresentationExpenseDetails: () => ({
    isPending: false,
    error: null,
    rows: [{
      allocationId: '22222222-2222-4222-8222-222222222222',
      allocationSource: 'allocation',
      ledgerId: '11111111-1111-4111-8111-111111111111',
      effectiveDate: '2026-03-20',
      description: 'Compra rateada',
      status: 'REALIZADO',
      origin: 'manual',
      categoryId: '33333333-3333-4333-8333-333333333333',
      categoryName: 'Insumos',
      operationalClass: 'operational',
      amount: 450,
    }],
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}));

describe('detalhe DFC de Despesas', () => {
  it('mantém regime explícito, hierarquia e navegação por categoria sem usar o detalhe legado', () => {
    const expenses = createPresentationExpensesData();
    const onBack = vi.fn();
    const onSelectCategory = vi.fn();
    render(
      <PresentationExpensesDetailPage
        companyId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        availability={{ state: 'available', data: expenses }}
        categoryId="22222222-2222-4222-8222-222222222222"
        unitName="Moralles Centro"
        onBack={onBack}
        onSelectCategory={onSelectCategory}
      />,
    );
    expect(screen.getByText(/Moralles Centro · DFC · regime de caixa · 2026-03/i)).toBeInTheDocument();
    expect(screen.getByText('Despesas operacionais › Insumos')).toBeInTheDocument();
    expect(screen.getByText('Compra rateada')).toBeInTheDocument();
    expect(screen.getByText('R$450,00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ver todas as despesas/i }));
    expect(onSelectCategory).toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole('button', { name: /voltar à apresentação/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
