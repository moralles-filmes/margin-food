import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDataEvent } from '@/lib/dataEvents';
import { useCan } from '@/permissions/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, TrendingUp, TrendingDown, Activity, FileDown, Ban, ExternalLink, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gerarPDFFluxoCaixa } from '@/lib/pdfFinanceiro';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { formatDateISO } from '@/lib/datetime';
import { useScopedToast } from '@/hooks/useScopedToast';
import * as XLSX from '@/lib/safeXlsx';

/* ─── Types ─── */
type EntidadeTipo = 'lancamento' | 'conta_pagar' | 'conta_receber';

export interface FluxoNavigateParams {
  tab: 'lancamentos' | 'pagar' | 'receber';
  dateFrom: string; // yyyy-MM-dd
  dateTo: string;   // yyyy-MM-dd
}

interface Detalhe {
  id?: string;
  entidade_tipo?: EntidadeTipo;
  tipo: 'realizado' | 'previsto';
  descricao: string;
  valor: number;
  natureza: 'entrada' | 'saida';
  origem: string;
}

interface DiaCashflow {
  data: string;
  entradas: number;
  saidas: number;
  prev_entradas: number;
  prev_saidas: number;
  detalhes: Detalhe[];
}

interface Totais {
  entradas: number;
  saidas: number;
  prev_entradas: number;
  prev_saidas: number;
  saldo_acumulado: number;
}

interface FluxoCaixaProps {
  onNavigate?: (params: FluxoNavigateParams) => void;
}

const origemBadge: Record<string, { text: string; cls: string }> = {
  manual: { text: 'Manual', cls: 'bg-muted text-muted-foreground border-border' },
  conciliacao: { text: 'Conciliação', cls: 'bg-primary/10 text-primary border-primary/20' },
  espelho_cp: { text: 'Espelho CP', cls: 'bg-warning/10 text-warning border-warning/20' },
  espelho_cr: { text: 'Espelho CR', cls: 'bg-success/10 text-success border-success/20' },
  transferencia: { text: 'Transferência', cls: 'bg-accent text-accent-foreground border-border' },
  ajuste_pagamento: { text: 'Ajuste', cls: 'bg-info/10 text-info border-info/20' },
  conta_pagar: { text: 'Conta a Pagar', cls: 'bg-warning/10 text-warning border-warning/20' },
  conta_receber: { text: 'Conta a Receber', cls: 'bg-success/10 text-success border-success/20' },
  conta_pagar_vencida: { text: 'Pagar (Vencida)', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
  conta_receber_vencida: { text: 'Receber (Vencida)', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
};


function SkeletonRows() {
  return (<>{Array.from({ length: 6 }).map((_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 6 }).map((_, j) => (
        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
  ))}</>);
}

function NoAccess() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Ban className="w-5 h-5 mr-2" /> Acesso negado
    </div>
  );
}

