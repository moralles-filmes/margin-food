import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConciliacaoLinhaCmv from './ConciliacaoLinhaCmv';

const props = (over: Partial<Parameters<typeof ConciliacaoLinhaCmv>[0]> = {}) => ({
  mostrarCmv: true, decisao: null, onDecisao: vi.fn(), rateio: null, onAbrirRateio: vi.fn(),
  permiteCompetencia: true, dataBanco: '2026-09-10', competencia: undefined, onCompetencia: vi.fn(), rotulo: 'PIX ARROZ',
  ...over,
});

describe('linha do extrato — CMV e competência', () => {
  it('responde Sim na linha', () => {
    const p = props();
    render(<ConciliacaoLinhaCmv {...p} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sim' }));
    expect(p.onDecisao).toHaveBeenCalledWith(true);
  });

  it('competência começa na data do banco; outra data é enviada, a mesma volta a "sem ajuste"', () => {
    const p = props();
    const { rerender } = render(<ConciliacaoLinhaCmv {...p} />);
    // Sem competência própria o botão não mostra data: ela só aparece quando difere do banco.
    const botao = screen.getByRole('button', { name: 'Alterar a competência de PIX ARROZ' });
    expect(botao).toHaveTextContent(/^Competência$/);
    fireEvent.click(botao);
    expect(screen.getByLabelText('Competência')).toHaveValue('2026-09-10');
    fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-09-03' } });
    expect(p.onCompetencia).toHaveBeenLastCalledWith('2026-09-03');
    // O campo é controlado pelo pai: o 2º change só dispara se a tela refletiu o 1º.
    rerender(<ConciliacaoLinhaCmv {...p} competencia="2026-09-03" />);
    expect(screen.getByLabelText('Competência')).toHaveValue('2026-09-03');
    fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-09-10' } });
    expect(p.onCompetencia).toHaveBeenLastCalledWith(undefined);
    expect(p.onCompetencia).toHaveBeenCalledTimes(2);
  });

  it('competência igual à data do banco não aparece como ajustada', () => {
    render(<ConciliacaoLinhaCmv {...props({ competencia: '2026-09-10' })} />);
    expect(screen.getByRole('button', { name: 'Alterar a competência de PIX ARROZ' })).toHaveTextContent(/^Competência$/);
  });

  it('competência ajustada aparece marcada', () => {
    render(<ConciliacaoLinhaCmv {...props({ competencia: '2026-09-03' })} />);
    expect(screen.getByRole('button', { name: 'Alterar a competência de PIX ARROZ' })).toHaveTextContent('Competência: 03/09/2026 (ajustada)');
  });

  it('rateio com várias linhas: resumo que abre o rateio, sem Sim/Não na linha', () => {
    const p = props({ rateio: { total: 3, respondidas: 1 } });
    render(<ConciliacaoLinhaCmv {...p} />);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /CMV: 1 de 3 linhas do rateio respondidas/ }));
    expect(p.onAbrirRateio).toHaveBeenCalled();
  });

  it('sem pergunta e sem competência, não renderiza nada', () => {
    const { container } = render(<ConciliacaoLinhaCmv {...props({ mostrarCmv: false, permiteCompetencia: false })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
