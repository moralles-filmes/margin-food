import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCan } from '@/permissions/hooks';
import { AlertTriangle, Bell, Clock, RefreshCw, ExternalLink, ShieldX, Download } from 'lucide-react';
import { fmtBRL } from '@/lib/money';
import * as XLSX from 'xlsx';

// ─── Types ───
interface AlertaFinanceiro {
  tipo: string;
  titulo: string;
  descricao: string;
  severidade: 'critical' | 'warning' | 'info';
  grupo: string;
  navigateTo?: string;
}

interface TruncationInfo {
  key: string;
  shown: number;
  total: number;
}

interface Props {
  onNavigate?: (tab: string) => void;
}

// ─── Constants ───
const GRUPO_ORDER = ['contas_pagar', 'contas_receber', 'contas_bancarias', 'lancamentos', 'recorrencias'];
const GRUPO_LABELS: Record<string, string> = {
  contas_pagar: 'Contas a Pagar',
  contas_receber: 'Contas a Receber',
  contas_bancarias: 'Contas Bancárias',
  lancamentos: 'Lançamentos',
  recorrencias: 'Recorrências',
};

const SEV_CONFIG = {
  critical: { color: 'bg-destructive/10 text-destructive border-destructive/30', icon: AlertTriangle, label: 'Crítico' },
  warning: { color: 'bg-warning/10 text-warning border-warning/30', icon: Clock, label: 'Atenção' },
  info: { color: 'bg-primary/10 text-primary border-primary/30', icon: Bell, label: 'Info' },
};

const ORIGEM_LABELS: Record<string, string> = {
  livro_razao: 'Livro Razão',
  contas_pagar: 'Contas a Pagar',
  contas_receber: 'Contas a Receber',
};

type SeverityFilter = 'todos' | 'critical' | 'warning' | 'info';

// ─── NoAccess ───
function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <ShieldX className="w-10 h-10 opacity-40" />
      <p className="font-medium">Acesso restrito</p>
      <p className="text-sm">Você não tem permissão para visualizar os alertas financeiros.</p>
    </div>
  );
}

// ─── Skeleton Loading ───
function SkeletonCards() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}><CardContent className="p-3 flex items-start gap-3">
          <Skeleton className="w-5 h-5 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </CardContent></Card>
      ))}
    </div>
  );
}

