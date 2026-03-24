export function useRegisterSW(
  options?: {
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  },
) {
  options?.onRegisteredSW?.('mock-sw.js', undefined);

  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async (_reloadPage?: boolean) => {},
  };
}
