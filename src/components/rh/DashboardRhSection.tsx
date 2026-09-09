import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, DollarSign, AlertTriangle, CalendarOff, Award, Heart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { formatFixedBR, fmtBRL, formatPercentBR } from '@/lib/formatters';
import GlobalKpiCard from '@/components/ui/KpiCard';
import { axisProps, gridProps, tooltipProps, SERIES_COLORS } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';

import { useCan } from '@/permissions/hooks';
const COLORS = SERIES_COLORS;

function fmtCurrency(v: number) {
  return fmtBRL(v);
}

function fmtPercent(v: number) {
  return formatPercentBR(v);
}

const R = (v: number) => fmtBRL(v);

interface Colaborador {
  id: string;
  nome: string;
  setor: string;
  cargo: string;
  status: string;
  data_admissao: string;
  salario: number;
  valor_hora: number;
  tipo_contrato: string;
  carga_horaria_semanal: number;
}

interface Props {
  colaboradores: Colaborador[];
}

const SETOR_LABELS: Record<string, string> = {
  cozinha: 'Cozinha', sushi: 'Sushi', limpeza: 'Limpeza', salao: 'Salão', copa: 'Copa'
};

export default function DashboardRhSection({
 colaboradores }: Props) {
  const supabase = useSupabase();
  const canViewRbac = useCan('rh:dashboard:view');
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  interface BhRow { colaborador_id: string; horas_trabalhadas: number; horas_extras: number; atrasos_min: number; faltas: number; dias_trabalhados: number; banco_horas_saldo: number; }
  interface FolhaRow { colaborador_id: string; salario_liquido: number; total_proventos: number; total_descontos: number; }
  interface BenRow { colaborador_id: string; tipo: string; valor_empresa: number; }
  interface FerRow { colaborador_id: string; status: string; }

  const [bancoHoras, setBancoHoras] = useState<BhRow[]>([]);
  const [folhas, setFolhas] = useState<FolhaRow[]>([]);
  const [beneficios, setBeneficios] = useState<BenRow[]>([]);
  const [ferias, setFerias] = useState<FerRow[]>([]);
  const [pontos, setPontos] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const RH_PAGE = 50;
  const [bhPage, setBhPage] = useState(0);
  const [bhHasMore, setBhHasMore] = useState(true);
  const [folhaPage, setFolhaPage] = useState(0);
  const [folhaHasMore, setFolhaHasMore] = useState(true);

  const fetchData = useCallback(async (bhP = 0, folhaP = 0) => {
    setLoading(true);
    const [bhRes, folhaRes, benRes, ferRes, pontoRes] = await Promise.all([
      supabase.from('rh_banco_horas').select('id, colaborador_id, periodo, horas_trabalhadas, horas_escaladas, horas_extras, banco_horas_saldo, atrasos_min, faltas, dias_trabalhados').eq('periodo', periodo)
        .range(bhP * RH_PAGE, (bhP + 1) * RH_PAGE - 1),
      supabase.from('rh_folha_pagamento').select('id, colaborador_id, salario_liquido, total_proventos, total_descontos, status').eq('periodo', periodo)
        .range(folhaP * RH_PAGE, (folhaP + 1) * RH_PAGE - 1),
      supabase.from('rh_beneficios').select('id, colaborador_id, tipo, valor_empresa').eq('status', 'ATIVO')
        .range(0, RH_PAGE - 1),
      supabase.from('rh_ferias_afastamentos').select('id, colaborador_id, tipo, status, data_inicio').gte('data_inicio', `${periodo}-01`).lte('data_inicio', `${periodo}-31`)
        .range(0, RH_PAGE - 1),
      supabase.from('rh_ponto_registros').select('id, colaborador_id, data, tipo, hora').gte('data', `${periodo}-01`).lte('data', `${periodo}-31`)
        .range(0, RH_PAGE - 1),
    ]);
    const bhData = bhRes.data || [];
    const folhaData = folhaRes.data || [];
    setBhHasMore(bhData.length === RH_PAGE);
    setFolhaHasMore(folhaData.length === RH_PAGE);
    setBhPage(bhP);
    setFolhaPage(folhaP);
    if (bhP === 0) setBancoHoras(bhData); else setBancoHoras(prev => [...prev, ...bhData]);
    if (folhaP === 0) setFolhas(folhaData); else setFolhas(prev => [...prev, ...folhaData]);
    setBeneficios(benRes.data || []);
    setFerias(ferRes.data || []);
    setPontos(pontoRes.data || []);
    setLoading(false);
  }, [periodo, supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── KPIs ───
  const headcount = colaboradores.length;
  const totalFolha = folhas.reduce((s, f) => s + (f.salario_liquido || 0), 0);
  const totalProventos = folhas.reduce((s, f) => s + (f.total_proventos || 0), 0);
  const totalDescontos = folhas.reduce((s, f) => s + (f.total_descontos || 0), 0);
  const custoBeneficios = beneficios.reduce((s, b) => s + (b.valor_empresa || 0), 0);
  const custoTotal = totalProventos + custoBeneficios;
  const custoMedioColab = headcount > 0 ? custoTotal / headcount : 0;

  const totalHE = bancoHoras.reduce((s, b) => s + (b.horas_extras || 0), 0);
  const totalFaltas = bancoHoras.reduce((s, b) => s + (b.faltas || 0), 0);
  const totalAtrasos = bancoHoras.reduce((s, b) => s + (b.atrasos_min || 0), 0);
  const diasTrabalhadosTotal = bancoHoras.reduce((s, b) => s + (b.dias_trabalhados || 0), 0);

  // Absenteísmo: faltas / (headcount * 22 dias úteis médios) * 100
  const absenteismo = headcount > 0 ? (totalFaltas / (headcount * 22)) * 100 : 0;

  const feriasPendentes = ferias.filter(f => f.status === 'SOLICITADA' || f.status === 'APROVADA').length;

  // ─── Charts Data ───
  const headcountPorSetor = useMemo(() => {
    const map: Record<string, number> = {};
    colaboradores.forEach(c => { map[c.setor] = (map[c.setor] || 0) + 1; });
    return Object.entries(map).map(([setor, count]) => ({
      name: SETOR_LABELS[setor] || setor,
      value: count,
    }));
  }, [colaboradores]);

  const contratoPorTipo = useMemo(() => {
    const map: Record<string, number> = {};
    colaboradores.forEach(c => { map[c.tipo_contrato] = (map[c.tipo_contrato] || 0) + 1; });
    return Object.entries(map).map(([tipo, count]) => ({ name: tipo, value: count }));
  }, [colaboradores]);

  const heByColab = useMemo(() => {
    return bancoHoras
      .filter(b => b.horas_extras > 0)
      .sort((a, b) => b.horas_extras - a.horas_extras)
      .slice(0, 10)
      .map(b => ({
        nome: colaboradores.find(c => c.id === b.colaborador_id)?.nome?.split(' ')[0] || '?',
        horas: Number(formatFixedBR(b.horas_extras, 1).replace(',', '.')),
      }));
  }, [bancoHoras, colaboradores]);

  const custoPorSetor = useMemo(() => {
    const map: Record<string, number> = {};
    folhas.forEach(f => {
      const colab = colaboradores.find(c => c.id === f.colaborador_id);
      const setor = colab?.setor || 'outro';
      map[setor] = (map[setor] || 0) + (f.total_proventos || 0);
    });
    return Object.entries(map).map(([setor, custo]) => ({
      name: SETOR_LABELS[setor] || setor,
      custo: Math.round(custo),
    }));
  }, [folhas, colaboradores]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Período:</span>
        <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
          className="h-8 text-xs border rounded-md px-2 bg-background text-foreground" />
      </div>

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlobalKpiCard icon={Users} label="Headcount" value={String(headcount)} />
        <GlobalKpiCard icon={DollarSign} label="Custo Total/mês" value={fmtBRL(custoTotal)} variant="danger" />
        <GlobalKpiCard icon={DollarSign} label="Custo Médio/colab" value={fmtBRL(custoMedioColab)} />
        <GlobalKpiCard icon={Heart} label="Benefícios/mês" value={fmtBRL(custoBeneficios)} />
      </div>

      {/* KPI Cards Row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlobalKpiCard icon={Clock} label="Horas Extras" value={`${formatFixedBR(totalHE, 1)}h`} variant={totalHE > headcount * 10 ? 'danger' : 'default'} />
        <GlobalKpiCard icon={CalendarOff} label="Absenteísmo" value={formatPercentBR(absenteismo)} variant={absenteismo > 5 ? 'danger' : 'default'} />
        <GlobalKpiCard icon={AlertTriangle} label="Atrasos (min)" value={String(totalAtrasos)} variant={totalAtrasos > headcount * 30 ? 'danger' : 'default'} />
        <GlobalKpiCard icon={Award} label="Férias Pendentes" value={String(feriasPendentes)} />
      </div>

      {/* Charts */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Headcount por setor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Headcount por Setor</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            {headcountPorSetor.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={headcountPorSetor} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                    {headcountPorSetor.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipProps} content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>

        {/* Custo por setor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Custo Folha por Setor</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            {custoPorSetor.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={custoPorSetor}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmtBRL(Number(v))} />} />
                  <Bar dataKey="custo" name="Custo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>

        {/* Tipo de contrato */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tipo de Contrato</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            {contratoPorTipo.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={contratoPorTipo} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                    {contratoPorTipo.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipProps} content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>

        {/* Top 10 HE */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top 10 — Horas Extras</CardTitle>
          </CardHeader>
          <CardContent className="h-52">
            {heByColab.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={heByColab} layout="vertical">
                  <CartesianGrid {...gridProps} vertical horizontal={false} />
                  <XAxis type="number" {...axisProps} />
                  <YAxis dataKey="nome" type="category" width={60} {...axisProps} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => `${formatFixedBR(Number(v), 1)}h`} />} />
                  <Bar dataKey="horas" name="Horas Extras" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
      </div>

      {/* Resumo Folha */}
      {folhas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resumo Financeiro — {periodo}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Total Proventos</p>
                <p className="text-lg font-bold text-success">{R(totalProventos)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Descontos</p>
                <p className="text-lg font-bold text-destructive">{R(totalDescontos)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Líquido Total</p>
                <p className="text-lg font-bold text-primary">{R(totalFolha)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Benefícios</p>
                <p className="text-lg font-bold">{R(custoBeneficios)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// local KpiCard removed — using global KpiCard from @/components/ui/KpiCard

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
      Sem dados para este período
    </div>
  );
}
