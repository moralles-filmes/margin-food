import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ConfirmarSaldoExtratoDialog from './ConfirmarSaldoExtratoDialog';

vi.mock('@/permissions/hooks', () => ({
  useCan: () => true,
}));

describe('ConfirmarSaldoExtratoDialog', () => {
  const baseProps = {
    open: true,
    nomeArquivo: 'santander.ofx',
    periodoInicio: '2026-08-01',
    periodoFim: '2026-09-01',
    linhasExtrato: [
      { data: '2026-08-31', descricao: 'APLICACAO CONTAMAX', tipo: 'DESPESA', valor: 327.41 },
      { data: '2026-09-01', descricao: 'PIX RECEBIDO', tipo: 'RECEITA', valor: 130.91 },
    ],
    saldoSugerido: { valor: 130.91, data: '2026-09-01' },
    saldoContaCorrenteArquivo: { valor: 130.91, data: '2026-09-01' },
    contaId: '11111111-1111-4111-8111-111111111111',
    onCancel: vi.fn(),
    onConfirmed: vi.fn(),
  };

  it('orienta a confirmar o saldo Santander consolidado quando há ContaMax', () => {
    render(<ConfirmarSaldoExtratoDialog {...baseProps} internalMovementCount={2} />);

    expect(screen.getByRole('alert')).toHaveTextContent('2 movimentação(ões) interna(s) ContaMax detectada(s)');
    expect(screen.getByRole('alert')).toHaveTextContent('saldo total exibido pelo Santander');
    expect(screen.getByRole('alert')).toHaveTextContent('conta corrente + ContaMax');
    expect(screen.getByRole('alert')).toHaveTextContent('R$130,91 da conta corrente em 01/09/2026');
    expect(screen.getByRole('alert')).toHaveTextContent('esse valor não preenche o total consolidado');
    expect(screen.getByLabelText('Saldo consolidado nessa data')).toHaveValue('');
    expect(screen.getByLabelText('Data do saldo informado')).toHaveValue('2026-08-31');
  });

  it('não exibe o alerta quando o arquivo não contém ContaMax', () => {
    render(<ConfirmarSaldoExtratoDialog {...baseProps} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('confirma o saldo total na data escolhida sem incluir a linha posterior', () => {
    const onConfirmed = vi.fn();
    render(
      <ConfirmarSaldoExtratoDialog
        {...baseProps}
        internalMovementCount={2}
        onConfirmed={onConfirmed}
      />,
    );

    fireEvent.change(screen.getByLabelText('Saldo consolidado nessa data'), {
      target: { value: '23289,29' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar valor' }));

    expect(onConfirmed).toHaveBeenCalledWith({ valor: 23289.29, data: '2026-08-31' });
    expect(screen.queryByText('Saldo não confere')).not.toBeInTheDocument();
  });
});
