import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions/hooks';
import { toast } from 'sonner';
import {
  ShoppingCart, RefreshCw, AlertTriangle, CheckCircle, TrendingDown,
  Package, DollarSign, Shield, Clock, ArrowRight, FileText, Zap
} from 'lucide-react';

interface SimItem {
  produtoId: string;
  nome: string;
  categoria: string;
  unidadeBase: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  estoqueIdeal: number;
  consumoMedioSemanal: number;
  coberturaSemanas: number;
  status: 'ok' | 'atencao' | 'ruptura';
  qtdSugerida: number;
  precoUnitario: number;
  subtotal: number;
  novaCoberturaProj: number;
  itemParado: boolean;
  diasSemMov: number;
}

interface SimResumo {
  totalEstimado: number;
  itensRuptura: number;
  itensSaemRuptura: number;
  coberturaMediaAtual: number;
  coberturaMediaProj: number;
  totalItens: number;
  itensParados: number;
  top10Impacto: SimItem[];
}

import { formatFixedBR, fmtBRL } from '@/lib/formatters';
const fmt = (v: number) => formatFixedBR(v, 2);

export default function SimuladorCompraGeral() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('purchases:create') || useCan('compras:pedidos:create');

  // Filters
  const [semanasMeta, setSemanasMeta] = useState('2');
  const [semanasConsumo, setSemanasConsumo] = useState('4');
  const [metodoPreco, setMetodoPreco] = useState('custo_medio_30d');
  const [categoria, setCategoria] = useState('');
  const [apenasRuptura, setApenasRuptura] = useState(false);

  // Data
  const [items, setItems] = useState<SimItem[]>([]);
  const [resumo, setResumo] = useState<SimResumo | null>(null);
  const [loading, setLoading] = useState(false);
  const [qtdOverrides, setQtdOverrides] = useState<Record<string, string>>({});

  const simular = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('cmv', {
        body: {
          action: 'simular_compra_geral',
          semanas_meta: Number(semanasMeta) || 2,
          semanas_consumo: Number(semanasConsumo) || 4,
          metodo_preco: metodoPreco,
          categoria: categoria || undefined,
          apenas_ruptura: apenasRuptura,
        },
      });
      if (error) throw error;
      setItems(data?.items || []);
      setResumo(data?.resumo || null);
      setQtdOverrides({});
    } catch (e: any) {
      toast.error('Erro na simulação: ' + (e.message || ''));
    }
    setLoading(false);
  }, [semanasMeta, semanasConsumo, metodoPreco, categoria, apenasRuptura]);

  const getQtd = (item: SimItem) => {
    const override = qtdOverrides[item.produtoId];
    return override !== undefined ? (parseFloat(override) || 0) : item.qtdSugerida;
  };

  const totalAjustado = useMemo(() => {
    return items.reduce((s, i) => s + getQtd(i) * i.precoUnitario, 0);
  }, [items, qtdOverrides]);

  const statusBadge = (status: string) => {
    if (status === 'ok') return <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px]">✅ OK</Badge>;
    if (status === 'atencao') return <Badge className="bg-accent/50 text-accent-foreground border-accent/30 text-[9px]">⚠️ Baixo</Badge>;
    return <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[9px]">❌ Ruptura</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* BLOCK 1: FILTROS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" /> Simulador de Compras
          </CardTitle>
          <CardDescription className="text-xs">
            Simule compras inteligentes baseadas no consumo real e cobertura em semanas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Meta Cobertura (semanas)</Label>
              <Select value={semanasMeta} onValueChange={setSemanasMeta}>
                <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 semana</SelectItem>
                  <SelectItem value="2">2 semanas</SelectItem>
                  <SelectItem value="3">3 semanas</SelectItem>
                  <SelectItem value="4">4 semanas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Base Consumo</Label>
              <Select value={semanasConsumo} onValueChange={setSemanasConsumo}>
                <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Últimas 2 sem.</SelectItem>
                  <SelectItem value="4">Últimas 4 sem.</SelectItem>
                  <SelectItem value="8">Últimas 8 sem.</SelectItem>
                  <SelectItem value="12">Últimas 12 sem.</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Preço</Label>
              <Select value={metodoPreco} onValueChange={setMetodoPreco}>
                <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custo_medio_30d">Média 30d</SelectItem>
                  <SelectItem value="custo_ultima_compra">Última compra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Categoria</Label>
              <Select value={categoria || 'all'} onValueChange={v => setCategoria(v === 'all' ? '' : v)}>
                <SelectTrigger className="bg-secondary border-border text-foreground"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {['Oriental', 'Bebidas', 'Limpeza', 'Embalagens', 'Cozinha', 'Descartáveis', 'Proteínas', 'Hortifruti', 'Outros'].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={apenasRuptura} onCheckedChange={setApenasRuptura} />
                <span className="text-[10px] text-muted-foreground">Só ruptura</span>
              </div>
              <Button onClick={simular} disabled={loading} size="sm" className="gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Simular
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BLOCK 4: RESUMO EXECUTIVO */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Estimado</span>
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <p className="text-lg font-bold text-foreground">R$ {fmt(totalAjustado)}</p>
              {totalAjustado !== resumo.totalEstimado && (
                <p className="text-[10px] text-muted-foreground">Original: R$ {fmt(resumo.totalEstimado)}</p>
              )}
            </CardContent>
          </Card>
          <Card className={resumo.itensRuptura > 0 ? 'border-destructive/30' : 'border-border'}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Itens Ruptura</span>
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <p className="text-lg font-bold text-foreground">{resumo.itensRuptura}</p>
              <p className="text-[10px] text-muted-foreground">{resumo.itensSaemRuptura} saem após compra</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Cobertura Atual</span>
                <Clock className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-lg font-bold text-foreground">{resumo.coberturaMediaAtual} sem</p>
              <div className="flex items-center gap-1 text-[10px] text-primary">
                <ArrowRight className="w-3 h-3" />
                <span>Projetada: {resumo.coberturaMediaProj} sem</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Itens Parados</span>
                <Package className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-lg font-bold text-foreground">{resumo.itensParados}</p>
              <p className="text-[10px] text-muted-foreground">sem mov. &gt;30 dias</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ALERTS */}
      {resumo && totalAjustado > 0 && (
        <div className="space-y-1.5">
          {items.filter(i => i.itemParado && getQtd(i) > 0).length > 0 && (
            <div className="bg-accent/20 border border-accent/30 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-accent-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-accent-foreground">
                <strong>Atenção:</strong> {items.filter(i => i.itemParado && getQtd(i) > 0).length} item(ns) parado(s) estão na lista. Verifique antes de comprar.
              </p>
            </div>
          )}
          {items.filter(i => {
            const q = getQtd(i);
            const novaCob = i.consumoMedioSemanal > 0 ? (i.estoqueAtual + q) / i.consumoMedioSemanal : 99;
            return novaCob > 6;
          }).length > 0 && (
            <div className="bg-accent/20 border border-accent/30 rounded-lg px-3 py-2 flex items-start gap-2">
              <Shield className="w-4 h-4 text-accent-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-accent-foreground">
                <strong>Risco de excesso:</strong> Alguns itens ficam com cobertura &gt;6 semanas. Ajuste as quantidades.
              </p>
            </div>
          )}
        </div>
      )}

      {/* BLOCK 3: LISTA DE ITENS */}
      {items.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Lista de Compras ({items.length} itens)
              </CardTitle>
              {canEdit && (
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => toast.info('Funcionalidade de conversão em pedido será implementada em breve.')}>
                  <FileText className="w-3.5 h-3.5" /> Converter em Pedido
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Item</TableHead>
                    <TableHead className="text-[10px]">Cat.</TableHead>
                    <TableHead className="text-right text-[10px]">Estoque</TableHead>
                    <TableHead className="text-right text-[10px]">Consumo/sem</TableHead>
                    <TableHead className="text-right text-[10px]">Cobertura</TableHead>
                    <TableHead className="text-[10px] text-center">Status</TableHead>
                    <TableHead className="text-right text-[10px]">Qtd Sugerida</TableHead>
                    <TableHead className="text-right text-[10px] w-24">Qtd Compra</TableHead>
                    <TableHead className="text-right text-[10px]">R$/un</TableHead>
                    <TableHead className="text-right text-[10px]">Subtotal</TableHead>
                    <TableHead className="text-right text-[10px]">Nova Cob.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => {
                    const qtd = getQtd(item);
                    const sub = qtd * item.precoUnitario;
                    const novaCob = item.consumoMedioSemanal > 0 ? (item.estoqueAtual + qtd) / item.consumoMedioSemanal : 99;
                    return (
                      <TableRow key={item.produtoId} className={item.itemParado ? 'bg-accent/5' : ''}>
                        <TableCell className="text-xs font-medium">
                          {item.nome}
                          {item.itemParado && <span className="text-[9px] text-destructive ml-1">⏸ {item.diasSemMov}d</span>}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{item.categoria}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(item.estoqueAtual)}</TableCell>
                        <TableCell className="text-right text-xs">{fmt(item.consumoMedioSemanal)}</TableCell>
                        <TableCell className="text-right text-xs">{item.coberturaSemanas} sem</TableCell>
                        <TableCell className="text-center">{statusBadge(item.status)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{fmt(item.qtdSugerida)}</TableCell>
                        <TableCell className="text-right">
                          {canEdit ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={qtdOverrides[item.produtoId] ?? item.qtdSugerida}
                              onChange={e => setQtdOverrides(prev => ({ ...prev, [item.produtoId]: e.target.value }))}
                              className="h-7 w-20 text-xs bg-secondary border-border text-foreground text-right"
                            />
                          ) : (
                            <span className="text-xs">{fmt(qtd)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">R$ {fmt(item.precoUnitario)}</TableCell>
                        <TableCell className="text-right text-xs font-medium">R$ {fmt(sub)}</TableCell>
                        <TableCell className={`text-right text-xs font-medium ${novaCob > 6 ? 'text-destructive' : novaCob >= Number(semanasMeta) ? 'text-primary' : 'text-foreground'}`}>
                          {Math.round(novaCob * 10) / 10} sem
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TOP 10 IMPACTO */}
      {resumo && resumo.top10Impacto.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-destructive" /> Top 10 — Maior Impacto Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">#</TableHead>
                  <TableHead className="text-[10px]">Item</TableHead>
                  <TableHead className="text-[10px]">Categoria</TableHead>
                  <TableHead className="text-right text-[10px]">Subtotal</TableHead>
                  <TableHead className="text-right text-[10px]">Qtd Sug.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumo.top10Impacto.map((item, i) => (
                  <TableRow key={item.produtoId}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-medium">{item.nome}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{item.categoria}</TableCell>
                    <TableCell className="text-right text-xs font-medium">R$ {fmt(item.subtotal)}</TableCell>
                    <TableCell className="text-right text-xs">{fmt(item.qtdSugerida)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* EMPTY STATE */}
      {items.length === 0 && !loading && (
        <Card className="border-border">
          <CardContent className="py-12 text-center">
            <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Simulador de Compras</p>
            <p className="text-xs text-muted-foreground mb-4">Configure os filtros e clique em "Simular" para gerar a lista inteligente de compras.</p>
            <Button onClick={simular} size="sm" className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Simular Agora
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
