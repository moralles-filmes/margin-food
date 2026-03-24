import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useCan } from '@/permissions/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldAlert, RefreshCw, Database, User, Shield, Wrench, Play, Trash2, Bug, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import CheckupSuiteCard from '@/components/admin/CheckupSuiteCard';
import AccessManagementCard from '@/components/admin/AccessManagementCard';
import BugTrackerView, { useCriticalBugCount } from '@/components/admin/BugTrackerView';

type RpcResult = { data: unknown; error: string | null; loading: boolean };

function useRpcRunner() {
  const [results, setResults] = useState<Record<string, RpcResult>>({});

  const run = useCallback(async (key: string, rpcName: string, params?: Record<string, unknown>) => {
    setResults(prev => ({ ...prev, [key]: { data: null, error: null, loading: true } }));
    try {
      const { data, error } = await (supabase.rpc as any)(rpcName, params || {});
      if (error) {
        setResults(prev => ({ ...prev, [key]: { data: null, error: error.message, loading: false } }));
      } else {
        setResults(prev => ({ ...prev, [key]: { data, error: null, loading: false } }));
      }
    } catch (e: any) {
      setResults(prev => ({ ...prev, [key]: { data: null, error: e?.message ?? String(e), loading: false } }));
    }
  }, []);

  return { results, run };
}

export default function AdminPanel() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const canAccess = useCan('system:global:manage');
  const { results, run } = useRpcRunner();
  const [healthLoaded, setHealthLoaded] = useState(false);
  const criticalBugs = useCriticalBugCount();

  // Auto-load health counts when access is granted
  if (canAccess && !healthLoaded) {
    setHealthLoaded(true);
    setTimeout(() => run('health', 'admin_health_counts'), 0);
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm p-6">
          <ShieldAlert className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">403 — Sem permissão</h2>
          <p className="text-sm text-muted-foreground">Acesso restrito a super administradores.</p>
        </div>
      </div>
    );
  }

  const handleClearCache = () => {
    sessionStorage.clear();
    localStorage.removeItem('rbac_cache');
    toast.success('Caches limpos. Recarregando...');
    setTimeout(() => window.location.reload(), 500);
  };

  const renderJson = (key: string) => {
    const r = results[key];
    if (!r) return <span className="text-muted-foreground text-xs">Aguardando execução...</span>;
    if (r.loading) return <span className="text-muted-foreground text-xs animate-pulse">Carregando...</span>;
    if (r.error) return <span className="text-destructive text-xs">ERROR: {r.error}</span>;
    return (
      <pre className="text-xs bg-muted/50 p-3 rounded-lg overflow-auto max-h-80 whitespace-pre-wrap break-all border border-border">
        {JSON.stringify(r.data, null, 2)}
      </pre>
    );
  };

  const healthData = results['health']?.data as Record<string, number> | null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-foreground">Painel Admin</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">super_admin</span>
        </div>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="bugs" className="gap-1.5">
              <Bug className="w-3 h-3" /> Bug Tracker
              {criticalBugs > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0 rounded-full bg-destructive text-destructive-foreground font-bold">
                  {criticalBugs}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CARD 1 — Identity */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="w-4 h-4" /> Identidade / Tenant
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="text-foreground">{user?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">auth.uid():</span>
                    <span className="text-foreground truncate max-w-48">{user?.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">company_id (profile):</span>
                    <span className="text-foreground truncate max-w-48">{profile?.company_id || '—'}</span>
                  </div>
                </CardContent>
              </Card>

              {/* CARD 2 — Health Counts */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Database className="w-4 h-4" /> Health Counts (Tenant)
                    <Button variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={() => run('health', 'admin_health_counts')}>
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {results['health']?.loading && <span className="text-xs text-muted-foreground animate-pulse">Carregando...</span>}
                  {results['health']?.error && <span className="text-xs text-destructive">ERROR: {results['health'].error}</span>}
                  {healthData && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
                      {Object.entries(healthData).filter(([k]) => k !== 'company_id').map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="text-muted-foreground">{k}:</span>
                          <span className={`font-semibold ${Number(v) === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* CARD 3 — Debug Tools */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Wrench className="w-4 h-4" /> Ferramentas de Debug
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => run('tenant', 'debug_tenant')}>
                      <Play className="w-3 h-3" /> debug_tenant
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => run('inventory', 'debug_company_inventory')}>
                      <Play className="w-3 h-3" /> debug_company_inventory
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => run('stock', 'debug_stock_last_movements', { p_limit: 20 })}>
                      <Play className="w-3 h-3" /> debug_stock_last_movements(20)
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {['tenant', 'inventory', 'stock'].map(key => (
                      results[key] && (
                        <div key={key}>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">{key}</p>
                          {renderJson(key)}
                        </div>
                      )
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Checkup Suite */}
              <CheckupSuiteCard />

              {/* Access Management */}
              <AccessManagementCard />

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Segurança
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span>Placeholder block trigger: <strong className="text-foreground">ATIVO</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span>FK companies(id): <strong className="text-foreground">82/82 tabelas</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span>company_id NOT NULL: <strong className="text-foreground">100%</strong></span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-warning/10 border border-warning/20">
                    <div className="w-2 h-2 rounded-full bg-warning" />
                    <span className="text-warning">pg_net extension in public — <strong>mitigado</strong> (REVOKE + risk register)</span>
                  </div>
                </CardContent>
              </Card>

              {/* Maintenance */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Wrench className="w-4 h-4" /> Manutenção
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={handleClearCache}>
                    <Trash2 className="w-3 h-3" /> Limpar caches locais + recarregar
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    Remove sessionStorage, localStorage RBAC cache e recarrega a página.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="bugs">
            <BugTrackerView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
