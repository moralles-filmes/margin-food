import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useScopedToast } from '@/hooks/useScopedToast';
import { RefreshCw, TrendingUp, TrendingDown, Wallet, FileDown, Ban, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { axisProps, gridProps, tooltipProps, chartValueFormatters, makeActiveDot } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { useCan } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import * as XLSX from '@/lib/safeXlsx';

/* ─── Types ─── */
interface ProjecaoDia {
  data: string;
  saldo: number;
  entradas: number;
  saidas: number;
  receita_estimada?: number;
  despesa_estimada?: number;
  saldo_com_estimativa?: number;
}

/** Receita/despesa que não passam por títulos: média do mesmo dia da semana nas 4 semanas fechadas do Livro Razão. */
interface ProjecaoEstimativa {
  disponivel: boolean;
  janela_inicio: string | null;
  janela_fim: string | null;
  receita_estimada: number;
  despesa_estimada: number;
  saldo_final: number;
  dias_negativo: number;
  saldo_minimo: number;
}

interface ProjecaoResult {
  saldo_inicial: number;
  entradas: number;
  saidas: number;
  saldo_final: number;
  dias_negativo: number;
  saldo_minimo: number;
  estimativa?: ProjecaoEstimativa;
  timeline: ProjecaoDia[];
}

function NoAccess() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Ban className="w-5 h-5 mr-2" /> Acesso negado
    </div>
  );
}

function SkeletonKpis() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}><CardContent className="p-3"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-6 w-28" /></CardContent></Card>
      ))}
    </div>
  );
}


