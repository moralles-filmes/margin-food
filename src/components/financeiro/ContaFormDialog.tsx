import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BRLInput } from '@/components/ui/brl-input';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';
import CategoryCombobox from './CategoryCombobox';
import SupplierCombobox from './SupplierCombobox';
import { Plus, Trash2, Repeat } from 'lucide-react';
import { TIPOS_CODIGO_PAGAMENTO, MAX_CODIGO_PAGAMENTO } from '@/domain/financeiro/codigoPagamento';
import { getRecurrenceLimit } from '@/domain/financeiro/recurrence';
import { decisaoSugerida, formatarCentavos, formatarData, resumirBoleto, type CmvDecisao } from '@/domain/financeiro/cmv';
import CmvDecisaoToggle from './cmv/CmvDecisaoToggle';

/* ─── Types ─── */
type ContaFormVariant = 'pagar' | 'receber' | 'lancamento';

/** Por que a decisão do CMV está como está, para o usuário conferir antes de salvar. */
type CmvAviso = 'sugerido' | 'redefinido' | 'unificar';

export interface RateioLine {
  key: string;
  /** Id da linha já gravada: o servidor preserva o identificador do rateio na edição. */
  id?: string;
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  /** Aparecer no CMV financeiro? `null` = ainda não respondido. */
  cmv_incluir?: CmvDecisao;
  cmv_aviso?: CmvAviso;
}

/** Configuração do CMV Financeiro da empresa; ausente = recurso indisponível (formulário como antes). */
export interface ContaFormCmv {
  /** A empresa exige a decisão Sim/Não nos boletos novos. */
  ativo: boolean;
  /** Padrão sugerido por categoria (só sugere; a decisão fica gravada em cada linha). */
  padroes: ReadonlyMap<string, CmvDecisao>;
}

export interface ContaFormData {
  descricao: string;
  valor: number;
  data_competencia: string;
  data_vencimento: string;
  data_pagamento?: string;
  fornecedor?: string;
  supplier_id?: string;
  cliente?: string;
  categoria_id: string;
  centro_custo_id: string;
  conta_id: string;
  conta_destino_id?: string;
  tipo_codigo_pagamento?: string;
  codigo_pagamento?: string;
  forma_pagamento: string;
  observacoes: string;
  recorrente: boolean;
  frequencia: string;
  parcelas: number;
  /** Decisão do CMV do boleto sem rateio (com rateio, a decisão é de cada linha). */
  cmv_incluir?: CmvDecisao;
  cmv_aviso?: CmvAviso;
  tipo?: string; // RECEITA | DESPESA | TRANSFERENCIA (for lancamento)
  status?: string; // PREVISTO | REALIZADO (for lancamento)
  pago?: boolean;
}

interface CategoriaRef { id: string; nome: string; tipo: string; codigo?: string | null; centro_custo_padrao_id: string | null }
interface CentroRef { id: string; nome: string }
interface ContaRef { id: string; nome: string }
interface SupplierRef { id: string; name: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: ContaFormVariant;
  form: ContaFormData;
  onFormChange: (form: ContaFormData) => void;
  rateioLines: RateioLine[];
  onRateioLinesChange: (lines: RateioLine[]) => void;
  categorias: CategoriaRef[];
  centros: CentroRef[];
  contas: ContaRef[];
  suppliers?: SupplierRef[];
  isEditing: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  // Lancamento-specific
  editPrevStatus?: string | null;
  justificativa?: string;
  onJustificativaChange?: (v: string) => void;
  classificationOnly?: boolean;
  cmv?: ContaFormCmv | null;
}