export default function AlertasSection({ onNavigate }: Props) {
  const canView = useCan('financeiro:alertas:view');
  const canExport = useCan('financeiro:alertas:export');

  const [alertas, setAlertas] = useState<AlertaFinanceiro[]>([]);
  const [truncations, setTruncations] = useState<TruncationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroSeveridade, setFiltroSeveridade] = useState<SeverityFilter>('todos');

  // ─── Debounce ref ───
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(), 500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_fin_alertas');
      if (error) {
        toast.error('Erro ao carregar alertas financeiros');
        console.error(error);
        setLoading(false);
        return;
      }
      const d = data as Record<string, unknown>;
      const list: AlertaFinanceiro[] = [];
      const trunc: TruncationInfo[] = [];

      // 1) CP vencidas (critical)
      const cpVencidas = (d.cp_vencidas || []) as Array<Record<string, unknown>>;
      const cpVencidasTotal = Number(d.cp_vencidas_total) || cpVencidas.length;
      if (cpVencidasTotal > cpVencidas.length) {
        trunc.push({ key: 'cp_vencidas', shown: cpVencidas.length, total: cpVencidasTotal });
      }
      cpVencidas.forEach((cp) => {
        list.push({
          tipo: 'cp_vencida', grupo: 'contas_pagar', severidade: 'critical', navigateTo: 'pagar',
          titulo: `⚠️ VENCIDA: ${cp.descricao}`,
          descricao: `Venceu em ${cp.data_vencimento} — ${fmtBRL(Number(cp.valor))}`,
        });
      });

      // 2) CP vencendo em 7 dias (warning)
      const cpVencer = (d.cp_vencer || []) as Array<Record<string, unknown>>;
      const cpVencerTotal = Number(d.cp_vencer_total) || cpVencer.length;
      if (cpVencerTotal > cpVencer.length) {
        trunc.push({ key: 'cp_vencer', shown: cpVencer.length, total: cpVencerTotal });
      }
      cpVencer.forEach((cp) => {
        list.push({
          tipo: 'cp_vencer', grupo: 'contas_pagar', severidade: 'warning', navigateTo: 'pagar',
          titulo: `Conta a pagar: ${cp.descricao}`,
          descricao: `Vence em ${cp.data_vencimento} — ${fmtBRL(Number(cp.valor))}`,
        });
      });

      // 3) CR atrasadas (warning)
      const crAtrasadas = (d.cr_atrasadas || []) as Array<Record<string, unknown>>;
      const crAtrasadasTotal = Number(d.cr_atrasadas_total) || crAtrasadas.length;
      if (crAtrasadasTotal > crAtrasadas.length) {
        trunc.push({ key: 'cr_atrasadas', shown: crAtrasadas.length, total: crAtrasadasTotal });
      }
      crAtrasadas.forEach((cr) => {
        list.push({
          tipo: 'cr_atrasada', grupo: 'contas_receber', severidade: 'warning', navigateTo: 'receber',
          titulo: `Recebimento atrasado: ${cr.descricao}`,
          descricao: `Cliente: ${cr.cliente} — Venceu em ${cr.data_vencimento} — ${fmtBRL(Number(cr.valor))}`,
        });
      });

      // 4) CR vencendo em 7 dias (info)
      const crVencer = (d.cr_vencer || []) as Array<Record<string, unknown>>;
      const crVencerTotal = Number(d.cr_vencer_total) || crVencer.length;
      if (crVencerTotal > crVencer.length) {
        trunc.push({ key: 'cr_vencer', shown: crVencer.length, total: crVencerTotal });
      }
      crVencer.forEach((cr) => {
        list.push({
          tipo: 'cr_vencer', grupo: 'contas_receber', severidade: 'info', navigateTo: 'receber',
          titulo: `A receber: ${cr.descricao}`,
          descricao: `Cliente: ${cr.cliente} — Vence em ${cr.data_vencimento}`,
        });
      });

      // 5) Saldo negativo (critical)
      (d.contas_saldo_negativo as Array<Record<string, unknown>> || []).forEach((c) => {
        list.push({
          tipo: 'saldo_negativo', grupo: 'contas_bancarias', severidade: 'critical', navigateTo: 'contas',
          titulo: `Saldo negativo: ${c.nome}`,
          descricao: `Saldo atual: ${fmtBRL(Number(c.saldo))}`,
        });
      });

      // 6) Lançamentos sem categoria (warning)
      const semCat = Number(d.lancamentos_sem_categoria) || 0;
      if (semCat > 0) {
        list.push({
          tipo: 'sem_categoria', grupo: 'lancamentos', severidade: 'warning', navigateTo: 'lancamentos',
          titulo: `${semCat} lançamento(s) sem categoria`,
          descricao: 'Lançamentos sem categoria podem prejudicar DRE, DFC e relatórios.',
        });
      }

      // 7) Lançamentos sem conta (warning)
      const semConta = Number(d.lancamentos_sem_conta) || 0;
      if (semConta > 0) {
        list.push({
          tipo: 'sem_conta', grupo: 'lancamentos', severidade: 'warning', navigateTo: 'lancamentos',
          titulo: `${semConta} lançamento(s) sem conta financeira`,
          descricao: 'Lançamentos sem conta comprometem saldo, conciliação e fluxo de caixa.',
        });
      }

      // 8) Recorrências pendentes (warning)
      const recPendentes = [
        ...((d.recorrencias_pendentes || []) as Array<Record<string, unknown>>),
        ...((d.recorrencias_cp_pendentes || []) as Array<Record<string, unknown>>),
        ...((d.recorrencias_cr_pendentes || []) as Array<Record<string, unknown>>),
      ];
      recPendentes.forEach((r) => {
        list.push({
          tipo: 'recorrencia_pendente', grupo: 'recorrencias', severidade: 'warning', navigateTo: 'recorrencias',
          titulo: `Recorrência não gerada: ${r.descricao}`,
          descricao: `Origem: ${ORIGEM_LABELS[r.origem as string] || r.origem} — ${fmtBRL(Number(r.valor))}`,
        });
      });

      // Sort by severity
      const sevOrder = { critical: 0, warning: 1, info: 2 };
      list.sort((a, b) => sevOrder[a.severidade] - sevOrder[b.severidade]);

      setAlertas(list);
      setTruncations(trunc);
    } catch (err) {
      console.error('Error loading alerts:', err);
      toast.error('Erro inesperado ao carregar alertas');
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (canView) load(); }, [load, canView]);

  // Auto-refresh on financial mutations (debounced)
  useDataEvent('financeiro:lancamentos', debouncedLoad);
  useDataEvent('financeiro:contas_pagar', debouncedLoad);
  useDataEvent('financeiro:contas_receber', debouncedLoad);
  useDataEvent('financeiro:contas', debouncedLoad);

  // ─── RBAC gate ───
  if (!canView) return <NoAccess />;

  // ─── Filtered list ───
  const filtered = filtroSeveridade === 'todos'
    ? alertas
    : alertas.filter(a => a.severidade === filtroSeveridade);

  const criticalCount = alertas.filter(a => a.severidade === 'critical').length;
  const warningCount = alertas.filter(a => a.severidade === 'warning').length;
  const infoCount = alertas.filter(a => a.severidade === 'info').length;

  // Group alerts
  const grouped = GRUPO_ORDER.map(g => ({
    grupo: g,
    label: GRUPO_LABELS[g],
    items: filtered.filter(a => a.grupo === g),
  })).filter(g => g.items.length > 0);

  // ─── Excel export ───
  const handleExportExcel = () => {
    const rows = alertas.map(a => ({
      Tipo: a.tipo,
      Severidade: SEV_CONFIG[a.severidade].label,
      Grupo: GRUPO_LABELS[a.grupo] || a.grupo,
      Título: a.titulo,
      Descrição: a.descricao,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alertas');
    XLSX.writeFile(wb, `alertas-financeiros-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Exportação concluída');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Central de Alertas</h2>
          <p className="text-sm text-muted-foreground">
            {criticalCount > 0 && <span className="text-destructive font-medium">{criticalCount} crítico(s)</span>}
            {criticalCount > 0 && warningCount > 0 && ' • '}
            {warningCount > 0 && <span className="text-warning font-medium">{warningCount} atenção</span>}
            {(criticalCount > 0 || warningCount > 0) && infoCount > 0 && ' • '}
            {infoCount > 0 && <span className="text-primary font-medium">{infoCount} info</span>}
            {alertas.length > 0 && ` • ${alertas.length} total`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && alertas.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Severity filter */}
      {!loading && alertas.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {([
            { key: 'todos' as SeverityFilter, label: 'Todos', count: alertas.length },
            { key: 'critical' as SeverityFilter, label: 'Crítico', count: criticalCount },
            { key: 'warning' as SeverityFilter, label: 'Atenção', count: warningCount },
            { key: 'info' as SeverityFilter, label: 'Info', count: infoCount },
          ]).filter(f => f.count > 0 || f.key === 'todos').map(f => (
            <Button
              key={f.key}
              variant={filtroSeveridade === f.key ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFiltroSeveridade(f.key)}
            >
              {f.label} ({f.count})
            </Button>
          ))}
        </div>
      )}

      {/* Truncation warnings */}
      {truncations.length > 0 && (
        <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
          {truncations.map(t => (
            <p key={t.key}>Mostrando {t.shown} de {t.total} alertas em "{GRUPO_LABELS[t.key] || t.key}"</p>
          ))}
        </div>
      )}

      {loading ? (
        <SkeletonCards />
      ) : alertas.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum alerta no momento</p>
          <p className="text-sm">Tudo sob controle! 🎉</p>
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <p className="text-sm">Nenhum alerta com severidade "{filtroSeveridade}"</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(g => (
            <div key={g.grupo} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {g.label} <Badge variant="outline" className="ml-1 text-[10px]">{g.items.length}</Badge>
                </h3>
                {onNavigate && g.items[0]?.navigateTo && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => onNavigate(g.items[0].navigateTo!)}>
                    <ExternalLink className="w-3 h-3 mr-1" /> Abrir
                  </Button>
                )}
              </div>
              {g.items.map((alerta, i) => {
                const config = SEV_CONFIG[alerta.severidade];
                const Icon = config.icon;
                return (
                  <Card key={`${g.grupo}-${alerta.tipo}-${i}`} className={`border ${config.color}`}>
                    <CardContent className="p-3 flex items-start gap-3">
                      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{alerta.titulo}</p>
                        <p className="text-xs text-muted-foreground">{alerta.descricao}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{config.label}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
