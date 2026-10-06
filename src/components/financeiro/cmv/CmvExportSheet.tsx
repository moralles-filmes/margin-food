import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BarChart3, CalendarRange, Download, FileSpreadsheet, FileText, LayoutGrid, ListOrdered,
  Loader2, NotebookPen, PieChart, Receipt, RefreshCw, SlidersHorizontal, type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { formatDateTimeBR } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { formatarIntervalo, type CmvReport } from '@/domain/financeiro/cmv';
import { fetchTodasCmvLinhas } from '@/hooks/useCmvFinanceiro';
import {
  CMV_ATALHOS_PDF, CMV_BLOCOS_PDF, CMV_TODOS_BLOCOS, normalizarBlocos,
  type CmvBlocoPdf, type CmvPdfBoleto, type CmvPdfResultado,
} from '@/lib/cmvFinanceiroPdfExport';

const ICONES: Record<CmvBlocoPdf, LucideIcon> = {
  cards: LayoutGrid,
  evolucao: BarChart3,
  composicao: PieChart,
  comparativo: FileSpreadsheet,
  ranking: ListOrdered,
  demonstrativo: FileText,
  temporal: CalendarRange,
  boletos: Receipt,
  observacoes: NotebookPen,
};

const ROTULO = new Map(CMV_BLOCOS_PDF.map(b => [b.id, b.rotulo]));
const MAX_OBSERVACOES = 2000;

interface Previa {
  resultado: CmvPdfResultado;
  /** Identifica a seleção que gerou esta prévia. */
  assinatura: string;
  report: CmvReport;
}

/** A lista de boletos de origem não soma o CMV do snapshot (algo mudou entre as duas leituras). */
class BoletosDivergentesError extends Error {}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Relatório que está na tela (a mesma fonte de dados do PDF). */
  report: CmvReport;
}

