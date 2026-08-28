import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import KpiCard from '@/components/ui/KpiCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, DollarSign, TrendingUp, TrendingDown, CheckCircle2, ChevronRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInBR } from '@/lib/datetime';
import { formatFixedBR } from '@/lib/formatters';

import { useCan } from '@/permissions/hooks';
interface Colaborador {
  id: string;
  nome: string;
  setor: string;
  salario: number;
  valor_hora: number;
  carga_horaria_semanal: number;
  adicional_noturno_percent?: number | null;
}

interface FolhaPagamento {
  id: string;
  colaborador_id: string;
  periodo: string;
  salario_base: number;
  valor_hora: number;
  horas_normais: number;
  horas_extras_50: number;
  horas_extras_100: number;
  adicional_noturno: number;
  adicional_insalubridade: number;
  adicional_periculosidade: number;
  gratificacoes: number;
  total_proventos: number;
  desconto_inss: number;
  desconto_irrf: number;
  desconto_vale_transporte: number;
  desconto_vale_refeicao: number;
  desconto_faltas: number;
  desconto_atrasos: number;
  outros_descontos: number;
  total_descontos: number;
  salario_liquido: number;
  dias_trabalhados: number;
  faltas: number;
  atrasos_min: number;
  observacoes: string;
  status: string;
  created_at: string;
}

interface Props {
  colaboradores: Colaborador[];
  canManage: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  RASCUNHO: { label: 'Rascunho', variant: 'outline' },
  CALCULADO: { label: 'Calculado', variant: 'secondary' },
  APROVADO: { label: 'Aprovado', variant: 'default' },
  PAGO: { label: 'Pago', variant: 'default' },
};

// INSS 2026 brackets (simplified)
function calcINSS(salario: number): number {
  if (salario <= 1412.00) return salario * 0.075;
  if (salario <= 2666.68) return 1412 * 0.075 + (salario - 1412) * 0.09;
  if (salario <= 4000.03) return 1412 * 0.075 + (2666.68 - 1412) * 0.09 + (salario - 2666.68) * 0.12;
  if (salario <= 7786.02) return 1412 * 0.075 + (2666.68 - 1412) * 0.09 + (4000.03 - 2666.68) * 0.12 + (salario - 4000.03) * 0.14;
  return 1412 * 0.075 + (2666.68 - 1412) * 0.09 + (4000.03 - 2666.68) * 0.12 + (7786.02 - 4000.03) * 0.14;
}

// IRRF simplified
function calcIRRF(baseIR: number): number {
  if (baseIR <= 2259.20) return 0;
  if (baseIR <= 2826.65) return baseIR * 0.075 - 169.44;
  if (baseIR <= 3751.05) return baseIR * 0.15 - 381.44;
  if (baseIR <= 4664.68) return baseIR * 0.225 - 662.77;
  return baseIR * 0.275 - 896.00;
}

const R = (v: number) => formatFixedBR(v, 2);

