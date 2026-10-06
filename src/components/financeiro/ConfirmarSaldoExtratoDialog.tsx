import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/brl-input';
import { DateInput } from '@/components/ui/DateInput';
import { diaAnterior } from '@/lib/extratoParser';
import { getConsolidatedBankDelta, isAutomaticInvestmentLine } from '@/lib/conciliacaoInvestimentoAutomatico';
import { diaSeguinte, sugerirSaldoInicial } from '@/lib/conciliacaoSaldoExtrato';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { normalizeBRLMoneyToNumber, formatNumberToBRL } from '@/lib/money';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useCan } from '@/permissions/hooks';
import { useRetornoFoco } from '@/components/financeiro/useRetornoFoco';

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
  /** Onde o foco volta ao fechar. O diálogo abre depois da leitura do arquivo e o campo de saldo
   *  tem `autoFocus`, então não há um gatilho para onde o Radix possa devolver o foco. */
  focoAoFechar?: () => HTMLElement | null;
}

interface ContaParaAjuste {
  id: string;
  saldo_inicial: number;
  updated_at: string;
}

/** Divergência que só pode vir do saldo inicial: a conta não tem lançamento antes do período. */
interface SugestaoSaldoInicial {
  conta: ContaParaAjuste;
  atual: number;
  sugerido: number;
  /** Véspera do período importado — a data em que o saldo sugerido vale. */
  data: string;
  /**
   * A conta já tem lançamento depois do período: o saldo inicial atual pode ter
   * sido conferido com eles, e mudá-lo desloca o saldo de todos. Só é correto se
   * o usuário for importar todo o intervalo até eles — decisão que fica fora do
   * ajuste de um clique.
   */
  temPosteriores: boolean;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O servidor rechecou o histórico sob lock e encontrou lançamento novo: a sugestão envelheceu. */
const HISTORICO_MUDOU_RE = /LANCAMENTO_(ANTERIOR|POSTERIOR)/;

/** Texto fixo para os erros conhecidos de `_guarded_ajustar_saldo_inicial_conta`; o resto vai só para o console. */
function mensagemErroAjuste(message: string, datas: { ate: string; periodoFim: string }): string {
  if (/LANCAMENTO_ANTERIOR/.test(message)) {
    return `A conta recebeu lançamentos até ${formatDateBR(parseLocalDate(datas.ate))} enquanto você conferia. Confira o saldo de novo.`;
  }
  if (/LANCAMENTO_POSTERIOR/.test(message)) {
    return `A conta recebeu lançamentos depois de ${formatDateBR(parseLocalDate(datas.periodoFim))} enquanto você conferia. Confira o saldo de novo.`;
  }
  if (/OPTIMISTIC_LOCK_CONFLICT/.test(message)) return 'A conta foi alterada por outra pessoa. Cancele e importe o extrato de novo.';
  if (/PERMISSION_DENIED/.test(message)) return 'Você não tem permissão para editar contas bancárias nesta unidade.';
  if (/NOT_FOUND/.test(message)) return 'Conta não encontrada nesta unidade.';
  return 'Não foi possível ajustar o saldo inicial. Tente de novo.';
}

interface Divergencia {
  informado: number;
  calculado: number;
  diferenca: number;
  sugestaoSaldoInicial?: SugestaoSaldoInicial;
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
  onCancel, onConfirmed, focoAoFechar,
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
  const canEditConta = useCan('financeiro:contas:edit');
  // Sem leitura de lançamentos a RLS devolve lista vazia, que pareceria "conta sem histórico".
  const canViewLancamentos = useCan('financeiro:lancamentos:view');
  const emitDataEvent = useEmitDataEvent();
  const { enviando: ajustando, executar } = useTravaEnvio();
  const retornoFoco = useRetornoFoco(focoAoFechar);

  /**
   * Existe lançamento da conta com data efetiva até `dataAnterior`? Filtro
   * conservador (qualquer uma das datas basta), então pode responder "sim" para
   * um lançamento cuja data efetiva é posterior — o lado seguro. `null` = erro.
   */
  const existeLancamentoAte = async (dataAnterior: string): Promise<boolean | null> => {
    const { data, error } = await supabase
      .from('fin_lancamentos')
      .select('id')
      .in('status', ['REALIZADO', 'CONCILIADO'])
      .or(`conta_id.eq.${contaId},conta_destino_id.eq.${contaId}`)
      .or(`data_competencia.lte.${dataAnterior},data_pagamento.lte.${dataAnterior},conciliado_em.lt.${periodoInicio}T00:00:00-03:00`)
      .limit(1);
    if (error) {
      console.error('[ConfirmarSaldoExtratoDialog.lancamentosAnteriores]', error);
      return null;
    }
    return (data || []).length > 0;
  };

