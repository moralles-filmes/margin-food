import { useRef, type ReactNode } from 'react';
import CodigoPagamento from './CodigoPagamento';
import { TIPOS_CODIGO_PAGAMENTO, type TipoCodigoPagamento } from '@/domain/financeiro/codigoPagamento';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import StatusBadge from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import { fmtBRL, formatDateBR, formatPercentBR, parseLocalDate } from '@/lib/formatters';
import { Pencil, DollarSign, Undo2 } from 'lucide-react';
import { useRetornoFoco } from './useRetornoFoco';
import { guardarOrigemDoDetalhe } from './contaDialogFoco';
import { detalheStatusBadge } from './contasView';

/* ─── Types ─── */
type ContaDetailVariant = 'pagar' | 'receber' | 'lancamento';

export interface ContaDetailRateio {
  categoria_nome: string;
  centro_custo_nome: string;
  valor: number;
  percentual: number;
  /** CMV financeiro: `undefined` = recurso indisponível (coluna não aparece). */
  cmv_incluir?: boolean | null;
}

export interface ContaDetailData {
  id: string;
  descricao: string;
  valor: number;
  status: string;
  tipo?: string; // RECEITA | DESPESA | TRANSFERENCIA
  origem?: string;
  data_competencia: string;
  data_vencimento: string | null;
  data_pagamento?: string | null;
  tipo_codigo_pagamento?: string | null;
  codigo_pagamento?: string | null;
  forma_pagamento: string | null;
  fornecedor?: string | null;
  cliente?: string | null;
  conta_nome?: string | null;
  categoria_nome?: string | null;
  centro_custo_nome?: string | null;
  codigo_referencia?: string | null;
  observacoes?: string | null;
  conciliado?: boolean | null;
  recorrente?: boolean;
  rateios: ContaDetailRateio[];
  updated_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ContaDetailData | null;
  variant: ContaDetailVariant;
  onEdit?: () => void;
  onPay?: () => void;
  onEstornar?: () => void;
  onAprovar?: () => void;
  canEdit?: boolean;
  canApprove?: boolean;
  saving?: boolean;
  /** Elemento que recebe o foco ao fechar quando quem abriu o detalhe saiu da tela. */
  focoReserva?: () => HTMLElement | null;
}

const FORMA_LABEL: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto bancário',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  transferencia: 'Transferência',
};

const TIPO_LABEL: Record<string, string> = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
  TRANSFERENCIA: 'Transferência',
};

const ORIGEM_LABEL: Record<string, string> = {
  manual: 'Lançamento Financeiro',
  conciliacao: 'Conciliação Bancária',
  espelho_cp: 'Espelho Conta a Pagar',
  espelho_cr: 'Espelho Conta a Receber',
  transferencia: 'Transferência entre Contas',
  ajuste_pagamento: 'Ajuste de Baixa (juros/tarifa/desconto)',
};

function InfoField({ label, value, editable }: { label: string; value: string | null | undefined; editable?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1">
        <span className="break-words text-sm font-medium text-foreground">{value || '-'}</span>
        {editable && <Pencil aria-hidden="true" className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
      </dd>
    </div>
  );
}

function DetailSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5', className)}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function cmvTexto(valor: boolean | null | undefined) {
  if (valor === true) return 'Sim (entra no CMV)';
  if (valor === false) return 'Não (fora do CMV)';
  return null;
}

