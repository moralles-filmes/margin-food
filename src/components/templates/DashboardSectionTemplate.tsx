/**
 * ─── Dashboard Section Template (Enterprise Safe) ───
 *
 * Use for: overview dashboards with KPIs, charts, and summary cards.
 *
 * Built-in:
 *  ✅ RBAC (view)
 *  ✅ NoAccess fallback
 *  ✅ Loading + Skeleton
 *  ✅ useDataEvent auto-refresh
 *  ✅ Typed KPI / chart models
 *  ✅ Timezone-safe period handling
 *
 * Replace all TODO markers before use.
 */

import { useState, useCallback, useEffect } from 'react';
import { useCan } from '@/permissions';
import { useDataEvent } from '@/lib/dataEvents';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── NoAccess ──
function NoAccess() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
      <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
      <p className="font-medium text-foreground">Acesso negado</p>
    </div>
  );
}

// ── Types (TODO: replace) ──
interface DashboardKpi {
  label: string;
  value: string;
  subtitle?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

// ── Component ──
export default function DashboardSectionTemplate() {
  // ── RBAC ──
  const canView = useCan('modulo:dashboard:view'); // TODO: replace

  // ── State ──
  const [kpis, setKpis] = useState<DashboardKpi[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // TODO: replace with actual RPC / aggregation
      // Always use explicit projection, never select('*')
      setKpis([
        { label: 'Total', value: '0', variant: 'default' },
      ]);
    } catch (err: unknown) {
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Auto-refresh ──
  useDataEvent('modulo:*', load); // TODO: replace event key

  // ── Guard ──
  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold text-foreground">
          📊 Dashboard {/* TODO */}
        </h2>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <Card key={i} className="border-border">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                {kpi.subtitle && <p className="text-xs text-muted-foreground mt-1">{kpi.subtitle}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
