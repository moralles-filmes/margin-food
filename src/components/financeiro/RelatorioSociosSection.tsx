import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { subMonths } from 'date-fns';
import { formatInBR, formatDateTimeBR, fmtBRL, formatPercentBR } from '@/lib/formatters';
import { FileDown, FileSpreadsheet, TrendingUp, TrendingDown, DollarSign, BarChart3, Loader2, CheckCircle2, AlertTriangle, ShieldX } from 'lucide-react';
import { useDataEvent } from '@/lib/dataEvents';
import { useCan } from '@/permissions/hooks';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from '@/lib/safeXlsx';

// ─── Types ───
type RankingItem = { nome: string; valor: number };

type RelatorioSociosResumo = {
  receita: number;
  despesa: number;
  resultado: number;
  margem: number;
  aReceber: number;
  aPagar: number;
  topDespesas: RankingItem[];
  topReceitas: RankingItem[];
};

// ─── PDF color constants ───
const PDF_PRIMARY_COLOR: [number, number, number] = [41, 128, 185];
const PDF_DESPESA_COLOR: [number, number, number] = [192, 57, 43];
const PDF_RECEITA_COLOR: [number, number, number] = [39, 174, 96];

// ─── Helpers ───
function formatMonthBR(value: string): string {
  // Parse "yyyy-MM" como data LOCAL (não UTC) — evita recuo de um mês no rótulo em BRT.
  const [y, m] = value.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── NoAccess ───
function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <ShieldX className="w-10 h-10 opacity-40" />
      <p className="font-medium">Acesso restrito</p>
      <p className="text-sm">Você não tem permissão para acessar o Relatório para Sócios.</p>
    </div>
  );
}

