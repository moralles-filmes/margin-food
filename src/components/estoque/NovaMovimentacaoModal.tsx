import { useSupabase } from '@/contexts/CompanyScopeContext';
/**
 * ─── NovaMovimentacaoModal ───
 * Modal dedicado para criação de movimentações de estoque, com um ou vários
 * itens no mesmo lançamento.
 *
 * Pré-seleciona o tipo de movimentação com base no botão acionado:
 *   - "Nova Entrada" → ENTRADA
 *   - "Nova Saída"   → SAIDA
 *   - "Ajuste / Transferência" → AJUSTE | BAIXA_PERDA
 *
 * Tipo e observação valem para o lote inteiro; produto, quantidade, unidade,
 * custo e setor são por item (linha nova herda o setor da anterior). Cálculo e
 * validação por item ficam em
 * `@/domain/estoque/movimentacaoLote`; o registro é um único INSERT atômico.
 *
 * @enterprise-safe  Mantém RBAC, tenant, dirty-guard e audit.
 */

import { useState, useMemo, useEffect, useCallback, useRef, forwardRef } from 'react';
import { ArrowDown, ArrowUp, Settings2, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ProductSearchCombobox, { type ProductOption } from '@/components/ui/ProductSearchCombobox';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { formatFixedBR, todayBR, fmtBRL } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useScopedToast } from '@/hooks/useScopedToast';
import { TenantError } from '@/lib/tenant';
import { getCostOrigin, getCostLabel, getActiveCostBase } from '@/components/estoque/CustoItemDisplay';
import { Badge } from '@/components/ui/badge';
import {
  calcularItemLote, itemLoteVazio, novoItemLote, validarLote, type MovLoteItem,
} from '@/domain/estoque/movimentacaoLote';
import { conteudoLoteMovimentacao } from '@/domain/estoque/idempotencia';
import { useChavesPendentes } from '@/hooks/useChavesPendentes';
import type { NovaMovimentacao } from '@/hooks/useEstoqueGeralStore';
import type { MovimentacaoEstoque } from '@/types/salmon';
import type { ProdutoExtended } from '@/types/estoque';

// ─── Public Types ───

export type MovModalPreset = 'entrada' | 'saida' | 'ajuste';

type MovTipo = MovimentacaoEstoque['tipo'];

const PRESET_DEFAULTS: Record<MovModalPreset, MovTipo> = {
  entrada: 'ENTRADA',
  saida: 'SAIDA',
  ajuste: 'AJUSTE',
};

const PRESET_TITLES: Record<MovModalPreset, string> = {
  entrada: 'Nova Entrada',
  saida: 'Nova Saída',
  ajuste: 'Ajuste / Transferência',
};

const PRESET_ICONS: Record<MovModalPreset, typeof ArrowDown> = {
  entrada: ArrowDown,
  saida: ArrowUp,
  ajuste: Settings2,
};

function isTenantErrorMessage(msg?: string): boolean {
  if (!msg) return false;
  return /tenant\s*inv[aá]lido|placeholder|empresa\s*n[ãa]o\s*(est[aá]|config)|n[ãa]o\s*vinculad/i.test(msg);
}

function unidadeCompraDe(p: ProdutoExtended): string {
  return p.unidadeCompra || p.unidadeMedida;
}

function temUnidadeCompra(p: ProdutoExtended): boolean {
  return unidadeCompraDe(p) !== p.unidadeMedida;
}

// ─── Props ───

interface Props {
  open: boolean;
  preset: MovModalPreset;
  onClose: () => void;
  produtos: ProdutoExtended[];
  saldos: Record<string, { saldo: number }>;
  userId: string;
  hasPermission: (p: string) => boolean;
  canEditPricing: boolean;
  addMovimentacoesLote: (itens: NovaMovimentacao[], opts?: { clientRequestId?: string }) => Promise<unknown>;
  recalcularPrecos: (produtoId?: string) => void | Promise<void>;
}