export default function CmvExportSheet({ open, onOpenChange, report }: Props) {
  const supabase = useSupabase();
  const toast = useScopedToast();
  const { executar, enviando } = useTravaEnvio();
  const [modo, setModo] = useState<'tudo' | 'personalizar'>('tudo');
  const [selecionados, setSelecionados] = useState<Set<CmvBlocoPdf>>(() => new Set(CMV_TODOS_BLOCOS));
  const [expandido, setExpandido] = useState(true);
  const [observacoes, setObservacoes] = useState('');
  // Snapshot: o relatório é fixado quando o painel abre. Se a tela atualizar os
  // dados depois, a prévia continua a do snapshot até o usuário pedir atualização.
  const [base, setBase] = useState(report);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const boletosCache = useRef<{ report: CmvReport; linhas: CmvPdfBoleto[] } | null>(null);

  useEffect(() => {
    if (open) {
      setBase(report);
      setPrevia(null);
      setErro(null);
    }
    // Só ao abrir: mudança de `report` com o painel aberto é sinalizada, não aplicada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const blocos = useMemo(
    () => normalizarBlocos(modo === 'tudo' ? CMV_TODOS_BLOCOS : [...selecionados]),
    [modo, selecionados],
  );
  const assinatura = JSON.stringify([blocos, expandido, blocos.includes('observacoes') ? observacoes.trim() : '']);
  // Toda recarga traz um objeto novo (e um novo `geradoEm`): só avisa quando os dados mudaram de fato.
  const desatualizada = useMemo(
    () => base !== report && JSON.stringify({ ...base, geradoEm: '' }) !== JSON.stringify({ ...report, geradoEm: '' }),
    [base, report],
  );

  useEffect(() => {
    if (!open || blocos.length === 0) {
      setPrevia(null);
      return;
    }
    let cancelado = false;
    const controller = new AbortController();
    setPreparando(true);
    setErro(null);
    const timer = window.setTimeout(async () => {
      try {
        let boletos: CmvPdfBoleto[] | null = null;
        if (blocos.includes('boletos')) {
          if (boletosCache.current?.report !== base) {
            const faixa = base.janelas.efetivoAtual;
            const lista = faixa
              ? await fetchTodasCmvLinhas(supabase, { inicio: faixa.inicio, fim: faixa.fim, situacao: 'incluido', categoriaId: null }, controller.signal)
              : { itens: [] };
            // As linhas são lidas agora; os cards, do snapshot. Se não fecham, o PDF não sai.
            let soma = 0;
            for (const l of lista.itens) soma += l.linhaCentavos;
            if (soma !== base.atual.cmvCentavos) throw new BoletosDivergentesError();
            boletosCache.current = { report: base, linhas: lista.itens };
          }
          boletos = boletosCache.current.linhas;
        }
        const { createCmvPdf } = await import('@/lib/cmvFinanceiroPdfExport');
        const resultado = createCmvPdf({
          report: base, blocos, demonstrativoExpandido: expandido, observacoes, boletos, emitidoEm: new Date(),
        });
        if (!cancelado) setPrevia({ resultado, assinatura, report: base });
      } catch (error) {
        if (cancelado) return;
        console.error('[CMV Financeiro] Falha ao preparar o PDF:', error);
        setPrevia(null);
        setErro(error instanceof BoletosDivergentesError
          ? 'As despesas mudaram depois que o relatório foi carregado. Feche o painel, atualize a tela e exporte de novo.'
          : 'Não foi possível preparar o PDF. Verifique a conexão e tente de novo.');
      } finally {
        if (!cancelado) setPreparando(false);
      }
    }, 350);
    return () => {
      cancelado = true;
      controller.abort();
      window.clearTimeout(timer);
    };
    // `assinatura` resume blocos + expandido + observações.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, base, assinatura, supabase]);

  const alternar = (id: CmvBlocoPdf, marcado: boolean) => {
    setSelecionados(atual => {
      const proximo = new Set(atual);
      if (marcado) proximo.add(id); else proximo.delete(id);
      return proximo;
    });
  };

  const pronta = previa !== null && previa.assinatura === assinatura && previa.report === base && !preparando;

  const gerar = () => {
    if (!pronta || !previa) return;
    void executar(async () => {
      try {
        // O arquivo é exatamente o documento da prévia.
        previa.resultado.doc.save(previa.resultado.fileName);
        toast.success('PDF do CMV Financeiro gerado.');
        onOpenChange(false);
      } catch (error) {
        console.error('[CMV Financeiro] Falha ao salvar o PDF:', error);
        toast.error('Não foi possível gerar o PDF.');
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle>Exportar relatório em PDF</SheetTitle>
          <SheetDescription>Selecione os blocos que deseja incluir no seu relatório.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div role="radiogroup" aria-label="Modo de exportação" className="grid grid-cols-2 gap-3">
            {([
              { id: 'tudo', titulo: 'Exportar tudo', texto: 'Inclui todos os blocos do relatório, de todas as abas.', icone: FileText },
              { id: 'personalizar', titulo: 'Personalizar exportação', texto: 'Escolha os blocos especificamente.', icone: SlidersHorizontal },
            ] as const).map(opcao => {
              const ativo = modo === opcao.id;
              const Icone = opcao.icone;
              return (
                <button
                  key={opcao.id} type="button" role="radio" aria-checked={ativo} onClick={() => setModo(opcao.id)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    ativo ? 'border-primary bg-primary-soft' : 'border-border bg-card hover:bg-muted',
                  )}
                >
                  <span className="flex items-start gap-2">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', ativo ? 'bg-card text-primary-ink' : 'bg-primary-soft text-primary-ink')}>
                      <Icone className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{opcao.titulo}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{opcao.texto}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {modo === 'personalizar' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" aria-label="Atalhos de seleção">
                {CMV_ATALHOS_PDF.map(atalho => (
                  <Button key={atalho.id} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelecionados(new Set(atalho.blocos))}>
                    {atalho.rotulo}
                  </Button>
                ))}
              </div>
              <fieldset className="space-y-1">
                <legend className="mb-2 text-sm font-semibold text-foreground">Selecionar blocos</legend>
                {CMV_BLOCOS_PDF.map(bloco => {
                  const Icone = ICONES[bloco.id];
                  const id = `cmv-bloco-${bloco.id}`;
                  return (
                    <div key={bloco.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                      <Checkbox id={id} checked={selecionados.has(bloco.id)} onCheckedChange={v => alternar(bloco.id, v === true)} />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
                        <Icone className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <Label htmlFor={id} className="min-w-0 cursor-pointer">
                        <span className="block text-sm font-medium text-foreground">{bloco.rotulo}</span>
                        <span className="block text-xs font-normal text-muted-foreground">{bloco.descricao}</span>
                      </Label>
                    </div>
                  );
                })}
              </fieldset>
              {blocos.length === 0 && (
                <p role="alert" className="text-sm font-medium text-destructive">Selecione pelo menos um bloco.</p>
              )}
            </div>
          )}

          {blocos.includes('demonstrativo') && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">Demonstrativo por categoria</p>
              <SegmentedControl
                value={expandido ? 'expandido' : 'resumido'}
                onChange={v => setExpandido(v === 'expandido')}
                options={[{ value: 'expandido', label: 'Expandido (com subcategorias)' }, { value: 'resumido', label: 'Resumido (só grupos)' }]}
              />
            </div>
          )}

          {blocos.includes('observacoes') && (
            <div className="space-y-1.5">
              <Label htmlFor="cmv-pdf-observacoes" className="text-sm font-semibold text-foreground">Observações</Label>
              <Textarea
                id="cmv-pdf-observacoes" value={observacoes} maxLength={MAX_OBSERVACOES} rows={3}
                onChange={e => setObservacoes(e.target.value)} placeholder="Texto livre que sai no final do PDF (opcional)."
              />
              <p className="text-xs text-muted-foreground">{observacoes.length}/{MAX_OBSERVACOES}. Sem texto, o bloco não é impresso.</p>
            </div>
          )}

          <section aria-label="Prévia do PDF" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Prévia do PDF</h3>
              <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {preparando ? 'Preparando…' : pronta ? `${previa.resultado.paginas} ${previa.resultado.paginas === 1 ? 'página' : 'páginas'} · A4 paisagem` : ''}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {base.empresa} · {formatarIntervalo(base.filtro)} · dados de {base.geradoEm ? formatDateTimeBR(new Date(base.geradoEm)) : '—'}.
              Origem dos dados e avisos de incompletude saem sempre na primeira página.
            </p>
            {desatualizada && (
              <div className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft p-2.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">Os dados da tela mudaram depois desta prévia. O PDF sairá com os dados da prévia até você atualizar.</span>
                <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => setBase(report)}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar
                </Button>
              </div>
            )}
            {erro ? (
              <p role="alert" className="rounded-lg border border-destructive-border bg-destructive-soft p-3 text-sm text-destructive">{erro}</p>
            ) : preparando || !pronta ? (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                {blocos.length === 0 ? 'Nenhum bloco selecionado.' : <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Montando o documento…</>}
              </div>
            ) : (
              <ol className="grid grid-cols-2 gap-3">
                {previa.resultado.blocosPorPagina.map((blocosDaPagina, i) => (
                  <li key={i} className="flex aspect-[297/210] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                    <div className="h-1 bg-primary-strong" aria-hidden="true" />
                    <div className="flex-1 space-y-1 overflow-hidden p-2">
                      <p className="truncate text-[9px] font-semibold text-foreground">{i === 0 ? 'CMV Financeiro' : `${base.empresa} · CMV Financeiro`}</p>
                      {i === 0 && <p className="truncate rounded bg-muted px-1 py-0.5 text-[8px] text-muted-foreground">Origem dos dados e avisos</p>}
                      {blocosDaPagina.map(bloco => (
                        <p key={bloco} className="truncate rounded bg-primary-soft px-1 py-0.5 text-[8px] font-medium text-primary-ink">{ROTULO.get(bloco)}</p>
                      ))}
                    </div>
                    <p className="border-t border-border px-2 py-0.5 text-right text-[8px] tabular-nums text-muted-foreground">Página {i + 1} de {previa.resultado.paginas}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <SheetFooter className="grid grid-cols-2 gap-3 border-t border-border px-5 py-4 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={gerar} disabled={!pronta || enviando}>
            {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Gerar PDF
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
