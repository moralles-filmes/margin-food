import { useState, useEffect, useCallback } from 'react';
import { calcVariacaoPct } from '@/domain/financeiro';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatInBR, fmtBRL, formatPercentBR, formatDecimalBR, formatDateBR } from '@/lib/formatters';
import { subMonths } from 'date-fns';
import { RefreshCw, ArrowRight, Equal, FileDown, Ban, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fmtBRLCompact } from '@/lib/money';
import { useCan } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import * as XLSX from '@/lib/safeXlsx';

/* ─── Types ─── */
type ComparativoPeriodo = {
  mes: string;
  receita: number;
  despesa: number;
  resultado: number;
  margem: number;
  total_lancamentos: number;
};

type ComparativoGraficoItem = {
  indicador: string;
  periodo_a: number;
  periodo_b: number;
};

type ComparativoCategoriaItem = {
  categoria: string;
  valor_a: number;
  valor_b: number;
  variacao_pct: number;
};

type ComparativoResponse = {
  periodo_a: ComparativoPeriodo;
  periodo_b: ComparativoPeriodo;
  variacoes: {
    receita_pct: number;
    despesa_pct: number;
    resultado_pct: number;
    margem_pp: number;
    lancamentos_pct: number;
  };
  grafico: ComparativoGraficoItem[];
  breakdown_categorias: ComparativoCategoriaItem[];
};

function NoAccess() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Ban className="w-5 h-5 mr-2" /> Acesso negado
    </div>
  );
}

