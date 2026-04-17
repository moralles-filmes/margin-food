/**
 * Unregisters all service workers and clears all Cache API entries before
 * reloading. window.location.reload() alone does not bypass a stale SW cache,
 * so this function must be used when recovering from persistent chunk errors
 * or when the ErrorBoundary detects a non-transient crash.
 */
export async function clearSwAndReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* ignore — reload regardless */ }
  window.location.reload();
}
