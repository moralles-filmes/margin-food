import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

const options = [{ value: 'dia', label: 'Dia' }, { value: 'mes', label: 'Mês' }, { value: 'periodo', label: 'Período' }];

describe('SegmentedControl', () => {
  it('item ativo é a pílula clara com texto azul e fica marcado para o leitor de tela', () => {
    render(<SegmentedControl options={options} value="mes" onChange={vi.fn()} />);
    const active = screen.getByRole('radio', { name: 'Mês' });
    expect(active).toHaveAttribute('aria-checked', 'true');
    expect(active).toHaveClass('bg-segmented-active', 'text-primary-ink', 'shadow-sm');
    expect(active).not.toHaveClass('bg-primary-strong');
    expect(screen.getByRole('radio', { name: 'Dia' })).toHaveAttribute('aria-checked', 'false');
  });

  it('o ativo também muda o peso da fonte, e o nome acessível não duplica o rótulo', () => {
    render(<SegmentedControl options={options} value="mes" onChange={vi.fn()} />);
    const visible = (name: string) => [...screen.getByRole('radio', { name }).querySelectorAll('span:not([aria-hidden])')].pop()!;
    expect(visible('Mês')).toHaveClass('font-semibold');
    expect(visible('Dia')).not.toHaveClass('font-semibold');
  });

  it('setas mudam a opção e só a ativa entra no Tab', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={options} value="mes" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Dia' })).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Mês' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('periodo');
  });
});