export default function ProjecaoFluxoSection() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:projecao:view');
  const canExport = useCan('financeiro:projecao:export');

  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [result, setResult] = useState<ProjecaoResult | null>(null);
  const [dias, setDias] = useState(30);
  const [saldoManual, setSaldoManual] = useState<number | null>(null);
  const [incluirEstimativa, setIncluirEstimativa] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const projetar = useCallback(async () => {
    if (!canView) return;
    if (loading) return;
    setLoading(true);
    setErrorState(false);
    try {
      const { data, error } = await supabase.rpc('get_fin_fluxo_projecao', {
        p_dias: dias,
        p_saldo_manual: saldoManual,
      });

      if (error) {
        console.error(error);
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Seu perfil não possui permissão para visualizar projeções.');
        } else {
          toast.error('Erro ao gerar projeção de fluxo de caixa');
        }
        setErrorState(true);
        setLoading(false);
        return;
      }

      const parsed = data as unknown as ProjecaoResult;
      setResult(parsed);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar projeção');
      setErrorState(true);
    }
    setLoading(false);
  }, [canView, dias, loading, saldoManual, supabase, toast]);

  // Auto-load on mount and when dias changes
  useEffect(() => {
    projetar();
  }, [dias]);

  // Auto-refresh on data events (debounced)
  const debouncedProjetar = useCallback(() => {
    const timer = setTimeout(projetar, 500);
    return () => clearTimeout(timer);
  }, [projetar]);

  useDataEvent('financeiro:lancamentos', projetar);
  useDataEvent('financeiro:pagar', projetar);
  useDataEvent('financeiro:receber', projetar);

  if (!canView) return <NoAccess />;

  const fmt = fmtBRL;

  const estimativa = result?.estimativa?.disponivel ? result.estimativa : null;
  const comEstimativa = incluirEstimativa && estimativa !== null;
  const timeline = (result?.timeline ?? []).map(d => ({
    ...d,
    receitaEstimada: comEstimativa ? d.receita_estimada ?? 0 : 0,
    despesaEstimada: comEstimativa ? d.despesa_estimada ?? 0 : 0,
    saldo: comEstimativa ? d.saldo_com_estimativa ?? d.saldo : d.saldo,
  }));
  const saldoInicial = result?.saldo_inicial ?? 0;
  const totalEntradas = result?.entradas ?? 0;
  const totalSaidas = result?.saidas ?? 0;
  const receitaEstimada = comEstimativa ? estimativa.receita_estimada : 0;
  const despesaEstimada = comEstimativa ? estimativa.despesa_estimada : 0;
  const saldoFinal = (comEstimativa ? estimativa.saldo_final : result?.saldo_final) ?? 0;
  const diasNegativo = (comEstimativa ? estimativa.dias_negativo : result?.dias_negativo) ?? 0;
  const saldoMin = (comEstimativa ? estimativa.saldo_minimo : result?.saldo_minimo) ?? 0;
  const janelaEstimativa = estimativa?.janela_inicio && estimativa.janela_fim
    ? `${formatDateBR(parseLocalDate(estimativa.janela_inicio))} a ${formatDateBR(parseLocalDate(estimativa.janela_fim))}`
    : null;

  const exportExcel = async () => {
    if (exportingExcel || timeline.length === 0) return;
    setExportingExcel(true);
    try {
      const rows = timeline.map(d => ({
        Data: formatDateBR(parseLocalDate(d.data)),
        Entradas: d.entradas,
        Saídas: d.saidas,
        ...(comEstimativa ? { 'Receita estimada': d.receitaEstimada, 'Despesa estimada': d.despesaEstimada } : {}),
        Saldo: d.saldo,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Projeção Fluxo');
      XLSX.writeFile(wb, 'projecao_fluxo_caixa.xlsx');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportPdf = async () => {
    if (exportingPdf || timeline.length === 0) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('Projeção de Fluxo de Caixa', 14, 15);
      doc.setFontSize(9);
      doc.text(`Horizonte: ${dias} dias | Saldo Inicial: ${fmt(saldoInicial)}`, 14, 23);
      if (comEstimativa && janelaEstimativa) {
        doc.text(`Inclui estimativa (média por dia da semana de ${janelaEstimativa}, fora de contas a pagar/receber)`, 14, 28);
      }

      autoTable(doc, {
        startY: comEstimativa ? 33 : 30,
        head: [comEstimativa
          ? ['Data', 'Entradas', 'Saídas', 'Receita estimada', 'Despesa estimada', 'Saldo']
          : ['Data', 'Entradas', 'Saídas', 'Saldo']],
        body: timeline.map(d => [
          formatDateBR(parseLocalDate(d.data)),
          fmt(d.entradas),
          fmt(d.saidas),
          ...(comEstimativa ? [fmt(d.receitaEstimada), fmt(d.despesaEstimada)] : []),
          fmt(d.saldo),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      doc.save('projecao_fluxo_caixa.pdf');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Projeção de Fluxo de Caixa</h2>
          <p className="text-sm text-muted-foreground">Contas pendentes (as vencidas entram no dia de hoje), lançamentos previstos e, opcionalmente, a estimativa do que entra e sai sem título</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">Saldo manual:</Label>
            <CurrencyInput
              showZero
              className="w-32 h-9"
              value={saldoManual == null ? '' : String(saldoManual)}
              onValueChange={(raw, parsed) => setSaldoManual(raw === '' ? null : parsed)}
              placeholder="Automático"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Switch id="projecao-estimativa" checked={incluirEstimativa} onCheckedChange={setIncluirEstimativa} />
            <Label htmlFor="projecao-estimativa" className="text-xs whitespace-nowrap">Incluir estimativa</Label>
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-xs whitespace-nowrap">Dias:</Label>
            <Select value={String(dias)} onValueChange={v => setDias(Number(v))}>
              <SelectTrigger className="w-20 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="60">60</SelectItem>
                <SelectItem value="90">90</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || timeline.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel || timeline.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
          <Button size="sm" onClick={projetar} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Projetar
          </Button>
        </div>
      </div>

      {errorState && !loading ? (
        <Card className="border-destructive/50">
          <CardContent className="p-8 text-center text-destructive">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Erro ao carregar projeção</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={projetar}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : loading && !result ? (
        <SkeletonKpis />
      ) : !result || timeline.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum dado para projeção</p>
          <p className="text-sm">Verifique se há lançamentos previstos ou contas pendentes no horizonte selecionado.</p>
        </CardContent></Card>
      ) : (
        <>
          <div className={`grid grid-cols-2 gap-3 ${comEstimativa ? 'md:grid-cols-4 xl:grid-cols-7' : 'md:grid-cols-5'}`}>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Saldo Inicial</p>
                <p className="text-lg font-bold">{fmt(saldoInicial)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3 text-success" /> Entradas</p>
                <p className="text-lg font-bold text-success">{fmt(totalEntradas)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3 text-destructive" /> Saídas</p>
                <p className="text-lg font-bold text-destructive">{fmt(totalSaidas)}</p>
              </CardContent>
            </Card>
            {comEstimativa && (
              <>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3 text-success" /> Receita estimada</p>
                    <p className="text-lg font-bold text-success">{fmt(receitaEstimada)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3 text-destructive" /> Despesa estimada</p>
                    <p className="text-lg font-bold text-destructive">{fmt(despesaEstimada)}</p>
                  </CardContent>
                </Card>
              </>
            )}
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Saldo Final</p>
                <p className={`text-lg font-bold ${saldoFinal >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(saldoFinal)}</p>
              </CardContent>
            </Card>
            <Card className={diasNegativo > 0 ? 'border-destructive/50' : ''}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Dias Negativo</p>
                <p className={`text-lg font-bold ${diasNegativo > 0 ? 'text-destructive' : 'text-success'} flex items-center gap-1`}>
                  {diasNegativo}
                  {diasNegativo > 0
                    ? <AlertTriangle className="w-4 h-4" />
                    : <CheckCircle2 className="w-4 h-4" />
                  }
                </p>
              </CardContent>
            </Card>
          </div>

          {incluirEstimativa && (
            <p className="text-xs text-muted-foreground">
              {comEstimativa && janelaEstimativa
                ? `Estimativa: média do mesmo dia da semana de ${janelaEstimativa} no Livro Razão (último dia com receita lançada), só com o que não passa por contas a pagar/receber — esses já entram pelo vencimento. Lucro de sócios e outros não operacionais ficam fora.`
                : 'Sem receita lançada no Livro Razão para estimar; a projeção usa só lançamentos previstos e contas pendentes.'}
            </p>
          )}

          <Card>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={timeline.map(d => ({ ...d, dataLabel: formatDateBR(parseLocalDate(d.data)) }))}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="dataLabel" {...axisProps} tickFormatter={v => v.slice(0, 5)} />
                  <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmt(Number(v))} />} />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="saldo" name="Saldo" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" strokeWidth={2} activeDot={makeActiveDot('hsl(var(--primary))')} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {saldoMin < 0 && (
            <Card className="border-destructive/50">
              <CardContent className="p-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
                <p className="text-sm font-medium text-destructive">
                  Atenção: Saldo mínimo projetado de {fmt(saldoMin)}. Considere antecipar recebimentos ou renegociar prazos.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