export default function RelatorioSociosSection() {
  const [mesAtual, setMesAtual] = useState(formatInBR(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(false);
  const [resumo, setResumo] = useState<RelatorioSociosResumo | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const canView = useCan('financeiro:relatorio-socios:view');
  const canExport = useCan('financeiro:relatorio-socios:export');

  const meses = useMemo(
    () => Array.from({ length: 12 }, (_, i) => formatInBR(subMonths(new Date(), i), 'yyyy-MM')),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('relatorio_socios_resumo', { p_mes: mesAtual });
      if (error) throw error;

      const d = data as unknown as Record<string, unknown>;
      const mapRanking = (arr: unknown): RankingItem[] =>
        (Array.isArray(arr) ? arr : []).map((t: Record<string, unknown>) => ({
          nome: String(t.nome || ''),
          valor: Number(t.valor || 0),
        }));

      setResumo({
        receita: Number(d.receita || 0),
        despesa: Number(d.despesa || 0),
        resultado: Number(d.resultado || 0),
        margem: Number(d.margem || 0),
        aReceber: Number(d.aReceber || d.a_receber || 0),
        aPagar: Number(d.aPagar || d.a_pagar || 0),
        topDespesas: mapRanking(d.topDespesas || d.top_despesas),
        topReceitas: mapRanking(d.topReceitas || d.top_receitas),
      });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar relatório');
    }
    setLoading(false);
  }, [mesAtual]);

  useEffect(() => { if (canView) load(); }, [load, canView]);

  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:cadastros', load);
  useDataEvent('financeiro:contas', load);

  const fmt = fmtBRL;
  // RULE FIN-MARGEM: official percentage calculation
  const pct = (v: number, base: number) => base > 0 ? formatPercentBR((v / base) * 100, 1) : '—';
  // Note: core margem is calculated server-side per FIN-MARGEM rule

  // ── PDF Export ──
  const gerarPDF = async () => {
    if (!resumo || exportingPdf) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF();
      const w = doc.internal.pageSize.getWidth();
      const mesLabel = formatMonthBR(mesAtual);

      doc.setFontSize(18);
      doc.text('Relatório Executivo — Sócios', w / 2, 20, { align: 'center' });
      doc.setFontSize(11);
      doc.text(`Competência: ${mesLabel}`, w / 2, 28, { align: 'center' });
      doc.text(`Gerado em: ${formatDateTimeBR(new Date())}`, w / 2, 34, { align: 'center' });

      doc.setFontSize(13);
      doc.text('Indicadores-Chave', 14, 48);

      autoTable(doc, {
        startY: 52,
        head: [['Indicador', 'Valor']],
        body: [
          ['Receita Total (competência)', fmt(resumo.receita)],
          ['Despesa Total (competência)', fmt(resumo.despesa)],
          ['Resultado (Lucro/Prejuízo)', fmt(resumo.resultado)],
          ['Margem', pct(resumo.resultado, resumo.receita)],
          ['A Receber no mês (pendente)', fmt(resumo.aReceber)],
          ['A Pagar no mês (pendente)', fmt(resumo.aPagar)],
        ],
        theme: 'grid',
        headStyles: { fillColor: PDF_PRIMARY_COLOR },
      });

      const y1 = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY || 100;

      if (resumo.topDespesas.length > 0) {
        doc.setFontSize(13);
        doc.text('Top Despesas por Categoria', 14, y1 + 12);
        autoTable(doc, {
          startY: y1 + 16,
          head: [['Categoria', 'Valor', '% da Despesa']],
          body: resumo.topDespesas.map(d => [d.nome, fmt(d.valor), pct(d.valor, resumo.despesa)]),
          theme: 'striped',
          headStyles: { fillColor: PDF_DESPESA_COLOR },
        });
      }

      const y2 = (doc as unknown as Record<string, Record<string, number>>).lastAutoTable?.finalY || y1 + 30;

      if (resumo.topReceitas.length > 0) {
        if (y2 > 230) doc.addPage();
        const startY = y2 > 230 ? 20 : y2 + 12;
        doc.setFontSize(13);
        doc.text('Top Receitas por Categoria', 14, startY);
        autoTable(doc, {
          startY: startY + 4,
          head: [['Categoria', 'Valor', '% da Receita']],
          body: resumo.topReceitas.map(r => [r.nome, fmt(r.valor), pct(r.valor, resumo.receita)]),
          theme: 'striped',
          headStyles: { fillColor: PDF_RECEITA_COLOR },
        });
      }

      doc.save(`relatorio-socios-${mesAtual}.pdf`);
      toast.success('PDF gerado com sucesso!');
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Excel Export ──
  const gerarExcel = async () => {
    if (!resumo || exportingExcel) return;
    setExportingExcel(true);
    try {
      const wb = XLSX.utils.book_new();

      const kpis = [
        ['Indicador', 'Valor'],
        ['Receita Total (competência)', resumo.receita],
        ['Despesa Total (competência)', resumo.despesa],
        ['Resultado (Lucro/Prejuízo)', resumo.resultado],
        ['Margem', pct(resumo.resultado, resumo.receita)],
        ['A Receber no mês (pendente)', resumo.aReceber],
        ['A Pagar no mês (pendente)', resumo.aPagar],
      ];
      const wsKpis = XLSX.utils.aoa_to_sheet(kpis);
      wsKpis['!cols'] = [{ wch: 30 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsKpis, 'KPIs');

      if (resumo.topDespesas.length > 0) {
        const despRows = [
          ['Categoria', 'Valor', '% da Despesa'],
          ...resumo.topDespesas.map(d => [d.nome, d.valor, pct(d.valor, resumo.despesa)]),
        ];
        const wsDeps = XLSX.utils.aoa_to_sheet(despRows);
        wsDeps['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsDeps, 'Top Despesas');
      }

      if (resumo.topReceitas.length > 0) {
        const recRows = [
          ['Categoria', 'Valor', '% da Receita'],
          ...resumo.topReceitas.map(r => [r.nome, r.valor, pct(r.valor, resumo.receita)]),
        ];
        const wsRec = XLSX.utils.aoa_to_sheet(recRows);
        wsRec['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsRec, 'Top Receitas');
      }

      XLSX.writeFile(wb, `relatorio-socios-${mesAtual}.xlsx`);
      toast.success('Excel gerado com sucesso!');
    } finally {
      setExportingExcel(false);
    }
  };

  if (!canView) return <NoAccess />;

  const cards = resumo ? [
    { label: 'Receita (competência)', value: resumo.receita, icon: TrendingUp, color: 'text-success' },
    { label: 'Despesa (competência)', value: resumo.despesa, icon: TrendingDown, color: 'text-destructive' },
    { label: 'Resultado', value: resumo.resultado, icon: DollarSign, color: resumo.resultado >= 0 ? 'text-success' : 'text-destructive' },
    { label: 'A Receber no mês', value: resumo.aReceber, icon: TrendingUp, color: 'text-primary' },
    { label: 'A Pagar no mês', value: resumo.aPagar, icon: TrendingDown, color: 'text-warning' },
  ] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Relatório para Sócios</h2>
          <p className="text-sm text-muted-foreground">Visão executiva mensal por competência • Transferências excluídas</p>
        </div>
        <div className="flex gap-2">
          <Select value={mesAtual} onValueChange={setMesAtual}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(m => (
                <SelectItem key={m} value={m}>{formatMonthBR(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canExport && resumo && (
            <>
              <Button variant="outline" size="sm" onClick={gerarPDF} disabled={exportingPdf}>
                <FileDown className="w-4 h-4 mr-1" /> {exportingPdf ? 'Gerando...' : 'PDF'}
              </Button>
              <Button variant="outline" size="sm" onClick={gerarExcel} disabled={exportingExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> {exportingExcel ? 'Gerando...' : 'Excel'}
              </Button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando dados...
          </CardContent>
        </Card>
      ) : !resumo ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum dado disponível para o período selecionado.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {cards.map(c => {
              const Icon = c.icon;
              return (
                <Card key={c.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${c.color}`} />
                      <span className="text-xs text-muted-foreground">{c.label}</span>
                    </div>
                    <p className={`text-lg font-bold ${c.color}`}>{fmt(c.value)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {resumo.resultado !== 0 && (
            <Card className={resumo.resultado >= 0 ? 'border-success/30' : 'border-destructive/30'}>
              <CardContent className="p-4">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  Margem: <span className={`font-bold ${resumo.resultado >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {pct(resumo.resultado, resumo.receita)}
                  </span>
                  {' '}— {resumo.resultado >= 0 ? (
                    <span className="inline-flex items-center gap-1">Operação lucrativa <CheckCircle2 className="w-4 h-4 text-success" /></span>
                  ) : (
                    <span className="inline-flex items-center gap-1">Operação deficitária <AlertTriangle className="w-4 h-4 text-warning" /></span>
                  )}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-destructive" /> Top Despesas
                </h3>
                {resumo.topDespesas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma despesa no período</p>
                ) : (
                  <div className="space-y-2">
                    {resumo.topDespesas.map(d => (
                      <div key={d.nome} className="flex justify-between text-sm">
                        <span className="truncate mr-2">{d.nome}</span>
                        <span className="font-mono font-medium text-destructive whitespace-nowrap">{fmt(d.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-success" /> Top Receitas
                </h3>
                {resumo.topReceitas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma receita no período</p>
                ) : (
                  <div className="space-y-2">
                    {resumo.topReceitas.map(r => (
                      <div key={r.nome} className="flex justify-between text-sm">
                        <span className="truncate mr-2">{r.nome}</span>
                        <span className="font-mono font-medium text-success whitespace-nowrap">{fmt(r.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