function formatMesLabel(mes: string): string {
  if (!mes) return '';
  const [y, m] = mes.split('-');
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${meses[Number(m) - 1]}/${y}`;
}

export default function ComparativoSection() {
  const canView = useCan('financeiro:comparativo:view');
  const canExport = useCan('financeiro:comparativo:export');

  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [mesA, setMesA] = useState(formatInBR(new Date(), 'yyyy-MM'));
  const [mesB, setMesB] = useState(formatInBR(subMonths(new Date(), 1), 'yyyy-MM'));
  const [data, setData] = useState<ComparativoResponse | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const comparar = useCallback(async () => {
    if (!canView) return;
    if (!mesA || !mesB) { toast.error('Selecione os dois períodos'); return; }
    if (mesA === mesB) { toast.error('Selecione períodos diferentes para comparar.'); return; }
    if (loading) return;

    setLoading(true);
    setErrorState(false);
    try {
      const { data: result, error } = await supabase.rpc('comparativo_periodos', {
        p_mes_a: mesA,
        p_mes_b: mesB,
      });

      if (error) {
        console.error(error);
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Seu perfil não possui permissão para visualizar comparativos.');
        } else {
          toast.error('Erro ao carregar comparativo');
        }
        setErrorState(true);
        setLoading(false);
        return;
      }

      setData(result as unknown as ComparativoResponse);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar comparativo');
      setErrorState(true);
    }
    setLoading(false);
  }, [canView, mesA, mesB]);

  // Auto-load on mount
  useEffect(() => {
    if (mesA && mesB && mesA !== mesB) comparar();
  }, []);

  // Auto-refresh
  useDataEvent('financeiro:lancamentos', comparar);
  useDataEvent('financeiro:cadastros', comparar);
  useDataEvent('financeiro:conciliacao', comparar);

  if (!canView) return <NoAccess />;

  const fmt = fmtBRL;

  // RULE FIN-COMPARATIVO: uses official calcVariacaoPct for consistency
  const variacao = (pct: number) => {
    if (pct === 0) return '—';
    return `${pct >= 0 ? '+' : ''}${formatPercentBR(pct)}`;
  };

  const varColor = (pct: number, inverso = false) => {
    if (pct === 0) return 'text-muted-foreground';
    const positivo = inverso ? pct < 0 : pct > 0;
    return positivo ? 'text-success' : 'text-destructive';
  };

  const pa = data?.periodo_a;
  const pb = data?.periodo_b;
  const v = data?.variacoes;

  const linhas = pa && pb && v ? [
    { label: 'Receita', a: pa.receita, b: pb.receita, pct: v.receita_pct },
    { label: 'Despesa', a: pa.despesa, b: pb.despesa, pct: v.despesa_pct, inverso: true },
    { label: 'Resultado', a: pa.resultado, b: pb.resultado, pct: v.resultado_pct },
    { label: 'Margem', a: pa.margem, b: pb.margem, pp: v.margem_pp, isPct: true },
    { label: 'Lançamentos', a: pa.total_lancamentos, b: pb.total_lancamentos, pct: v.lancamentos_pct, isNum: true },
  ] : [];

  const mesALabel = formatMesLabel(mesA);
  const mesBLabel = formatMesLabel(mesB);

  const exportExcel = async () => {
    if (exportingExcel || !data) return;
    setExportingExcel(true);
    try {
      const wb = XLSX.utils.book_new();

      // Comparativo
      const compRows = linhas.map(l => ({
        Indicador: l.label,
        [mesALabel]: l.isNum ? l.a : l.isPct ? `${formatDecimalBR(l.a, 1)}%` : l.a,
        [mesBLabel]: l.isNum ? l.b : l.isPct ? `${formatDecimalBR(l.b, 1)}%` : l.b,
        'Variação': l.isPct ? `${formatDecimalBR(l.pp ?? 0, 1)}pp` : variacao(l.pct ?? 0),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compRows), 'Comparativo');

      // Categorias
      if (data.breakdown_categorias?.length > 0) {
        const catRows = data.breakdown_categorias.map(c => ({
          Categoria: c.categoria,
          [mesALabel]: c.valor_a,
          [mesBLabel]: c.valor_b,
          'Variação %': formatDecimalBR(c.variacao_pct, 1),
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), 'Categorias');
      }

      XLSX.writeFile(wb, 'comparativo_periodos.xlsx');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportPdf = async () => {
    if (exportingPdf || !data) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('Comparativo Período vs Período', 14, 15);
      doc.setFontSize(9);
      doc.text(`${mesALabel} vs ${mesBLabel}`, 14, 23);

      autoTable(doc, {
        startY: 30,
        head: [['Indicador', mesALabel, mesBLabel, 'Variação']],
        body: linhas.map(l => [
          l.label,
          l.isNum ? String(l.a) : l.isPct ? `${formatDecimalBR(l.a, 1)}%` : fmt(l.a),
          l.isNum ? String(l.b) : l.isPct ? `${formatDecimalBR(l.b, 1)}%` : fmt(l.b),
          l.isPct ? `${formatDecimalBR(l.pp ?? 0, 1)}pp` : variacao(l.pct ?? 0),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      if (data.breakdown_categorias?.length > 0) {
        const lastY = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY || 80;
        doc.setFontSize(11);
        doc.text('Categorias com maior variação', 14, lastY + 10);
        autoTable(doc, {
          startY: lastY + 15,
          head: [['Categoria', mesALabel, mesBLabel, 'Variação %']],
          body: data.breakdown_categorias.map(c => [
            c.categoria,
            fmt(c.valor_a),
            fmt(c.valor_b),
            `${formatDecimalBR(c.variacao_pct, 1)}%`,
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 41, 59] },
        });
      }

      doc.save('comparativo_periodos.pdf');
    } finally {
      setExportingPdf(false);
    }
  };

  const isMesABeforeB = mesA && mesB && mesB < mesA;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Comparativo Período vs Período</h2>
          <p className="text-sm text-muted-foreground">Compare indicadores entre dois meses</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && data && (
            <>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel}>
                <FileDown className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs">Período A</Label>
              <Input type="month" value={mesA} onChange={e => setMesA(e.target.value)} className="w-40" />
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground mb-2" />
            <div>
              <Label className="text-xs">Período B</Label>
              <Input type="month" value={mesB} onChange={e => setMesB(e.target.value)} className="w-40" />
            </div>
            <Button size="sm" onClick={comparar} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Comparar
            </Button>
          </div>
          {isMesABeforeB && (
            <p className="text-xs text-muted-foreground mt-2">
              Nota: Período B é mais antigo que Período A.
            </p>
          )}
        </CardContent>
      </Card>

      {errorState && !loading ? (
        <Card className="border-destructive/50">
          <CardContent className="p-8 text-center text-destructive">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Erro ao carregar comparativo</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={comparar}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : loading && !data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : data && pa && pb && v ? (
        <>
          {/* Comparison cards */}
          <div className="space-y-3">
            {linhas.map(linha => {
              const color = linha.isPct
                ? varColor(linha.pp ?? 0)
                : varColor(linha.pct ?? 0, linha.inverso);
              return (
                <Card key={linha.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm w-28">{linha.label}</span>
                      <div className="flex items-center gap-4 flex-1 justify-end">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{mesALabel}</p>
                          <p className="font-bold">
                            {linha.isNum ? linha.a : linha.isPct ? `${formatDecimalBR(linha.a, 1)}%` : fmt(linha.a)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{mesBLabel}</p>
                          <p className="font-bold">
                            {linha.isNum ? linha.b : linha.isPct ? `${formatDecimalBR(linha.b, 1)}%` : fmt(linha.b)}
                          </p>
                        </div>
                        <Badge variant="outline" className={`${color} min-w-[70px] justify-center`}>
                          {linha.isPct
                            ? `${formatDecimalBR(linha.pp ?? 0, 1)}pp`
                            : variacao(linha.pct ?? 0)
                          }
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Chart */}
          {data.grafico?.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Comparativo Visual</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.grafico}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="indicador" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtBRLCompact} />
                    <Tooltip formatter={(val: number) => fmt(val)} />
                    <Legend />
                    <Bar dataKey="periodo_a" name={mesALabel} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="periodo_b" name={mesBLabel} fill="hsl(var(--primary) / 0.4)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Category breakdown */}
          {data.breakdown_categorias?.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Categorias com Maior Variação (Despesas)</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">{mesALabel}</TableHead>
                      <TableHead className="text-right">{mesBLabel}</TableHead>
                      <TableHead className="text-right">Variação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.breakdown_categorias.map(c => (
                      <TableRow key={c.categoria}>
                        <TableCell className="text-sm">{c.categoria}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(c.valor_a)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(c.valor_b)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${varColor(c.variacao_pct, true)}`}>
                          {variacao(c.variacao_pct)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Equal className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Selecione dois períodos e clique em "Comparar"</p>
        </CardContent></Card>
      )}
    </div>
  );
}
