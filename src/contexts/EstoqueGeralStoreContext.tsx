import React, { createContext, useContext } from 'react';
import { useEstoqueGeralStore as useEstoqueGeralStoreHook } from '@/hooks/useEstoqueGeralStore';

type EstoqueGeralStoreValue = ReturnType<typeof useEstoqueGeralStoreHook>;

const EstoqueGeralStoreContext = createContext<EstoqueGeralStoreValue | null>(null);

export function EstoqueGeralStoreProvider({ children }: { children: React.ReactNode }) {
  const store = useEstoqueGeralStoreHook();
  return (
    <EstoqueGeralStoreContext.Provider value={store}>
      {children}
    </EstoqueGeralStoreContext.Provider>
  );
}

export function useEstoqueGeralStoreContext(): EstoqueGeralStoreValue {
  const ctx = useContext(EstoqueGeralStoreContext);
  if (!ctx) throw new Error('useEstoqueGeralStoreContext must be used within EstoqueGeralStoreProvider');
  return ctx;
}
