import { useState, useEffect, useId, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { decisaoAoTrocarCategoria, formatarCentavos, formatarData, resumirBoleto, type CmvDecisao } from '@/domain/financeiro/cmv';
import CmvDecisaoToggle from './cmv/CmvDecisaoToggle';
import { useRetornoFoco } from './useRetornoFoco';
import { useConteinerEstreito } from './useConteinerEstreito';
import { tomarOrigemDoDetalhe } from './contaDialogFoco';

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
  /** Mostra o atalho "Cadastrar fornecedor" (permissão de criar fornecedor em Compras ou no Financeiro). */
  canQuickAddSupplier?: boolean;
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
  /** Reclassificação de lançamento conciliado pode ajustar a competência (banco com o recurso). */
  competenciaNaReclassificacao?: boolean;
  /** Elemento que recebe o foco ao fechar quando quem abriu o formulário saiu da tela. */
  focoReserva?: () => HTMLElement | null;
}

/**
 * Abaixo desta largura da área do rateio, ele vira lista de cartões (uma só marcação, D45).
 * Medido em navegador: a tabela precisa de ~500 px sem a coluna do CMV e de 736 px com ela.
 */
const RATEIO_LIMITE_PX = 640;
const RATEIO_LIMITE_CMV_PX = 760;
/** A área do rateio chega a 770 px no diálogo mais largo: com a histerese padrão (32 px) não voltaria a tabela. */
const RATEIO_HISTERESE_PX = 8;

const SECAO = 'space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5';