  /**
   * Existe lançamento com data efetiva depois do período? Mesma regra de data do
   * saldo: COALESCE(data_pagamento, conciliado_em no fuso BR, data_competencia).
   * `null` = erro.
   */
  const existeLancamentoDepois = async (): Promise<boolean | null> => {
    const inicioDiaSeguinte = `${diaSeguinte(periodoFim)}T00:00:00-03:00`;
    const { data, error } = await supabase
      .from('fin_lancamentos')
      .select('id')
      .in('status', ['REALIZADO', 'CONCILIADO'])
      .or(`conta_id.eq.${contaId},conta_destino_id.eq.${contaId}`)
      .or(
        `data_pagamento.gt.${periodoFim},`
        + `and(data_pagamento.is.null,conciliado_em.gte.${inicioDiaSeguinte}),`
        + `and(data_pagamento.is.null,conciliado_em.is.null,data_competencia.gt.${periodoFim})`,
      )
      .limit(1);
    if (error) {
      console.error('[ConfirmarSaldoExtratoDialog.lancamentosPosteriores]', error);
      return null;
    }
    return (data || []).length > 0;
  };

  /**
   * Só sugere ajustar o saldo inicial quando ele é a ÚNICA explicação possível:
   * sem lançamento antes do período, o saldo do sistema na véspera é o próprio
   * `saldo_inicial`. Com lançamento anterior, a diferença pode ser lançamento
   * faltando ou duplicado — ajustar o saldo inicial esconderia exatamente o erro
   * que esta conferência existe para mostrar. Qualquer falha de leitura cai na
   * divergência genérica.
   */
  const buscarSugestaoSaldoInicial = async (
    informado: number,
    deltaAteData: number,
    saldoBase: number,
    dataAnterior: string,
  ): Promise<SugestaoSaldoInicial | undefined> => {
    if (!canViewLancamentos) return undefined;
    // As datas vêm do arquivo do extrato e entram cruas no filtro do PostgREST.
    if (![periodoInicio, periodoFim, dataAnterior].every(d => ISO_DATE_RE.test(d)) || !UUID_RE.test(contaId)) {
      return undefined;
    }
    if (await existeLancamentoAte(dataAnterior) !== false) return undefined;

    const { data: conta, error: erroConta } = await supabase
      .from('fin_contas')
      .select('id, saldo_inicial, updated_at')
      .eq('id', contaId)
      .maybeSingle();
    if (erroConta || !conta) {
      if (erroConta) console.error('[ConfirmarSaldoExtratoDialog.conta]', erroConta);
      return undefined;
    }

    const atual = Number(conta.saldo_inicial) || 0;
    // Saldo da véspera diferente do saldo inicial = há lançamento que o filtro
    // acima não pegou; a premissa da sugestão não vale.
    if (Math.abs(saldoBase - atual) >= TOLERANCIA) return undefined;

    const posteriores = await existeLancamentoDepois();
    if (posteriores === null) return undefined;

    return {
      conta: conta as ContaParaAjuste,
      atual,
      sugerido: sugerirSaldoInicial({ informado, deltaAteData }),
      data: dataAnterior,
      temPosteriores: posteriores,
    };
  };

  const conferirSaldo = async (informado: number) => {
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
      return;
    }
    const sugestaoSaldoInicial = await buscarSugestaoSaldoInicial(informado, deltaAteData, saldoBase, dataAnterior);
    setDivergencia({ informado, calculado, diferenca, sugestaoSaldoInicial });
  };

  const reconferir = async (informado: number) => {
    setDivergencia(null);
    setLoading(true);
    try {
      await conferirSaldo(informado);
    } finally {
      setLoading(false);
    }
  };

