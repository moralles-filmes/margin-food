import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DollarSign, TrendingUp, Users, Calculator,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import GlobalKpiCard from '@/components/ui/KpiCard';
import { formatInBR } from '@/lib/datetime';
import { fmtBRL } from '@/lib/money';
import type { Database } from '@/integrations/supabase/types';

import { useCan } from '@/permissions/hooks';
type RhCustoMensal = Database['public']['Tables']['rh_custos_mensais']['Row'];

interface RhColaborador {
  id: string;
  status: string;
  salario: number;
  adicional_noturno_percent?: number;
  valor_hora?: number;
  setor: string;
}

interface Props {
  colaboradores: RhColaborador[];
}

/** View model — only the columns we select */
interface CustoMensalView {
  id: string;
  periodo: string;
  total_salarios: number;
  total_horas_extras: number;
  total_beneficios: number;
  total_encargos: number;
  total_insalubridade: number;
  total_noturno: number;
  total_geral: number;
  qtd_colaboradores: number;
  custo_medio_colaborador: number;
  detalhamento: unknown;
  calculado_por: string | null;
}

const fmt = fmtBRL;

export default function ControleCustosRhSection({
 colaboradores }: Props) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const canViewRbac = useCan('rh:custos:view');
  const { user } = useAuth();
  const [custos, setCustos] = useState<CustoMensalView[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [periodoCalc, setPeriodoCalc] = useState(() => formatInBR(new Date(), 'yyyy-MM'));

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rh_custos_mensais')
      .select('id, periodo, total_salarios, total_horas_extras, total_beneficios, total_encargos, total_insalubridade, total_noturno, total_geral, qtd_colaboradores, custo_medio_colaborador, detalhamento, calculado_por')
      .order('periodo', { ascending: false })
      .limit(12);
    if (error) console.error(error);
    setCustos((data || []) as unknown as CustoMensalView[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const calcularCustos = async () => {
    if (!periodoCalc) { toast.error('Selecione o período'); return; }
    setCalculating(true);

    try {
      const ativos = colaboradores.filter(c => c.status === 'ativo');
      const qtd = ativos.length;

      // Salários
      const totalSalarios = ativos.reduce((s, c) => s + (c.salario || 0), 0);

      // Encargos estimados (INSS patronal ~28.8% + FGTS 8% + PIS 1% ≈ 37.8%)
      const totalEncargos = totalSalarios * 0.378;

      // Adicional noturno
      const totalNoturno = ativos.reduce((s, c) => {
        const pct = c.adicional_noturno_percent || 0;
        return s + ((c.salario || 0) * pct / 100);
      }, 0);

      // Benefícios do período
      const { data: beneficiosKpi, error: beneficiosErr } = await supabase.rpc('get_rh_beneficios_total');
      if (beneficiosErr) throw beneficiosErr;
      const totalBeneficios = Number((beneficiosKpi as { total_beneficios?: number } | null)?.total_beneficios ?? 0);

      // Horas extras do período (banco_horas)
      const { data: bancoHoras } = await supabase
        .from('rh_banco_horas')
        .select('horas_extras, colaborador_id')
        .eq('periodo', periodoCalc);
      
      let totalHorasExtras = 0;
      for (const bh of (bancoHoras || [])) {
        const colab = ativos.find(c => c.id === bh.colaborador_id);
        if (colab) {
          const valorHora = colab.valor_hora || ((colab.salario || 0) / 220);
          totalHorasExtras += (bh.horas_extras || 0) * valorHora * 1.5;
        }
      }

      const totalGeral = totalSalarios + totalEncargos + totalBeneficios + totalHorasExtras + totalNoturno;
      const custoMedio = qtd > 0 ? totalGeral / qtd : 0;

      // Detalhamento por setor
      const setores: Record<string, { qtd: number; custo: number }> = {};
      for (const c of ativos) {
        if (!setores[c.setor]) setores[c.setor] = { qtd: 0, custo: 0 };
        setores[c.setor].qtd++;
        setores[c.setor].custo += (c.salario || 0);
      }

      const payload: Database['public']['Tables']['rh_custos_mensais']['Insert'] = {
        periodo: periodoCalc,
        total_salarios: Math.round(totalSalarios * 100) / 100,
        total_horas_extras: Math.round(totalHorasExtras * 100) / 100,
        total_beneficios: Math.round(totalBeneficios * 100) / 100,
        total_encargos: Math.round(totalEncargos * 100) / 100,
        total_insalubridade: 0,
        total_noturno: Math.round(totalNoturno * 100) / 100,
        total_geral: Math.round(totalGeral * 100) / 100,
        qtd_colaboradores: qtd,
        custo_medio_colaborador: Math.round(custoMedio * 100) / 100,
        detalhamento: setores as unknown as Database['public']['Tables']['rh_custos_mensais']['Insert']['detalhamento'],
        calculado_por: user?.id ?? null,
      };

      const { error } = await supabase
        .from('rh_custos_mensais')
        .upsert(withCompanyId(companyId, payload), { onConflict: 'company_id,periodo' });

      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Custos calculados com sucesso!');
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast.error('Erro: ' + msg);
    } finally {
      setCalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const atual = custos[0];
  const anterior = custos[1];
  const variacao = atual && anterior && anterior.total_geral > 0
    ? ((atual.total_geral - anterior.total_geral) / anterior.total_geral) * 100
    : null;

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Calcular */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-xs">Período:</Label>
            <Input
              type="month"
              className="h-8 text-xs w-40"
              value={periodoCalc}
              onChange={e => setPeriodoCalc(e.target.value)}
            />
            <Button size="sm" className="gap-1.5 h-8" onClick={calcularCustos} disabled={calculating}>
              {calculating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
              {calculating ? 'Calculando...' : 'Calcular Custos'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {atual && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <GlobalKpiCard
            label="Custo Total"
            value={fmt(atual.total_geral)}
            icon={DollarSign}
            sub={variacao !== null && variacao !== undefined ? `${variacao > 0 ? '+' : ''}${variacao.toFixed(1)}% vs mês anterior` : undefined}
            variant={variacao && variacao > 0 ? 'danger' : 'default'}
          />
          <GlobalKpiCard
            label="Salários"
            value={fmt(atual.total_salarios)}
            icon={Users}
            sub={`${atual.qtd_colaboradores} colaboradores`}
          />
          <GlobalKpiCard
            label="Encargos"
            value={fmt(atual.total_encargos)}
            icon={TrendingUp}
            sub="~37.8% folha"
          />
          <GlobalKpiCard
            label="Custo Médio/Colab"
            value={fmt(atual.custo_medio_colaborador)}
            icon={Users}
          />
        </div>
      )}

      {/* Breakdown */}
      {atual && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Composição de Custos — {atual.periodo}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <CostBar label="Salários" value={atual.total_salarios} total={atual.total_geral} color="bg-primary" />
              <CostBar label="Encargos" value={atual.total_encargos} total={atual.total_geral} color="bg-primary" />
              <CostBar label="Benefícios" value={atual.total_beneficios} total={atual.total_geral} color="bg-success" />
              <CostBar label="Horas Extras" value={atual.total_horas_extras} total={atual.total_geral} color="bg-warning" />
              <CostBar label="Adicional Noturno" value={atual.total_noturno} total={atual.total_geral} color="bg-accent" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      {custos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Histórico Mensal</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Período</TableHead>
                  <TableHead className="text-xs text-right">Salários</TableHead>
                  <TableHead className="text-xs text-right">Encargos</TableHead>
                  <TableHead className="text-xs text-right">Benefícios</TableHead>
                  <TableHead className="text-xs text-right">H. Extras</TableHead>
                  <TableHead className="text-xs text-right font-semibold">Total</TableHead>
                  <TableHead className="text-xs text-right">Colabs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {custos.map((c, i) => {
                  const prev = custos[i + 1];
                  const var_ = prev && prev.total_geral > 0
                    ? ((c.total_geral - prev.total_geral) / prev.total_geral) * 100
                    : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs font-medium">{c.periodo}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(c.total_salarios)}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(c.total_encargos)}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(c.total_beneficios)}</TableCell>
                      <TableCell className="text-xs text-right">{fmt(c.total_horas_extras)}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">
                        {fmt(c.total_geral)}
                        {var_ !== null && (
                          <span className={cn("ml-1 text-[10px]", var_ > 0 ? "text-destructive" : "text-success")}>
                            {var_ > 0 ? '+' : ''}{var_.toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right">{c.qtd_colaboradores}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {custos.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm text-muted-foreground">Nenhum cálculo de custos ainda. Selecione um período e clique em "Calcular Custos".</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CostBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-28 shrink-0">{label}</span>
      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-24 text-right">{fmt(value)}</span>
      <span className="text-[10px] text-muted-foreground w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}
