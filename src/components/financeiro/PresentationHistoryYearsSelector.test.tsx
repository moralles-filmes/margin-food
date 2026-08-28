import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PresentationHistoryYearsSelector from '@/components/financeiro/PresentationHistoryYearsSelector';

describe('seletor de anos do histórico de Faturamento', () => {
  it('impede o quarto ano de forma acessível', () => {
    render(<PresentationHistoryYearsSelector years={[2024, 2025, 2026]} onChange={() => {}} />);
    expect(screen.getByRole('textbox', { name: /ano para adicionar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /adicionar ano/i })).toBeDisabled();
    expect(screen.getByText(/limite de 3 anos atingido/i)).toBeInTheDocument();
  });

  it('mantém ao menos um ano, evita duplicata e ordena a seleção', () => {
    const onChange = vi.fn();
    const view = render(<PresentationHistoryYearsSelector years={[2026]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /remover 2026/i })).toBeDisabled();

    const input = screen.getByRole('textbox', { name: /ano para adicionar/i });
    fireEvent.change(input, { target: { value: '2024' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar ano/i }));
    expect(onChange).toHaveBeenCalledWith([2024, 2026]);

    view.rerender(<PresentationHistoryYearsSelector years={[2024, 2026]} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: /ano para adicionar/i }), { target: { value: '2026' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar ano/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/distintos/i);
  });
});
