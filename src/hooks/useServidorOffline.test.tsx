import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServidorOffline } from './useServidorOffline';

const fetchMock = vi.fn<typeof fetch>();

async function aguardarVerificacao() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe('useServidorOffline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('não mostra offline quando o navegador diz offline mas o servidor responde', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fetchMock.mockResolvedValue(new Response(null));

    const { result } = renderHook(() => useServidorOffline());
    await aguardarVerificacao();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it('mostra offline quando o servidor não responde e volta sozinho sem depender do evento online', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useServidorOffline());
    await aguardarVerificacao();
    expect(result.current).toBe(true);

    fetchMock.mockResolvedValue(new Response(null));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current).toBe(false);

    // Online de novo: para de reconferir.
    const chamadas = fetchMock.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(chamadas);
  });

  it('timeout conta como offline', async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));

    const { result } = renderHook(() => useServidorOffline());
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

    expect(result.current).toBe(true);
  });

  it('evento de rede durante uma verificação em curso reconfere ao terminar', async () => {
    let responder!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { responder = () => resolve(new Response(null)); }));
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useServidorOffline());
    act(() => { window.dispatchEvent(new Event('offline')); });
    await act(async () => { responder(); await vi.advanceTimersByTimeAsync(0); });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(true);
  });
});
