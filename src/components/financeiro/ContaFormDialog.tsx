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

/* ─── Types ─── */
type ContaFormVariant = 'pagar' | 'receber' | 'lancamento';

export interface RateioLine {
  key: string;
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
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
  forma_pagamento: string;
  observacoes: string;
  recorrente: boolean;
  frequencia: string;
  parcelas: number;
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
}

export default function ContaFormDialog({
  open, onOpenChange, variant, form, onFormChange, rateioLines, onRateioLinesChange,
  categorias, centros, contas, suppliers,
  isEditing, saving, onSave, onClose,
  editPrevStatus, justificativa, onJustificativaChange,
}: Props) {
  const [enableRateio, setEnableRateio] = useState(false);

  useEffect(() => {
    setEnableRateio(rateioLines.length > 0);
  }, [open, rateioLines.length]);

  const fmt = fmtBRL;
  const isTransfer = variant === 'lancamento' && form.tipo === 'TRANSFERENCIA';
  const titleLabel = variant === 'pagar' ? 'Conta a Pagar' : variant === 'receber' ? 'Conta a Receber' : 'Lancamento';
  const catFilterType = variant === 'pagar' ? 'despesa' : variant === 'receber' ? 'receita' : (form.tipo?.toLowerCase() || '');

  // ─── Rateio helpers ───
  const addRateioLine = () => {
    const newLine: RateioLine = { key: crypto.randomUUID(), categoria_id: '', centro_custo_id: '', valor: 0, percentual: 0 };
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
      };
      onRateioLinesChange([newLine]);
    }
  };

  const set = (partial: Partial<ContaFormData>) => onFormChange({ ...form, ...partial });

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? `Editar ${titleLabel}` : `Nova ${variant === 'pagar' ? 'despesa' : variant === 'receber' ? 'receita' : (form.tipo === 'RECEITA' ? 'receita' : form.tipo === 'TRANSFERENCIA' ? 'transferencia' : 'despesa')}`}
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Informacoes do lancamento */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground italic">Informacoes do lancamento</h3>

            {/* Lancamento-specific: tipo + status */}
            {variant === 'lancamento' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={form.tipo || 'DESPESA'} onValueChange={v => set({ tipo: v })} disabled={isEditing && form.tipo === 'TRANSFERENCIA'}>
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
                  <Select value={form.status || 'PREVISTO'} onValueChange={v => set({ status: v })}>
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
                className="mt-1"
              />
            </div>

            {/* Fornecedor/Cliente, Data competencia, Valor */}
            <div className={`grid gap-4 ${variant === 'lancamento' ? 'grid-cols-2' : 'grid-cols-3'}`}>
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
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Valor *</Label>
                <BRLInput
                  numericValue={form.valor}
                  onNumericChange={v => set({ valor: v })}
                  showPrefix
                  className="mt-1"
                />
              </div>
            </div>

            {/* Rateio toggle + Categoria + Centro de custo */}
            {!isTransfer && (
              <div className="grid grid-cols-3 gap-4 items-end">
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
                        onValueChange={v => set({ categoria_id: v })}
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

            {/* Rateio table */}
            {!isTransfer && enableRateio && rateioLines.length > 0 && (
              <div className="border border-border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Rateio por Categoria</Label>
                  <div className="flex gap-1">
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
                      <TableHead className="text-xs w-24">Valor</TableHead>
                      <TableHead className="text-xs w-16">%</TableHead>
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
              </div>
            )}
          </section>

          {/* Repetir lancamento */}
          {!isTransfer && (
            <section className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold">Repetir lancamento?</Label>
                </div>
                <Switch
                  checked={form.recorrente}
                  onCheckedChange={v => set({ recorrente: v })}
                />
              </div>
              {form.recorrente && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Frequencia</Label>
                    <Select value={form.frequencia} onValueChange={v => set({ frequencia: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Parcelas (0 = infinito)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={form.parcelas || ''}
                      onChange={e => set({ parcelas: parseInt(e.target.value, 10) || 0 })}
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Condicao de pagamento */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Condicao de pagamento</h3>
            <div className="grid grid-cols-4 gap-4 items-end">
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
          </section>

          {/* Justificativa for REALIZADO edits */}
          {variant === 'lancamento' && isEditing && editPrevStatus === 'REALIZADO' && (
            <section className="border border-warning/30 bg-warning/5 rounded-xl p-5 space-y-3">
              <Label className="text-sm font-semibold text-warning-foreground">Justificativa obrigatoria</Label>
              <p className="text-xs text-muted-foreground">Este lancamento ja esta REALIZADO. Informe o motivo da alteracao.</p>
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
            disabled={saving || (enableRateio && rateioLines.length > 0 && !rateioValido)}
          >
            {saving ? 'Salvando...' : isEditing ? 'Salvar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
