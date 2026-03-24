/**
 * ─── useFormDirtyGuard ───
 * Reusable hook for detecting unsaved changes in form modals.
 * Provides dirty detection by comparing current form state to initial snapshot,
 * and a guard function that shows a confirmation before closing.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { clearFormDirtyState, setFormDirtyState } from '@/lib/dirtyStateRegistry';

interface UseFormDirtyGuardOptions<T> {
  /** Current form state */
  current: T;
  /** Called when the user confirms they want to close */
  onClose: () => void;
}

function createFormId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `form-${Math.random().toString(36).slice(2, 10)}`;
}

export function useFormDirtyGuard<T>({ current, onClose }: UseFormDirtyGuardOptions<T>) {
  const initialRef = useRef<string>(JSON.stringify(current));
  const formIdRef = useRef<string>(createFormId());
  const [showConfirm, setShowConfirm] = useState(false);

  /** Snapshot the current state as "clean" (call on open or after save) */
  const markClean = useCallback(() => {
    initialRef.current = JSON.stringify(current);
    clearFormDirtyState(formIdRef.current);
  }, [current]);

  /** Whether the form has unsaved changes */
  const isDirty = JSON.stringify(current) !== initialRef.current;

  useEffect(() => {
    setFormDirtyState(formIdRef.current, isDirty);

    return () => {
      clearFormDirtyState(formIdRef.current);
    };
  }, [isDirty]);

  /** Attempt to close — shows confirmation if dirty */
  const guardedClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  /** User confirmed they want to leave */
  const confirmClose = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  /** User chose to keep editing */
  const cancelClose = useCallback(() => {
    setShowConfirm(false);
  }, []);

  return {
    isDirty,
    showConfirm,
    guardedClose,
    confirmClose,
    cancelClose,
    markClean,
  };
}
