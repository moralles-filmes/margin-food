import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { hasDirtyForms, subscribeDirtyForms } from '@/lib/dirtyStateRegistry';
import { useRegisterSW } from '@/lib/pwaRegistration';

const CHECK_INTERVAL = 30 * 1000;
const UPDATE_APPLIED_KEY = 'pwa-update-applied';

/**
 * Shows a post-reload toast if the page was reloaded by an automatic update.
 * Called once on mount.
 */
function showPostReloadToast() {
  try {
    if (sessionStorage.getItem(UPDATE_APPLIED_KEY)) {
      sessionStorage.removeItem(UPDATE_APPLIED_KEY);
      // Small delay so the toast system is ready after hydration
      setTimeout(() => {
        toast.success('Sistema atualizado', {
          description: 'A nova versão foi aplicada com sucesso.',
          duration: 5000,
          position: 'bottom-center',
        });
      }, 1500);
    }
  } catch { /* ignore */ }
}

export function PwaUpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const applyingUpdateRef = useRef(false);
  const deferredNoticeShownRef = useRef(false);
  const [hasPendingDirtyForms, setHasPendingDirtyForms] = useState(hasDirtyForms());
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  const applyUpdateWhenSafe = useCallback(async () => {
    if (!needRefresh || hasPendingDirtyForms || !isPageVisible || applyingUpdateRef.current) return;

    applyingUpdateRef.current = true;

    // Store flag so post-reload toast is shown
    try { sessionStorage.setItem(UPDATE_APPLIED_KEY, '1'); } catch { /* ignore */ }

    toast.info('Aplicando nova versão…', {
      description: 'A página será recarregada automaticamente.',
      duration: 3000,
      position: 'bottom-center',
    });

    // Small delay so the user sees the toast before reload
    await new Promise(resolve => setTimeout(resolve, 1200));
    await updateServiceWorker(true);
  }, [hasPendingDirtyForms, isPageVisible, needRefresh, updateServiceWorker]);

  // Post-reload confirmation
  useEffect(() => {
    showPostReloadToast();
  }, []);

  // Subscribe to dirty forms registry
  useEffect(() => {
    return subscribeDirtyForms(setHasPendingDirtyForms);
  }, []);

  // Periodic + event-driven SW update checks
  useEffect(() => {
    const checkForUpdate = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      registrationRef.current?.update().catch(error => {
        console.error('SW update check failed:', error);
      });
    };

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsPageVisible(visible);
      if (visible) checkForUpdate();
    };

    window.addEventListener('focus', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = window.setInterval(checkForUpdate, CHECK_INTERVAL);

    return () => {
      window.removeEventListener('focus', checkForUpdate);
      window.removeEventListener('online', checkForUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, []);

  // React to needRefresh changes
  useEffect(() => {
    if (!needRefresh) {
      applyingUpdateRef.current = false;
      deferredNoticeShownRef.current = false;
      return;
    }

    if (hasPendingDirtyForms) {
      if (!deferredNoticeShownRef.current) {
        toast.warning('Nova versão pronta', {
          description: 'A atualização será aplicada automaticamente quando não houver alterações não salvas.',
          duration: 5000,
          position: 'bottom-center',
        });
        deferredNoticeShownRef.current = true;
      }
      return;
    }

    void applyUpdateWhenSafe();
  }, [applyUpdateWhenSafe, hasPendingDirtyForms, needRefresh, isPageVisible]);

  return null;
}
