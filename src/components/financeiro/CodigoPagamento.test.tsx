import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CodigoPagamento from './CodigoPagamento';
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => toast }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('copiar código completo', () => {
  it.each([
    '34191.79001 01043.510047 91020.150008 5 99990000012500',
    'financeiro+loja@example.com',
    '000201' + 'BR.GOV.BCB.PIX'.repeat(600),
    '  código com formatação\n12345  ',
  ])('copia sem rótulos, cortes ou normalização (%#)', async codigo => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<CodigoPagamento codigo={codigo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Código copiado!'));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(codigo);
  });
  it('informa falha sem confirmar cópia nem expor o código no log', async () => {
    const codigo = 'chave-financeira';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error(codigo)) } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CodigoPagamento codigo={codigo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(codigo);
  });
});
