import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, RefreshCw, Zap, Database, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { useCan } from '@/permissions/hooks';
interface SlowEvent {
  id: string;
  created_at: string;
  entity: string;
  metadata: { type?: string; duration_ms?: number; [k: string]: any } | null;
}

interface MvStatus {
  view: string;
  ms: number;
}

export default function PerformanceMonitorView() {
  const canViewRbac = useCan('configuracoes:performance:view');
  const [slowEvents, setSlowEvents] = useState<SlowEvent[]>([]);
  const [lastRefresh, setLastRefresh] = useState<MvStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    // Fetch last 50 slow query events
    const { data: slow } = await supabase
      .from('audit_logs')
      .select('id, created_at, entity, metadata')
      .eq('module', 'perf')
      .eq('action', 'SLOW_QUERY')
      .order('created_at', { ascending: false })
      .limit(50);
    setSlowEvents((slow || []) as SlowEvent[]);

    // Fetch last MV refresh job
    const { data: jobs } = await supabase
      .from('audit_logs')
      .select('metadata')
      .eq('module', 'system')
      .eq('entity', 'materialized_views')
      .eq('action', 'JOB_RUN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (jobs && jobs.length > 0 && Array.isArray(jobs[0].metadata)) {
      setLastRefresh(jobs[0].metadata as unknown as MvStatus[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleRefreshMVs = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc('refresh_materialized_views');
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Views atualizadas!');
      if (Array.isArray(data)) setLastRefresh(data as unknown as MvStatus[]);
      fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }


  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Monitor de Performance
          </h2>
          <p className="text-xs text-muted-foreground">Observabilidade de queries e materialized views</p>
        </div>
        <Button onClick={handleRefreshMVs} size="sm" variant="outline" className="gap-1.5 text-xs" disabled={refreshing}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh MVs
        </Button>
      </div>

      {/* MV Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" /> Materialized Views — Último Refresh
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lastRefresh.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum refresh registrado ainda.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {lastRefresh.map((mv, i) => (
                <div key={i} className="bg-background-subtle rounded-lg p-3 text-center">
                  <p className="text-[10px] font-mono text-muted-foreground truncate">{mv.view?.replace('mv_', '')}</p>
                  <p className={`text-sm font-bold ${mv.ms > 800 ? 'text-destructive' : mv.ms > 300 ? 'text-warning' : 'text-success'}`}>
                    {mv.ms?.toFixed(0)}ms
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slow Queries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-warning" /> Slow Queries ({slowEvents.length})
            <Badge variant="outline" className="text-[9px] ml-auto">Threshold: 800ms</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {slowEvents.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Nenhuma slow query detectada. 🎉</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Data</TableHead>
                  <TableHead className="text-[10px]">Entidade</TableHead>
                  <TableHead className="text-[10px]">Tipo</TableHead>
                  <TableHead className="text-[10px] text-right">Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slowEvents.map(ev => (
                  <TableRow key={ev.id}>
                    <TableCell className="text-[11px] font-mono text-muted-foreground">
                      {format(new Date(ev.created_at), 'dd/MM/yyyy HH:mm:ss')}
                    </TableCell>
                    <TableCell className="text-[11px]">{ev.entity}</TableCell>
                    <TableCell className="text-[11px]">
                      <Badge variant="outline" className="text-[9px]">{ev.metadata?.type || '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`text-xs font-bold ${(ev.metadata?.duration_ms || 0) > 2000 ? 'text-destructive' : 'text-warning'}`}>
                        {ev.metadata?.duration_ms?.toFixed(0) || '—'}ms
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
