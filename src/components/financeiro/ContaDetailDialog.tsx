import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtBRL, formatDateBR, formatPercentBR, parseLocalDate } from '@/lib/formatters';
import {
  Pencil, DollarSign, Undo2,
  CheckCircle, Clock, AlertTriangle, Ban,
} from 'lucide-react';

/* ─── Types ─── */
export type ContaDetailVariant = 'pagar' | 'receber' | 'lancamento';

export interface ContaDetailRateio {
  categoria_nome: string;
  centro_custo_nome: string;
  valor: number;
  percentual: number;
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
}

/* ─── Status config ─── */
const STATUS_MAP: Record<string, { label: string; color: string; Icon: typeof Clock }> = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', Icon: Clock },
  AGUARDANDO_APROVACAO: { label: 'Aguard. Aprovacao', color: 'bg-warning/10 text-warning border-warning/20', Icon: Clock },
  APROVADO: { label: 'Aprovado', color: 'bg-primary/10 text-primary border-primary/20', Icon: CheckCircle },
  PAGO: { label: 'Pago', color: 'bg-success/10 text-success border-success/20', Icon: CheckCircle },
  A_RECEBER: { label: 'A Receber', color: 'bg-primary/10 text-primary border-primary/20', Icon: Clock },
  RECEBIDO: { label: 'Recebido', color: 'bg-success/10 text-success border-success/20', Icon: CheckCircle },
  VENCIDO: { label: 'Vencido', color: 'bg-destructive/10 text-destructive border-destructive/20', Icon: AlertTriangle },
  CANCELADO: { label: 'Cancelado', color: 'bg-muted text-muted-foreground', Icon: Ban },
  PREVISTO: { label: 'Previsto', color: 'bg-warning/10 text-warning-foreground border-warning/20', Icon: Clock },
  REALIZADO: { label: 'Realizado', color: 'bg-success/10 text-success border-success/20', Icon: CheckCircle },
};

const FORMA_LABEL: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto bancario',
  dinheiro: 'Dinheiro',
  cartao: 'Cartao',
  transferencia: 'Transferencia',
};

const TIPO_LABEL: Record<string, string> = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
  TRANSFERENCIA: 'Transferencia',
};

const ORIGEM_LABEL: Record<string, string> = {
  manual: 'Lancamento Financeiro',
  conciliacao: 'Conciliacao Bancaria',
  espelho_cp: 'Espelho Conta a Pagar',
  espelho_cr: 'Espelho Conta a Receber',
  transferencia: 'Transferencia entre Contas',
  ajuste_pagamento: 'Ajuste de Baixa (juros/tarifa/desconto)',
};

