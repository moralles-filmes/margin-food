/**
 * ─── Analytics Section Template (Enterprise Safe) ───
 *
 * Use for: read-only analytics / reports sub-tabs.
 *
 * Built-in:
 *  ✅ RBAC (view / export)
 *  ✅ NoAccess fallback
 *  ✅ Loading + Skeleton
 *  ✅ useDataEvent auto-refresh
 *  ✅ Export guard (PDF / Excel placeholder)
 *  ✅ Typed chart data
 *  ✅ Timezone-safe date filters
 *
 * Replace all TODO markers before use.
 */

import { useState, useCallback, useEffect } from 'react';
import { useCan } from '@/permissions';
import { useDataEvent } from '@/lib/dataEvents';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, Download, Loader2 } from 'lucide-react';
import { todayBR, formatDateBR } from '@/lib/datetime';

// ── NoAccess ──
function NoAccess() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
      <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
      <p className="font-medium text-foreground">Acesso negado</p>
      <p className="text-xs text-muted-foreground mt-1">Você não tem permissão para visualizar este relatório.</p>
    </div>
  );
}

// ── Types (TODO: replace) ──
interface KpiData {
  label: string;
  value: number;
  trend?: 'up' | 'down' | 'stable';
}

interface ChartPoint {
  date: string;
  value: number;
}

// ── Component ──
export default function AnalyticsSectionTemplate() {
  // ── RBAC ──
  const canView   = useCan('modulo:subaba:view');    // TODO: replace
  const canExport = useCan('modulo:subaba:export');  // TODO: replace

  // ── State ──
  const [kpis, setKpis] = useState<KpiData[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      /*
       * TODO: replace with actual RPC or aggregation query, e.g.:
       * const { data, error } = await supabase
       *   .rpc('get_analytics_data', { p_date_from: formatDateBR(new Date(Date.now() - 30 * 86400000)) });
       * if (error) { toast.error('Erro ao carregar análise'); return; }
       */
      void supabase; void formatDateBR; void todayBR; // prevent unused warnings
      // TODO: normalize data into KpiData[] and ChartPoint[]
      setKpis([]);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Auto-refresh ──
  useDataEvent('modulo:subaba', load); // TODO: replace event key

  // ── Export ──
  const handleExport = async (format: 'pdf' | 'excel') => {
    if (exporting) return;
    setExporting(true);
    try {
      // TODO: implement actual export using pdfGenerator or xlsx
      toast.success(`Exportação ${format.toUpperCase()} iniciada`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro na exportação');
    } finally {
      setExporting(false);
    }
  };

  // ── Guard ──
  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold text-foreground">
          📊 Título do Relatório {/* TODO */}
        </h2>
        {canExport && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleExport('pdf')} disabled={exporting || loading}>
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleExport('excel')} disabled={exporting || loading}>
              Excel
            </Button>
          </div>
        )}
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <Card key={i} className="border-border">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold text-foreground">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Chart area */}
      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <Card className="border-border">
          <CardContent className="p-4">
            {/* TODO: render chart with chartData */}
            <p className="text-sm text-muted-foreground text-center py-12">Gráfico aqui</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
