import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { todayBR } from '@/lib/formatters';
import { formatarCentavos } from '@/domain/financeiro/cmv';
import {
  aplicarPadroesCmv, mensagemErroCmv, simularPadroesCmv, type CmvPreviaFonte, type CmvPreviaPadroes,
} from '@/hooks/useCmvFinanceiro';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Depois de gravar: recarregar o relatório e as telas que mostram a decisão. */
  onAplicado: () => void;
}

const inicioDoMes = () => `${todayBR().slice(0, 7)}-01`;

/**
 * Preenche as linhas PENDENTES com o padrão da categoria (boletos e lançamentos), a
 * partir de uma data de competência. Sempre passa por prévia; decisão já tomada
 * nunca muda e categoria sem padrão continua pendente.
 *
 * A prévia vale para a data em que foi pedida: o "Aplicar" só libera com a prévia
 * da data que está na tela, e resposta que chega depois de a data mudar (ou de o
 * diálogo fechar e reabrir) é descartada.
 */
export default function CmvAplicarPadroesDialog({ open, onOpenChange, onAplicado }: Props) {
  const supabase = useSupabase();
  const toast = useScopedToast();
  const { executar, enviando } = useTravaEnvio();
  const [desde, setDesde] = useState(inicioDoMes);
  const [previa, setPrevia] = useState<CmvPreviaPadroes | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  // Numera os pedidos de prévia. Trocar a data, fechar ou reabrir invalida o que ainda está a caminho.
  const pedidoRef = useRef(0);

  useEffect(() => {
    pedidoRef.current += 1;
    setCarregando(false);
    if (!open) return;
    setDesde(inicioDoMes());
    setPrevia(null);
    setJustificativa('');
  }, [open]);

  const trocarDesde = (valor: string) => {
    pedidoRef.current += 1;
    setCarregando(false);
    setDesde(valor);
    setPrevia(null);
  };

  const verPrevia = async () => {
    const pedido = ++pedidoRef.current;
    setPrevia(null);
    setCarregando(true);
    try {
      const resultado = await simularPadroesCmv(supabase, desde);
      // A data mudou ou o diálogo foi reaberto no meio do caminho: essa prévia é de outro contexto.
      if (pedido !== pedidoRef.current) return;
      setPrevia(resultado);
    } catch (error) {
      console.error('[CMV Financeiro] Falha na prévia de aplicar padrões:', error);
      if (pedido === pedidoRef.current) toast.error(mensagemErroCmv(error));
    } finally {
      if (pedido === pedidoRef.current) setCarregando(false);
    }
  };

  const linhasQueMudam = previa
    ? previa.boleto.linhasSim + previa.boleto.linhasNao + previa.lancamento.linhasSim + previa.lancamento.linhasNao
    : 0;
  const podeAplicar = previa !== null && previa.desde === desde
    && linhasQueMudam > 0 && justificativa.trim() !== '' && !carregando && !enviando;

  const aplicar = () => {
    if (!previa || !podeAplicar) return;
    // A data aplicada é a da prévia que a pessoa viu.
    const dataDaPrevia = previa.desde;
    void executar(async () => {
      try {
        const r = await aplicarPadroesCmv(supabase, dataDaPrevia, justificativa);
        toast.success(r.documentos === 0
          ? 'Nada a aplicar: as pendências mudaram desde a prévia.'
          : `${r.linhas} ${r.linhas === 1 ? 'linha classificada' : 'linhas classificadas'} em ${r.documentos} ${r.documentos === 1 ? 'despesa' : 'despesas'}.`);
        onAplicado();
        onOpenChange(false);
      } catch (error) {
        console.error('[CMV Financeiro] Falha ao aplicar padrões:', error);
        toast.error(`${mensagemErroCmv(error)} Nada foi alterado.`);
      }
    });
  };

  const linhaPrevia = (rotulo: string, f: CmvPreviaFonte) => (
    <tr className="border-b border-border last:border-0">
      <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">{rotulo}</th>
      <td className="px-3 py-2 text-right tabular-nums">{f.linhasSim} · {formatarCentavos(f.centavosSim)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{f.linhasNao} · {formatarCentavos(f.centavosNao)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{f.linhasSemPadrao} · {formatarCentavos(f.centavosSemPadrao)}</td>
    </tr>
  );

  return (
    <Dialog open={open} onOpenChange={aberto => { if (!enviando) onOpenChange(aberto); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Aplicar padrões às pendentes</DialogTitle>
          <DialogDescription>
            As linhas sem resposta recebem o padrão da categoria (Sim ou Não), a partir da data de competência escolhida. Decisões já tomadas não mudam e categorias sem padrão continuam pendentes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="cmv-padroes-desde" className="text-xs text-muted-foreground">Competência a partir de</Label>
              <DateInput id="cmv-padroes-desde" value={desde} onValueChange={trocarDesde} disabled={carregando || enviando} className="h-9 w-44" />
            </div>
            <Button type="button" variant="outline" onClick={() => void verPrevia()} disabled={!desde || carregando || enviando}>
              {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Ver prévia
            </Button>
          </div>
          {previa && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <caption className="sr-only">Prévia: linhas e valores que recebem o padrão da categoria</caption>
                <thead>
                  <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                    <th scope="col" className="px-3 py-2 text-left font-medium">Origem</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Viram Sim</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Viram Não</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Continuam pendentes</th>
                  </tr>
                </thead>
                <tbody>
                  {linhaPrevia('Boletos', previa.boleto)}
                  {linhaPrevia('Lançamentos e conciliação', previa.lancamento)}
                </tbody>
              </table>
            </div>
          )}
          {previa && linhasQueMudam > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="cmv-padroes-justificativa" className="text-xs text-muted-foreground">Justificativa (fica na auditoria)</Label>
              <Textarea id="cmv-padroes-justificativa" value={justificativa} onChange={e => setJustificativa(e.target.value)} maxLength={300} rows={2} />
            </div>
          )}
          {previa && linhasQueMudam === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma linha pendente com padrão a partir desta data.</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
          <Button type="button" onClick={aplicar} disabled={!podeAplicar}>
            {enviando ? 'Aplicando…' : 'Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
