import { useState, useMemo } from 'react';
import { includesNormalized } from '@/lib/utils';
import { fmtBRL, fmtBRLRaw, formatPercentBR } from '@/lib/formatters';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { AuditoriaCompra } from '@/types/salmon';
import { format } from 'date-fns';
import { ShieldAlert, Download, Eye, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PeriodFilter, { PeriodRange, getDefaultRange, filterByPeriod } from './PeriodFilter';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

function parseLocalDate(d: string) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); }
const fmtR = (v: number) => fmtBRL(v);

const statusLabel: Record<string, { emoji: string; label: string; cls: string }> = {
  boa: { emoji: '✅', label: 'OK', cls: 'text-success' },
  perto: { emoji: '⚠️', label: 'Atenção', cls: 'text-warning' },
  estourado: { emoji: '❌', label: 'Estourado', cls: 'text-destructive' },
};

interface AuditViewProps {
  store: ReturnType<typeof useSalmonStore>;
}

export default function AuditView({ store }: AuditViewProps) {
  const { auditorias, entries } = store;
  const [period, setPeriod] = useState<PeriodRange>(getDefaultRange());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [onlyOverrides, setOnlyOverrides] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  // Filter auditorias by period using dataEntrada as date field
  const audWithDate = useMemo(() => auditorias.map(a => ({ ...a, date: a.dataEntrada })), [auditorias]);
  const filtered = useMemo(() => {
    let list = filterByPeriod(audWithDate, period);
    if (filterStatus !== 'all') {
      list = list.filter(a => a.statusMetaNoMomento === filterStatus);
    }
    if (onlyOverrides) {
      list = list.filter(a => a.overrideAlerta);
    }
    if (filterSupplier) {
      list = list.filter(a => includesNormalized(a.fornecedor, filterSupplier));
    }
    return list;
  }, [audWithDate, period, filterStatus, onlyOverrides, filterSupplier]);

  // KPIs
  const kpis = useMemo(() => {
    const atencao = filtered.filter(a => a.statusMetaNoMomento === 'perto');
    const estourado = filtered.filter(a => a.statusMetaNoMomento === 'estourado');
    const overrides = filtered.filter(a => a.overrideAlerta);
    const total = filtered.length;
    return {
      atencaoQtd: atencao.length,
      atencaoVal: atencao.reduce((s, a) => s + a.valorTotal, 0),
      estouradoQtd: estourado.length,
      estouradoVal: estourado.reduce((s, a) => s + a.valorTotal, 0),
      overrideQtd: overrides.length,
      overrideVal: overrides.reduce((s, a) => s + a.valorTotal, 0),
      overridePct: total > 0 ? (overrides.length / total) * 100 : 0,
    };
  }, [filtered]);

  const detailItem = detailId ? auditorias.find(a => a.id === detailId) : null;
  const detailEntry = detailItem ? entries.find(e => e.id === detailItem.entradaId) : null;

  const exportCSV = () => {
    const headers = ['Data', 'Valor', 'Fornecedor', 'Status Meta', 'Status Projeção', 'Status Semana', 'Override', 'Tipo Override', 'Motivo'];
    const rows = filtered.map(a => [
      a.dataEntrada, a.valorTotal, a.fornecedor,
      statusLabel[a.statusMetaNoMomento]?.label || '',
      statusLabel[a.statusProjecaoNoMomento]?.label || '',
      statusLabel[a.statusSemanaNoMomento]?.label || '',
      a.overrideAlerta ? 'Sim' : 'Não',
      a.overrideTipo.join(', '),
      a.overrideMotivo,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `auditoria_compras_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" /> Auditoria de Compras
          </h2>
          <p className="text-xs text-muted-foreground">{filtered.length} registros no período</p>
        </div>
        <Button onClick={exportCSV} size="sm" variant="outline" className="gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
      </div>

      <PeriodFilter current={period} onChange={setPeriod} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-warning/30 rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Atenção</p>
          <p className="text-lg font-display font-bold text-warning">{kpis.atencaoQtd}</p>
          <p className="text-[11px] text-muted-foreground">{fmtR(kpis.atencaoVal)}</p>
        </div>
        <div className="bg-card border border-destructive/30 rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Estourado</p>
          <p className="text-lg font-display font-bold text-destructive">{kpis.estouradoQtd}</p>
          <p className="text-[11px] text-muted-foreground">{fmtR(kpis.estouradoVal)}</p>
        </div>
        <div className="bg-card border border-primary/30 rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overrides</p>
          <p className="text-lg font-display font-bold text-primary">{kpis.overrideQtd}</p>
          <p className="text-[11px] text-muted-foreground">{fmtR(kpis.overrideVal)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">% Override</p>
          <p className="text-lg font-display font-bold text-foreground">{formatPercentBR(kpis.overridePct)}</p>
          <p className="text-[11px] text-muted-foreground">do total no período</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" /> Filtros
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Status</Label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="w-full h-8 rounded-md border border-border bg-secondary px-2 text-xs text-foreground">
              <option value="all">Todos</option>
              <option value="perto">Atenção</option>
              <option value="estourado">Estourado</option>
            </select>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Fornecedor</Label>
            <Input value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} placeholder="Buscar..." className="h-8 text-xs bg-secondary border-border" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={onlyOverrides} onChange={e => setOnlyOverrides(e.target.checked)} className="rounded" />
              Só overrides
            </label>
          </div>
        </div>
      </div>

      {/* Listing */}
      <div className="space-y-2">
        {filtered.map((a, i) => {
          const stMeta = statusLabel[a.statusMetaNoMomento];
          return (
            <div key={a.id} className="bg-card border border-border rounded-xl p-3 animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{a.fornecedor || '—'}</span>
                    {a.overrideAlerta && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-medium">OVERRIDE</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px]">
                    <span className="text-muted-foreground">{format(parseLocalDate(a.dataEntrada), 'dd/MM/yyyy')}</span>
                    <span className="text-warning font-medium">{fmtR(a.valorTotal)}</span>
                    <span className={stMeta.cls}>{stMeta.emoji} {stMeta.label}</span>
                  </div>
                  {a.overrideMotivo && (
                    <p className="text-[10px] text-muted-foreground italic mt-1">Motivo: {a.overrideMotivo}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setDetailId(a.id)}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum registro de auditoria no período</p>
        )}
      </div>

      {/* Detail drawer */}
      <AlertDialog open={!!detailId} onOpenChange={open => !open && setDetailId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" /> Detalhes da Auditoria
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {detailItem ? (
                <div className="space-y-3 text-left">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><span className="text-muted-foreground">Data:</span> <span className="text-foreground font-medium">{format(parseLocalDate(detailItem.dataEntrada), 'dd/MM/yyyy')}</span></div>
                    <div><span className="text-muted-foreground">Valor:</span> <span className="text-foreground font-medium">{fmtR(detailItem.valorTotal)}</span></div>
                    <div><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground font-medium">{detailItem.fornecedor || '—'}</span></div>
                    <div><span className="text-muted-foreground">Mês:</span> <span className="text-foreground font-medium">{detailItem.mesAno}</span></div>
                  </div>
                  <div className="border-t border-border pt-2 space-y-1.5">
                    <p className="text-xs font-semibold text-foreground">Status no momento do salvamento</p>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Meta</p>
                        <p className={statusLabel[detailItem.statusMetaNoMomento].cls}>
                          {statusLabel[detailItem.statusMetaNoMomento].emoji} {statusLabel[detailItem.statusMetaNoMomento].label}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Projeção</p>
                        <p className={statusLabel[detailItem.statusProjecaoNoMomento].cls}>
                          {statusLabel[detailItem.statusProjecaoNoMomento].emoji} {statusLabel[detailItem.statusProjecaoNoMomento].label}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Semana</p>
                        <p className={statusLabel[detailItem.statusSemanaNoMomento].cls}>
                          {statusLabel[detailItem.statusSemanaNoMomento].emoji} {statusLabel[detailItem.statusSemanaNoMomento].label}
                        </p>
                      </div>
                    </div>
                  </div>
                  {detailItem.overrideAlerta && (
                    <div className="border-t border-border pt-2 space-y-1">
                      <p className="text-xs font-semibold text-destructive">⚠️ Override confirmado</p>
                      <p className="text-[11px] text-muted-foreground">Tipo: {detailItem.overrideTipo.join(', ')}</p>
                      {detailItem.overrideMotivo && (
                        <p className="text-[11px] text-muted-foreground">Motivo: {detailItem.overrideMotivo}</p>
                      )}
                    </div>
                  )}
                  {detailEntry && (
                    <div className="border-t border-border pt-2 space-y-1">
                      <p className="text-xs font-semibold text-foreground">Dados da entrada</p>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div><span className="text-muted-foreground">Lote:</span> <span className="text-foreground">{detailEntry.lot || '—'}</span></div>
                        <div><span className="text-muted-foreground">SIF:</span> <span className="text-foreground">{detailEntry.sif || '—'}</span></div>
                        <div><span className="text-muted-foreground">Kg Bruto:</span> <span className="text-foreground">{detailEntry.grossKg}</span></div>
                        <div><span className="text-muted-foreground">R$/kg:</span> <span className="text-foreground">{fmtBRLRaw(detailEntry.pricePerKg || 0)}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              ) : <span>Carregando...</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