export default function FluxoCaixaSection({ onNavigate }: FluxoCaixaProps) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:fluxo:view');
  const canExport = useCan('financeiro:fluxo:export');

  const [dias, setDias] = useState<DiaCashflow[]>([]);
  const [totais, setTotais] = useState<Totais>({ entradas: 0, saidas: 0, prev_entradas: 0, prev_saidas: 0, saldo_acumulado: 0 });
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<'realizado' | 'previsto' | 'ambos'>('ambos');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const navigateToDate = (date: string) => {
    if (!onNavigate) return;
    onNavigate({ tab: 'lancamentos', dateFrom: date, dateTo: date });
  };

  const navigateToDetail = (det: Detalhe, date: string) => {
    if (!onNavigate || !det.entidade_tipo) return;
    const tab = det.entidade_tipo === 'conta_pagar' ? 'pagar'
      : det.entidade_tipo === 'conta_receber' ? 'receber'
      : 'lancamentos';
    onNavigate({ tab, dateFrom: date, dateTo: date });
  };

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    const hoje = new Date();
    const inicio = formatDateISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    const fimProj = formatDateISO(new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0));

    const { data, error } = await supabase.rpc('get_fin_cashflow', { p_inicio: inicio, p_fim: fimProj });
    if (error) { toast.error('Erro ao carregar fluxo de caixa'); console.error(error); setLoading(false); return; }
    // RULE FIN-FLUXO: RPC is the source of truth for daily cash flow
    const result = data as unknown as { dias?: DiaCashflow[]; totais?: Totais } | null;
    setDias(result?.dias || []);
    setTotais(result?.totais || { entradas: 0, saidas: 0, prev_entradas: 0, prev_saidas: 0, saldo_acumulado: 0 });
    setLoading(false);
  }, [canView, supabase, toast]);

  useEffect(() => { load(); }, [load]);
  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:pagar', load);
  useDataEvent('financeiro:receber', load);
  useDataEvent('financeiro:conciliacao', load);

  const filteredFluxo = useMemo(() => {
    if (modo === 'ambos') return dias;
    return dias.map(d => {
      if (modo === 'realizado') return { ...d, prev_entradas: 0, prev_saidas: 0 };
      return { ...d, entradas: 0, saidas: 0 };
    }).filter(d => {
      if (modo === 'realizado') return d.entradas > 0 || d.saidas > 0;
      return d.prev_entradas > 0 || d.prev_saidas > 0;
    });
  }, [dias, modo]);

  const saldoAcumulado = totais.entradas - totais.saidas;
  const saldoProjetado = (totais.entradas + totais.prev_entradas) - (totais.saidas + totais.prev_saidas);

  if (!canView) return <NoAccess />;

  const toggleExpand = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const fmt = fmtBRL;

  const exportExcel = () => {
    const rows = filteredFluxo.map(d => ({
      Data: formatDateBR(parseLocalDate(d.data)),
      Entradas: d.entradas,
      Saídas: d.saidas,
      'Prev. Entradas': d.prev_entradas,
      'Prev. Saídas': d.prev_saidas,
      'Saldo Dia': (d.entradas + d.prev_entradas) - (d.saidas + d.prev_saidas),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fluxo de Caixa');
    XLSX.writeFile(wb, 'fluxo_de_caixa.xlsx');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Fluxo de Caixa</h2>
          <p className="text-sm text-muted-foreground">Real + Projetado (2 meses)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={() => gerarPDFFluxoCaixa({ periodo: 'Real + Projetado (2 meses)', totais: { entradas: totais.entradas, saidas: totais.saidas, previstoEntradas: totais.prev_entradas, previstoSaidas: totais.prev_saidas }, linhas: filteredFluxo.map(l => ({ data: l.data, entradas: l.entradas, saidas: l.saidas, previstoEntradas: l.prev_entradas, previstoSaidas: l.prev_saidas, saldoPrevisto: (l.entradas + l.prev_entradas) - (l.saidas + l.prev_saidas) })) })} disabled={filteredFluxo.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={filteredFluxo.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
          <Select value={modo} onValueChange={v => setModo(v as 'realizado' | 'previsto' | 'ambos')}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos">Real + Previsto</SelectItem>
              <SelectItem value="realizado">Só Realizado</SelectItem>
              <SelectItem value="previsto">Só Previsto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {modo !== 'previsto' && (
          <>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-success" /><span className="text-[11px] text-muted-foreground">Entradas Realizadas</span></div>
              <p className="text-lg font-bold text-success">{fmt(totais.entradas)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-destructive" /><span className="text-[11px] text-muted-foreground">Saídas Realizadas</span></div>
              <p className="text-lg font-bold text-destructive">{fmt(totais.saidas)}</p>
            </CardContent></Card>
          </>
        )}
        {modo === 'previsto' && (
          <>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-success/80" /><span className="text-[11px] text-muted-foreground">Prev. Entradas</span></div>
              <p className="text-lg font-bold text-success/80">{fmt(totais.prev_entradas)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingDown className="w-4 h-4 text-destructive/80" /><span className="text-[11px] text-muted-foreground">Prev. Saídas</span></div>
              <p className="text-lg font-bold text-destructive/80">{fmt(totais.prev_saidas)}</p>
            </CardContent></Card>
          </>
        )}
        {modo !== 'previsto' && (
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-primary" /><span className="text-[11px] text-muted-foreground">Saldo Real</span></div>
            <p className={`text-lg font-bold ${saldoAcumulado >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(saldoAcumulado)}</p>
          </CardContent></Card>
        )}
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-primary" /><span className="text-[11px] text-muted-foreground">Saldo Acumulado</span></div>
          <p className={`text-lg font-bold ${totais.saldo_acumulado >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(totais.saldo_acumulado)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Activity className="w-4 h-4 text-warning" /><span className="text-[11px] text-muted-foreground">Saldo Projetado</span></div>
          <p className={`text-lg font-bold ${saldoProjetado >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(saldoProjetado)}</p>
        </CardContent></Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            {modo !== 'previsto' && <TableHead className="text-right">Entradas</TableHead>}
            {modo !== 'previsto' && <TableHead className="text-right">Saídas</TableHead>}
            {modo !== 'realizado' && <TableHead className="text-right">Prev. Entradas</TableHead>}
            {modo !== 'realizado' && <TableHead className="text-right">Prev. Saídas</TableHead>}
            <TableHead className="text-right">Saldo Dia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <SkeletonRows />
          ) : filteredFluxo.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem movimentações no período</TableCell></TableRow>
          ) : filteredFluxo.map(d => {
            const isExpanded = expandedDates.has(d.data);
            const saldoDia = modo === 'realizado'
              ? d.entradas - d.saidas
              : modo === 'previsto'
                ? d.prev_entradas - d.prev_saidas
                : (d.entradas + d.prev_entradas) - (d.saidas + d.prev_saidas);

            const detalhes = (d.detalhes || []).filter(det => {
              if (modo === 'realizado') return det.tipo === 'realizado';
              if (modo === 'previsto') return det.tipo === 'previsto';
              return true;
            });

            return (
              <tr key={`group-${d.data}`} style={{ display: 'contents' }}>
                <TableRow className="cursor-pointer hover:bg-muted/60" onClick={() => toggleExpand(d.data)}>
                  <TableCell className="font-mono text-sm">
                    <span className="mr-1 text-muted-foreground">{isExpanded ? '▾' : '▸'}</span>
                    {formatDateBR(parseLocalDate(d.data))}
                    {onNavigate && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-5 w-5 ml-1 inline-flex align-middle"
                        title="Ver lançamentos do dia"
                        onClick={e => { e.stopPropagation(); navigateToDate(d.data); }}
                      >
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    )}
                  </TableCell>
                  {modo !== 'previsto' && <TableCell className="text-right text-success">{d.entradas > 0 ? fmt(d.entradas) : '—'}</TableCell>}
                  {modo !== 'previsto' && <TableCell className="text-right text-destructive">{d.saidas > 0 ? fmt(d.saidas) : '—'}</TableCell>}
                  {modo !== 'realizado' && <TableCell className="text-right text-success/80">{d.prev_entradas > 0 ? fmt(d.prev_entradas) : '—'}</TableCell>}
                  {modo !== 'realizado' && <TableCell className="text-right text-destructive/80">{d.prev_saidas > 0 ? fmt(d.prev_saidas) : '—'}</TableCell>}
                  <TableCell className={`text-right font-bold ${saldoDia >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(saldoDia)}</TableCell>
                </TableRow>
                {isExpanded && detalhes.map((det, i) => {
                  const ob = origemBadge[det.origem] || origemBadge.manual;
                  const colCount = 2 + (modo !== 'previsto' ? 2 : 0) + (modo !== 'realizado' ? 2 : 0);
                  return (
                    <TableRow
                      key={`${d.data}-det-${i}`}
                      className={`bg-muted/20 ${onNavigate && det.entidade_tipo ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                      onClick={() => onNavigate && det.entidade_tipo && navigateToDetail(det, d.data)}
                    >
                      <TableCell className="pl-8 text-xs text-muted-foreground whitespace-normal break-words max-w-xs">
                        {onNavigate && det.entidade_tipo && <ExternalLink className="w-3 h-3 inline mr-1 opacity-40" />}
                        {det.descricao || '(sem descrição)'}
                      </TableCell>
                      <TableCell colSpan={colCount - 2} className="text-right">
                        <span className={`text-xs font-medium ${det.natureza === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                          {det.natureza === 'entrada' ? '+' : '-'} {fmt(det.valor)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${ob.cls}`}>{ob.text}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </tr>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
