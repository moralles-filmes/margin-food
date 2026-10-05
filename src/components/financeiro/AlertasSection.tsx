import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataEvent } from '@/lib/dataEvents';
import { Button } from '@/components/ui/button';
import StatusBadge, { type StatusType } from '@/components/ui/StatusBadge';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useCan } from '@/permissions/hooks';
import { AlertTriangle, Bell, Check, Clock, RefreshCw, ExternalLink, Download } from 'lucide-react';
import { fmtBRL } from '@/lib/money';
import * as XLSX from '@/lib/safeXlsx';
import { formatDateValueBR } from '@/lib/formatters';
import { todayBR } from '@/lib/datetime';
import { FinScreenHeader, FinSectionGroup } from './finV2Layout';

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

// Cor por token -soft/-border (sem opacidade); o texto do alerta fica em foreground/muted.
const SEV_CONFIG: Record<'critical' | 'warning' | 'info', { card: string; icon: typeof Bell; iconColor: string; chip: string; badge: StatusType; label: string }> = {
  critical: { card: 'border-destructive-border bg-destructive-soft', icon: AlertTriangle, iconColor: 'text-destructive', chip: 'bg-destructive-soft text-destructive border-destructive-border', badge: 'danger', label: 'Crítico' },
  warning: { card: 'border-warning-border bg-warning-soft', icon: Clock, iconColor: 'text-warning', chip: 'bg-warning-soft text-warning border-warning-border', badge: 'warning', label: 'Atenção' },
  info: { card: 'border-info-border bg-info-soft', icon: Bell, iconColor: 'text-info', chip: 'bg-info-soft text-info border-info-border', badge: 'info', label: 'Info' },
};

const ORIGEM_LABELS: Record<string, string> = {
  livro_razao: 'Livro Razão',
  contas_pagar: 'Contas a Pagar',
  contas_receber: 'Contas a Receber',
};

type SeverityFilter = 'todos' | 'critical' | 'warning' | 'info';

