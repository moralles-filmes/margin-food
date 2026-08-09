import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/brl-input';
import { supabase } from '@/integrations/supabase/client';
import { diaAnterior } from '@/lib/extratoParser';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { normalizeBRLMoneyToNumber, formatNumberToBRL } from '@/lib/money';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

interface ConfirmarSaldoExtratoDialogProps {
  open: boolean;
  nomeArquivo: string;
  periodoInicio: string;
  periodoFim: string;
  deltaExtrato: number;
  saldoSugerido?: { valor: number; data: string };
  contaId: string;
  onCancel: () => void;
  onConfirmed: () => void;
}

interface Divergencia {
  informado: number;
  calculado: number;
  diferenca: number;
}

const TOLERANCIA = 0.01;

export default function ConfirmarSaldoExtratoDialog({
  open, nomeArquivo, periodoInicio, periodoFim, deltaExtrato, saldoSugerido, contaId,
  onCancel, onConfirmed,
}: ConfirmarSaldoExtratoDialogProps) {
  const [valorInput, setValorInput] = useState(() =>
    saldoSugerido ? formatNumberToBRL(saldoSugerido.valor) : ''
  );
  const [loading, setLoading] = useState(false);
  const [divergencia, setDivergencia] = useState<Divergencia | null>(null);

  const handleConfirmarValor = async () => {
    const informado = normalizeBRLMoneyToNumber(valorInput);
    if (informado == null) {
      toast.error('Informe o saldo final do extrato.');
      return;
    }

    setLoading(true);
    try {
      const dataAnterior = diaAnterior(periodoInicio);
      const { data, error } = await supabase.rpc('get_fin_saldo_conta_em', {
        p_conta_id: contaId,
        p_data: dataAnterior,
      });
      if (error) {
        toast.error('Erro ao calcular saldo: ' + error.message);
        return;
      }
      const saldoBase = Number(data) || 0;
      const calculado = saldoBase + deltaExtrato;
      const diferenca = informado - calculado;

      if (Math.abs(diferenca) < TOLERANCIA) {
        toast.success('Saldo confere!');
        onConfirmed();
      } else {
        setDivergencia({ informado, calculado, diferenca });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        {!divergencia ? (
          <>
            <DialogHeader>
              <DialogTitle>Confirme o saldo do seu extrato</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Arquivo: <span className="font-medium text-foreground">{nomeArquivo}</span>
              </p>
              <p className="text-muted-foreground">
                Período importado: <span className="font-medium text-foreground">
                  {formatDateBR(parseLocalDate(periodoInicio))} a {formatDateBR(parseLocalDate(periodoFim))}
                </span>
              </p>
              <div>
                <Label>Saldo final em {formatDateBR(parseLocalDate(periodoFim))}</Label>
                <CurrencyInput
                  value={valorInput}
                  onValueChange={(raw) => setValorInput(raw)}
                  showPrefix
                  placeholder="0,00"
                  autoFocus
                />
                {saldoSugerido && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    ⚡ Valor sugerido pelo arquivo — confira antes de confirmar.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onCancel} disabled={loading}>Cancelar</Button>
              <Button onClick={handleConfirmarValor} disabled={loading}>
                {loading ? 'Verificando...' : 'Confirmar valor'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                Saldo não confere
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="text-muted-foreground">
                  Saldo informado: <span className="font-mono font-medium text-foreground">{fmtBRL(divergencia.informado)}</span>
                </p>
                <p className="text-muted-foreground">
                  Saldo calculado pelo sistema: <span className="font-mono font-medium text-foreground">{fmtBRL(divergencia.calculado)}</span>
                </p>
                <p className="text-muted-foreground">
                  Diferença: <span className="font-mono font-semibold text-destructive">{fmtBRL(divergencia.diferenca)}</span>
                </p>
              </div>
              <p className="text-muted-foreground text-xs">
                Isso indica que pode haver lançamento(s) incorreto(s) ou faltando antes de {formatDateBR(parseLocalDate(periodoInicio))}.
                Você pode continuar a conciliação mesmo assim e investigar depois, ou cancelar para corrigir antes.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onCancel}>Cancelar importação</Button>
              <Button variant="destructive" onClick={onConfirmed}>Continuar mesmo assim</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