function InfoField({ label, value, editable }: { label: string; value: string | null | undefined; editable?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium text-foreground truncate">{value || '-'}</p>
        {editable && <Pencil className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
      </div>
    </div>
  );
}

export default function ContaDetailDialog({
  open, onOpenChange, data, variant,
  onEdit, onPay, onEstornar, onAprovar,
  canEdit, canApprove, saving,
}: Props) {
  if (!data) return null;

  const status = STATUS_MAP[data.status] || STATUS_MAP.RASCUNHO;
  const fmt = fmtBRL;
  const fmtDate = (d: string | null | undefined) => d ? formatDateBR(parseLocalDate(d)) : '-';

  const tipoLabel = data.tipo
    ? (data.origem ? ORIGEM_LABEL[data.origem] || TIPO_LABEL[data.tipo] : TIPO_LABEL[data.tipo])
    : variant === 'pagar' ? 'Conta a Pagar' : variant === 'receber' ? 'Conta a Receber' : 'Lancamento';

  const entityLabel = variant === 'pagar' ? 'despesa' : variant === 'receber' ? 'receita' : 'lancamento';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">
            Detalhes da {entityLabel}
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Informacoes de lancamento */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Informacoes de lancamento</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {variant === 'pagar' && (
                <InfoField
                  label="Fornecedor"
                  value={data.fornecedor}
                />
              )}
              {variant === 'receber' && (
                <InfoField label="Cliente" value={data.cliente} />
              )}
              <InfoField label="Tipo" value={tipoLabel} />
              <InfoField label="Data de competencia" value={fmtDate(data.data_competencia)} />
              <InfoField
                label="Categoria"
                value={data.rateios.length > 1 ? `${data.rateios.length} informadas` : data.categoria_nome}
                editable={canEditAction}
              />
              <InfoField label="Centro de custo" value={data.centro_custo_nome} editable={canEditAction} />
              {data.codigo_referencia && (
                <InfoField label="Codigo de referencia" value={data.codigo_referencia} />
              )}
            </div>
            <Separator />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoField label="Vencimento" value={fmtDate(data.data_vencimento)} />
              <InfoField label="Descricao" value={data.descricao} editable={canEditAction} />
              <div className="text-right">
                <p className="text-xs text-muted-foreground font-medium mb-0.5">Valor total</p>
                <p className="text-2xl font-bold text-foreground">R$ {fmt(data.valor).replace('R$', '').trim()}</p>
              </div>
            </div>
          </section>

          {/* Informacoes detalhadas do pagamento */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Informacoes detalhadas do pagamento</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Vencimento</TableHead>
                  <TableHead className="text-xs">Forma de pagamento</TableHead>
                  <TableHead className="text-xs">Conta</TableHead>
                  <TableHead className="text-xs text-right">Valor R$</TableHead>
                  <TableHead className="text-xs text-right">Juros/Multa R$</TableHead>
                  <TableHead className="text-xs text-right">Desconto R$</TableHead>
                  <TableHead className="text-xs">Situacao</TableHead>
                  {(canPayOrReceive || canEstornar || canAprovarAction) && (
                    <TableHead className="text-xs text-right">Acoes</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-sm">{fmtDate(data.data_vencimento)}</TableCell>
                  <TableCell className="text-sm">{data.forma_pagamento ? FORMA_LABEL[data.forma_pagamento] || data.forma_pagamento : '-'}</TableCell>
                  <TableCell className="text-sm">{data.conta_nome || '-'}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{fmt(data.valor)}</TableCell>
                  <TableCell className="text-sm text-right text-muted-foreground">0,00</TableCell>
                  <TableCell className="text-sm text-right text-muted-foreground">0,00</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${status.color}`}>
                      {status.label}
                    </span>
                  </TableCell>
                  {(canPayOrReceive || canEstornar || canAprovarAction) && (
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {canAprovarAction && (
                          <Button size="sm" variant="outline" onClick={onAprovar} disabled={saving} className="text-xs h-7">
                            Aprovar
                          </Button>
                        )}
                        {canPayOrReceive && (
                          <Button size="sm" variant="default" onClick={onPay} disabled={saving} className="text-xs h-7">
                            <DollarSign className="w-3 h-3 mr-1" />
                            {variant === 'pagar' ? 'Pagar' : 'Receber'}
                          </Button>
                        )}
                        {canEstornar && (
                          <Button size="sm" variant="outline" onClick={onEstornar} disabled={saving} className="text-xs h-7 text-warning border-warning/30 hover:bg-warning/10">
                            <Undo2 className="w-3 h-3 mr-1" />Estornar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              </TableBody>
            </Table>

            {/* Summary totals */}
            <div className="flex justify-end gap-8 text-sm pt-2">
              <div className="text-right">
                <p className="text-muted-foreground text-xs">Valor em aberto (R$)</p>
                <p className={`font-bold ${['PAGO', 'RECEBIDO', 'REALIZADO'].includes(data.status) ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {['PAGO', 'RECEBIDO', 'REALIZADO'].includes(data.status) ? '0,00' : fmt(data.valor)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs">Valor pago (R$)</p>
                <p className={`font-bold ${['PAGO', 'RECEBIDO', 'REALIZADO'].includes(data.status) ? 'text-success' : 'text-muted-foreground'}`}>
                  {['PAGO', 'RECEBIDO', 'REALIZADO'].includes(data.status) ? fmt(data.valor) : '0,00'}
                </p>
              </div>
            </div>
          </section>

          {/* Observacoes */}
          <Accordion type="single" collapsible defaultValue={data.observacoes ? 'obs' : undefined}>
            <AccordionItem value="obs" className="bg-card border border-border rounded-xl px-5">
              <AccordionTrigger className="text-sm font-semibold py-4">
                Observacoes
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {data.observacoes ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{data.observacoes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma observacao encontrada</p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Categorias e Centro de Custo */}
          {data.rateios.length > 0 && (
            <Accordion type="single" collapsible defaultValue="cat">
              <AccordionItem value="cat" className="bg-card border border-border rounded-xl px-5">
                <AccordionTrigger className="text-sm font-semibold py-4">
                  Informacoes de categoria e centro de custo
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Categoria</TableHead>
                        <TableHead className="text-xs">Valor</TableHead>
                        <TableHead className="text-xs">Porcentagem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rateios.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{r.categoria_nome || '-'}</p>
                              {r.centro_custo_nome && (
                                <p className="text-xs text-muted-foreground ml-4 mt-1">
                                  Centro de custo: {r.centro_custo_nome}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{fmt(r.valor)}</TableCell>
                          <TableCell className="text-sm">{formatPercentBR(r.percentual, 2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            {canEditAction && onEdit && (
              <Button variant="outline" onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-1" /> Editar lancamento
              </Button>
            )}
            {canPayOrReceive && onPay && (
              <Button onClick={onPay} disabled={saving} className="bg-success hover:bg-success/90 text-success-foreground">
                <DollarSign className="w-4 h-4 mr-1" />
                {variant === 'pagar' ? 'Informar pagamento' : 'Informar recebimento'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