// ─── Skeleton Loading ───
function SkeletonCards() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Carregando alertas…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} aria-hidden="true" className="flex items-start gap-3 rounded-xl border bg-card p-3">
          <Skeleton className="w-5 h-5 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function AlertasSection({ onNavigate }: Props) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:alertas:view');
  const canExport = useCan('financeiro:alertas:export');

  const [alertas, setAlertas] = useState<AlertaFinanceiro[]>([]);
  const [truncations, setTruncations] = useState<TruncationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroSeveridade, setFiltroSeveridade] = useState<SeverityFilter>('todos');
  // Só apresentação: falha de carga nunca vira "Tudo sob controle" (PF-013).
  const [erro, setErro] = useState(false);
  const [carregado, setCarregado] = useState(false);

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
        setErro(true);
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
          descricao: `Venceu em ${formatDateValueBR(String(cp.data_vencimento))} — ${fmtBRL(Number(cp.valor))}`,
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
          descricao: `Vence em ${formatDateValueBR(String(cp.data_vencimento))} — ${fmtBRL(Number(cp.valor))}`,
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
          descricao: `Cliente: ${cr.cliente} — Venceu em ${formatDateValueBR(String(cr.data_vencimento))} — ${fmtBRL(Number(cr.valor))}`,
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
          descricao: `Cliente: ${cr.cliente} — Vence em ${formatDateValueBR(String(cr.data_vencimento))}`,
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
      setErro(false);
      setCarregado(true);
    } catch (err) {
      console.error('Error loading alerts:', err);
      toast.error('Erro inesperado ao carregar alertas');
      setErro(true);
    }
    setLoading(false);
  }, [supabase, toast]);

  useEffect(() => { if (canView) load(); }, [load, canView]);

  // Auto-refresh on financial mutations (debounced)
  useDataEvent('financeiro:lancamentos', debouncedLoad);
  useDataEvent('financeiro:contas_pagar', debouncedLoad);
  useDataEvent('financeiro:contas_receber', debouncedLoad);
  useDataEvent('financeiro:contas', debouncedLoad);

  // ─── RBAC gate ───
  if (!canView) return <AccessDenied description="Você não tem permissão para visualizar os alertas financeiros." />;

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
    XLSX.writeFile(wb, `alertas-financeiros-${todayBR()}.xlsx`);
    toast.success('Exportação concluída');
  };

  const chips = ([
    { key: 'todos' as SeverityFilter, label: 'Todos', count: alertas.length, tom: 'bg-card text-foreground border-border hover:bg-card-hover' },
    { key: 'critical' as SeverityFilter, label: 'Crítico', count: criticalCount, tom: SEV_CONFIG.critical.chip },
    { key: 'warning' as SeverityFilter, label: 'Atenção', count: warningCount, tom: SEV_CONFIG.warning.chip },
    { key: 'info' as SeverityFilter, label: 'Info', count: infoCount, tom: SEV_CONFIG.info.chip },
  ]).filter(f => f.count > 0 || f.key === 'todos');
  const rotuloFiltro = filtroSeveridade === 'todos' ? 'Todos' : SEV_CONFIG[filtroSeveridade].label;
  // Sem "⚠️" na tela: o ícone do cartão já marca a severidade. O título do Excel não muda.
  const tituloNaTela = (titulo: string) => titulo.replace(/^⚠️\s*/u, '');

  const resumo = alertas.length > 0 ? (
    <>
      {criticalCount > 0 && <span className="font-medium text-destructive">{criticalCount} crítico(s)</span>}
      {criticalCount > 0 && warningCount > 0 && ' • '}
      {warningCount > 0 && <span className="font-medium text-warning">{warningCount} atenção</span>}
      {(criticalCount > 0 || warningCount > 0) && infoCount > 0 && ' • '}
      {infoCount > 0 && <span className="font-medium text-info">{infoCount} info</span>}
      {truncations.length > 0 ? ` • ${alertas.length} listados` : ` • ${alertas.length} total`}
    </>
  ) : 'Pendências financeiras que pedem ação.';

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Central de Alertas"
        description={erro && !carregado ? 'Pendências financeiras que pedem ação.' : resumo}
        actions={(
          <>
            {canExport && alertas.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportExcel}>
                <Download aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw aria-hidden="true" className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </>
        )}
      />

      {/* Severity filter */}
      {!loading && alertas.length > 0 && (
        <div className="space-y-2">
          <div role="group" aria-label="Filtrar por severidade" className="flex flex-wrap gap-2">
            {chips.map(f => {
              const ativo = filtroSeveridade === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setFiltroSeveridade(f.key)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    f.tom,
                    // Ativo: anel azul + marca de seleção + peso maior — não depende só da cor.
                    ativo && 'font-semibold ring-2 ring-primary ring-offset-1 ring-offset-background',
                  )}
                >
                  {ativo && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                  {f.label} <span className="font-semibold tabular-nums">({f.count})</span>
                </button>
              );
            })}
          </div>
          {truncations.length > 0 && (
            <p className="text-xs text-muted-foreground">Contagens dos alertas listados.</p>
          )}
        </div>
      )}

      {/* Truncation warnings */}
      {truncations.length > 0 && (
        <div className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs text-foreground">
          {truncations.map(t => (
            <p key={t.key}>Mostrando {t.shown} de {t.total} alertas em "{GRUPO_LABELS[t.key] || t.key}"</p>
          ))}
        </div>
      )}

      {erro && carregado && !loading && alertas.length > 0 && (
        <ErrorState compact title="Não foi possível atualizar os alertas" description="A lista abaixo é da última carga." onRetry={load} />
      )}

      {loading ? (
        <SkeletonCards />
      ) : erro && (!carregado || alertas.length === 0) ? (
        // Sem lista para mostrar, o erro não divide a tela com "Tudo sob controle!".
        <ErrorState title="Não foi possível carregar os alertas" onRetry={load} />
      ) : alertas.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Bell aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground">Nenhum alerta no momento</p>
          <p className="text-sm text-muted-foreground">Tudo sob controle!</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum alerta com severidade “{rotuloFiltro}”</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(g => (
            <FinSectionGroup
              key={g.grupo}
              id={`alertas-${g.grupo}`}
              title={`${g.label} (${g.items.length})`}
              caption={onNavigate && g.items[0]?.navigateTo ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onNavigate(g.items[0].navigateTo!)}
                  aria-label={`Abrir ${g.label}`}
                >
                  <ExternalLink aria-hidden="true" className="w-3 h-3 mr-1" /> Abrir
                </Button>
              ) : undefined}
            >
              <ul className="space-y-2">
                {g.items.map((alerta, i) => {
                  const config = SEV_CONFIG[alerta.severidade];
                  const Icon = config.icon;
                  return (
                    <li key={`${g.grupo}-${alerta.tipo}-${i}`} className={cn('flex items-start gap-3 rounded-xl border p-3', config.card)}>
                      <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', config.iconColor)} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-foreground">{tituloNaTela(alerta.titulo)}</p>
                        <p className="break-words text-xs text-muted-foreground">{alerta.descricao}</p>
                      </div>
                      <StatusBadge status={config.badge} label={config.label} className="shrink-0" />
                    </li>
                  );
                })}
              </ul>
            </FinSectionGroup>
          ))}
        </div>
      )}
    </div>
  );
}
