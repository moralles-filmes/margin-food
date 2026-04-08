import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { emitDataEvent } from "@/lib/dataEvents";

const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FloatingCalculator = lazy(() => import("./components/FloatingCalculator"));

const AUTO_REFRESH_THROTTLE_MS = 2 * 60 * 1000; // 2 minutos

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
      retry: 1,
      staleTime: 3 * 60 * 1000, // 3 minutos
      gcTime: 10 * 60 * 1000,
    },
  },
});

const App = () => {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      toast.error("Ocorreu um erro inesperado. Tente novamente.");
      event.preventDefault();
    };

    let lastRefreshAt = 0;

    const refreshRuntimeData = () => {
      const now = Date.now();
      if (now - lastRefreshAt < AUTO_REFRESH_THROTTLE_MS) return;

      lastRefreshAt = now;
      // Invalida apenas queries que já ficaram stale, sem forçar refetch de tudo
      queryClient.invalidateQueries({ refetchType: 'none' });
      emitDataEvent('app:refresh');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshRuntimeData();
      }
    };

    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener('focus', refreshRuntimeData);
    window.addEventListener('online', refreshRuntimeData);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener('focus', refreshRuntimeData);
      window.removeEventListener('online', refreshRuntimeData);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PwaUpdatePrompt />
          <BrowserRouter>
            <Suspense fallback={<div className="h-screen bg-background" />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/compras" element={<Index />} />
                <Route path="/fornecedores" element={<Index />} />
                <Route path="/recebimentos" element={<Index />} />
                <Route path="/mercados-sazonais" element={<Index />} />
                <Route path="/confirmacoes-recebimento" element={<Index />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <FloatingCalculator />
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