  const ajustarSaldoInicial = () => executar(async () => {
    const sugestaoAtual = divergencia?.sugestaoSaldoInicial;
    if (!divergencia || !sugestaoAtual || sugestaoAtual.temPosteriores) return;
    const { conta, sugerido, data: dataAnterior } = sugestaoAtual;

    // A premissa (nenhum lançamento até a véspera nem depois do período) foi
    // checada quando a tela abriu; outra aba pode ter importado extrato desde
    // então, e o lock otimista da conta não percebe (lançamento não toca
    // fin_contas). A RPC refaz as duas checagens sob lock antes de gravar.
    const { error } = await supabase.rpc('_guarded_ajustar_saldo_inicial_conta', {
      p_conta_id: conta.id,
      p_saldo_inicial: sugerido,
      p_ate: dataAnterior,
      p_periodo_fim: periodoFim,
      p_expected_updated_at: conta.updated_at,
      p_contexto: { arquivo: nomeArquivo, saldo_informado: divergencia.informado, data_saldo: dataSaldo },
    });
    if (error) {
      console.error('[ConfirmarSaldoExtratoDialog.ajustarSaldoInicial]', error);
      toast.error(mensagemErroAjuste(error.message, { ate: dataAnterior, periodoFim }));
      if (HISTORICO_MUDOU_RE.test(error.message)) await reconferir(divergencia.informado);
      return;
    }
    // Até processar as linhas deste extrato o saldo da conta fica no da véspera,
    // como em qualquer extrato ainda pendente.
    toast.success(`Saldo inicial ajustado para ${fmtBRL(sugerido)}. O saldo da conta fecha com o banco depois de processar as linhas deste extrato.`);
    emitDataEvent('financeiro:contas');
    await reconferir(divergencia.informado);
  });

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
      await conferirSaldo(informado);
    } finally {
      setLoading(false);
    }
  };

  const sugestao = divergencia?.sugestaoSaldoInicial;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto" {...retornoFoco}>
        {!divergencia ? (
          <>
            <DialogHeader>
              <DialogTitle>Confirme o saldo do seu extrato</DialogTitle>
              <DialogDescription>
                O saldo informado vira a referência da conferência de saldo do extrato.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <dl className="grid gap-2 rounded-lg border bg-muted p-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Arquivo</dt>
                  <dd className="break-all font-medium text-foreground">{nomeArquivo}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Período importado</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {formatDateBR(parseLocalDate(periodoInicio))} a {formatDateBR(parseLocalDate(periodoFim))}
                  </dd>
                </div>
              </dl>
              {internalMovementCount > 0 && (
                <div
                  role="alert"
                  className="rounded-lg border border-warning-border bg-warning-soft p-3 text-xs"
                >
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
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
                <p className="text-xs text-muted-foreground">
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
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                    Valor sugerido pelo arquivo — confira antes de confirmar.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onCancel} disabled={loading}>Cancelar</Button>
              <Button onClick={handleConfirmarValor} disabled={loading} aria-busy={loading}>
                {loading && <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />}
                {loading ? 'Verificando...' : 'Confirmar valor'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
                Saldo não confere
              </DialogTitle>
              <DialogDescription>
                Saldo informado e saldo calculado em {formatDateBR(parseLocalDate(dataSaldo))}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <dl className="space-y-1.5 rounded-lg border border-destructive-border bg-destructive-soft p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <dt className="text-muted-foreground">Saldo informado</dt>
                  <dd className="whitespace-nowrap font-medium tabular-nums text-foreground">{fmtBRL(divergencia.informado)}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <dt className="text-muted-foreground">Saldo calculado pelo sistema</dt>
                  <dd className="whitespace-nowrap font-medium tabular-nums text-foreground">{fmtBRL(divergencia.calculado)}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-destructive-border pt-1.5">
                  <dt className="font-medium text-foreground">Diferença</dt>
                  <dd className="whitespace-nowrap font-semibold tabular-nums text-destructive">{fmtBRL(divergencia.diferenca)}</dd>
                </div>
              </dl>
              {sugestao ? (
                <div
                  role="note"
                  aria-labelledby="sugestao-saldo-inicial-titulo"
                  className="space-y-1.5 rounded-lg border border-warning-border bg-warning-soft p-3 text-xs"
                >
                  <p id="sugestao-saldo-inicial-titulo" className="flex items-center gap-2 font-medium text-foreground">
                    <Info aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
                    O saldo inicial da conta não bate com este extrato
                  </p>
                  <p className="text-muted-foreground">
                    Esta conta não tem lançamentos antes de {formatDateBR(parseLocalDate(periodoInicio))}, então o saldo do
                    sistema em {formatDateBR(parseLocalDate(sugestao.data))} é o próprio saldo inicial cadastrado:{' '}
                    <strong className="whitespace-nowrap tabular-nums text-foreground">{fmtBRL(sugestao.atual)}</strong>.
                  </p>
                  <p className="text-muted-foreground">
                    Pelo extrato, o saldo do banco em {formatDateBR(parseLocalDate(sugestao.data))} era{' '}
                    <strong className="whitespace-nowrap tabular-nums text-foreground">{fmtBRL(sugestao.sugerido)}</strong>.
                    O saldo inicial precisa ser o saldo do banco antes do primeiro lançamento importado, não o saldo de hoje.
                  </p>
                  {sugestao.temPosteriores ? (
                    <p className="font-medium text-foreground">
                      Esta conta já tem lançamentos depois de {formatDateBR(parseLocalDate(periodoFim))}. Mudar o saldo inicial
                      desloca o saldo deles também, por isso o ajuste não é feito aqui: corrija em Contas Bancárias só se for
                      importar todo o período até esses lançamentos.
                    </p>
                  ) : canEditConta ? (
                    <p className="font-medium text-foreground">
                      Confira no app do banco o saldo de {formatDateBR(parseLocalDate(sugestao.data))} antes de ajustar.
                    </p>
                  ) : (
                    <p className="font-medium text-foreground">
                      Peça a quem pode editar contas bancárias para ajustar o saldo inicial.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Isso indica que pode haver lançamento(s) incorreto(s) ou faltando antes de {formatDateBR(parseLocalDate(periodoInicio))}.
                  Você pode continuar a conciliação mesmo assim e investigar depois, ou cancelar para corrigir antes.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onCancel} disabled={ajustando}>Cancelar importação</Button>
              <Button
                variant="destructive"
                onClick={() => onConfirmed({ valor: divergencia.informado, data: dataSaldo })}
                disabled={ajustando}
              >
                Continuar mesmo assim
              </Button>
              {sugestao && !sugestao.temPosteriores && canEditConta && (
                <Button onClick={ajustarSaldoInicial} disabled={ajustando} aria-busy={ajustando}>
                  {ajustando && <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />}
                  {ajustando ? 'Ajustando...' : `Ajustar saldo inicial para ${fmtBRL(sugestao.sugerido)}`}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
