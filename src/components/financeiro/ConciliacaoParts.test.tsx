import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fmtBRL } from '@/lib/formatters';
import { ConferenciaSaldoErro, ConferenciaSaldoPainel, ExtratoLinhaResumo } from './ConciliacaoParts';

const saldoExtrato = { valor: 5000, data: '2026-09-03' };

describe('ConferenciaSaldoPainel', () => {
  it('confere: selo, extrato e sistema na mesma data, sem "-R$0,00" por resíduo de ponto flutuante', () => {
    render(
      <ConferenciaSaldoPainel
        saldoExtrato={saldoExtrato}
        conferencia={{ sistema: 5000, projetado: 5000, pendentesDelta: 0, diferenca: -0.0000001 }}
        confere
        diaDivergencia={null}
        atualizando={false}
      />,
    );
    const painel = screen.getByRole('status');
    expect(painel).toHaveTextContent('Saldo confere com o extrato do banco');
    expect(painel).toHaveTextContent('Confere');
    expect(painel).toHaveTextContent('Banco em 03/09/2026');
    expect(painel).toHaveTextContent('Sistema na mesma data');
    expect(painel).toHaveTextContent(fmtBRL(0));
    expect(painel).not.toHaveTextContent('-R$');
    expect(painel).not.toHaveTextContent('linhas ainda pendentes');
  });

  it('confere com linhas pendentes avisa no próprio título que é projeção (como o texto de antes)', () => {
    render(
      <ConferenciaSaldoPainel
        saldoExtrato={saldoExtrato}
        conferencia={{ sistema: 4900, projetado: 5000, pendentesDelta: 100, diferenca: 0 }}
        confere
        diaDivergencia={null}
        atualizando
      />,
    );
    expect(screen.getByRole('status', { name: 'Saldo confere com o extrato do banco (projetado com as linhas ainda pendentes)' })).toBeInTheDocument();
    expect(screen.getByText('Sistema na mesma data (com linhas pendentes)')).toBeInTheDocument();
    expect(screen.getByText('Atualizando…')).toBeInTheDocument();
  });

  it('não confere: alerta com a diferença, o dia em que começou e o aviso de revisão (textos de antes)', () => {
    render(
      <ConferenciaSaldoPainel
        saldoExtrato={saldoExtrato}
        conferencia={{ sistema: 4900, projetado: 4900, pendentesDelta: 0, diferenca: 100 }}
        confere={false}
        diaDivergencia={{ status: 'found', data: '2026-09-02' }}
        atualizando={false}
      />,
    );
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent(`Saldo NÃO confere com o extrato do banco — diferença de ${fmtBRL(100)}`);
    expect(alerta).toHaveTextContent('Não confere');
    expect(alerta).toHaveTextContent('A diferença começou em 02/09/2026 — revise as linhas dessa data.');
    expect(alerta).toHaveTextContent('Pode haver linha marcada como duplicata/ignorada que na verdade é uma transação real');
  });

  it('diferença anterior ao período do extrato', () => {
    render(
      <ConferenciaSaldoPainel
        saldoExtrato={saldoExtrato}
        conferencia={{ sistema: 4900, projetado: 4900, pendentesDelta: 0, diferenca: 100 }}
        confere={false}
        diaDivergencia={{ status: 'before_period', data: '2026-09-01' }}
        atualizando={false}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('A diferença já existia antes de 01/09/2026 (fora do período deste extrato).');
  });
});

describe('ConferenciaSaldoErro', () => {
  it('falha na leitura do saldo vira aviso com nova tentativa, nunca veredito', () => {
    const onRetry = vi.fn();
    render(<ConferenciaSaldoErro data="2026-09-03" onRetry={onRetry} retrying={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível conferir o saldo com o extrato');
    expect(screen.queryByText(/confere com o extrato/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('ExtratoLinhaResumo', () => {
  it('mostra a descrição inteira, a data, o valor e o tipo', () => {
    render(<ExtratoLinhaResumo descricao="DESCRIÇÃO SINTÉTICA LONGA DE TESTE" data="2026-09-04" valor={1234.56} tipo="DESPESA" />);
    expect(screen.getByText('DESCRIÇÃO SINTÉTICA LONGA DE TESTE')).toBeInTheDocument();
    expect(screen.getByText('04/09/2026')).toBeInTheDocument();
    expect(screen.getByText(fmtBRL(1234.56))).toBeInTheDocument();
    expect(screen.getByText('Despesa')).toBeInTheDocument();
  });

  it('aceita selo próprio (Saída/Entrada na transferência)', () => {
    render(<ExtratoLinhaResumo descricao="TED" data="2026-09-04" valor={10} tipo="RECEITA" badge={{ label: 'Entrada', status: 'success' }} />);
    expect(screen.getByText('Entrada')).toBeInTheDocument();
    expect(screen.queryByText('Receita')).not.toBeInTheDocument();
  });
});
