import { useState, useCallback } from 'react';

/**
 * Like useState but persists the value to localStorage under a namespaced key.
 * On mount, restores the saved value if it's in the allowedValues set (prevents stale/invalid routes).
 *
 * @param storageKey - localStorage key, e.g. 'app:tab:main' or 'app:tab:financeiro'
 * @param defaultValue - fallback when nothing is saved or saved value is invalid
 * @param allowedValues - optional array of valid values; if provided, saved value is validated against it
 */
export function usePersistedTab<T extends string>(
  storageKey: string,
  defaultValue: T,
  allowedValues?: T[],
): [T, (value: T) => void] {
  const [value, setValueInternal] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        // Validate against allowed values if provided
        if (allowedValues && allowedValues.length > 0) {
          if (allowedValues.includes(saved as T)) {
            return saved as T;
          }
          // Saved value is invalid — clear and use default
          localStorage.removeItem(storageKey);
          return defaultValue;
        }
        return saved as T;
      }
    } catch {
      // localStorage unavailable
    }
    return defaultValue;
  });

  const setValue = useCallback(
    (newValue: T) => {
      setValueInternal(newValue);
      try {
        localStorage.setItem(storageKey, newValue);
      } catch {
        // quota exceeded or unavailable
      }
    },
    [storageKey],
  );

  return [value, setValue];
}
