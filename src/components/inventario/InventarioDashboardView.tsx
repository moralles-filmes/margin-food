/**
 * Inventario Dashboard sub-view — extracted from InventarioView monolith.
 */
import { Loader2, ShieldAlert, Clock, Users, TrendingDown, TrendingUp, Flame, BarChart3, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDisplayBR } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';
import { formatInBR } from '@/lib/datetime';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';
import type { Inventario, DashboardData } from '@/hooks/useInventarioStore';

function KPICard({ label, value, color, large }: { label: string; value: string; color?: string; large?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={`${large ? 'text-2xl' : 'text-lg'} font-display font-bold ${color || 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function riskBadge(score: number) {
  if (score > 60) return <Badge className="bg-destructive/10 text-destructive text-[9px] gap-1"><Flame className="w-3 h-3" />Alto Risco</Badge>;
  if (score > 30) return <Badge className="bg-warning/10 text-warning text-[9px] gap-1"><AlertTriangle className="w-3 h-3" />Atenção</Badge>;
  return <Badge className="bg-success/10 text-success text-[9px] gap-1">Seguro</Badge>;
}

interface Props {
  dashboard: DashboardData | null;
  onBack: () => void;
  onOpenDetail: (inv: Inventario) => void;
}

export default function InventarioDashboardView({ dashboard: d, onBack, onOpenDetail }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <h2 className="text-lg font-display font-bold text-foreground">📊 Dashboard Inventário 3.0</h2>
      </div>

      {!d ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {d.finalizados.length > 0 && (
              <>
                <KPICard label="Última Acurácia" value={formatPercentBR(Number(d.finalizados[0].acuracia_percent))} color="text-success" large />
                <KPICard label="Drift Total" value={fmtBRL(Number(d.finalizados[0].drift_total_valor))}
                  color={Number(d.finalizados[0].drift_total_valor) < 0 ? 'text-destructive' : 'text-success'} large />
              </>
            )}
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-[10px] text-muted-foreground uppercase">Score Médio Risco</p>
              <p className={`text-2xl font-display font-bold ${d.avgScore > 60 ? 'text-destructive' : d.avgScore > 30 ? 'text-warning' : 'text-success'}`}>
                {d.avgScore}
              </p>
              {riskBadge(d.avgScore)}
            </div>
            <KPICard label="Sob Análise" value={String(d.sobAnalise.length)} color={d.sobAnalise.length > 0 ? 'text-destructive' : 'text-muted-foreground'} large />
          </div>

          {/* Inventários sob análise */}
          {d.sobAnalise.length > 0 && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Inventários Sob Análise</p>
              {d.sobAnalise.map(inv => (
                <button key={inv.id} onClick={() => onOpenDetail(inv)}
                  className="w-full flex items-center justify-between bg-card/50 rounded-lg p-2.5 text-left hover:bg-card transition-colors">
                  <div>
                    <span className="text-xs font-medium text-foreground capitalize">{inv.tipo}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{formatDisplayBR(parseLocalDate(inv.data))}</span>
                  </div>
                  <Badge className="text-[9px] bg-destructive/10 text-destructive">Requer Aprovação</Badge>
                </button>
              ))}
            </div>
          )}

          {/* Drift por Turno */}
          {Object.keys(d.turnoDrift).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><Clock className="w-4 h-4 text-primary" /> Desvio por Turno</p>
              <div className="space-y-2">
                {Object.entries(d.turnoDrift).sort((a, b) => a[1] - b[1]).map(([turno, val]) => (
                  <div key={turno} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{turno}</span>
                    <span className={`font-bold ${val < 0 ? 'text-destructive' : 'text-success'}`}>
                      {val < 0 ? <TrendingDown className="w-3 h-3 inline mr-1" /> : <TrendingUp className="w-3 h-3 inline mr-1" />}
                      {fmtBRL(val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drift por Usuário */}
          {Object.keys(d.userDrift).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" /> Desvio por Usuário</p>
              <div className="space-y-2">
                {Object.entries(d.userDrift).sort((a, b) => b[1].total - a[1].total).map(([uid, data]) => (
                  <div key={uid} className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-foreground font-medium">{data.nome}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{data.count} itens</span>
                    </div>
                    <span className="text-destructive font-bold">{fmtBRL(data.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drift por Categoria */}
          {Object.keys(d.categoriasDrift).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground mb-3">Drift por Categoria</p>
              <div className="space-y-2">
                {Object.entries(d.categoriasDrift).sort((a, b) => a[1] - b[1]).map(([cat, val]) => (
                  <div key={cat} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{cat}</span>
                    <span className={`font-bold ${val < 0 ? 'text-destructive' : 'text-success'}`}>{fmtBRL(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tendência */}
          {d.finalizados.length > 1 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground mb-3">Tendência de Acurácia</p>
              <div className="flex items-end gap-2 h-24">
                {[...d.finalizados].reverse().slice(-8).map(h => (
                  <div key={h.id} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-primary/20 rounded-t relative" style={{ height: `${Math.max(5, Number(h.acuracia_percent))}%` }}>
                      <div className="w-full bg-primary rounded-t absolute bottom-0" style={{ height: `${Number(h.acuracia_percent)}%` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{formatInBR(parseLocalDate(h.data), 'dd/MM')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top critical */}
          {d.topCriticos.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-foreground mb-3">🚨 Top Itens Críticos</p>
              <div className="space-y-2">
                {d.topCriticos.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-destructive/5 rounded-lg p-2.5">
                    <span className="text-xs text-foreground font-medium">{item.produtos?.nome_produto || 'Item'}</span>
                    <span className="text-xs text-destructive font-bold">{fmtBRL(item.impacto_financeiro)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {d.historico.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum inventário encontrado</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
