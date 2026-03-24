import React, { createContext, useContext } from 'react';
import { useSalmonStore as useSalmonStoreHook } from '@/hooks/useSalmonStore';

type SalmonStoreValue = ReturnType<typeof useSalmonStoreHook>;

const SalmonStoreContext = createContext<SalmonStoreValue | null>(null);

export function SalmonStoreProvider({ children }: { children: React.ReactNode }) {
  const store = useSalmonStoreHook();
  return (
    <SalmonStoreContext.Provider value={store}>
      {children}
    </SalmonStoreContext.Provider>
  );
}

export function useSalmonStoreContext(): SalmonStoreValue {
  const ctx = useContext(SalmonStoreContext);
  if (!ctx) throw new Error('useSalmonStoreContext must be used within SalmonStoreProvider');
  return ctx;
}
