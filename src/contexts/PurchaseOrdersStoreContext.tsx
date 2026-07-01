import React, { createContext, useContext } from 'react';
import { usePurchaseOrdersStore as usePurchaseOrdersStoreHook } from '@/hooks/usePurchaseOrdersStore';

type PurchaseOrdersStoreValue = ReturnType<typeof usePurchaseOrdersStoreHook>;

const PurchaseOrdersStoreContext = createContext<PurchaseOrdersStoreValue | null>(null);

export function PurchaseOrdersStoreProvider({ children }: { children: React.ReactNode }) {
  const store = usePurchaseOrdersStoreHook();
  return (
    <PurchaseOrdersStoreContext.Provider value={store}>
      {children}
    </PurchaseOrdersStoreContext.Provider>
  );
}

export function usePurchaseOrdersStoreContext(): PurchaseOrdersStoreValue {
  const ctx = useContext(PurchaseOrdersStoreContext);
  if (!ctx) throw new Error('usePurchaseOrdersStoreContext must be used within PurchaseOrdersStoreProvider');
  return ctx;
}