export default function FolhaPagamentoSection({
 colaboradores, canManage }: Props) {
  const canViewRbac = useCan('rh:folha:view');
  const { user } = useAuth();
  const [folhas, setFolhas] = useState<FolhaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState(formatInBR(new Date(), 'yyyy-MM'));
  const [selectedFolha, setSelectedFolha] = useState<FolhaPagamento | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rh_folha_pagamento')
        .select('id, colaborador_id, periodo, salario_base, valor_hora, horas_normais, horas_extras_50, horas_extras_100, adicional_noturno, adicional_insalubridade, adicional_periculosidade, gratificacoes, total_proventos, desconto_inss, desconto_irrf, desconto_vale_transporte, desconto_vale_refeicao, desconto_faltas, desconto_atrasos, outros_descontos, total_descontos, salario_liquido, dias_trabalhados, faltas, atrasos_min, observacoes, status, created_at')
        .eq('periodo', periodo)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setFolhas((data || []) as FolhaPagamento[]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [periodo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getColabNome = (id: string) => colaboradores.find(c => c.id === id)?.nome || 'Desconhecido';

  const handleGerarFolha = async () => {
    if (!canManage) { toast.error('Sem permissão'); return; }
    setGenerating(true);

    try {
      // Fetch banco_horas for period
      const { data: bancoData } = await supabase
        .from('rh_banco_horas')
        .select('id, colaborador_id, periodo, horas_trabalhadas, horas_extras, banco_horas_saldo, observacoes')
        .eq('periodo', periodo);

      const bancoMap = new Map((bancoData || []).map((b: any) => [b.colaborador_id, b]));

      const inserts = colaboradores.map(colab => {
        const banco: any = bancoMap.get(colab.id) || {};
        const salarioBase = colab.salario || 0;
        const valorHora = colab.valor_hora || (salarioBase / 220);
        const horasNormais = banco.horas_trabalhadas || 0;
        const horasExtras = banco.horas_extras || 0;
        const he50 = horasExtras * 0.7; // 70% at 50%
        const he100 = horasExtras * 0.3; // 30% at 100%
        const noturnoPercent = colab.adicional_noturno_percent || 0;
        const adicNoturno = salarioBase * (noturnoPercent / 100);
        const faltas = banco.faltas || 0;
        const atrasos = banco.atrasos_min || 0;

        const valorHE50 = he50 * valorHora * 1.5;
        const valorHE100 = he100 * valorHora * 2;
        const descontoFaltas = faltas * (salarioBase / 30);
        const descontoAtrasos = (atrasos / 60) * valorHora;

        const totalProventos = salarioBase + valorHE50 + valorHE100 + adicNoturno;
        const inss = calcINSS(totalProventos);
        const baseIR = totalProventos - inss;
        const irrf = Math.max(calcIRRF(baseIR), 0);
        const valeTransporte = salarioBase * 0.06;
        const totalDescontos = inss + irrf + valeTransporte + descontoFaltas + descontoAtrasos;
        const liquido = totalProventos - totalDescontos;

        return {
          colaborador_id: colab.id,
          periodo,
          salario_base: salarioBase,
          valor_hora: Math.round(valorHora * 100) / 100,
          horas_normais: horasNormais,
          horas_extras_50: Math.round(he50 * 100) / 100,
          horas_extras_100: Math.round(he100 * 100) / 100,
          adicional_noturno: Math.round(adicNoturno * 100) / 100,
          gratificacoes: 0,
          adicional_insalubridade: 0,
          adicional_periculosidade: 0,
          total_proventos: Math.round(totalProventos * 100) / 100,
          desconto_inss: Math.round(inss * 100) / 100,
          desconto_irrf: Math.round(irrf * 100) / 100,
          desconto_vale_transporte: Math.round(valeTransporte * 100) / 100,
          desconto_vale_refeicao: 0,
          desconto_faltas: Math.round(descontoFaltas * 100) / 100,
          desconto_atrasos: Math.round(descontoAtrasos * 100) / 100,
          outros_descontos: 0,
          total_descontos: Math.round(totalDescontos * 100) / 100,
          salario_liquido: Math.round(liquido * 100) / 100,
          dias_trabalhados: banco.dias_trabalhados || 0,
          faltas,
          atrasos_min: atrasos,
          status: 'CALCULADO',
          calculado_por: user?.id,
        };
      });

      // Upsert to handle existing records
      for (const insert of inserts) {
        const existing = folhas.find(f => f.colaborador_id === insert.colaborador_id);
        if (existing) {
          await supabase.from('rh_folha_pagamento').update(insert).eq('id', existing.id);
        } else {
          await supabase.from('rh_folha_pagamento').insert(insert);
        }
      }

      toast.success(`Folha de ${periodo} calculada para ${inserts.length} colaboradores!`);
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar folha');
    }
    setGenerating(false);
  };

  const handleAprovar = async (id: string) => {
    const { error } = await supabase.from('rh_folha_pagamento').update({
      status: 'APROVADO',
      aprovado_por: user?.id,
    }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Folha aprovada!');
    fetchData();
  };

  const handleMarcarPago = async (id: string) => {
    const { error } = await supabase.from('rh_folha_pagamento').update({
      status: 'PAGO',
    }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Marcado como pago!');
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Stats
  const totalProventos = folhas.reduce((s, f) => s + f.total_proventos, 0);
  const totalDescontos = folhas.reduce((s, f) => s + f.total_descontos, 0);
  const totalLiquido = folhas.reduce((s, f) => s + f.salario_liquido, 0);
  const pendentes = folhas.filter(f => f.status === 'CALCULADO').length;

  // Detail view
  if (selectedFolha) {
    const f = selectedFolha;
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => setSelectedFolha(null)}>← Voltar</Button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{getColabNome(f.colaborador_id)}</h2>
            <p className="text-xs text-muted-foreground">Período: {f.periodo} · {f.dias_trabalhados} dias trabalhados</p>
          </div>
          <Badge variant={STATUS_CONFIG[f.status]?.variant || 'outline'} className="text-xs">
            {STATUS_CONFIG[f.status]?.label || f.status}
          </Badge>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Proventos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-success"><TrendingUp className="w-4 h-4" /> Proventos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Row label="Salário Base" value={f.salario_base} />
              {f.horas_extras_50 > 0 && <Row label={`HE 50% (${f.horas_extras_50}h)`} value={f.horas_extras_50 * f.valor_hora * 1.5} />}
              {f.horas_extras_100 > 0 && <Row label={`HE 100% (${f.horas_extras_100}h)`} value={f.horas_extras_100 * f.valor_hora * 2} />}
              {f.adicional_noturno > 0 && <Row label="Adicional Noturno" value={f.adicional_noturno} />}
              {f.adicional_insalubridade > 0 && <Row label="Insalubridade" value={f.adicional_insalubridade} />}
              {f.adicional_periculosidade > 0 && <Row label="Periculosidade" value={f.adicional_periculosidade} />}
              {f.gratificacoes > 0 && <Row label="Gratificações" value={f.gratificacoes} />}
              <div className="border-t pt-1.5 mt-1.5">
                <Row label="Total Proventos" value={f.total_proventos} bold />
              </div>
            </CardContent>
          </Card>

          {/* Descontos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-destructive"><TrendingDown className="w-4 h-4" /> Descontos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Row label="INSS" value={f.desconto_inss} negative />
              {f.desconto_irrf > 0 && <Row label="IRRF" value={f.desconto_irrf} negative />}
              <Row label="Vale Transporte (6%)" value={f.desconto_vale_transporte} negative />
              {f.desconto_vale_refeicao > 0 && <Row label="Vale Refeição" value={f.desconto_vale_refeicao} negative />}
              {f.desconto_faltas > 0 && <Row label={`Faltas (${f.faltas})`} value={f.desconto_faltas} negative />}
              {f.desconto_atrasos > 0 && <Row label={`Atrasos (${f.atrasos_min}min)`} value={f.desconto_atrasos} negative />}
              {f.outros_descontos > 0 && <Row label="Outros" value={f.outros_descontos} negative />}
              <div className="border-t pt-1.5 mt-1.5">
                <Row label="Total Descontos" value={f.total_descontos} bold negative />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Líquido */}
        <Card className="bg-primary-soft border-primary-border">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Salário Líquido</span>
              <span className="text-xl font-bold text-primary">R$ {R(f.salario_liquido)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {canManage && (
          <div className="flex gap-2">
            {f.status === 'CALCULADO' && (
              <Button size="sm" onClick={() => handleAprovar(f.id)} className="gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
              </Button>
            )}
            {f.status === 'APROVADO' && (
              <Button size="sm" variant="outline" onClick={() => handleMarcarPago(f.id)} className="gap-1">
                <DollarSign className="w-3.5 h-3.5" /> Marcar como Pago
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // List view
  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Proventos" value={`R$ ${R(totalProventos)}`} icon={TrendingUp} variant="success" />
        <KpiCard label="Total Descontos" value={`R$ ${R(totalDescontos)}`} icon={TrendingDown} variant="danger" />
        <KpiCard label="Total Líquido" value={`R$ ${R(totalLiquido)}`} icon={DollarSign} variant="primary" />
        <KpiCard label="Folhas" value={folhas.length} sub={`/ ${colaboradores.length} colaboradores`} icon={Users} />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Período:</Label>
          <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="h-8 text-xs w-40" />
        </div>
        {canManage && (
          <Button size="sm" onClick={handleGerarFolha} disabled={generating} className="gap-1.5 h-8">
            <Calculator className="w-3.5 h-3.5" />
            {generating ? 'Calculando...' : 'Calcular Folha'}
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Folha de Pagamento — {periodo}</CardTitle>
        </CardHeader>
        <CardContent>
          {folhas.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">Nenhuma folha calculada para este período</p>
              {canManage && (
                <p className="text-xs text-muted-foreground mt-1">Clique em "Calcular Folha" para gerar</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Colaborador</TableHead>
                    <TableHead className="text-xs text-right">Salário Base</TableHead>
                    <TableHead className="text-xs text-right">Proventos</TableHead>
                    <TableHead className="text-xs text-right">Descontos</TableHead>
                    <TableHead className="text-xs text-right">Líquido</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folhas.map(f => {
                    const status = STATUS_CONFIG[f.status] || STATUS_CONFIG.RASCUNHO;
                    return (
                      <TableRow key={f.id} className="cursor-pointer hover:bg-surface-hover" onClick={() => setSelectedFolha(f)}>
                        <TableCell className="text-xs font-medium">{getColabNome(f.colaborador_id)}</TableCell>
                        <TableCell className="text-xs text-right">R$ {R(f.salario_base)}</TableCell>
                        <TableCell className="text-xs text-right text-success">R$ {R(f.total_proventos)}</TableCell>
                        <TableCell className="text-xs text-right text-destructive">R$ {R(f.total_descontos)}</TableCell>
                        <TableCell className="text-xs text-right font-semibold">R$ {R(f.salario_liquido)}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                        </TableCell>
                        <TableCell><ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /></TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="bg-background-subtle font-semibold">
                    <TableCell className="text-xs">TOTAL ({folhas.length})</TableCell>
                    <TableCell className="text-xs text-right">—</TableCell>
                    <TableCell className="text-xs text-right text-success">R$ {R(totalProventos)}</TableCell>
                    <TableCell className="text-xs text-right text-destructive">R$ {R(totalDescontos)}</TableCell>
                    <TableCell className="text-xs text-right">R$ {R(totalLiquido)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold, negative }: { label: string; value: number; bold?: boolean; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className={cn("text-muted-foreground", bold && "text-foreground font-semibold")}>{label}</span>
      <span className={cn(bold && "font-semibold", negative ? "text-destructive" : "")}>
        {negative ? '- ' : ''}R$ {R(value)}
      </span>
    </div>
  );
}
