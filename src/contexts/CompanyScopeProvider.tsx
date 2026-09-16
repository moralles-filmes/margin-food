import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createCompanyClient, COMPANY_ACCESS_REVOKED_EVENT } from '@/integrations/supabase/companyClient';
import { CompanyScopeContext, type CompanyProfile } from './CompanyScopeContext';
import { useAuth } from './AuthContext';
import { loadCompanyProfile, type CompanyAccessMode } from '@/lib/companyAccess';
import { Button } from '@/components/ui/button';
import { useLocation } from 'react-router-dom';

function ScopedContent({ companyId, userId, mode, resource, queryClient, initialProfile, children, restart }: {
  companyId: string; userId: string; mode: CompanyAccessMode; resource: ReturnType<typeof createCompanyClient>; queryClient: QueryClient; initialProfile?: CompanyProfile; children: ReactNode; restart: () => void;
}) {
  const [profile, setProfile] = useState<CompanyProfile | null>(initialProfile ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let blocked = false;
    const close = () => { blocked = true; generation++; void queryClient.cancelQueries(); queryClient.clear(); resource.dispose(); };
    const load = async () => {
      if (blocked) return;
      const request = ++generation;
      try {
        const next = await loadCompanyProfile(resource.client, userId, companyId, mode, AbortSignal.timeout(15_000));
        if (alive && request === generation) { setProfile(next); setError(null); }
      } catch (failure) {
        console.error('[Unidade] Falha de autorização:', failure);
        if (alive && request === generation) { close(); setProfile(null); setError('Não foi possível validar o acesso a esta unidade.'); }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const revoked = (event: Event) => {
      if ((event as CustomEvent).detail.companyId !== companyId) return;
      close(); setProfile(null); setError('Seu acesso a esta unidade foi removido.');
    };
    window.addEventListener(COMPANY_ACCESS_REVOKED_EVENT, revoked);
    return () => { alive = false; clearInterval(timer); window.removeEventListener(COMPANY_ACCESS_REVOKED_EVENT, revoked); };
  }, [companyId, userId, mode, queryClient, resource]);
  const scope = useMemo(() => profile ? { companyId, client: resource.client, profile } : null, [companyId, resource, profile]);
  if (error) return <div role="alert" className="space-y-3 p-6 text-sm"><p>{error}</p><Button variant="outline" onClick={restart}>Tentar novamente</Button></div>;
  if (!scope) return <div role="status" aria-label="Carregando unidade" className="min-h-48 animate-pulse rounded-lg bg-muted" />;
  return <CompanyScopeContext.Provider value={scope}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></CompanyScopeContext.Provider>;
}

export function CompanyScopeProvider(props: { companyId: string; userId: string; initialProfile?: CompanyProfile; children: ReactNode }) {
  const { companyAccessMode } = useAuth();
  return <CompanyScopeLifetime key={`${props.userId}:${props.companyId}:${companyAccessMode}`} {...props} mode={companyAccessMode} />;
}

function CompanyScopeLifetime({ companyId, userId, mode, ...props }: { companyId: string; userId: string; mode: CompanyAccessMode; initialProfile?: CompanyProfile; children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [resources, setResources] = useState<{ resource: ReturnType<typeof createCompanyClient>; queryClient: QueryClient } | null>(null);
  useEffect(() => {
    const resource = createCompanyClient(companyId, userId, mode);
    const queryClient = new QueryClient({ defaultOptions: { queries: {
      refetchOnWindowFocus: false, refetchOnReconnect: true, refetchOnMount: false,
      retry: 1, staleTime: 3 * 60_000, gcTime: 10 * 60_000,
    } } });
    setResources({ resource, queryClient });
    return () => { void queryClient.cancelQueries(); queryClient.clear(); resource.dispose(); };
  }, [companyId, userId, mode, attempt]);
  if (!resources) return <div role="status" aria-label="Carregando unidade" className="min-h-48 animate-pulse rounded-lg bg-muted" />;
  return <ScopedContent key={attempt} {...props} initialProfile={attempt ? undefined : props.initialProfile} {...resources} companyId={companyId} userId={userId} mode={mode} restart={() => { setResources(null); setAttempt(value => value + 1); }} />;
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
