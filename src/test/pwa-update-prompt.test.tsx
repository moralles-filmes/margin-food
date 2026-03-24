import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';
import { __resetDirtyFormsRegistryForTests, setFormDirtyState } from '@/lib/dirtyStateRegistry';
import { useRegisterSW } from '@/lib/pwaRegistration';
import { toast } from 'sonner';

vi.mock('@/lib/pwaRegistration', () => ({
  useRegisterSW: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

describe('PwaUpdatePrompt', () => {
  const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
  let needRefresh = false;

  beforeEach(() => {
    __resetDirtyFormsRegistryForTests();
    vi.clearAllMocks();
    vi.useFakeTimers();
    needRefresh = false;
    sessionStorage.clear();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    vi.mocked(useRegisterSW).mockImplementation((options?: Parameters<typeof useRegisterSW>[0]) => {
      options?.onRegisteredSW?.('mock-sw.js', {
        update: vi.fn().mockResolvedValue(undefined),
      } as unknown as ServiceWorkerRegistration);

      return {
        needRefresh: [needRefresh, vi.fn()],
        offlineReady: [false, vi.fn()],
        updateServiceWorker,
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aplica automaticamente a nova versão quando não há formulário sujo', async () => {
    const { rerender } = render(<PwaUpdatePrompt />);

    needRefresh = true;
    rerender(<PwaUpdatePrompt />);

    // Sets session flag and shows toast
    expect(toast.info).toHaveBeenCalled();
    expect(sessionStorage.getItem('pwa-update-applied')).toBe('1');

    // Advance past the 1200ms delay before updateServiceWorker is called
    await vi.advanceTimersByTimeAsync(1500);

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('adianta a atualização até o formulário ficar limpo', async () => {
    setFormDirtyState('form-teste', true);

    const { rerender } = render(<PwaUpdatePrompt />);

    needRefresh = true;
    rerender(<PwaUpdatePrompt />);

    await vi.advanceTimersByTimeAsync(0);

    expect(toast.warning).toHaveBeenCalled();
    expect(updateServiceWorker).not.toHaveBeenCalled();

    setFormDirtyState('form-teste', false);
    rerender(<PwaUpdatePrompt />);

    await vi.advanceTimersByTimeAsync(1500);

    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('mostra toast de confirmação pós-reload', () => {
    sessionStorage.setItem('pwa-update-applied', '1');
    render(<PwaUpdatePrompt />);

    vi.advanceTimersByTime(2000);

    expect(toast.success).toHaveBeenCalledWith(
      'Sistema atualizado',
      expect.objectContaining({ description: expect.any(String) }),
    );
    expect(sessionStorage.getItem('pwa-update-applied')).toBeNull();
  });
});