export default function ContaFormDialog({
  open, onOpenChange, variant, form, onFormChange, rateioLines, onRateioLinesChange,
  categorias, centros, contas, suppliers,
  isEditing, saving, onSave, onClose,
  editPrevStatus, justificativa, onJustificativaChange,
  classificationOnly = false,
  cmv = null,
}: Props) {
  const [enableRateio, setEnableRateio] = useState(false);

  useEffect(() => {
    setEnableRateio(rateioLines.length > 0);
  }, [open, rateioLines.length]);

  const fmt = fmtBRL;
  const isTransfer = variant === 'lancamento' && form.tipo === 'TRANSFERENCIA';
  const titleLabel = variant === 'pagar' ? 'Conta a Pagar' : variant === 'receber' ? 'Conta a Receber' : 'Lancamento';
  const catFilterType = variant === 'pagar' ? 'despesa' : variant === 'receber' ? 'receita' : (form.tipo?.toLowerCase() || '');
  const recurrenceLimit = getRecurrenceLimit(form.frequencia);

  // ─── CMV financeiro ───
  const cmvTemDecisao = (form.cmv_incluir ?? null) !== null || rateioLines.some(l => (l.cmv_incluir ?? null) !== null);
  const mostrarCmv = variant === 'pagar' && cmv !== null && (cmv.ativo || cmvTemDecisao);

  /** Trocar a categoria reaplica o padrão dela — e avisa, para a decisão não mudar em silêncio. */
  const cmvAoTrocarCategoria = (anterior: CmvDecisao | undefined, categoriaId: string): { cmv_incluir: CmvDecisao; cmv_aviso?: CmvAviso } => {
    if (!cmv) return { cmv_incluir: anterior ?? null };
    const sugestao = decisaoSugerida(categoriaId, cmv.padroes);
    const antes = anterior ?? null;
    if (antes !== null && antes !== sugestao) return { cmv_incluir: sugestao, cmv_aviso: 'redefinido' };
    return { cmv_incluir: sugestao, cmv_aviso: sugestao !== null ? 'sugerido' : undefined };
  };

  // ─── Rateio helpers ───
  const addRateioLine = () => {
    const newLine: RateioLine = { key: crypto.randomUUID(), categoria_id: '', centro_custo_id: '', valor: 0, percentual: 0, cmv_incluir: null };
    onRateioLinesChange([...rateioLines, newLine]);
  };

  const removeRateioLine = (key: string) => {
    onRateioLinesChange(rateioLines.filter(l => l.key !== key));
  };

  const updateRateioLine = (key: string, fields: Record<string, any>) => {
    onRateioLinesChange(rateioLines.map(l => {
      if (l.key !== key) return l;
      const updated = { ...l, ...fields };
      if ('categoria_id' in fields) {
        const cat = categorias.find(c => c.id === fields.categoria_id);
        if (cat?.centro_custo_padrao_id) updated.centro_custo_id = cat.centro_custo_padrao_id;
        if (fields.categoria_id !== l.categoria_id) Object.assign(updated, cmvAoTrocarCategoria(l.cmv_incluir, fields.categoria_id));
      }
      return updated;
    }));
  };

  const ratearIgualmente = () => {
    if (rateioLines.length === 0) return;
    const perLine = Math.floor((form.valor / rateioLines.length) * 100) / 100;
    const remainder = form.valor - perLine * rateioLines.length;
    onRateioLinesChange(rateioLines.map((l, i) => ({
      ...l,
      valor: i === 0 ? perLine + Math.round(remainder * 100) / 100 : perLine,
      percentual: Math.round((100 / rateioLines.length) * 10) / 10,
    })));
  };

  const totalRateio = rateioLines.reduce((s, l) => s + Number(l.valor || 0), 0);
  const diffRateio = form.valor - totalRateio;
  const rateioValido = rateioLines.length === 0 || Math.abs(diffRateio) < 0.01;

  const handleToggleRateio = (v: boolean) => {
    setEnableRateio(v);
    if (!v) {
      // Preserve first rateio line's category/centro into the main form fields
      if (rateioLines.length > 0) {
        const first = rateioLines[0];
        onFormChange({
          ...form,
          categoria_id: first.categoria_id || form.categoria_id,
          centro_custo_id: first.centro_custo_id || form.centro_custo_id,
          // Linhas com respostas diferentes não viram uma só em silêncio: o boleto
          // inteiro passaria a contar (ou a sair) pelo valor cheio.
          ...(new Set(rateioLines.map(l => l.cmv_incluir ?? null)).size > 1
            ? { cmv_incluir: null, cmv_aviso: 'unificar' as const }
            : { cmv_incluir: first.cmv_incluir ?? null, cmv_aviso: first.cmv_aviso }),
        });
      }
      onRateioLinesChange([]);
    } else if (rateioLines.length === 0) {
      // Seed first rateio line with existing form category/centro
      const newLine: RateioLine = {
        key: crypto.randomUUID(),
        categoria_id: form.categoria_id || '',
        centro_custo_id: form.centro_custo_id || '',
        valor: form.valor || 0,
        percentual: 100,
        cmv_incluir: form.cmv_incluir ?? null,
        cmv_aviso: form.cmv_aviso,
      };
      onRateioLinesChange([newLine]);
    }
  };

  const set = (partial: Partial<ContaFormData>) => onFormChange({ ...form, ...partial });

  const rateioAtivo = enableRateio && rateioLines.length > 0;
  const cmvResumo = resumirBoleto(
    form.valor,
    rateioAtivo
      ? rateioLines.map(l => ({ valor: l.valor, cmv_incluir: l.cmv_incluir ?? null }))
      : [{ valor: form.valor, cmv_incluir: form.cmv_incluir ?? null }],
  );
  // Boleto novo exige a decisão; boleto legado em edição segue com a pendência à vista.
  // Na edição só trava a decisão que existia e foi apagada nesta tela (categoria trocada, rateio desfeito).
  const cmvApagadaNaEdicao = rateioAtivo
    ? rateioLines.some(l => (l.cmv_incluir ?? null) === null && l.cmv_aviso === 'redefinido')
    : (form.cmv_incluir ?? null) === null && (form.cmv_aviso === 'redefinido' || form.cmv_aviso === 'unificar');
  const cmvBloqueiaSalvar = mostrarCmv && Boolean(cmv?.ativo)
    && (isEditing ? cmvApagadaNaEdicao : cmvResumo.linhasPendentes > 0);
  const cmvCompetencia = form.data_competencia || form.data_vencimento;
  const marcarTodasCmv = (valor: boolean) =>
    onRateioLinesChange(rateioLines.map(l => ({ ...l, cmv_incluir: valor, cmv_aviso: undefined })));
  const textoAvisoCmv = (aviso?: CmvAviso) =>
    aviso === 'unificar' ? 'O rateio tinha respostas diferentes: informe a do boleto inteiro.'
      : aviso === 'redefinido' ? 'Categoria trocada: decisão redefinida. Confira.'
      : aviso === 'sugerido' ? 'Sugestão do padrão da categoria.'
        : null;

  const cmvResumoBloco = mostrarCmv && (
    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2" aria-live="polite">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Total do boleto</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatarCentavos(cmvResumo.totalCentavos)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Incluído no CMV</dt>
          <dd className="font-semibold tabular-nums text-primary-ink">{formatarCentavos(cmvResumo.incluidoCentavos)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fora do CMV</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatarCentavos(cmvResumo.foraCentavos)}</dd>
        </div>
        {cmvResumo.pendenteCentavos !== 0 || cmvResumo.linhasPendentes > 0 ? (
          <div>
            <dt className="text-muted-foreground">Pendente de classificação</dt>
            <dd className="font-semibold tabular-nums text-warning">{formatarCentavos(cmvResumo.pendenteCentavos)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-[11px] text-muted-foreground">
        {cmvCompetencia
          ? <>Competência usada no CMV: <strong className="text-foreground">{formatarData(cmvCompetencia)}</strong>{!form.data_competencia && ' (vencimento, pois a competência não foi informada)'}.</>
          : 'Sem data de competência o boleto não entra em nenhum período do CMV.'}
        {' '}A cobrança e o pagamento do boleto não mudam.
      </p>
      {cmvBloqueiaSalvar && (
        <p className="text-xs font-medium text-warning">Responda Sim ou Não{rateioAtivo ? ' em todas as linhas' : ''} para salvar.</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className={`${mostrarCmv ? 'max-w-4xl' : 'max-w-3xl'} p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">
            {classificationOnly
              ? 'Editar classificacao'
              : isEditing
                ? `Editar ${titleLabel}`
                : `Nova ${variant === 'pagar' ? 'despesa' : variant === 'receber' ? 'receita' : (form.tipo === 'RECEITA' ? 'receita' : form.tipo === 'TRANSFERENCIA' ? 'transferencia' : 'despesa')}`}
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {classificationOnly && (
            <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">A conciliacao bancaria sera mantida.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Somente categoria, centro de custo, rateio e observacoes podem ser alterados. Valor, data, conta, tipo e descricao bancaria permanecem bloqueados.
              </p>
            </div>
          )}

          {/* Informacoes do lancamento */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground italic">Informacoes do lancamento</h3>

            {/* Lancamento-specific: tipo + status */}
            {variant === 'lancamento' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={form.tipo || 'DESPESA'} onValueChange={v => set({ tipo: v })} disabled={classificationOnly || (isEditing && form.tipo === 'TRANSFERENCIA')}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RECEITA">Receita</SelectItem>
                      <SelectItem value="DESPESA">Despesa</SelectItem>
                      <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={form.status || 'PREVISTO'} onValueChange={v => set({ status: v })} disabled={classificationOnly}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PREVISTO">Previsto</SelectItem>
                      <SelectItem value="REALIZADO">Realizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Descricao (full width) */}
            <div>
              <Label className="text-xs text-muted-foreground">Descricao *</Label>
              <Input
                value={form.descricao}
                onChange={e => set({ descricao: e.target.value })}
                disabled={classificationOnly}
                className="mt-1"
              />
            </div>

            {/* Fornecedor/Cliente, Data competencia, Valor */}
            <div className={`grid gap-4 ${variant === 'pagar' ? 'grid-cols-1 sm:grid-cols-3' : variant === 'lancamento' ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {variant === 'pagar' && (
                <div>
                  <Label className="text-xs text-muted-foreground">Fornecedor</Label>
                  <SupplierCombobox
                    value={form.supplier_id || ''}
                    onValueChange={v => set({ supplier_id: v })}
                    options={suppliers || []}
                  />
                </div>
              )}
              {variant === 'receber' && (
                <div>
                  <Label className="text-xs text-muted-foreground">Cliente</Label>
                  <Input
                    value={form.cliente || ''}
                    onChange={e => set({ cliente: e.target.value })}
                    placeholder="Nome do cliente"
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Data de competencia *</Label>
                <DateInput
                  value={form.data_competencia}
                  onValueChange={v => set({ data_competencia: v })}
                  disabled={classificationOnly}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Valor *</Label>
                <BRLInput
                  numericValue={form.valor}
                  onNumericChange={v => set({ valor: v })}
                  showPrefix
                  disabled={classificationOnly}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Rateio toggle + Categoria + Centro de custo */}
            {!isTransfer && (
              <div className={`grid gap-4 items-end ${variant === 'pagar' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-3'}`}>
                <div className="flex items-center gap-2 self-center">
                  <Label className="text-xs text-muted-foreground">Habilitar rateio</Label>
                  <Switch
                    checked={enableRateio}
                    onCheckedChange={handleToggleRateio}
                  />
                </div>
                {!enableRateio && (
                  <>
                    <div>
                      <Label className="text-xs text-muted-foreground">Categoria *</Label>
                      <CategoryCombobox
                        value={form.categoria_id}
                        onValueChange={v => set({
                          categoria_id: v,
                          ...(v !== form.categoria_id ? cmvAoTrocarCategoria(form.cmv_incluir, v) : {}),
                        })}
                        options={categorias.filter(c => catFilterType ? c.tipo === catFilterType : true)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Centro de custo</Label>
                      <Select value={form.centro_custo_id} onValueChange={v => set({ centro_custo_id: v })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* CMV financeiro — boleto de uma categoria */}
            {!isTransfer && mostrarCmv && !rateioAtivo && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Label className="text-sm font-medium text-foreground">Aparecer no CMV financeiro?</Label>
                  <CmvDecisaoToggle
                    value={form.cmv_incluir ?? null}
                    onChange={v => set({ cmv_incluir: v, cmv_aviso: undefined })}
                    label="Aparecer no CMV financeiro?"
                  />
                  {textoAvisoCmv(form.cmv_aviso) && (
                    <span className="text-xs text-muted-foreground">{textoAvisoCmv(form.cmv_aviso)}</span>
                  )}
                </div>
                {cmvResumoBloco}
              </div>
            )}

            {/* Rateio table */}
            {!isTransfer && enableRateio && rateioLines.length > 0 && (
              <div className="border border-border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Rateio por Categoria</Label>
                  <div className="flex flex-wrap justify-end gap-1">
                    {mostrarCmv && (
                      <>
                        <Button type="button" size="sm" variant="outline" onClick={() => marcarTodasCmv(true)} className="text-xs h-7">Marcar todas</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => marcarTodasCmv(false)} className="text-xs h-7">Desmarcar todas</Button>
                      </>
                    )}
                    {rateioLines.length > 1 && form.valor > 0 && (
                      <Button type="button" size="sm" variant="outline" onClick={ratearIgualmente} className="text-xs h-7">Ratear Igual</Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={addRateioLine} className="text-xs h-7">
                      <Plus className="w-3 h-3 mr-1" /> Linha
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Categoria</TableHead>
                      <TableHead className="text-xs">Centro Custo</TableHead>
                      <TableHead className={`text-xs ${mostrarCmv ? 'min-w-[8.5rem]' : 'w-24'}`}>Valor</TableHead>
                      <TableHead className="text-xs w-16">%</TableHead>
                      {mostrarCmv && <TableHead className="text-xs whitespace-nowrap">Aparecer no CMV financeiro?</TableHead>}
                      <TableHead className="text-xs w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateioLines.map(line => (
                      <TableRow key={line.key}>
                        <TableCell className="p-1">
                          <CategoryCombobox
                            value={line.categoria_id}
                            onValueChange={v => updateRateioLine(line.key, { categoria_id: v })}
                            options={categorias.filter(c => catFilterType ? c.tipo === catFilterType : true)}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Select value={line.centro_custo_id} onValueChange={v => updateRateioLine(line.key, { centro_custo_id: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
                            <SelectContent>{centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1">
                          <BRLInput
                            numericValue={line.valor || 0}
                            onNumericChange={val => {
                              const pct = form.valor > 0 ? (val / form.valor) * 100 : 0;
                              updateRateioLine(line.key, { valor: val, percentual: Math.round(pct * 10) / 10 });
                            }}
                            showPrefix
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="p-1 text-xs text-muted-foreground text-center">
                          {line.percentual ? formatPercentBR(line.percentual, 1) : '-'}
                        </TableCell>
                        {mostrarCmv && (
                          <TableCell className="p-1">
                            <CmvDecisaoToggle
                              size="sm"
                              value={line.cmv_incluir ?? null}
                              onChange={v => updateRateioLine(line.key, { cmv_incluir: v, cmv_aviso: undefined })}
                              label={`Aparecer no CMV financeiro? — ${categorias.find(c => c.id === line.categoria_id)?.nome || 'linha sem categoria'}`}
                            />
                            {textoAvisoCmv(line.cmv_aviso) && (
                              <p className="mt-1 max-w-[11rem] text-[11px] leading-tight text-muted-foreground">{textoAvisoCmv(line.cmv_aviso)}</p>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="p-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRateioLine(line.key)}>
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-muted-foreground">Total rateado: <strong>{fmt(totalRateio)}</strong></span>
                  {Math.abs(diffRateio) >= 0.01 && <span className="text-destructive font-medium">Diferenca: {fmt(diffRateio)}</span>}
                  {Math.abs(diffRateio) < 0.01 && rateioLines.length > 0 && <span className="text-success font-medium">Rateio fechado</span>}
                </div>
                {cmvResumoBloco}
              </div>
            )}
          </section>

          {/* Repetir lancamento */}
          {!isTransfer && !classificationOnly && (
            <section className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">Repetir lancamento?</Label>
                </div>
                <Switch
                  checked={form.recorrente}
                  onCheckedChange={v => set({ recorrente: v, parcelas: v ? Math.max(form.parcelas, 2) : 0 })}
                />
              </div>
              {form.recorrente && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Frequencia</Label>
                    <Select
                      value={form.frequencia}
                      onValueChange={v => {
                        const nextLimit = getRecurrenceLimit(v);
                        set({ frequencia: v, parcelas: Math.min(Math.max(form.parcelas, 2), nextLimit) });
                      }}
                    >
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Total de lançamentos (máx. {recurrenceLimit})
                    </Label>
                    <Input
                      type="number"
                      min={2}
                      max={recurrenceLimit}
                      step={1}
                      value={form.parcelas}
                      onChange={e => {
                        const value = Number.parseInt(e.target.value, 10);
                        set({ parcelas: Number.isNaN(value) ? 0 : value });
                      }}
                      onBlur={() => set({ parcelas: Math.min(Math.max(form.parcelas || 2, 2), recurrenceLimit) })}
                      className="mt-1"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">Inclui o lançamento atual.</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Condicao de pagamento */}
          {!classificationOnly && <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Condicao de pagamento</h3>
            <div className={`grid gap-4 items-end ${variant === 'pagar' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-4'}`}>
              {variant !== 'lancamento' && (
                <div>
                  <Label className="text-xs text-muted-foreground">Parcelamento *</Label>
                  <Select value="avista" disabled>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avista">A vista</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Vencimento *</Label>
                <DateInput
                  value={form.data_vencimento}
                  onValueChange={v => set({ data_vencimento: v })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
                <Select value={form.forma_pagamento} onValueChange={v => set({ forma_pagamento: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartao</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  {isTransfer ? 'Conta Origem' : 'Conta de pagamento'}
                </Label>
                <Select value={form.conta_id} onValueChange={v => set({ conta_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {variant === 'lancamento' && !isTransfer && (
                <div>
                  <Label className="text-xs text-muted-foreground">Data Pagamento</Label>
                  <DateInput
                    value={form.data_pagamento || ''}
                    onValueChange={v => set({ data_pagamento: v })}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
            {/* Transfer: Conta Destino on its own row */}
            {isTransfer && (
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Conta Destino</Label>
                  <Select value={form.conta_destino_id || ''} onValueChange={v => set({ conta_destino_id: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{contas.filter(c => c.id !== form.conta_id).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Transfer info */}
            {isTransfer && (
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                Transferencias criam automaticamente dois lancamentos vinculados (saida da origem + entrada no destino) e nao afetam relatorios de receitas/despesas.
              </div>
            )}
          </section>}

          {variant === 'pagar' && (
            <section className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold">Dados para pagamento</h3>
              <p className="text-xs text-muted-foreground">Opcional. Informe o código desta conta para copiá-lo na aba Códigos de Pagamento.</p>
              <div>
                <Label htmlFor="tipo-codigo-pagamento">Tipo do código</Label>
                <Select value={form.tipo_codigo_pagamento || 'sem_codigo'} onValueChange={v => set(v === 'sem_codigo'
                  ? { tipo_codigo_pagamento: '', codigo_pagamento: '' }
                  : { tipo_codigo_pagamento: v })}>
                  <SelectTrigger id="tipo-codigo-pagamento" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem_codigo">Sem código</SelectItem>
                    {Object.entries(TIPOS_CODIGO_PAGAMENTO).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.tipo_codigo_pagamento && (
                <div>
                  <Label htmlFor="codigo-pagamento">Código / chave de pagamento</Label>
                  <Textarea id="codigo-pagamento" value={form.codigo_pagamento || ''}
                    onChange={e => set({ codigo_pagamento: e.target.value })}
                    maxLength={MAX_CODIGO_PAGAMENTO} rows={3} autoComplete="off" spellCheck={false}
                    className="mt-1 font-mono text-sm break-all" aria-describedby="codigo-pagamento-ajuda" />
                  <p id="codigo-pagamento-ajuda" className="mt-1 text-xs text-muted-foreground">Cole o código completo. A formatação será preservada. Para remover, selecione “Sem código”.</p>
                </div>
              )}
              {form.recorrente && <p className="text-xs text-muted-foreground">O código será salvo somente nesta parcela. Preencha o código de cada uma das demais parcelas ao recebê-lo.</p>}
            </section>
          )}

          {/* Justificativa for REALIZADO edits */}
          {variant === 'lancamento' && isEditing && (classificationOnly || editPrevStatus === 'REALIZADO') && (
            <section className="border border-warning/30 bg-warning/5 rounded-xl p-5 space-y-3">
              <Label className="text-sm font-semibold text-warning-foreground">Justificativa obrigatoria</Label>
              <p className="text-xs text-muted-foreground">
                {classificationOnly
                  ? 'Informe o motivo da reclassificacao. A justificativa ficara registrada na auditoria.'
                  : 'Este lancamento ja esta REALIZADO. Informe o motivo da alteracao.'}
              </p>
              <Textarea
                value={justificativa || ''}
                onChange={e => onJustificativaChange?.(e.target.value)}
                placeholder="Motivo da alteracao..."
                className="min-h-[60px]"
              />
            </section>
          )}

          {/* Observacoes / Anexo tabs */}
          <Tabs defaultValue="obs" className="bg-card border border-border rounded-xl overflow-hidden">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
              <TabsTrigger
                value="obs"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm"
              >
                Observacoes
              </TabsTrigger>
              <TabsTrigger
                value="anexo"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm"
              >
                Anexo
              </TabsTrigger>
            </TabsList>
            <TabsContent value="obs" className="p-4 mt-0">
              <Label className="text-xs text-muted-foreground">Observacoes</Label>
              <Textarea
                value={form.observacoes}
                onChange={e => set({ observacoes: e.target.value })}
                placeholder="Descreva observacoes relevantes sobre esse lancamento financeiro"
                className="min-h-[80px] mt-1"
              />
            </TabsContent>
            <TabsContent value="anexo" className="p-4 mt-0">
              <p className="text-sm text-muted-foreground">Funcionalidade de anexos em breve.</p>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Voltar
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || (enableRateio && rateioLines.length > 0 && !rateioValido) || cmvBloqueiaSalvar}
          >
            {saving ? 'Salvando...' : isEditing ? 'Salvar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
