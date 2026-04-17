import { useEffect, lazy, Suspense, Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { emitDataEvent } from "@/lib/dataEvents";
import { clearSwAndReload } from "@/lib/swRecovery";

const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FloatingCalculator = lazy(() => import("./components/FloatingCalculator"));

const AUTO_REFRESH_THROTTLE_MS = 2 * 60 * 1000; // 2 minutos

const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';

function isChunkErr(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Failed to load module script')
  );
}


class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; isChunk: boolean; errorMessage: string }
> {
  state = { hasError: false, isChunk: false, errorMessage: '' };

  static getDerivedStateFromError(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error ?? '');
    return { hasError: true, isChunk: isChunkErr(error), errorMessage: msg };
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary]', error);
    if (isChunkErr(error)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          window.location.reload();
          return;
        }
        // Second consecutive chunk error: SW is likely stale — clear and reload
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        void clearSwAndReload();
      } catch { void clearSwAndReload(); }
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-foreground font-medium">
          {this.state.isChunk
            ? 'Falha ao carregar recursos do sistema.'
            : 'Ocorreu um erro inesperado.'}
        </p>
        {this.state.errorMessage && (
          <p className="text-xs text-muted-foreground max-w-md break-all font-mono">
            {this.state.errorMessage}
          </p>
        )}
        <button
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
          onClick={() => {
            try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch {}
            void clearSwAndReload();
          }}
        >
          Recarregar
        </button>
      </div>
    );
  }
}

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
      const msg = event.reason instanceof Error
        ? event.reason.message
        : String(event.reason ?? '');
      // Chunk errors are handled by the global listener in main.tsx
      if (isChunkErr(event.reason) || msg.includes('Failed to fetch dynamically imported module')) return;
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
          <ErrorBoundary>
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
          </ErrorBoundary>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
