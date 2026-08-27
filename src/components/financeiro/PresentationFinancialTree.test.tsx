import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PresentationFinancialTree from './PresentationFinancialTree';

describe('árvore financeira de drill-down', () => {
  it('exibe acumulado e direto sem somá-los novamente e abre o nó por botão semântico', () => {
    const onSelect = vi.fn();
    render(
      <PresentationFinancialTree
        title="Despesas"
        tone="expense"
        onSelectNode={onSelect}
        nodes={[{
          categoryId: 'parent',
          parentCategoryId: null,
          name: 'Operação',
          nature: 'DESPESA',
          directAmount: 50,
          amount: 700,
          sharePercent: 100,
          children: [{
            categoryId: 'child',
            parentCategoryId: 'parent',
            name: 'Insumos',
            nature: 'DESPESA',
            directAmount: 650,
            amount: 650,
            sharePercent: 92.86,
            children: [],
          }],
        }]}
      />,
    );

    expect(screen.getByText('R$700,00')).toBeInTheDocument();
    expect(screen.getByText('direto R$50,00')).toBeInTheDocument();
    expect(screen.queryByText('R$1.350,00')).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Abrir detalhe da categoria Insumos' });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'child' }));
  });
});
