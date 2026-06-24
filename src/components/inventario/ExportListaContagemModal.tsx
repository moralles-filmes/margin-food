import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FileDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { Inventario, InventarioItem } from '@/hooks/useInventarioStore';
import { gerarPDFListaContagem } from '@/lib/pdfInventarioContagem';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventario: Inventario;
  itens: InventarioItem[];
  nomeConferente?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EM_CONTAGEM: 'Em contagem',
  EM_REVISAO: 'Em revisão',
  SOB_ANALISE: 'Sob análise',
  FINALIZADO: 'Finalizado',
};

export default function ExportListaContagemModal({
  open,
  onOpenChange,
  inventario,
  itens,
  nomeConferente,
}: Props) {
  const [agruparPorLocal, setAgruparPorLocal] = useState(true);
  const [mostrarSaldo, setMostrarSaldo] = useState(false);
  const [apenasNaoContados, setApenasNaoContados] = useState(false);

  const isRascunho = inventario.status === 'RASCUNHO';
  const total = itens.length;
  const contados = itens.filter(i => i.contagem_fisica !== null).length;
  const naoContados = total - contados;
  const invCode = `INV-${inventario.id.slice(-8).toUpperCase()}`;

  const handleGerar = () => {
    try {
      gerarPDFListaContagem(inventario, itens, {
        agruparPorLocal,
        mostrarSaldoTeorico: mostrarSaldo,
        apenasNaoContados: isRascunho ? false : apenasNaoContados,
        nomeConferente,
      });
      toast.success('PDF gerado!');
      onOpenChange(false);
    } catch (err) {
      console.error('[ExportListaContagemModal.handleGerar]', err);
      toast.error('Erro ao gerar PDF. Tente novamente.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <FileDown className="w-5 h-5 text-primary" />
            Exportar Lista de Contagem (PDF)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo do inventário */}
          <div className="bg-secondary/50 rounded-lg p-3 text-xs space-y-1">
            <p><strong>Nº:</strong> {invCode}</p>
            <p><strong>Status:</strong> {STATUS_LABEL[inventario.status] ?? inventario.status}</p>
            <p>
              <strong>Itens:</strong> {total} total
              {!isRascunho && ` — ${contados} contados / ${naoContados} pendentes`}
            </p>
          </div>

          {/* Opção: Agrupar por local */}
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="agrupar-local" className="text-sm cursor-pointer">
                Agrupar por local de estoque
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Organiza por local (câmara, cozinha…) e depois por categoria.
              </p>
            </div>
            <Switch
              id="agrupar-local"
              checked={agruparPorLocal}
              onCheckedChange={setAgruparPorLocal}
            />
          </div>

          {/* Opção: Mostrar saldo */}
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="mostrar-saldo" className="text-sm cursor-pointer">
                Mostrar saldo do sistema
              </Label>
              {!mostrarSaldo ? (
                <p className="text-[11px] text-muted-foreground">
                  Lista cega evita viés na contagem (recomendado).
                </p>
              ) : (
                <p className="text-[11px] text-warning">
                  O conferente verá o saldo esperado — pode influenciar a contagem.
                </p>
              )}
            </div>
            <Switch
              id="mostrar-saldo"
              checked={mostrarSaldo}
              onCheckedChange={setMostrarSaldo}
            />
          </div>

          {/* Alerta quando saldo habilitado */}
          {mostrarSaldo && (
            <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                A lista cega é a melhor prática para auditorias — sem ver o saldo, o conferente
                conta com mais independência e os resultados são mais confiáveis.
              </span>
            </div>
          )}

          {/* Opção: Apenas não contados */}
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label
                htmlFor="apenas-pendentes"
                className={`text-sm ${isRascunho ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'}`}
              >
                Apenas itens não contados
              </Label>
              <p className="text-[11px] text-muted-foreground">
                {isRascunho
                  ? 'Todos os itens estão pendentes em rascunho — filtro não aplicável.'
                  : `Exporta apenas os ${naoContados} itens ainda não contados.`}
              </p>
            </div>
            <Switch
              id="apenas-pendentes"
              checked={apenasNaoContados}
              onCheckedChange={setApenasNaoContados}
              disabled={isRascunho}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleGerar} className="gap-2">
            <FileDown className="w-4 h-4" /> Gerar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
