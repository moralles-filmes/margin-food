import { useMemo, useState } from 'react';
import { MetaCompraMensal, SalmonEntry } from '@/types/salmon';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DecimalInput } from '@/components/ui/decimal-input';
import { CurrencyInput } from '@/components/ui/brl-input';
import { DollarSign, Settings2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { startOfMonth, endOfMonth, getDaysInMonth } from 'date-fns';
import { getWeeksOfMonth } from './WeeklyBreakdown';
import { parseLocalDate } from '@/lib/dateUtils';
import { formatDateBR, formatInBR } from '@/lib/datetime';

export function getMetaStatus(percent: number, amarelo: number, vermelho: number) {
  if (percent >= vermelho) return 'estourado';
  if (percent >= amarelo) return 'perto';
  return 'boa';
}

/** Weekly-based projection */
export interface ProjecaoResult {
  gastoMes: number;
  diasNoMes: number;
  semanasNoMes: number;
  semanasDecorridas: number;
  semanasRestantes: number;
  mediaSemanal: number;
  projecaoFimMes: number;
  difMeta: number;
  statusProjecao: 'boa' | 'perto' | 'estourado';
  restanteMeta: number;
  mesEncerrado: boolean;
  metaEstourada: boolean;
  ritmoIdealSemanal: number;
}

export function calcProjecao(
  entries: SalmonEntry[],
  mesAno: string,
  meta: MetaCompraMensal | null,
  extraValue = 0
): ProjecaoResult {
  const [year, month] = mesAno.split('-').map(Number);
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const diasNoMes = getDaysInMonth(new Date(year, month - 1));
  const weeks = getWeeksOfMonth(year, month);
  const semanasNoMes = weeks.length;
  const todayStr = formatDateBR(); // yyyy-MM-dd in BR timezone
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const isCurrentMonth = tY === year && tM === month;
  const currentDay = isCurrentMonth ? tD : (new Date(tY, tM - 1, tD) > monthEnd ? diasNoMes : 0);

  // Count elapsed weeks (a week is "elapsed" if currentDay > endDay, or partially elapsed if we're in it)
  let semanasDecorridas = 0;
  for (const w of weeks) {
    if (currentDay >= w.startDay) semanasDecorridas++;
  }
  semanasDecorridas = Math.max(1, semanasDecorridas);

  const mesEncerrado = !isCurrentMonth && new Date(tY, tM - 1, tD) > monthEnd;
  if (mesEncerrado) {
    // All weeks elapsed
    // semanasDecorridas = semanasNoMes; // already handled
  }

  const monthEntries = entries.filter(e => {
    const d = parseLocalDate(e.date);
    return d >= monthStart && d <= monthEnd;
  });

  const gastoMes = monthEntries.reduce((s, e) => s + e.totalValue, 0) + extraValue;

  const mediaSemanal = gastoMes / Math.max(1, mesEncerrado ? semanasNoMes : semanasDecorridas);
  const projecaoFimMes = mediaSemanal * semanasNoMes;

  const metaValor = meta?.metaValorCompra || 0;
  const amarelo = meta?.alertaAmareloPercent || 85;
  const vermelho = meta?.alertaVermelhoPercent || 100;
  const restanteMeta = metaValor - gastoMes;
  const metaEstourada = restanteMeta <= 0 && metaValor > 0;

  // Weeks remaining (weeks where currentDay <= endDay)
  const semanasRestantes = weeks.filter(w => currentDay <= w.endDay).length;
  const ritmoIdealSemanal = metaEstourada || mesEncerrado || semanasRestantes <= 0 ? 0 : restanteMeta / semanasRestantes;

  const pctProj = metaValor > 0 ? (projecaoFimMes / metaValor) * 100 : 0;

  return {
    gastoMes,
    diasNoMes,
    semanasNoMes,
    semanasDecorridas,
    semanasRestantes,
    mediaSemanal,
    projecaoFimMes,
    difMeta: metaValor - projecaoFimMes,
    statusProjecao: metaValor > 0 ? getMetaStatus(pctProj, amarelo, vermelho) : 'boa',
    restanteMeta,
    mesEncerrado,
    metaEstourada,
    ritmoIdealSemanal,
  };
}

export function useMetaMensal(entries: SalmonEntry[], metas: MetaCompraMensal[], targetMonth?: string, categoria = 'salmao') {
  return useMemo(() => {
    const mesAno = targetMonth || formatDateBR(new Date()).slice(0, 7);
    const meta = metas.find(m => m.mesAno === mesAno && m.categoria === categoria);
    const proj = calcProjecao(entries, mesAno, meta);

    if (!meta) return { meta: null, gastoMes: proj.gastoMes, mesAno, percentual: 0, restante: 0, status: 'sem-meta' as const, projecao: proj };

    const percentual = meta.metaValorCompra > 0 ? (proj.gastoMes / meta.metaValorCompra) * 100 : 0;
    const restante = meta.metaValorCompra - proj.gastoMes;
    const status = getMetaStatus(percentual, meta.alertaAmareloPercent, meta.alertaVermelhoPercent);

    return { meta, gastoMes: proj.gastoMes, mesAno, percentual, restante, status, projecao: proj };
  }, [entries, metas, targetMonth, categoria]);
}

interface MetaCompraCardProps {
  entries: SalmonEntry[];
  metas: MetaCompraMensal[];
  onSaveMeta: (meta: Omit<MetaCompraMensal, 'id' | 'createdAt'>) => void;
  targetMonth?: string;
  compact?: boolean;
  periodIsMonth?: boolean;
  categoria?: string;
  canManage?: boolean;
  saving?: boolean;
  /** Server-side gasto total — if provided, overrides client-side calculation */
  serverGasto?: number;
  spendLoading?: boolean;
}

import { fmtBRL, formatPercentBR } from '@/lib/formatters';
const fmtR = (v: number) => fmtBRL(v);

export default function MetaCompraCard({ entries, metas, onSaveMeta, targetMonth, compact, periodIsMonth = true, categoria = 'salmao', canManage = true, saving = false, serverGasto, spendLoading }: MetaCompraCardProps) {
  const metaData = useMetaMensal(entries, metas, targetMonth, categoria);
  // Use server-side gasto if available, otherwise fall back to client-side
  const gastoMes = serverGasto !== undefined ? serverGasto : metaData.gastoMes;
  const { meta, mesAno } = metaData;
  const percentual = meta ? (meta.metaValorCompra > 0 ? (gastoMes / meta.metaValorCompra) * 100 : 0) : 0;
  const restante = meta ? meta.metaValorCompra - gastoMes : 0;
  const status = meta ? getMetaStatus(percentual, meta.alertaAmareloPercent, meta.alertaVermelhoPercent) : 'sem-meta' as const;
  const [editing, setEditing] = useState(false);
  const [formValor, setFormValor] = useState('');
  const [formAmarelo, setFormAmarelo] = useState('85');
  const [formVermelho, setFormVermelho] = useState('100');

  if (!periodIsMonth) {
    return (
      <div className="bg-card border border-border rounded-xl p-3 text-center">
        <p className="text-[11px] text-muted-foreground">Meta mensal é exibida por mês. Selecione "Mês" para ver a meta do período.</p>
      </div>
    );
  }

  const startEdit = () => {
    setFormValor(meta ? String(meta.metaValorCompra) : '');
    setFormAmarelo(meta ? String(meta.alertaAmareloPercent) : '85');
    setFormVermelho(meta ? String(meta.alertaVermelhoPercent) : '100');
    setEditing(true);
  };

  const handleSave = () => {
    if (saving) return;
    const valor = Number(formValor);
    if (!valor || valor <= 0) return;
    onSaveMeta({
      mesAno,
      categoria,
      metaValorCompra: valor,
      alertaAmareloPercent: Number(formAmarelo) || 85,
      alertaVermelhoPercent: Number(formVermelho) || 100,
    });
    setEditing(false);
  };

  const statusConfig = {
    'boa': { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', border: 'border-success/30', label: '✅ Boa' },
    'perto': { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30', label: '⚠️ Chegando perto' },
    'estourado': { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', label: '❌ Estourado' },
    'sem-meta': { icon: DollarSign, color: 'text-muted-foreground', bg: 'bg-secondary', border: 'border-border', label: 'Meta não configurada' },
  };

  const cfg = statusConfig[status];
  const StatusIcon = cfg.icon;
  const monthLabel = formatInBR(new Date(mesAno + '-01T12:00:00'), 'MMMM yyyy');

  if (editing) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-scale-in">
        <p className="text-xs font-semibold text-foreground">Definir Meta de Compra — {monthLabel}</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">Meta (R$)</Label>
            <CurrencyInput value={formValor} onValueChange={(raw) => setFormValor(raw)} showPrefix maxDecimals={2} placeholder="0,00" className="bg-secondary border-border text-foreground" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Amarelo (%)</Label>
            <DecimalInput value={formAmarelo} onValueChange={(raw) => setFormAmarelo(raw)} maxDecimals={1} placeholder="85" className="bg-secondary border-border text-foreground" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Vermelho (%)</Label>
            <DecimalInput value={formVermelho} onValueChange={(raw) => setFormVermelho(raw)} maxDecimals={1} placeholder="100" className="bg-secondary border-border text-foreground" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
          <Button size="sm" className="gradient-salmon text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Meta'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${cfg.bg} border ${cfg.border} rounded-xl p-3 space-y-2 animate-fade-up`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <StatusIcon className={`w-4 h-4 ${cfg.color}`} />
          <span className="text-xs font-semibold text-foreground">Meta de Compra — {monthLabel}</span>
        </div>
        {canManage && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground gap-1" onClick={startEdit}>
            <Settings2 className="w-3 h-3" /> Editar
          </Button>
        )}
      </div>

      {status === 'sem-meta' ? (
        <div className="text-center py-2">
          <p className="text-[11px] text-muted-foreground">Meta do mês não configurada</p>
          {canManage && (
            <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={startEdit}>Definir Meta</Button>
          )}
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>Gasto atual</span>
              <span>{formatPercentBR(percentual)}</span>
            </div>
            <Progress value={Math.min(percentual, 100)} className="h-2" />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              {fmtR(gastoMes)} de {fmtR(meta!.metaValorCompra)}
            </span>
            <span className={`font-bold ${cfg.color}`}>
              {restante >= 0
                ? `Restam ${fmtR(restante)}`
                : `Excedido ${fmtR(Math.abs(restante))}`
              }
            </span>
          </div>
        </>
      )}
    </div>
  );
}
