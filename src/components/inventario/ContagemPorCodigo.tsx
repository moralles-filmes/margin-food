import { useState } from 'react';
import { ArrowLeft, CheckCircle2, ListChecks, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BarcodeLookupResult, Inventario, InventarioItem, UpdateContagemResult } from '@/hooks/useInventarioStore';
import { useContagemPorCodigo } from '@/hooks/useContagemPorCodigo';
import LeitorCodigoBarras from '@/components/estoque-operacional/LeitorCodigoBarras';
import { formatDisplayBR } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';

interface Props {
  inventario: Inventario;
  itens: InventarioItem[];
  canCount: boolean;
  onBack: () => void;
  onVerListaCompleta: () => void;
  onFinalizar: () => void;
  buscarPorBarcode: (inventarioId: string, barcode: string) => Promise<BarcodeLookupResult>;
  salvarContagem: (itemId: string, contagemBase: number) => Promise<UpdateContagemResult | null>;
}

const STATUS_LABEL: Record<Inventario['status'], string> = {
  RASCUNHO: 'Rascunho',
  EM_CONTAGEM: 'Em contagem',
  EM_REVISAO: 'Em revisão',
  SOB_ANALISE: 'Sob análise',
  FINALIZADO: 'Finalizado',
};

export default function ContagemPorCodigo({
  inventario, itens, canCount, onBack, onVerListaCompleta, onFinalizar, buscarPorBarcode, salvarContagem,
}: Props) {
  const [aviso, setAviso] = useState<string | undefined>();
  const [focoToken, setFocoToken] = useState(0);

  const { processarLeitura, desfazerUltimaLeitura, historico, processando } = useContagemPorCodigo({
    inventarioId: inventario.id, buscarPorBarcode, salvarContagem,
  });

  const totalItens = itens.length;
  const contados = itens.filter(i => i.contagem_fisica !== null).length;

  const tratarLeitura = async (raw: string) => {
    const resultado = await processarLeitura(raw);
    setFocoToken(v => v + 1);
    if (resultado.tipo === 'contabilizado') {
      setAviso(`✅ ${resultado.item.nomeProduto} — quantidade contada: ${resultado.item.quantidadeContadaCompra} ${resultado.item.unidadeCompra}`);
    } else if (resultado.tipo === 'nao_encontrado') {
      setAviso(`Produto não encontrado para o código ${resultado.barcode}.`);
    } else if (resultado.tipo === 'fora_do_inventario') {
      setAviso(`O código ${resultado.barcode} pertence a um produto fora deste inventário.`);
    } else {
      setAviso(resultado.mensagem);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-display font-bold text-foreground">
            Inventário: {formatDisplayBR(parseLocalDate(inventario.data))}
          </h2>
          <p className="text-xs text-muted-foreground">
            {STATUS_LABEL[inventario.status]} · {contados}/{totalItens} produtos contabilizados
          </p>
        </div>
      </div>

      {!canCount ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Você não tem permissão para contar itens deste inventário.
        </div>
      ) : (
        <LeitorCodigoBarras
          onLeitura={codigo => void tratarLeitura(codigo)}
          onLancarManualmente={() => setAviso('Digite o código no campo acima e pressione Enter.')}
          ocupado={processando}
          aviso={aviso}
          focoToken={focoToken}
        />
      )}

      {historico.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Últimos produtos contabilizados</p>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => void desfazerUltimaLeitura()} disabled={processando}>
              <Undo2 className="h-3.5 w-3.5" /> Desfazer última leitura
            </Button>
          </div>
          <ul className="space-y-1.5">
            {historico.map(h => (
              <li key={h.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-foreground">{h.nomeProduto}</span>
                <span className="shrink-0 font-mono text-success">+1 → {h.quantidadeContadaCompra} {h.unidadeCompra}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="h-12 flex-1 gap-1.5" onClick={onVerListaCompleta}>
          <ListChecks className="h-4 w-4" /> Ver lista completa
        </Button>
        <Button className="h-12 flex-1 gap-1.5" onClick={onFinalizar}>
          <CheckCircle2 className="h-4 w-4" /> Finalizar inventário
        </Button>
      </div>
    </div>
  );
}
