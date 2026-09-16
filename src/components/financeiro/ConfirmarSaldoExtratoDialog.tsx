import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/brl-input';
import { DateInput } from '@/components/ui/DateInput';
import { diaAnterior } from '@/lib/extratoParser';
import { getConsolidatedBankDelta, isAutomaticInvestmentLine } from '@/lib/conciliacaoInvestimentoAutomatico';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { normalizeBRLMoneyToNumber, formatNumberToBRL } from '@/lib/money';
import { useScopedToast } from '@/hooks/useScopedToast';
import { AlertTriangle } from 'lucide-react';
import { useCan } from '@/permissions/hooks';

interface ConfirmarSaldoExtratoDialogProps {
  open: boolean;
  nomeArquivo: string;
  periodoInicio: string;
  periodoFim: string;
  linhasExtrato: Array<{
    data: string;
    descricao?: string | null;
    tipo: string;
    valor: number;
  }>;
  saldoSugerido?: { valor: number; data: string };
  /** LEDGERBAL da conta corrente quando o OFX omite o investimento ContaMax. */
  saldoContaCorrenteArquivo?: { valor: number; data: string };
  /** Quantidade de aplicações/resgates ContaMax neutralizados no arquivo. */
  internalMovementCount?: number;
  contaId: string;
  onCancel: () => void;
  /** Recebe o saldo final confirmado pelo usuário — o pai o usa como referência
   *  da conferência pós-processamento (inclusive no "Continuar mesmo assim"). */
  onConfirmed: (saldoConfirmado: { valor: number; data: string }) => void;
}

interface Divergencia {
  informado: number;
  calculado: number;
  diferenca: number;
}

const TOLERANCIA = 0.01;

function getInitialReferenceDate(
  periodoInicio: string,
  periodoFim: string,
  linhasExtrato: ConfirmarSaldoExtratoDialogProps['linhasExtrato'],
  saldoSugerido: ConfirmarSaldoExtratoDialogProps['saldoSugerido'],
  saldoContaCorrenteArquivo: ConfirmarSaldoExtratoDialogProps['saldoContaCorrenteArquivo'],
): string {
  // Quando o Santander baixa o OFX durante um dia ainda aberto, o LEDGERBAL
  // cobre só a conta corrente daquele instante. A última varredura ContaMax é
  // a melhor data inicial para o saldo consolidado do último dia fechado.
  if (saldoContaCorrenteArquivo) {
    const latestContaMaxDate = linhasExtrato
      .filter(isAutomaticInvestmentLine)
      .map(linha => linha.data)
      .filter(data => data >= periodoInicio && data <= periodoFim && data <= saldoContaCorrenteArquivo.data)
      .sort()
      .at(-1);
    if (latestContaMaxDate) return latestContaMaxDate;
  }

  if (saldoSugerido?.data >= periodoInicio && saldoSugerido.data <= periodoFim) {
    return saldoSugerido.data;
  }

  return periodoFim;
}

export default function ConfirmarSaldoExtratoDialog({
  open, nomeArquivo, periodoInicio, periodoFim, linhasExtrato, saldoSugerido,
  saldoContaCorrenteArquivo, internalMovementCount = 0, contaId,
  onCancel, onConfirmed,
}: ConfirmarSaldoExtratoDialogProps) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [valorInput, setValorInput] = useState(() =>
    internalMovementCount === 0 && saldoSugerido ? formatNumberToBRL(saldoSugerido.valor) : ''
  );
  const [dataSaldo, setDataSaldo] = useState(() => getInitialReferenceDate(
    periodoInicio,
    periodoFim,
    linhasExtrato,
    saldoSugerido,
    saldoContaCorrenteArquivo,
  ));
  const [loading, setLoading] = useState(false);
  const [divergencia, setDivergencia] = useState<Divergencia | null>(null);
  const canViewConciliacao = useCan('financeiro:conciliacao:view');

  const handleConfirmarValor = async () => {
    if (!canViewConciliacao) {
      toast.error('Sem permissão para conciliação bancária.');
      return;
    }
    const informado = normalizeBRLMoneyToNumber(valorInput);
    if (informado == null) {
      toast.error('Informe o saldo final do extrato.');
      return;
    }
    if (!dataSaldo || dataSaldo < periodoInicio || dataSaldo > periodoFim) {
      toast.error('Informe uma data do saldo dentro do período importado.');
      return;
    }

    // O OFX do Santander pode trazer as linhas da conta corrente enquanto o
    // saldo confirmado pelo usuário já soma corrente + ContaMax. Nesse caso as
    // bases não são comparáveis antes do matching. Guardamos a âncora total e a
    // conferência pós-processamento faz a validação definitiva contra o razão.
    if (internalMovementCount > 0) {
      toast.success('Saldo Santander consolidado registrado para a conferência final.');
      onConfirmed({ valor: informado, data: dataSaldo });
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
      const deltaAteData = getConsolidatedBankDelta(
        linhasExtrato.filter(linha => linha.data <= dataSaldo),
      );
      const calculado = saldoBase + deltaAteData;
      const diferenca = informado - calculado;

      if (Math.abs(diferenca) < TOLERANCIA) {
        toast.success('Saldo confere!');
        onConfirmed({ valor: informado, data: dataSaldo });
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
              {internalMovementCount > 0 && (
                <div
                  role="alert"
                  className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs"
                >
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                    {internalMovementCount} movimentação(ões) interna(s) ContaMax detectada(s)
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Confirme o <strong className="text-foreground">saldo total exibido pelo Santander</strong>,
                    somando conta corrente + ContaMax.
                    {saldoContaCorrenteArquivo ? (
                      <>
                        {' '}O OFX informa apenas <strong className="text-foreground">
                          {fmtBRL(saldoContaCorrenteArquivo.valor)} da conta corrente em{' '}
                          {formatDateBR(parseLocalDate(saldoContaCorrenteArquivo.data))}
                        </strong>; por segurança, esse valor não preenche o total consolidado.
                      </>
                    ) : (
                      ' O saldo da conta corrente no arquivo não representa o total consolidado.'
                    )}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="data-saldo-extrato">Data do saldo informado</Label>
                <DateInput
                  id="data-saldo-extrato"
                  value={dataSaldo}
                  min={periodoInicio}
                  max={periodoFim}
                  onValueChange={setDataSaldo}
                />
                <p className="text-[11px] text-muted-foreground">
                  Linhas posteriores a essa data não entram na conferência.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="saldo-final-extrato">
                  {internalMovementCount > 0 ? 'Saldo consolidado nessa data' : 'Saldo final nessa data'}
                </Label>
                <CurrencyInput
                  id="saldo-final-extrato"
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
              <Button
                variant="destructive"
                onClick={() => onConfirmed({ valor: divergencia.informado, data: dataSaldo })}
              >
                Continuar mesmo assim
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