export default function NovaMovimentacaoModal({
  open, preset, onClose, produtos, saldos,
  userId, hasPermission, canEditPricing,
  addMovimentacoesLote, recalcularPrecos,
}: Props) {
  const toast = useScopedToast();
  const supabase = useSupabase();

  const keySeq = useRef(0);
  const novaKey = useCallback(() => `item-${++keySeq.current}`, []);

  const [tipo, setTipo] = useState<MovTipo>(PRESET_DEFAULTS[preset]);
  const [observacao, setObservacao] = useState('');
  const [itens, setItens] = useState<MovLoteItem[]>(() => [novoItemLote('item-0')]);
  const [custoDesbloqueado, setCustoDesbloqueado] = useState<Record<string, boolean>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Trava síncrona: `saving` só desabilita o botão no próximo render.
  const salvandoRef = useRef(false);
  // Semente por lote ainda não confirmado, fora do modal: fechar e reabrir, ou
  // registrar outro lote no meio, não troca a chave de um lote que pode ter sido
  // gravado sem resposta.
  const chavesLote = useChavesPendentes('estoque-movimentacao-lote');
  const ultimoItemRef = useRef<HTMLDivElement>(null);

  const resetForm = useCallback(() => {
    setTipo(PRESET_DEFAULTS[preset]);
    setObservacao('');
    setItens([novoItemLote(novaKey())]);
    setCustoDesbloqueado({});
    setErros({});
  }, [preset, novaKey]);

  // Reset form when modal opens with a new preset
  useEffect(() => {
    if (open) {
      resetForm();
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  // Setores (Controle de Estoque -> Cadastros -> Setores)
  const [setores, setSetores] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    supabase.from('stock_sectors').select('name').eq('is_active', true).order('name')
      .then(({ data }) => setSetores((data || []).map((s: { name: string }) => s.name)));
  }, [open, supabase]);

  // Product options
  const productOptions: ProductOption[] = useMemo(() =>
    produtos.filter(p => p.ativo).map(p => ({
      id: p.id,
      label: p.nomeProduto,
      sublabel: `(${p.unidadeMedida})`,
      keywords: p.sku || '',
    })),
    [produtos]
  );

  const produtosById = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos]);

  const isEntrada = tipo === 'ENTRADA';
  const isSaida = !isEntrada;
  const canEditCost = canEditPricing || hasPermission('finance:manage');

  // Dirty guard — só o que o usuário digitou; linhas vazias e o tipo padrão
  // do preset não contam, para o modal recém-aberto nunca nascer "sujo".
  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);
  const dirtySnapshot = useMemo(() => ({
    itens: itens.filter(i => !itemLoteVazio(i)).map(({ key: _key, ...rest }) => rest),
    observacao,
  }), [itens, observacao]);
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({
    current: dirtySnapshot,
    onClose: handleClose,
  });

  // Mesmo produto para setores diferentes é legítimo; só avisa quando produto
  // e setor se repetem (na entrada, que não tem setor, basta o produto).
  const chaveRepeticao = useCallback(
    (i: MovLoteItem) => (isEntrada ? i.produtoId : `${i.produtoId}|${i.setor}`),
    [isEntrada],
  );
  const repeticoes = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const i of itens) {
      if (!i.produtoId) continue;
      const chave = chaveRepeticao(i);
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    return contagem;
  }, [itens, chaveRepeticao]);

  const resumo = useMemo(() => {
    let quantidadeItens = 0;
    let total = 0;
    for (const i of itens) {
      if (!i.produtoId) continue;
      const calc = calcularItemLote(i, produtosById.get(i.produtoId), isEntrada);
      if (calc.quantidadeBase <= 0) continue;
      quantidadeItens++;
      total += calc.custoTotal;
    }
    return { quantidadeItens, total };
  }, [itens, produtosById, isEntrada]);

  // ─── Item handlers ───

  const limparErro = useCallback((key: string) => {
    setErros(e => {
      if (!(key in e)) return e;
      const { [key]: _removido, ...resto } = e;
      return resto;
    });
  }, []);

  const atualizarItem = useCallback((key: string, patch: Partial<MovLoteItem>) => {
    setItens(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));
    limparErro(key);
  }, [limparErro]);

  const selecionarProduto = useCallback((key: string, produtoId: string) => {
    const prod = produtosById.get(produtoId);
    if (!prod) return;
    const custoBase = isEntrada ? 0 : getActiveCostBase(prod);
    atualizarItem(key, {
      produtoId,
      fator: String(prod.fatorConversaoPadrao || 1),
      usePurchaseUnit: isEntrada && temUnidadeCompra(prod),
      custoUnitario: custoBase > 0 ? String(Math.round(custoBase * 100) / 100) : '',
    });
    setCustoDesbloqueado(d => {
      if (!(key in d)) return d;
      const { [key]: _removido, ...resto } = d;
      return resto;
    });
  }, [produtosById, isEntrada, atualizarItem]);

  // A linha nova herda o setor da última: o caso comum é vários itens para o
  // mesmo setor, e trocar numa linha é mais rápido que escolher em todas.
  const adicionarItem = useCallback(() => {
    setItens(prev => [...prev, novoItemLote(novaKey(), prev[prev.length - 1]?.setor ?? '')]);
  }, [novaKey]);

  const removerItem = useCallback((key: string) => {
    setItens(prev => (prev.length > 1 ? prev.filter(i => i.key !== key) : prev));
    limparErro(key);
  }, [limparErro]);

  // Traz a linha recém-adicionada para a vista
  const totalLinhas = itens.length;
  const totalLinhasRef = useRef(totalLinhas);
  useEffect(() => {
    if (totalLinhas > totalLinhasRef.current) ultimoItemRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    totalLinhasRef.current = totalLinhas;
  }, [totalLinhas]);

  // ─── Submit ───
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvandoRef.current) return;

    const resultado = validarLote({ itens, produtos: produtosById, saldos, isEntrada });
    if (!resultado.ok) {
      setErros(resultado.erros);
      toast.error(resultado.mensagem);
      return;
    }

    salvandoRef.current = true;
    setSaving(true);
    try {
      const data = todayBR();
      const movimentacoes = resultado.itens.map(item => ({
        produtoId: item.produtoId,
        data,
        tipo,
        quantidade: item.quantidadeBase,
        custoUnitario: item.custoUnitario,
        custoTotal: item.custoTotal,
        origem: 'Manual',
        referenciaId: '',
        observacao,
        createdBy: userId,
        setor: isSaida ? item.setor : undefined,
      }));
      // Chave derivada do lote: repetir o MESMO lote (duplo clique, resposta
      // perdida) devolve as linhas já gravadas; mudar qualquer item gera outra.
      const conteudo = conteudoLoteMovimentacao({
        tipo,
        observacao,
        itens: movimentacoes.map(m => ({
          produtoId: m.produtoId, quantidade: m.quantidade, custoUnitario: m.custoUnitario, setor: m.setor,
        })),
      });
      await addMovimentacoesLote(movimentacoes, { clientRequestId: await chavesLote.chave(conteudo) });
      chavesLote.confirmar(conteudo);

      const n = resultado.itens.length;
      toast.success(n === 1 ? `Movimentação ${tipo} registrada!` : `${n} movimentações ${tipo} registradas!`);

      if (isEntrada) {
        // Um produto por vez, em segundo plano: o modal não espera o recálculo.
        const ids = [...new Set(resultado.itens.map(i => i.produtoId))];
        void (async () => { for (const id of ids) await recalcularPrecos(id); })();
      }
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string } | null)?.message || '';
      if (err instanceof TenantError || isTenantErrorMessage(msg)) {
        toast.error(msg || 'Usuário não vinculado a empresa válida.');
      } else if (msg.includes('REQUEST_ID_REUTILIZADO')) {
        toast.error('Este lote não confere com o que já foi registrado. Confira as movimentações antes de registrar de novo.');
      } else {
        toast.error(msg || 'Erro ao registrar movimentação');
      }
    } finally {
      salvandoRef.current = false;
      setSaving(false);
    }
  };

  const Icon = PRESET_ICONS[preset];

  // Available tipos based on preset
  const tipoOptions: { value: MovTipo; label: string }[] = useMemo(() => {
    switch (preset) {
      case 'entrada': return [{ value: 'ENTRADA', label: 'Entrada' }];
      case 'saida': return [
        { value: 'SAIDA', label: 'Saída' },
        { value: 'BAIXA_PERDA', label: 'Baixa/Perda' },
      ];
      case 'ajuste': return [
        { value: 'AJUSTE', label: 'Ajuste (+)' },
        { value: 'BAIXA_PERDA', label: 'Baixa/Perda (−)' },
      ];
    }
  }, [preset]);

  if (!open) return null;

  const labelRegistrar = resumo.quantidadeItens > 1 ? `Registrar ${resumo.quantidadeItens} itens` : 'Registrar';

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) guardedClose(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="pb-3 border-b border-border flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                preset === 'entrada' ? 'bg-success-soft' : preset === 'saida' ? 'bg-destructive-soft' : 'bg-primary-soft'
              }`}>
                <Icon className={`w-4 h-4 ${
                  preset === 'entrada' ? 'text-success' : preset === 'saida' ? 'text-destructive' : 'text-primary'
                }`} />
              </div>
              {PRESET_TITLES[preset]}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 space-y-3 pt-2 pr-1">
              {/* Tipo vale para todos os itens */}
              {tipoOptions.length > 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Tipo *</Label>
                    <Select value={tipo} onValueChange={v => setTipo(v as MovTipo)}>
                      <SelectTrigger className="bg-secondary border-border text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tipoOptions.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Itens */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Itens</p>
                  <p className="text-[11px] text-muted-foreground">{itens.length} {itens.length === 1 ? 'linha' : 'linhas'}</p>
                </div>

                {itens.map((item, index) => (
                  <ItemLinha
                    key={item.key}
                    ref={index === itens.length - 1 ? ultimoItemRef : undefined}
                    item={item}
                    index={index}
                    produto={item.produtoId ? produtosById.get(item.produtoId) : undefined}
                    productOptions={productOptions}
                    isEntrada={isEntrada}
                    saldo={item.produtoId ? saldos[item.produtoId]?.saldo || 0 : 0}
                    custoTravado={!custoDesbloqueado[item.key]}
                    canEditCost={canEditCost}
                    repetido={!!item.produtoId && (repeticoes.get(chaveRepeticao(item)) ?? 0) > 1}
                    setores={setores}
                    erro={erros[item.key]}
                    podeRemover={itens.length > 1}
                    onSelectProduto={id => selecionarProduto(item.key, id)}
                    onChange={patch => atualizarItem(item.key, patch)}
                    onDesbloquearCusto={() => setCustoDesbloqueado(d => ({ ...d, [item.key]: true }))}
                    onRemover={() => removerItem(item.key)}
                  />
                ))}

                <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-dashed" onClick={adicionarItem}>
                  <Plus className="w-4 h-4" /> Adicionar item
                </Button>
              </div>

              {/* Observação */}
              <div>
                <Label className="text-[11px] text-muted-foreground">Observação</Label>
                <Input value={observacao} onChange={e => setObservacao(e.target.value)} maxLength={500} className="bg-secondary border-border text-foreground" />
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 mt-2 border-t border-border flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {resumo.quantidadeItens} {resumo.quantidadeItens === 1 ? 'item' : 'itens'}
                {resumo.total > 0 && <> · Total <span className="font-semibold text-foreground">{fmtBRL(resumo.total)}</span></>}
              </p>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={guardedClose} disabled={saving}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" className="bg-primary-strong text-primary-foreground border-0" disabled={saving}>
                  {saving ? 'Registrando...' : labelRegistrar}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </>
  );
}

// ─── Linha de item ───

interface ItemLinhaProps {
  item: MovLoteItem;
  index: number;
  produto: ProdutoExtended | undefined;
  productOptions: ProductOption[];
  isEntrada: boolean;
  saldo: number;
  custoTravado: boolean;
  canEditCost: boolean;
  repetido: boolean;
  setores: string[];
  erro?: string;
  podeRemover: boolean;
  onSelectProduto: (produtoId: string) => void;
  onChange: (patch: Partial<MovLoteItem>) => void;
  onDesbloquearCusto: () => void;
  onRemover: () => void;
}

const ItemLinha = forwardRef<HTMLDivElement, ItemLinhaProps>(function ItemLinha({
  item, index, produto, productOptions, isEntrada, saldo, custoTravado, canEditCost,
  repetido, setores, erro, podeRemover, onSelectProduto, onChange, onDesbloquearCusto, onRemover,
}, ref) {
  const calc = calcularItemLote(item, produto, isEntrada);
  const unBase = produto?.unidadeMedida || '';
  const unCompra = produto ? unidadeCompraDe(produto) : '';
  const dual = produto ? temUnidadeCompra(produto) : false;
  const fatorPadrao = produto?.fatorConversaoPadrao || 1;

  const costOrigin = produto && !isEntrada ? getCostOrigin(produto) : null;
  const temCustoCadastrado = produto && !isEntrada ? getActiveCostBase(produto) > 0 : false;
  // Sem custo no cadastro o campo fica livre (como no lançamento unitário);
  // com custo, só quem pode editar preço destrava.
  const custoBloqueado = temCustoCadastrado && custoTravado;

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border p-3 space-y-2.5',
        erro ? 'border-destructive-border bg-destructive-soft' : 'border-border bg-card',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground w-5 pt-2.5 tabular-nums shrink-0">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          <ProductSearchCombobox
            options={productOptions}
            value={item.produtoId}
            onSelect={onSelectProduto}
            placeholder="Buscar produto…"
            allowClear={false}
          />
        </div>
        <Button
          type="button" variant="ghost" size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemover} disabled={!podeRemover}
          aria-label={`Remover item ${index + 1}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {produto && (
        <div className="sm:pl-7 space-y-2">
          <div className={cn('grid grid-cols-2 gap-2', dual ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
            {dual && (
              <div>
                <Label className="text-[11px] text-muted-foreground">Unidade</Label>
                <ToggleGroup
                  type="single"
                  value={item.usePurchaseUnit ? 'purchase' : 'base'}
                  onValueChange={v => { if (v) onChange({ usePurchaseUnit: v === 'purchase' }); }}
                  className="grid grid-cols-2 gap-1 bg-background-subtle p-0.5 rounded-md border border-border w-full h-9"
                >
                  <ToggleGroupItem
                    value="base"
                    aria-label={`Lançar em ${unBase}`}
                    className="h-full text-xs font-semibold data-[state=on]:bg-primary-strong data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm rounded"
                  >
                    {unBase}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="purchase"
                    aria-label={`Lançar em ${unCompra}`}
                    className="h-full text-xs font-semibold data-[state=on]:bg-primary-strong data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm rounded"
                  >
                    {unCompra}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            <div>
              <Label className="text-[11px] text-muted-foreground">Quantidade * ({item.usePurchaseUnit ? unCompra : unBase})</Label>
              <Input
                type="text" inputMode="decimal"
                value={item.quantidade}
                onChange={e => onChange({ quantidade: e.target.value })}
                className="bg-secondary border-border text-foreground h-9"
                placeholder="Ex: 3"
                aria-label={`Quantidade do item ${index + 1}`}
              />
            </div>

            {isEntrada ? (
              <>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Fator ({unBase} por {unCompra})</Label>
                  <Input
                    type="text" inputMode="decimal"
                    value={item.fator}
                    onChange={e => onChange({ fator: e.target.value })}
                    className="bg-secondary border-border text-foreground h-9"
                    placeholder="Ex: 5"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Preço por {unCompra} (R$) *</Label>
                  <CurrencyInput
                    value={item.precoCompra}
                    onValueChange={raw => onChange({ precoCompra: raw })}
                    showPrefix maxDecimals={2}
                    className="bg-secondary border-border text-foreground h-9"
                    placeholder="0,00"
                  />
                </div>
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-1">
                  <Label className="text-[11px] text-muted-foreground">Custo R$/{unBase}</Label>
                  {custoBloqueado && canEditCost && (
                    <button type="button" onClick={onDesbloquearCusto} className="text-[10px] text-primary-ink underline">Editar custo</button>
                  )}
                </div>
                <CurrencyInput
                  value={item.custoUnitario}
                  onValueChange={raw => onChange({ custoUnitario: raw })}
                  showPrefix maxDecimals={2}
                  className="bg-secondary border-border text-foreground h-9"
                  disabled={custoBloqueado}
                />
              </div>
            )}

            {!isEntrada && (
              <div>
                <Label className="text-[11px] text-muted-foreground">🏷️ Setor *</Label>
                <Select value={item.setor} onValueChange={v => onChange({ setor: v })}>
                  <SelectTrigger className="bg-secondary border-border text-foreground h-9" aria-label={`Setor do item ${index + 1}`}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {setores.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Resumo da linha */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {item.usePurchaseUnit && calc.quantidadeBase > 0 && (
              <span>= <span className="font-semibold text-foreground">{formatFixedBR(calc.quantidadeBase, 2)} {unBase}</span></span>
            )}
            {isEntrada && calc.custoUnitario > 0 && (
              <span>R$/{unBase}: <span className="font-semibold text-foreground">{fmtBRL(calc.custoUnitario)}</span></span>
            )}
            {!isEntrada && (
              <span>
                Estoque: <span className="font-semibold text-foreground">{formatFixedBR(saldo, 2)} {unBase}</span>
                {dual && fatorPadrao > 0 && <> ({formatFixedBR(saldo / fatorPadrao, 1)} {unCompra})</>}
              </span>
            )}
            {costOrigin && temCustoCadastrado && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{getCostLabel(costOrigin)}</Badge>
            )}
            {calc.custoTotal > 0 && (
              <span className="ml-auto">Total: <span className="font-semibold text-primary-ink">{fmtBRL(calc.custoTotal)}</span></span>
            )}
          </div>

          {!isEntrada && !temCustoCadastrado && !item.custoUnitario && (
            <p className="text-[11px] text-destructive font-medium">⚠️ Item sem custo cadastrado. Registre uma entrada ou custo padrão.</p>
          )}
        </div>
      )}

      {repetido && (
        <p className="text-[11px] text-warning font-medium sm:pl-7">
          {isEntrada ? 'Produto repetido nesta lista' : 'Produto repetido para o mesmo setor'} — confira se não é duplicidade.
        </p>
      )}
      {erro && <p className="text-[11px] text-destructive font-medium sm:pl-7" role="alert">{erro}</p>}
    </div>
  );
});