export default function ContaFormDialog({
  open, onOpenChange, variant, form, onFormChange, rateioLines, onRateioLinesChange,
  categorias, centros, contas, suppliers, canQuickAddSupplier = false,
  isEditing, saving, onSave, onClose,
  editPrevStatus, justificativa, onJustificativaChange,
  classificationOnly = false,
  cmv = null,
  competenciaNaReclassificacao = false,
  focoReserva,
}: Props) {
  const [enableRateio, setEnableRateio] = useState(false);
  const uid = useId();
  const id = (campo: string) => `${uid}-${campo}`;
  // Reserva do retorno de foco: quem abriu o detalhe, quando o formulário veio de "Editar lançamento".
  const origemEncadeada = useRef<HTMLElement | null>(null);
  const retornoFoco = useRetornoFoco(() => focoReserva?.() ?? (origemEncadeada.current?.isConnected ? origemEncadeada.current : null));

  useEffect(() => {
    setEnableRateio(rateioLines.length > 0);
  }, [open, rateioLines.length]);

  const fmt = fmtBRL;
  const isTransfer = variant === 'lancamento' && form.tipo === 'TRANSFERENCIA';
  const titleLabel = variant === 'pagar' ? 'Conta a Pagar' : variant === 'receber' ? 'Conta a Receber' : 'Lançamento';
  const catFilterType = variant === 'pagar' ? 'despesa' : variant === 'receber' ? 'receita' : (form.tipo?.toLowerCase() || '');
  const recurrenceLimit = getRecurrenceLimit(form.frequencia);

  // ─── CMV financeiro ───
  // Boleto de Contas a Pagar e despesa do Livro Razão. Só o boleto exige a resposta;
  // no lançamento ela é sugerida pelo padrão da categoria e a pendência fica na revisão.
  const cmvDoc = variant === 'pagar' ? 'boleto' : 'despesa';
  const cmvVariante = variant === 'pagar' || (variant === 'lancamento' && form.tipo === 'DESPESA');
  const cmvTemDecisao = (form.cmv_incluir ?? null) !== null || rateioLines.some(l => (l.cmv_incluir ?? null) !== null);
  // Aviso de categoria trocada mantém a pergunta à vista: sem isso, com a classificação
  // desligada, a decisão seria apagada ao salvar sem ninguém ver o "Confira".
  const cmvTemAviso = Boolean(form.cmv_aviso) || rateioLines.some(l => Boolean(l.cmv_aviso));
  const mostrarCmv = cmvVariante && cmv !== null && (cmv.ativo || cmvTemDecisao || cmvTemAviso);
  const [rateioRef, rateioEstreito] = useConteinerEstreito(mostrarCmv ? RATEIO_LIMITE_CMV_PX : RATEIO_LIMITE_PX, RATEIO_HISTERESE_PX);

  /** Trocar a categoria reaplica o padrão dela — e avisa, para a decisão não mudar em silêncio. */
  const cmvAoTrocarCategoria = (anterior: CmvDecisao | undefined, categoriaId: string): { cmv_incluir: CmvDecisao; cmv_aviso?: CmvAviso } =>
    cmv ? decisaoAoTrocarCategoria(anterior, categoriaId, cmv.padroes) : { cmv_incluir: anterior ?? null };

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
  const cmvBloqueiaSalvar = variant === 'pagar' && mostrarCmv && Boolean(cmv?.ativo)
    && (isEditing ? cmvApagadaNaEdicao : cmvResumo.linhasPendentes > 0);
  // O CMV do boleto cai na competência e, sem ela, no vencimento; o da despesa de lançamento só usa a competência.
  const cmvCompetencia = variant === 'pagar' ? (form.data_competencia || form.data_vencimento) : form.data_competencia;
  const marcarTodasCmv = (valor: boolean) =>
    onRateioLinesChange(rateioLines.map(l => ({ ...l, cmv_incluir: valor, cmv_aviso: undefined })));
  const textoAvisoCmv = (aviso?: CmvAviso) =>
    aviso === 'unificar' ? `O rateio tinha respostas diferentes: informe a ${variant === 'pagar' ? 'do boleto inteiro' : 'da despesa inteira'}.`
      : aviso === 'redefinido' ? 'Categoria trocada: decisão redefinida. Confira.'
      : aviso === 'sugerido' ? 'Sugestão do padrão da categoria.'
        : null;
  const nomeCategoria = (categoriaId: string) => categorias.find(c => c.id === categoriaId)?.nome || 'linha sem categoria';
  const categoriasDoTipo = categorias.filter(c => catFilterType ? c.tipo === catFilterType : true);

  const titulo = classificationOnly
    ? 'Editar classificação'
    : isEditing
      ? `Editar ${titleLabel}`
      : `Nova ${variant === 'pagar' ? 'despesa' : variant === 'receber' ? 'receita' : (form.tipo === 'RECEITA' ? 'receita' : form.tipo === 'TRANSFERENCIA' ? 'transferência' : 'despesa')}`;

  const cmvResumoBloco = mostrarCmv && (
    <div className="rounded-lg border border-border bg-muted p-3 space-y-2" aria-live="polite">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Total {cmvDoc === 'boleto' ? 'do boleto' : 'da despesa'}</dt>
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
          : `Sem data de competência ${cmvDoc === 'boleto' ? 'o boleto' : 'a despesa'} não entra em nenhum período do CMV.`}
        {' '}{cmvDoc === 'boleto' ? 'A cobrança e o pagamento do boleto não mudam.' : 'O pagamento e o saldo da conta não mudam.'}
      </p>
      {cmvBloqueiaSalvar && (
        <p className="text-xs font-medium text-warning">Responda Sim ou Não{rateioAtivo ? ' em todas as linhas' : ''} para salvar.</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent
        className={`${mostrarCmv ? 'max-w-4xl' : 'max-w-3xl'} p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col`}
        onOpenAutoFocus={() => {
          origemEncadeada.current = tomarOrigemDoDetalhe();
          retornoFoco.onOpenAutoFocus();
        }}
        onCloseAutoFocus={retornoFoco.onCloseAutoFocus}
      >
        <DialogHeader className="space-y-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-lg font-semibold leading-tight text-foreground">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">Campos com * são obrigatórios.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
          {classificationOnly && (
            <div className="rounded-lg border border-success-border bg-success-soft px-4 py-3 text-sm">
              <p className="font-medium text-foreground">A conciliação bancária será mantida.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {competenciaNaReclassificacao
                  ? 'Somente categoria, centro de custo, rateio, competência, a resposta do CMV e observações podem ser alterados. Valor, data do banco, conta, tipo e descrição bancária permanecem bloqueados.'
                  : 'Somente categoria, centro de custo, rateio e observações podem ser alterados. Valor, data, conta, tipo e descrição bancária permanecem bloqueados.'}
              </p>
            </div>
          )}

          {/* Informações do lançamento */}
          <section className={SECAO} aria-labelledby={id('secao-info')}>
            <h3 id={id('secao-info')} className="text-sm font-semibold text-foreground">Informações do lançamento</h3>

            {/* Lancamento-specific: tipo + status */}
            {variant === 'lancamento' && (
              <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
                <div>
                  <Label htmlFor={id('tipo')} className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={form.tipo || 'DESPESA'} onValueChange={v => set({ tipo: v })} disabled={classificationOnly || (isEditing && form.tipo === 'TRANSFERENCIA')}>
                    <SelectTrigger id={id('tipo')} className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RECEITA">Receita</SelectItem>
                      <SelectItem value="DESPESA">Despesa</SelectItem>
                      <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={id('status')} className="text-xs text-muted-foreground">Status</Label>
                  <Select value={form.status || 'PREVISTO'} onValueChange={v => set({ status: v })} disabled={classificationOnly}>
                    <SelectTrigger id={id('status')} className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PREVISTO">Previsto</SelectItem>
                      <SelectItem value="REALIZADO">Realizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Descrição (full width) */}
            <div>
              <Label htmlFor={id('descricao')} className="text-xs text-muted-foreground">Descrição *</Label>
              <Input
                id={id('descricao')}
                value={form.descricao}
                onChange={e => set({ descricao: e.target.value })}
                disabled={classificationOnly}
                className="mt-1"
              />
            </div>

            {/* Fornecedor/Cliente, Data competência, Valor */}
            <div className={`grid gap-4 ${variant === 'lancamento' ? 'grid-cols-1 min-[400px]:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
              {variant === 'pagar' && (
                <div>
                  <Label htmlFor={id('fornecedor')} className="text-xs text-muted-foreground">Fornecedor</Label>
                  <SupplierCombobox
                    id={id('fornecedor')}
                    value={form.supplier_id || ''}
                    onValueChange={v => set({ supplier_id: v })}
                    options={suppliers || []}
                    enableQuickAdd={canQuickAddSupplier}
                    className="mt-1"
                  />
                </div>
              )}
              {variant === 'receber' && (
                <div>
                  <Label htmlFor={id('cliente')} className="text-xs text-muted-foreground">Cliente</Label>
                  <Input
                    id={id('cliente')}
                    value={form.cliente || ''}
                    onChange={e => set({ cliente: e.target.value })}
                    placeholder="Nome do cliente"
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label htmlFor={id('competencia')} className="text-xs text-muted-foreground">Data de competência *</Label>
                <DateInput
                  id={id('competencia')}
                  value={form.data_competencia}
                  onValueChange={v => set({ data_competencia: v })}
                  disabled={classificationOnly && !competenciaNaReclassificacao}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={id('valor')} className="text-xs text-muted-foreground">Valor *</Label>
                <BRLInput
                  id={id('valor')}
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
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-2 self-center">
                  <Label htmlFor={id('rateio')} className="text-xs text-muted-foreground">Habilitar rateio</Label>
                  <Switch
                    id={id('rateio')}
                    checked={enableRateio}
                    onCheckedChange={handleToggleRateio}
                  />
                </div>
                {!enableRateio && (
                  <>
                    <div>
                      <Label htmlFor={id('categoria')} className="text-xs text-muted-foreground">Categoria *</Label>
                      <CategoryCombobox
                        id={id('categoria')}
                        value={form.categoria_id}
                        onValueChange={v => set({
                          categoria_id: v,
                          ...(v !== form.categoria_id ? cmvAoTrocarCategoria(form.cmv_incluir, v) : {}),
                        })}
                        options={categoriasDoTipo}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor={id('centro')} className="text-xs text-muted-foreground">Centro de custo</Label>
                      <Select value={form.centro_custo_id} onValueChange={v => set({ centro_custo_id: v })}>
                        <SelectTrigger id={id('centro')} className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
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

            {/* Rateio */}
            {!isTransfer && enableRateio && rateioLines.length > 0 && (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Rateio por Categoria</p>
                  <div className="flex flex-wrap justify-end gap-1">
                    {mostrarCmv && (
                      <>
                        <Button type="button" size="sm" variant="outline" onClick={() => marcarTodasCmv(true)} className="text-xs h-8">Marcar todas</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => marcarTodasCmv(false)} className="text-xs h-8">Desmarcar todas</Button>
                      </>
                    )}
                    {rateioLines.length > 1 && form.valor > 0 && (
                      <Button type="button" size="sm" variant="outline" onClick={ratearIgualmente} className="text-xs h-8">Ratear Igual</Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={addRateioLine} className="text-xs h-8">
                      <Plus aria-hidden="true" className="w-3 h-3 mr-1" /> Linha
                    </Button>
                  </div>
                </div>
                {/* Mede a própria área do rateio, sem padding: borda e conteúdo têm a mesma largura. */}
                <div ref={rateioRef}>
                {rateioEstreito ? (
                  <ul className="space-y-2" aria-label="Linhas do rateio">
                    {rateioLines.map((line, i) => (
                      <li key={line.key} className="space-y-2 rounded-lg border border-border bg-background-subtle p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">Linha {i + 1}</span>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remover linha ${i + 1} do rateio`} onClick={() => removeRateioLine(line.key)}>
                            <Trash2 aria-hidden="true" className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                        <div>
                          <Label htmlFor={id(`rateio-cat-${line.key}`)} className="text-xs text-muted-foreground">Categoria</Label>
                          <CategoryCombobox
                            id={id(`rateio-cat-${line.key}`)}
                            value={line.categoria_id}
                            onValueChange={v => updateRateioLine(line.key, { categoria_id: v })}
                            options={categoriasDoTipo}
                            className="mt-1"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="min-w-0">
                            <Label htmlFor={id(`rateio-cc-${line.key}`)} className="text-xs text-muted-foreground">Centro Custo</Label>
                            <Select value={line.centro_custo_id} onValueChange={v => updateRateioLine(line.key, { centro_custo_id: v })}>
                              <SelectTrigger id={id(`rateio-cc-${line.key}`)} className="mt-1 h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
                              <SelectContent>{centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="min-w-0">
                            <Label htmlFor={id(`rateio-valor-${line.key}`)} className="text-xs text-muted-foreground">
                              Valor <span className="font-normal">({line.percentual ? formatPercentBR(line.percentual, 1) : '-'})</span>
                            </Label>
                            <BRLInput
                              id={id(`rateio-valor-${line.key}`)}
                              numericValue={line.valor || 0}
                              onNumericChange={val => {
                                const pct = form.valor > 0 ? (val / form.valor) * 100 : 0;
                                updateRateioLine(line.key, { valor: val, percentual: Math.round(pct * 10) / 10 });
                              }}
                              showPrefix
                              className="mt-1 h-8 text-xs"
                            />
                          </div>
                        </div>
                        {mostrarCmv && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Aparecer no CMV financeiro?</p>
                            <CmvDecisaoToggle
                              size="sm"
                              value={line.cmv_incluir ?? null}
                              onChange={v => updateRateioLine(line.key, { cmv_incluir: v, cmv_aviso: undefined })}
                              label={`Aparecer no CMV financeiro? — ${nomeCategoria(line.categoria_id)}`}
                            />
                            {textoAvisoCmv(line.cmv_aviso) && (
                              <p className="text-[11px] leading-tight text-muted-foreground">{textoAvisoCmv(line.cmv_aviso)}</p>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Categoria</TableHead>
                        <TableHead className="text-xs">Centro Custo</TableHead>
                        <TableHead className={`text-xs ${mostrarCmv ? 'min-w-[8.5rem]' : 'min-w-[7.5rem]'}`}>Valor</TableHead>
                        <TableHead className="text-xs w-16">%</TableHead>
                        {mostrarCmv && <TableHead className="text-xs whitespace-nowrap">Aparecer no CMV financeiro?</TableHead>}
                        <TableHead className="text-xs w-8"><span className="sr-only">Remover</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rateioLines.map((line, i) => (
                        <TableRow key={line.key}>
                          <TableCell className="p-1">
                            <CategoryCombobox
                              aria-label={`Categoria da linha ${i + 1}`}
                              value={line.categoria_id}
                              onValueChange={v => updateRateioLine(line.key, { categoria_id: v })}
                              options={categoriasDoTipo}
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Select value={line.centro_custo_id} onValueChange={v => updateRateioLine(line.key, { centro_custo_id: v })}>
                              <SelectTrigger aria-label={`Centro de custo da linha ${i + 1}`} className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
                              <SelectContent>{centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-1">
                            <BRLInput
                              aria-label={`Valor da linha ${i + 1}`}
                              numericValue={line.valor || 0}
                              onNumericChange={val => {
                                const pct = form.valor > 0 ? (val / form.valor) * 100 : 0;
                                updateRateioLine(line.key, { valor: val, percentual: Math.round(pct * 10) / 10 });
                              }}
                              showPrefix
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell className="p-1 text-xs text-muted-foreground text-center tabular-nums">
                            {line.percentual ? formatPercentBR(line.percentual, 1) : '-'}
                          </TableCell>
                          {mostrarCmv && (
                            <TableCell className="p-1">
                              <CmvDecisaoToggle
                                size="sm"
                                value={line.cmv_incluir ?? null}
                                onChange={v => updateRateioLine(line.key, { cmv_incluir: v, cmv_aviso: undefined })}
                                label={`Aparecer no CMV financeiro? — ${nomeCategoria(line.categoria_id)}`}
                              />
                              {textoAvisoCmv(line.cmv_aviso) && (
                                <p className="mt-1 max-w-[11rem] text-[11px] leading-tight text-muted-foreground">{textoAvisoCmv(line.cmv_aviso)}</p>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="p-1">
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remover linha ${i + 1} do rateio`} onClick={() => removeRateioLine(line.key)}>
                              <Trash2 aria-hidden="true" className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs" aria-live="polite">
                  <span className="text-muted-foreground">Total rateado: <strong className="tabular-nums text-foreground">{fmt(totalRateio)}</strong></span>
                  {Math.abs(diffRateio) >= 0.01 && <span className="font-medium text-destructive">Diferença: {fmt(diffRateio)}</span>}
                  {Math.abs(diffRateio) < 0.01 && rateioLines.length > 0 && <span className="font-medium text-success">Rateio fechado</span>}
                </div>
                {cmvResumoBloco}
              </div>
            )}
          </section>

          {/* Repetir lançamento */}
          {!isTransfer && !classificationOnly && (
            <section className={SECAO}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Repeat aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                  <Label htmlFor={id('recorrente')} className="text-sm font-semibold">Repetir lançamento?</Label>
                </div>
                <Switch
                  id={id('recorrente')}
                  checked={form.recorrente}
                  onCheckedChange={v => set({ recorrente: v, parcelas: v ? Math.max(form.parcelas, 2) : 0 })}
                />
              </div>
              {form.recorrente && (
                <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
                  <div>
                    <Label htmlFor={id('frequencia')} className="text-xs text-muted-foreground">Frequência</Label>
                    <Select
                      value={form.frequencia}
                      onValueChange={v => {
                        const nextLimit = getRecurrenceLimit(v);
                        set({ frequencia: v, parcelas: Math.min(Math.max(form.parcelas, 2), nextLimit) });
                      }}
                    >
                      <SelectTrigger id={id('frequencia')} className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={id('parcelas')} className="text-xs text-muted-foreground">
                      Total de lançamentos (máx. {recurrenceLimit})
                    </Label>
                    <Input
                      id={id('parcelas')}
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
                      aria-describedby={id('parcelas-ajuda')}
                      className="mt-1"
                    />
                    <p id={id('parcelas-ajuda')} className="mt-1 text-[11px] text-muted-foreground">Inclui o lançamento atual.</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Condição de pagamento */}
          {!classificationOnly && <section className={SECAO} aria-labelledby={id('secao-condicao')}>
            <h3 id={id('secao-condicao')} className="text-sm font-semibold text-foreground">Condição de pagamento</h3>
            <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {variant !== 'lancamento' && (
                <div>
                  <Label htmlFor={id('parcelamento')} className="text-xs text-muted-foreground">Parcelamento *</Label>
                  <Select value="avista" disabled>
                    <SelectTrigger id={id('parcelamento')} className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avista">À vista</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor={id('vencimento')} className="text-xs text-muted-foreground">Vencimento *</Label>
                <DateInput
                  id={id('vencimento')}
                  value={form.data_vencimento}
                  onValueChange={v => set({ data_vencimento: v })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={id('forma')} className="text-xs text-muted-foreground">Forma de pagamento</Label>
                <Select value={form.forma_pagamento} onValueChange={v => set({ forma_pagamento: v })}>
                  <SelectTrigger id={id('forma')} className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={id('conta')} className="text-xs text-muted-foreground">
                  {isTransfer ? 'Conta Origem' : 'Conta de pagamento'}
                </Label>
                <Select value={form.conta_id} onValueChange={v => set({ conta_id: v })}>
                  <SelectTrigger id={id('conta')} className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {variant === 'lancamento' && !isTransfer && (
                <div>
                  <Label htmlFor={id('data-pagamento')} className="text-xs text-muted-foreground">Data Pagamento</Label>
                  <DateInput
                    id={id('data-pagamento')}
                    value={form.data_pagamento || ''}
                    onValueChange={v => set({ data_pagamento: v })}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
            {/* Transfer: Conta Destino on its own row */}
            {isTransfer && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label htmlFor={id('conta-destino')} className="text-xs text-muted-foreground">Conta Destino</Label>
                  <Select value={form.conta_destino_id || ''} onValueChange={v => set({ conta_destino_id: v })}>
                    <SelectTrigger id={id('conta-destino')} className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{contas.filter(c => c.id !== form.conta_id).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Transfer info */}
            {isTransfer && (
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Transferências criam automaticamente dois lançamentos vinculados (saída da origem + entrada no destino) e não afetam relatórios de receitas/despesas.
              </div>
            )}
          </section>}

          {variant === 'pagar' && (
            <section className={SECAO} aria-labelledby={id('secao-dados')}>
              <h3 id={id('secao-dados')} className="text-sm font-semibold">Dados para pagamento</h3>
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
            <section className="space-y-3 rounded-xl border border-warning-border bg-warning-soft p-4 sm:p-5">
              <Label htmlFor={id('justificativa')} className="text-sm font-semibold text-foreground">Justificativa obrigatória</Label>
              <p id={id('justificativa-ajuda')} className="text-xs text-muted-foreground">
                {classificationOnly
                  ? 'Informe o motivo da reclassificação. A justificativa ficará registrada na auditoria.'
                  : 'Este lançamento já está REALIZADO. Informe o motivo da alteração.'}
              </p>
              <Textarea
                id={id('justificativa')}
                value={justificativa || ''}
                onChange={e => onJustificativaChange?.(e.target.value)}
                placeholder="Motivo da alteração..."
                aria-describedby={id('justificativa-ajuda')}
                className="min-h-[60px] bg-card"
              />
            </section>
          )}

          {/* Observações / Anexo tabs */}
          <Tabs defaultValue="obs" className="overflow-hidden rounded-xl border border-border bg-card">
            <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger
                value="obs"
                className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Observações
              </TabsTrigger>
              <TabsTrigger
                value="anexo"
                className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Anexo
              </TabsTrigger>
            </TabsList>
            <TabsContent value="obs" className="mt-0 p-4">
              <Label htmlFor={id('observacoes')} className="text-xs text-muted-foreground">Observações</Label>
              <Textarea
                id={id('observacoes')}
                value={form.observacoes}
                onChange={e => set({ observacoes: e.target.value })}
                placeholder="Descreva observações relevantes sobre esse lançamento financeiro"
                className="mt-1 min-h-[80px]"
              />
            </TabsContent>
            <TabsContent value="anexo" className="mt-0 p-4">
              <p className="text-sm text-muted-foreground">Funcionalidade de anexos em breve.</p>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t bg-background-subtle px-4 py-3 sm:px-6 sm:py-4">
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
