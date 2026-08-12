import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/brl-input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { emitDataEvent } from '@/lib/dataEvents';
import { fmtBRL } from '@/lib/money';
import { toast } from 'sonner';
import CategoryCombobox from '@/components/financeiro/CategoryCombobox';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import SupplierCombobox from '@/components/financeiro/SupplierCombobox';
import { Plus, Trash2, PieChart, CheckCircle, RefreshCw, FileText } from 'lucide-react';

import { useCan } from '@/permissions/hooks';
interface ExtratoLinha {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA';
  fitId?: string;
}

interface RateioItem {
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  observacao: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linha: ExtratoLinha | null;
  contaBancariaId: string;
  onCreated: (result: { id: string; destino: string }) => void;
}

type Destino = 'lancamento' | 'conta_pagar' | 'conta_receber';

export default function CriarLancamentoExtratoDialog({
 open, onOpenChange, linha, contaBancariaId, onCreated }: Props) {
  const canViewRbac = useCan('financeiro:conciliacao:reconcile');
  const { user } = useAuth();

  // Form state
  const [destino, setDestino] = useState<Destino>('lancamento');
  const [descricao, setDescricao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [valor, setValor] = useState(0);
  const [tipo, setTipo] = useState<'RECEITA' | 'DESPESA'>('DESPESA');
  const [dataCompetencia, setDataCompetencia] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [cliente, setCliente] = useState('');

  // Rateio
  const [useRateio, setUseRateio] = useState(false);
  const [rateioLinhas, setRateioLinhas] = useState<RateioItem[]>([]);

  // Data
  const [categorias, setCategorias] = useState<any[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Load reference data
  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('suppliers').select('id, name').order('name'),
    ]).then(([catRes, ccRes, supRes]) => {
      setCategorias(buildCategoryOptions(catRes.data || []));
      setCentrosCusto(ccRes.data || []);
      setSuppliers((supRes.data || []).map((s: any) => ({ id: s.id, name: s.name })));
    });
  }, [open]);

  // Pre-fill from extrato line
  useEffect(() => {
    if (!linha || !open) return;
    setDescricao(linha.descricao);
    setValor(linha.valor);
    setTipo(linha.tipo);
    setDataCompetencia(linha.data);
    setDataVencimento(linha.data);
    setDataPagamento(linha.data);
    setCategoriaId('');
    setSupplierId('');
    setCliente('');
    setObservacoes('');
    setUseRateio(false);
    setRateioLinhas([]);
    setDestino('lancamento');
  }, [linha, open]);

  // Rateio helpers
  const addRateioLinha = () => {
    setRateioLinhas(prev => [...prev, { categoria_id: '', centro_custo_id: '', valor: 0, percentual: 0, observacao: '' }]);
  };

  const removeRateioLinha = (idx: number) => {
    setRateioLinhas(prev => prev.filter((_, i) => i !== idx));
  };

  const updateRateioLinha = (idx: number, field: keyof RateioItem, value: any) => {
    setRateioLinhas(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], [field]: value };

      if (field === 'categoria_id') {
        const cat = categorias.find(c => c.id === value);
        if (cat?.centro_custo_padrao_id) item.centro_custo_id = cat.centro_custo_padrao_id;
      }

      if (field === 'valor' && valor > 0) {
        item.percentual = Math.round((Number(value) / valor) * 10000) / 100;
      } else if (field === 'percentual' && valor > 0) {
        item.valor = Math.round((Number(value) / 100) * valor * 100) / 100;
      }

      updated[idx] = item;
      return updated;
    });
  };

  const bindExtratoLine = async (lancamentoId?: string | null) => {
    if (!linha?.fitId || !lancamentoId) return;
    const { error } = await supabase.rpc('reconcile_bind_extrato', {
      p_conta_id: contaBancariaId,
      p_external_id: linha.fitId,
      p_tipo: linha.tipo,
      p_lancamento_id: lancamentoId,
    });
    if (error) throw error;
  };

  const ratearIgual = () => {
    const n = rateioLinhas.length;
    if (n === 0) return;
    const valorCada = Math.floor((valor / n) * 100) / 100;
    const resto = Math.round((valor - valorCada * n) * 100) / 100;
    setRateioLinhas(prev => prev.map((l, i) => ({
      ...l,
      valor: i === 0 ? valorCada + resto : valorCada,
      percentual: Math.round(((i === 0 ? valorCada + resto : valorCada) / valor) * 10000) / 100,
    })));
  };

  const rateioTotal = rateioLinhas.reduce((s, l) => s + Number(l.valor || 0), 0);
  const rateioDiff = valor - rateioTotal;
  const rateioValido = !useRateio || (rateioLinhas.length > 0 && Math.abs(rateioDiff) < 0.01 && rateioLinhas.every(l => l.categoria_id));

  const handleSave = async () => {
    if (!descricao.trim()) { toast.error('Informe a descrição'); return; }
    if (valor <= 0) { toast.error('Valor deve ser maior que zero'); return; }
    if (!dataCompetencia) { toast.error('Informe a data de competência'); return; }
    if (!useRateio && !categoriaId) { toast.error('Selecione uma categoria'); return; }
    if (useRateio && !rateioValido) { toast.error('Rateio inválido'); return; }

    setSaving(true);
    try {
      const rateioPayload = useRateio && rateioLinhas.length > 0
        ? rateioLinhas.map(r => ({
            categoria_id: r.categoria_id || null,
            centro_custo_id: r.centro_custo_id || null,
            valor: r.valor,
            percentual: r.percentual || null,
            observacao: r.observacao || null,
          }))
        : null;

      // Categoria única → rateio de 1 linha, para a RPC gravar categoria_id no INSERT.
      // Evita um segundo UPDATE em lançamento REALIZADO (que dispararia o trigger de justificativa).
      const singleCat = !useRateio && categoriaId ? categorias.find(c => c.id === categoriaId) : null;
      const singleRateioPayload = singleCat
        ? [{
            categoria_id: categoriaId,
            centro_custo_id: singleCat.centro_custo_padrao_id || null,
            valor,
            percentual: 100,
            observacao: null,
          }]
        : null;
      const effectivePayload = rateioPayload ?? singleRateioPayload;

      if (destino === 'lancamento') {
        // Create via existing RPC (categoria já vai no payload → sem UPDATE de campo vigiado)
        const { data, error } = await supabase.rpc('reconcile_import_lancamento', {
          p_data: dataCompetencia,
          p_descricao: descricao,
          p_valor: valor,
          p_tipo: tipo,
          p_conta_id: contaBancariaId,
          p_user_id: user?.id,
          p_rateio_linhas: effectivePayload,
          p_external_id: linha?.fitId || null,
        });
        if (error) throw error;
        const importResult = data as { lancamento_id?: string } | null;
        await bindExtratoLine(importResult?.lancamento_id);

        // Update the just-created lancamento with extra fields if needed.
        // NÃO incluir categoria_id aqui: é campo vigiado pelo trigger de lançamento REALIZADO.
        if (dataVencimento || dataPagamento || observacoes) {
          // Find the lancamento we just created (most recent for this account)
          const { data: recent } = await supabase.from('fin_lancamentos')
            .select('id')
            .eq('conta_id', contaBancariaId)
            .eq('descricao', descricao)
            .eq('data_competencia', dataCompetencia)
            .order('created_at', { ascending: false })
            .limit(1);

          if (recent && recent.length > 0) {
            const updatePayload: any = {};
            if (dataVencimento) updatePayload.data_vencimento = dataVencimento;
            if (dataPagamento) updatePayload.data_pagamento = dataPagamento;
            if (observacoes) updatePayload.observacoes = observacoes;
            if (Object.keys(updatePayload).length > 0) {
              await supabase.from('fin_lancamentos').update(updatePayload).eq('id', recent[0].id);
            }
          }
        }

        toast.success('Lançamento criado e conciliado com sucesso!');
        emitDataEvent('financeiro:lancamentos');
        onCreated({ id: 'lancamento-created', destino: 'lancamento' });

      } else if (destino === 'conta_pagar') {
        const payload: any = {
          descricao,
          valor,
          data_vencimento: dataVencimento || dataCompetencia,
          data_competencia: dataCompetencia,
          status: 'PAGO',
          data_pagamento: dataPagamento || dataCompetencia,
          valor_pago: valor,
          conta_id: contaBancariaId,
          observacoes: observacoes || null,
          categoria_id: useRateio ? null : (categoriaId || null),
          supplier_id: supplierId || null,
        };

        const { data: cpData, error: cpError } = await supabase.from('fin_contas_pagar').insert(payload).select('id').single();
        if (cpError) throw cpError;

        // Create corresponding lancamento for the ledger with proper referencia linking
        const { data: lancData, error: lancError } = await supabase.rpc('reconcile_import_lancamento', {
          p_data: dataCompetencia,
          p_descricao: descricao,
          p_valor: valor,
          p_tipo: 'DESPESA',
          p_conta_id: contaBancariaId,
          p_user_id: user?.id,
          p_rateio_linhas: effectivePayload,
          p_external_id: linha?.fitId || null,
        });
        if (lancError) console.warn('Lancamento mirror for CP:', lancError.message);
        else await bindExtratoLine((lancData as { lancamento_id?: string } | null)?.lancamento_id);

        // Link the lancamento back to CP via referencia fields
        if (cpData) {
          const { data: recentLanc } = await supabase.from('fin_lancamentos')
            .select('id')
            .eq('conta_id', contaBancariaId)
            .eq('descricao', descricao)
            .eq('data_competencia', dataCompetencia)
            .order('created_at', { ascending: false })
            .limit(1);
          if (recentLanc && recentLanc.length > 0) {
            await supabase.from('fin_lancamentos').update({
              referencia_modulo: 'contas_pagar',
              referencia_id: cpData.id,
              origem: 'espelho_cp',
            }).eq('id', recentLanc[0].id);
            await supabase.from('fin_contas_pagar').update({
              lancamento_id: recentLanc[0].id,
            }).eq('id', cpData.id);
          }
        }

        toast.success('Conta a pagar criada (já baixada) e conciliada!');
        emitDataEvent('financeiro:contas_pagar');
        emitDataEvent('financeiro:lancamentos');
        onCreated({ id: cpData?.id || 'cp-created', destino: 'conta_pagar' });

      } else if (destino === 'conta_receber') {
        const payload: any = {
          descricao,
          valor,
          data_vencimento: dataVencimento || dataCompetencia,
          data_competencia: dataCompetencia,
          status: 'RECEBIDO',
          data_recebimento: dataPagamento || dataCompetencia,
          valor_recebido: valor,
          conta_id: contaBancariaId,
          observacoes: observacoes || null,
          categoria_id: useRateio ? null : (categoriaId || null),
          cliente: cliente || null,
          supplier_id: supplierId || null,
        };

        const { data: crData, error: crError } = await supabase.from('fin_contas_receber').insert(payload).select('id').single();
        if (crError) throw crError;

        // Create corresponding lancamento for the ledger
        const { data: lancData, error: lancError } = await supabase.rpc('reconcile_import_lancamento', {
          p_data: dataCompetencia,
          p_descricao: descricao,
          p_valor: valor,
          p_tipo: 'RECEITA',
          p_conta_id: contaBancariaId,
          p_user_id: user?.id,
          p_rateio_linhas: effectivePayload,
          p_external_id: linha?.fitId || null,
        });
        if (lancError) console.warn('Lancamento mirror for CR:', lancError.message);
        else await bindExtratoLine((lancData as { lancamento_id?: string } | null)?.lancamento_id);

        // Link the lancamento back to CR via referencia fields
        if (crData) {
          const { data: recentLanc } = await supabase.from('fin_lancamentos')
            .select('id')
            .eq('conta_id', contaBancariaId)
            .eq('descricao', descricao)
            .eq('data_competencia', dataCompetencia)
            .order('created_at', { ascending: false })
            .limit(1);
          if (recentLanc && recentLanc.length > 0) {
            await supabase.from('fin_lancamentos').update({
              referencia_modulo: 'contas_receber',
              referencia_id: crData.id,
              origem: 'espelho_cr',
            }).eq('id', recentLanc[0].id);
            await supabase.from('fin_contas_receber').update({
              lancamento_id: recentLanc[0].id,
            }).eq('id', crData.id);
          }
        }

        toast.success('Conta a receber criada (já recebida) e conciliada!');
        emitDataEvent('financeiro:contas_receber');
        emitDataEvent('financeiro:lancamentos');
        onCreated({ id: crData?.id || 'cr-created', destino: 'conta_receber' });
      }

      emitDataEvent('financeiro:conciliacao');
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao criar registro');
    }
    setSaving(false);
  };

  if (!linha) return null;

  const filteredCategorias = categorias.filter(c => {
    if (tipo === 'RECEITA') return c.tipo === 'receita' || !c.tipo;
    if (tipo === 'DESPESA') return c.tipo === 'despesa' || !c.tipo;
    return true;
  });

  if (!canViewRbac) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Criar Registro a partir do Extrato
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Extrato source card */}
          <Card className="border-primary/20">
            <CardContent className="p-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase">Linha do Extrato</p>
                  <p className="text-sm font-medium">{linha.descricao}</p>
                  <p className="text-xs text-muted-foreground">{linha.data}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{fmtBRL(linha.valor)}</p>
                  <Badge variant={linha.tipo === 'RECEITA' ? 'default' : 'destructive'}>{linha.tipo}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Destino */}
          <div>
            <Label className="text-xs font-medium">Tipo de Registro</Label>
            <div className="flex gap-2 mt-1">
              <Button size="sm" variant={destino === 'lancamento' ? 'default' : 'outline'} onClick={() => setDestino('lancamento')} className="text-xs">
                Lançamento
              </Button>
              <Button size="sm" variant={destino === 'conta_pagar' ? 'default' : 'outline'} onClick={() => { setDestino('conta_pagar'); setTipo('DESPESA'); }} className="text-xs">
                Conta a Pagar
              </Button>
              <Button size="sm" variant={destino === 'conta_receber' ? 'default' : 'outline'} onClick={() => { setDestino('conta_receber'); setTipo('RECEITA'); }} className="text-xs">
                Conta a Receber
              </Button>
            </div>
          </div>

          {/* Tipo (only for lancamento) */}
          {destino === 'lancamento' && (
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={v => setTipo(v as 'RECEITA' | 'DESPESA')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESPESA">Despesa</SelectItem>
                  <SelectItem value="RECEITA">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Descrição + Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={descricao} onChange={e => setDescricao(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <CurrencyInput value={String(valor)} onValueChange={(_, parsed) => setValor(parsed ?? 0)} showPrefix maxDecimals={2} className="h-9" />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Data Competência</Label>
              <Input type="date" value={dataCompetencia} onChange={e => setDataCompetencia(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Data Vencimento</Label>
              <Input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Data {tipo === 'RECEITA' ? 'Recebimento' : 'Pagamento'}</Label>
              <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* Categoria (single or rateio) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Categoria</Label>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => {
                setUseRateio(!useRateio);
                if (!useRateio && rateioLinhas.length === 0) {
                  setRateioLinhas([{ categoria_id: categoriaId || '', centro_custo_id: '', valor, percentual: 100, observacao: '' }]);
                }
              }}>
                <PieChart className="w-3 h-3" />
                {useRateio ? 'Categoria Única' : 'Ratear'}
              </Button>
            </div>

            {!useRateio ? (
              <CategoryCombobox
                value={categoriaId}
                onValueChange={setCategoriaId}
                options={filteredCategorias}
                placeholder="Pesquisar categoria..."
                className="h-9 text-sm"
              />
            ) : (
              <div className="space-y-2 border border-border rounded-lg p-3">
                {rateioLinhas.map((rl, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Label className="text-[10px] text-muted-foreground">Categoria</Label>
                      <CategoryCombobox
                        value={rl.categoria_id}
                        onValueChange={v => updateRateioLinha(idx, 'categoria_id', v)}
                        options={filteredCategorias}
                        placeholder="Pesquisar..."
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                      <CurrencyInput className="h-8 text-xs" value={String(rl.valor || '')} onValueChange={(_, parsed) => updateRateioLinha(idx, 'valor', parsed ?? 0)} showPrefix maxDecimals={2} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">%</Label>
                      <Input className="h-8 text-xs" type="text" inputMode="decimal" value={rl.percentual || ''} onChange={e => {
                        const v = e.target.value.replace(',', '.');
                        updateRateioLinha(idx, 'percentual', v === '' ? 0 : Number(v) || 0);
                      }} />
                    </div>
                    <div className="col-span-2 flex justify-end gap-1">
                      {rateioLinhas.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeRateioLinha(idx)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addRateioLinha}><Plus className="w-3 h-3 mr-1" /> Linha</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={ratearIgual}>🧮 Igual</Button>
                  </div>
                  <span className={`text-xs font-medium ${Math.abs(rateioDiff) < 0.01 ? 'text-success' : 'text-destructive'}`}>
                    {fmtBRL(rateioTotal)} / {fmtBRL(valor)}
                    {Math.abs(rateioDiff) >= 0.01 && ` (falta ${fmtBRL(rateioDiff)})`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Fornecedor / Cliente */}
          {(destino === 'conta_pagar' || tipo === 'DESPESA') && (
            <div>
              <Label className="text-xs">Fornecedor</Label>
              <SupplierCombobox
                value={supplierId}
                onValueChange={setSupplierId}
                options={suppliers}
                placeholder="Pesquisar fornecedor..."
                className="h-9"
              />
            </div>
          )}

          {destino === 'conta_receber' && (
            <div>
              <Label className="text-xs">Cliente</Label>
              <Input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente" className="h-9" />
            </div>
          )}

          {/* Observações */}
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações adicionais..." className="min-h-[60px]" />
          </div>

          {/* Info box */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p className="font-medium text-foreground mb-1">Ao salvar:</p>
            <ul className="text-muted-foreground space-y-1 text-xs">
              {destino === 'lancamento' && (
                <>
                  <li>✅ Lançamento criado no Livro Razão</li>
                  <li>✅ Lançamento já nasce conciliado</li>
                </>
              )}
              {destino === 'conta_pagar' && (
                <>
                  <li>✅ Conta a pagar criada com status PAGO</li>
                  <li>✅ Lançamento correspondente no Livro Razão</li>
                  <li>✅ Conciliado automaticamente com o extrato</li>
                </>
              )}
              {destino === 'conta_receber' && (
                <>
                  <li>✅ Conta a receber criada com status RECEBIDO</li>
                  <li>✅ Lançamento correspondente no Livro Razão</li>
                  <li>✅ Conciliado automaticamente com o extrato</li>
                </>
              )}
              {useRateio && <li>✅ Rateio por categoria aplicado</li>}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            Criar e Conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
