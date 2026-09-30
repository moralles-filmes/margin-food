import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTravaEnvio } from './useTravaEnvio';

describe('useTravaEnvio', () => {
  it('duplo clique no mesmo tick executa a ação uma vez só', async () => {
    const { result } = renderHook(() => useTravaEnvio());
    let liberar!: () => void;
    const acao = vi.fn(() => new Promise<string>(resolve => { liberar = () => resolve('ok'); }));

    let primeira!: Promise<string | undefined>;
    let segunda!: Promise<string | undefined>;
    act(() => {
      // Mesmo `executar` (mesmo render): o estado ainda não chegou ao botão.
      primeira = result.current.executar(acao);
      segunda = result.current.executar(acao);
    });

    expect(acao).toHaveBeenCalledTimes(1);
    expect(result.current.enviando).toBe(true);
    await expect(segunda).resolves.toBeUndefined();

    await act(async () => { liberar(); await primeira; });
    await expect(primeira).resolves.toBe('ok');
    expect(result.current.enviando).toBe(false);
  });

  it('libera depois de erro, para o usuário poder tentar de novo', async () => {
    const { result } = renderHook(() => useTravaEnvio());

    await act(async () => {
      await expect(result.current.executar(() => Promise.reject(new Error('falhou')))).rejects.toThrow('falhou');
    });
    expect(result.current.enviando).toBe(false);

    const acao = vi.fn(async () => 'segunda');
    await act(async () => { await result.current.executar(acao); });
    expect(acao).toHaveBeenCalledTimes(1);
  });
});