export default function ContaDetailDialog({
  open, onOpenChange, data, variant,
  onEdit, onPay, onEstornar, onAprovar,
  canEdit, canApprove, saving, focoReserva,
}: Props) {
  const retornoFoco = useRetornoFoco(focoReserva);
  const origem = useRef<HTMLElement | null>(null);
  const conteudo = useRef<HTMLDivElement | null>(null);

  if (!data) return null;

  const status = detalheStatusBadge(data.status);
  const fmt = fmtBRL;
  const fmtDate = (d: string | null | undefined) => d ? formatDateBR(parseLocalDate(d)) : '-';

  const tipoLabel = data.tipo
    ? (data.origem ? ORIGEM_LABEL[data.origem] || TIPO_LABEL[data.tipo] : TIPO_LABEL[data.tipo])
    : variant === 'pagar' ? 'Conta a Pagar' : variant === 'receber' ? 'Conta a Receber' : 'Lançamento';

  const titulo = variant === 'pagar' ? 'Detalhes da despesa' : variant === 'receber' ? 'Detalhes da receita' : 'Detalhes do lançamento';

  // Action button labels
  const canPayOrReceive = variant === 'pagar'
    ? data.status === 'APROVADO'
    : variant === 'receber'
      ? data.status === 'A_RECEBER'
      : false;
  const canEstornar = variant === 'pagar'
    ? data.status === 'PAGO'
    : variant === 'receber'
      ? data.status === 'RECEBIDO'
      : false;
  const canAprovarAction = variant === 'pagar' && data.status === 'AGUARDANDO_APROVACAO' && canApprove;
  const canEditAction = canEdit && !['PAGO', 'RECEBIDO', 'CANCELADO'].includes(data.status);
  const quitado = ['PAGO', 'RECEBIDO', 'REALIZADO'].includes(data.status);
  const mostraCmv = data.rateios.some(r => r.cmv_incluir !== undefined);

  const editar = () => {
    // O formulário abre no lugar do detalhe: ele devolve o foco a quem abriu o detalhe.
    guardarOrigemDoDetalhe(origem.current);
    onEdit?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={conteudo}
        className="max-w-4xl p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col focus:outline-none"
        onOpenAutoFocus={event => {
          origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          retornoFoco.onOpenAutoFocus();
          // Foco no próprio diálogo: o primeiro botão focável é uma ação (Pagar/Estornar) e um Enter a acionaria.
          event.preventDefault();
          conteudo.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={retornoFoco.onCloseAutoFocus}
      >
        <DialogHeader className="space-y-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-lg font-semibold leading-tight text-foreground">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">{data.descricao}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
          <DetailSection title="Informações do lançamento">
            <dl className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 sm:grid-cols-3">
              {variant === 'pagar' && <InfoField label="Fornecedor" value={data.fornecedor} />}
              {variant === 'receber' && <InfoField label="Cliente" value={data.cliente} />}
              <InfoField label="Tipo" value={tipoLabel} />
              <InfoField label="Data de competência" value={fmtDate(data.data_competencia)} />
              <InfoField
                label="Categoria"
                value={data.rateios.length > 1 ? `${data.rateios.length} informadas` : data.categoria_nome}
                editable={canEditAction}
              />
              <InfoField label="Centro de custo" value={data.centro_custo_nome} editable={canEditAction} />
              {data.codigo_referencia && <InfoField label="Código de referência" value={data.codigo_referencia} />}
            </dl>
            <Separator />
            <dl className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 sm:grid-cols-3">
              <InfoField label="Vencimento" value={fmtDate(data.data_vencimento)} />
              <InfoField label="Descrição" value={data.descricao} editable={canEditAction} />
              <div className="min-w-0 min-[400px]:col-span-2 sm:col-span-1 sm:text-right">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">Valor total</dt>
                <dd className="text-2xl font-bold tabular-nums text-foreground">R$ {fmt(data.valor).replace('R$', '').trim()}</dd>
              </div>
            </dl>
          </DetailSection>

          <DetailSection title="Informações detalhadas do pagamento">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <InfoField label="Vencimento" value={fmtDate(data.data_vencimento)} />
              <InfoField label="Forma de pagamento" value={data.forma_pagamento ? FORMA_LABEL[data.forma_pagamento] || data.forma_pagamento : '-'} />
              <InfoField label="Conta" value={data.conta_nome} />
              <div className="min-w-0">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">Valor R$</dt>
                <dd className="text-sm font-medium tabular-nums text-foreground">{fmt(data.valor)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">Juros/Multa R$</dt>
                <dd className="text-sm tabular-nums text-muted-foreground">0,00</dd>
              </div>
              <div className="min-w-0">
                <dt className="mb-0.5 text-xs font-medium text-muted-foreground">Desconto R$</dt>
                <dd className="text-sm tabular-nums text-muted-foreground">0,00</dd>
              </div>
              <div className="min-w-0">
                <dt className="mb-1 text-xs font-medium text-muted-foreground">Situação</dt>
                <dd><StatusBadge status={status.status} label={status.label} size="md" /></dd>
              </div>
            </dl>

            {(canPayOrReceive || canEstornar || canAprovarAction) && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="mr-auto text-xs font-medium text-muted-foreground">Ações</span>
                {canAprovarAction && (
                  <Button size="sm" variant="outline" onClick={onAprovar} disabled={saving} className="h-8 text-xs">
                    Aprovar
                  </Button>
                )}
                {canPayOrReceive && (
                  <Button size="sm" variant="default" onClick={onPay} disabled={saving} className="h-8 text-xs">
                    <DollarSign aria-hidden="true" className="mr-1 h-3 w-3" />
                    {variant === 'pagar' ? 'Pagar' : 'Receber'}
                  </Button>
                )}
                {canEstornar && (
                  <Button size="sm" variant="outline" onClick={onEstornar} disabled={saving} className="h-8 border-warning-border text-xs text-warning hover:bg-warning-soft">
                    <Undo2 aria-hidden="true" className="mr-1 h-3 w-3" />Estornar
                  </Button>
                )}
              </div>
            )}

            <dl className="flex flex-wrap justify-end gap-x-8 gap-y-2 border-t pt-3 text-sm">
              <div className="text-right">
                <dt className="text-xs text-muted-foreground">Valor em aberto (R$)</dt>
                <dd className={cn('font-bold tabular-nums', quitado ? 'text-muted-foreground' : 'text-destructive')}>
                  {quitado ? '0,00' : fmt(data.valor)}
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-xs text-muted-foreground">Valor pago (R$)</dt>
                <dd className={cn('font-bold tabular-nums', quitado ? 'text-success' : 'text-muted-foreground')}>
                  {quitado ? fmt(data.valor) : '0,00'}
                </dd>
              </div>
            </dl>
          </DetailSection>

          {variant === 'pagar' && data.codigo_pagamento && (
            <DetailSection title="Dados para pagamento" className="space-y-3">
              <p className="text-xs text-muted-foreground">{TIPOS_CODIGO_PAGAMENTO[data.tipo_codigo_pagamento as TipoCodigoPagamento]}</p>
              <CodigoPagamento codigo={data.codigo_pagamento} rotulo={data.fornecedor || data.descricao} />
            </DetailSection>
          )}

          <Accordion type="single" collapsible defaultValue={data.observacoes ? 'obs' : undefined}>
            <AccordionItem value="obs" className="rounded-xl border border-border bg-card px-4 sm:px-5">
              <AccordionTrigger className="py-4 text-sm font-semibold">
                Observações
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {data.observacoes ? (
                  <p className="whitespace-pre-wrap text-sm text-foreground">{data.observacoes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma observação encontrada</p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {data.rateios.length > 0 && (
            <Accordion type="single" collapsible defaultValue="cat">
              <AccordionItem value="cat" className="rounded-xl border border-border bg-card px-4 sm:px-5">
                <AccordionTrigger className="py-4 text-left text-sm font-semibold">
                  Informações de categoria e centro de custo
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <ul className="divide-y divide-border" aria-label="Categorias do lançamento">
                    {data.rateios.map((r, i) => {
                      const cmv = cmvTexto(r.cmv_incluir);
                      return (
                        <li key={i} className="space-y-1 py-3 first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 break-words text-sm font-medium text-foreground">{r.categoria_nome || '-'}</p>
                            <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">{fmt(r.valor)}</p>
                          </div>
                          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                            <p className="min-w-0 break-words">{r.centro_custo_nome ? `Centro de custo: ${r.centro_custo_nome}` : 'Sem centro de custo'}</p>
                            <p className="shrink-0 tabular-nums">{formatPercentBR(r.percentual, 2)}</p>
                          </div>
                          {mostraCmv && (
                            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <span>CMV financeiro:</span>
                              {cmv
                                ? <span className="font-medium text-foreground">{cmv}</span>
                                : <StatusBadge status="warning" label="Pendente de classificação" />}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-background-subtle px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canEditAction && onEdit && (
              <Button variant="outline" onClick={editar}>
                <Pencil aria-hidden="true" className="mr-1 h-4 w-4" /> Editar lançamento
              </Button>
            )}
            {canPayOrReceive && onPay && (
              <Button onClick={onPay} disabled={saving} className="bg-success hover:bg-success/90 text-success-foreground">
                <DollarSign aria-hidden="true" className="mr-1 h-4 w-4" />
                {variant === 'pagar' ? 'Informar pagamento' : 'Informar recebimento'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
