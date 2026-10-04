import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CodigoPagamento from './CodigoPagamento';
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => toast }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('copiar código completo', () => {
  it.each([
    '34191.79001 01043.510047 91020.150008 5 99990000012500',
    '00190.00009 01234.567890 12345.678901 1 00000000123456',
    '00012345000191',
    'financeiro+loja@example.com',
    '000201' + 'BR.GOV.BCB.PIX'.repeat(600),
    '  código com formatação\n12345  ',
  ])('copia sem rótulos, cortes ou normalização (%#)', async codigo => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<CodigoPagamento codigo={codigo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar código' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Código copiado!'));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(codigo);
  });

  it('dá contexto ao nome acessível e mostra "Copiado" por um instante', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CodigoPagamento codigo="00190" rotulo="Fornecedor Teste" />);
    const botao = screen.getByRole('button', { name: 'Copiar código de Fornecedor Teste' });
    expect(botao).toHaveTextContent('Copiar');
    await act(async () => { fireEvent.click(botao); });
    expect(botao).toHaveTextContent('Copiado');
    expect(botao).toHaveAccessibleName('Copiado: código de Fornecedor Teste');
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(botao).toHaveTextContent('Copiar');
    expect(botao).toHaveAccessibleName('Copiar código de Fornecedor Teste');
    expect(botao).not.toHaveTextContent('Copiado');
  });

  it('informa falha sem confirmar cópia nem expor o código no log', async () => {
    const codigo = 'chave-financeira';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error(codigo)) } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CodigoPagamento codigo={codigo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar código' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copiar código' })).not.toHaveTextContent('Copiado');
    expect(JSON.stringify(log.mock.calls)).not.toContain(codigo);
  });
});
