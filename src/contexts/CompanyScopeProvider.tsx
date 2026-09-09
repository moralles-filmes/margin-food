import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createCompanyClient, COMPANY_ACCESS_REVOKED_EVENT } from '@/integrations/supabase/companyClient';
import { CompanyScopeContext, type CompanyProfile } from './CompanyScopeContext';
import { parseCompanyProfile, useAuth } from './AuthContext';
import { Button } from '@/components/ui/button';
import { useLocation } from 'react-router-dom';

function ScopedContent({ companyId, resource, queryClient, initialProfile, children }: {
  companyId: string; resource: ReturnType<typeof createCompanyClient>; queryClient: QueryClient; initialProfile?: CompanyProfile; children: ReactNode;
}) {
  const [profile, setProfile] = useState<CompanyProfile | null>(initialProfile ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data, error: failure } = await resource.client.rpc('get_my_company_context').abortSignal(AbortSignal.timeout(15_000));
        if (failure) throw failure;
        const next = parseCompanyProfile(data);
        if (next.company_id !== companyId) throw new Error('COMPANY_SCOPE_MISMATCH');
        if (alive) { setProfile(next); setError(null); }
      } catch (failure) {
        console.error('[Unidade] Falha de autorização:', failure);
        if (alive) { setProfile(null); setError('Não foi possível validar o acesso a esta unidade.'); queryClient.clear(); }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const revoked = (event: Event) => {
      if ((event as CustomEvent).detail.companyId !== companyId) return;
      setProfile(null); setError('Seu acesso a esta unidade foi removido.'); queryClient.clear();
    };
    window.addEventListener(COMPANY_ACCESS_REVOKED_EVENT, revoked);
    return () => { alive = false; clearInterval(timer); window.removeEventListener(COMPANY_ACCESS_REVOKED_EVENT, revoked); };
  }, [attempt, companyId, queryClient, resource]);
  const scope = useMemo(() => profile ? { companyId, client: resource.client, profile } : null, [companyId, resource, profile]);
  if (error) return <div role="alert" className="space-y-3 p-6 text-sm"><p>{error}</p><Button variant="outline" onClick={() => { setError(null); setAttempt(value => value + 1); }}>Tentar novamente</Button></div>;
  if (!scope) return <div role="status" aria-label="Carregando unidade" className="min-h-48 animate-pulse rounded-lg bg-muted" />;
  return <CompanyScopeContext.Provider value={scope}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></CompanyScopeContext.Provider>;
}

export function CompanyScopeProvider(props: { companyId: string; userId: string; initialProfile?: CompanyProfile; children: ReactNode }) {
  return <CompanyScopeLifetime key={`${props.userId}:${props.companyId}`} {...props} />;
}

function CompanyScopeLifetime({ companyId, userId, ...props }: { companyId: string; userId: string; initialProfile?: CompanyProfile; children: ReactNode }) {
  const [resources, setResources] = useState<{ resource: ReturnType<typeof createCompanyClient>; queryClient: QueryClient } | null>(null);
  useEffect(() => {
    const resource = createCompanyClient(companyId, userId);
    const queryClient = new QueryClient({ defaultOptions: { queries: {
      refetchOnWindowFocus: false, refetchOnReconnect: true, refetchOnMount: false,
      retry: 1, staleTime: 3 * 60_000, gcTime: 10 * 60_000,
    } } });
    setResources({ resource, queryClient });
    return () => { void queryClient.cancelQueries(); queryClient.clear(); resource.dispose(); };
  }, [companyId, userId]);
  if (!resources) return <div role="status" aria-label="Carregando unidade" className="min-h-48 animate-pulse rounded-lg bg-muted" />;
  return <ScopedContent {...props} {...resources} companyId={companyId} />;
}

export function GlobalCompanyBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { pathname } = useLocation();
  if (pathname === '/reset-password') return <>{children}</>;
  if (!auth.user) return <>{children}</>;
  if (auth.loading || auth.switchingCompany || auth.permissionState === 'LOADING') {
    return <div role="status" className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Carregando unidade…</div>;
  }
  if (auth.permissionState === 'ERROR') return <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
    <p role="alert">{auth.permissionError}</p><Button onClick={auth.retryPermissions}>Tentar novamente</Button><Button variant="ghost" onClick={() => void auth.signOut()}>Sair</Button>
  </div>;
  if (!auth.activeCompanyId || !auth.profile) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6">
    <h1 className="text-xl font-semibold">{auth.accessibleCompanies.length ? 'Selecione uma unidade' : 'Nenhuma unidade disponível'}</h1>
    <p className="text-sm text-muted-foreground">{auth.accessibleCompanies.length ? 'Escolha a unidade em que deseja trabalhar.' : 'Solicite ao administrador um acesso ativo.'}</p>
    <div className="grid w-full max-w-lg gap-3 sm:grid-cols-2">{auth.accessibleCompanies.map(company => <Button key={company.id} variant="outline" className="h-auto min-h-20 whitespace-normal" onClick={() => void auth.setActiveCompany(company.id)}>{company.nome}</Button>)}</div>
    <Button variant="ghost" onClick={() => void auth.refreshCompanies()}>Atualizar acessos</Button><Button variant="ghost" onClick={() => void auth.signOut()}>Sair</Button>
  </div>;
  return <CompanyScopeProvider companyId={auth.activeCompanyId} userId={auth.user.id} initialProfile={auth.profile}>{children}</CompanyScopeProvider>;
}
