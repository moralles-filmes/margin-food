import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, BarChart3, Download, Moon, Package, Plus, Sun, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import KpiCard, { type KpiAppearance, type KpiVariant } from '@/components/ui/KpiCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { ChartLegend } from '@/components/ui/ChartLegend';
import AccessDenied from '@/components/ui/AccessDenied';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Button } from '@/components/ui/button';
import {
  PROJECTED_DASH_ARRAY, SEMANTIC_CHART_COLORS, axisProps, barProps, chartMargin, chartValueFormatters,
  getSeriesColor, gridProps, horizontalBarProps, legendProps, tooltipProps,
} from '@/lib/chartTheme';
import { formatMoneyBR } from '@/lib/formatters';

/**
 * Catálogo de primitivas do Redesign V2 — só existe em desenvolvimento (rota registrada em
 * `App.tsx` apenas com `import.meta.env.DEV`). Todos os dados são sintéticos; nada aqui consulta
 * o banco nem representa uma empresa.
 */

const VARIANTS: KpiVariant[] = ['default', 'primary', 'success', 'warning', 'danger', 'gold'];
const APPEARANCES: KpiAppearance[] = ['default', 'summary', 'highlight'];
const MONTHS = ['Mês 1', 'Mês 2', 'Mês 3', 'Mês 4', 'Mês 5', 'Mês 6'];
const SERIES = Array.from({ length: 12 }, (_, i) => `Série sintética ${i + 1}`);

const manySeriesData = MONTHS.map((mes, m) => ({
  mes,
  ...Object.fromEntries(SERIES.map((s, i) => [s, 1000 + ((m * 37 + i * 91) % 17) * 420])),
}));
const lineData = MONTHS.map((mes, m) => ({
  mes,
  realizado: m < 4 ? [12000, -4500, 0, 18250.5][m] : null,
  projetado: [11000, 2000, 6000, 15000, 17000, 21000][m],
}));
const rankingData = [
  { nome: 'Categoria sintética com nome bastante extenso', valor: 123456789.12 },
  { nome: 'Categoria B', valor: 45000 },
  { nome: 'Categoria C', valor: 1200.5 },
  { nome: 'Categoria D', valor: 0 },
];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2>{title}</h2>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DesignCatalog() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [segment, setSegment] = useState('mes');
  const [clicks, setClicks] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const toggleTheme = () => {
    // Só alterna a classe para inspeção visual — não grava a preferência do usuário.
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
  };
  const fakeRetry = () => {
    setRetrying(true);
    window.setTimeout(() => setRetrying(false), 1200);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1400px] space-y-10">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-ink">Redesign V2 · Fase 01</p>
            <h1>Catálogo de desenvolvimento</h1>
            <p className="text-sm text-muted-foreground">Dados fictícios. Esta página não existe no build de produção.</p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleTheme}>
            {dark ? <Sun className="mr-1.5 h-4 w-4" /> : <Moon className="mr-1.5 h-4 w-4" />}
            {dark ? 'Tema claro' : 'Tema escuro'}
          </Button>
        </header>

        <Section title="Grupo de resumo" note="Um destaque azul por grupo; os demais em summary. Cliques no primeiro card: contador abaixo.">
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4" data-testid="grupo-resumo">
            <KpiCard
              appearance="highlight"
              label="Indicador principal"
              value={formatMoneyBR(87519.2)}
              sub="Texto de apoio do indicador"
              icon={Wallet}
              onClick={() => setClicks(c => c + 1)}
              ariaLabel="Indicador principal — abrir detalhe"
            />
            <KpiCard appearance="summary" variant="success" label="Indicador positivo" value={formatMoneyBR(32229.21)} icon={TrendingUp}
              delta={{ label: 'vs. período anterior', formatted: '+12,4%', direction: 'up', tone: 'positive' }} />
            <KpiCard appearance="summary" variant="warning" label="Indicador de atenção" value={formatMoneyBR(0)} sub="Zero real, não é erro" icon={AlertTriangle} />
            <KpiCard appearance="summary" variant="danger" valueTone="negative" label="Resultado negativo" value={formatMoneyBR(-35812.74)} icon={BarChart3}
              delta={{ label: 'vs. período anterior', formatted: '-59,9%', direction: 'down', tone: 'negative' }} />
          </div>
          <p className="text-sm text-muted-foreground" data-testid="contador-cliques">Cliques no destaque: {clicks}</p>
        </Section>

        <Section title="Casos-limite" note="Valor longo, negativo no destaque, rótulo extenso, várias linhas de apoio.">
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4" data-testid="casos-limite">
            <KpiCard appearance="highlight" label="Valor muito grande" value={formatMoneyBR(123456789.12)} sub="Sem reticências e sem cortar centavos" icon={Wallet} />
            <KpiCard appearance="highlight" label="Saldo negativo em destaque" value={formatMoneyBR(-1108.08)} sub="O sinal identifica o negativo" icon={TrendingDown}
              delta={{ label: 'vs. período anterior', formatted: '-8,2%', direction: 'down', tone: 'negative' }} />
            <KpiCard appearance="summary" label="Rótulo propositalmente longo para conferir a quebra de linha ao lado do ícone" value={formatMoneyBR(123456789.12)} icon={Package}
              sub="Linha de apoio longa, que precisa quebrar em duas ou três linhas sem empurrar o valor para fora do card." />
            <KpiCard appearance="summary" label="Sem ícone e sem apoio" value="—" />
          </div>
        </Section>

        {APPEARANCES.map(appearance => (
          <Section key={appearance} title={`Variants em appearance="${appearance}"`}
            note={appearance === 'default' ? 'Aparência atual de todos os consumidores — não muda.' : appearance === 'highlight' ? 'A variant não altera o card azul.' : undefined}>
            {/* Família V2 (valor em 24px): uma coluna abaixo de 480px — duas colunas a 320px estouram o card. */}
            <div
              className={appearance === 'default'
                ? 'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6'
                : 'grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6'}
              data-testid={`variants-${appearance}`}
            >
              {VARIANTS.map(variant => (
                <KpiCard key={variant} appearance={appearance} variant={variant} label={variant} value={formatMoneyBR(1234.56)} sub="Apoio" icon={Package}
                  delta={{ label: 'vs. anterior', formatted: '+1,0%', direction: 'up', tone: 'positive' }} />
              ))}
            </div>
          </Section>
        ))}

        <Section title="Gráficos" note="Moldura, legenda e tooltip. Séries projetadas tracejadas; negativos e nulos preservados.">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Doze séries" subtitle="Seis meses · R$" height="h-[320px]"
              footer="Legenda rolável e tooltip limitado a 8 linhas (maxItems)."
              actions={<SegmentedControl value={segment} onChange={setSegment} options={[{ value: 'dia', label: 'Dia' }, { value: 'mes', label: 'Mês' }, { value: 'periodo', label: 'Período' }]} />}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={manySeriesData} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="mes" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} width={64} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip maxItems={8} valueFormatter={v => formatMoneyBR(Number(v))} />} />
                  <Legend {...legendProps} content={<ChartLegend scrollable />} />
                  {SERIES.map((s, i) => <Bar key={s} dataKey={s} stackId="a" fill={getSeriesColor(i)} legendType="square" />)}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Realizado e projetado" subtitle="Com negativo, zero e meses sem realizado" height="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="mes" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} width={64} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip dashedKeys={['projetado']} valueFormatter={v => formatMoneyBR(Number(v))} />} />
                  <Legend {...legendProps} content={<ChartLegend dashedKeys={['projetado']} justify="end" />} />
                  <Line dataKey="realizado" name="Realizado" stroke={getSeriesColor(0)} strokeWidth={2} connectNulls={false} />
                  <Line dataKey="projetado" name="Projetado" stroke={SEMANTIC_CHART_COLORS.projected} strokeWidth={2} strokeDasharray={PROJECTED_DASH_ARRAY} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Ranking com nome longo" subtitle="Barras horizontais · R$" height="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingData} layout="vertical" margin={chartMargin}>
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                  <YAxis type="category" dataKey="nome" {...axisProps} width={150} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => formatMoneyBR(Number(v))} />} />
                  <Bar dataKey="valor" name="Valor" fill={getSeriesColor(0)} {...horizontalBarProps} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Um único ponto" subtitle="Barra com base em zero" height="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ mes: 'Mês 1', valor: 4200 }]} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="mes" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} width={64} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => formatMoneyBR(Number(v))} />} />
                  <Bar dataKey="valor" name="Valor" fill={getSeriesColor(0)} {...barProps} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Carregando" subtitle="Skeleton na altura do gráfico" height="h-[200px]" loading><span /></ChartCard>
            <ChartCard title="Vazio" subtitle="Sem dados não é zero" height="h-[200px]" isEmpty emptyDescription="Ajuste o período para ver os dados."><span /></ChartCard>
            <ChartCard title="Erro" subtitle="Falha de carregamento com nova tentativa" height="h-[200px]" error
              errorDescription="Verifique a conexão e tente de novo." onRetry={fakeRetry} retrying={retrying}><span /></ChartCard>
          </div>
        </Section>

        <Section title="Estados">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <AccessDenied />
            <ErrorState description="Verifique a conexão e tente de novo." onRetry={fakeRetry} retrying={retrying} />
            <EmptyState title="Nenhum registro encontrado" description="Estado vazio já existente no sistema." />
            <AccessDenied compact />
            <ErrorState compact onRetry={fakeRetry} retrying={retrying} />
            <EmptyState compact title="Nenhum registro encontrado" />
          </div>
        </Section>

        <Section title="Controles existentes" note="Sem alteração nesta fase — aqui só para conferir a harmonia com os cards novos.">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="success" label="Confirmado" size="md" />
            <StatusBadge status="warning" label="Pendente" size="md" />
            <StatusBadge status="danger" label="Vencido" size="md" />
            <StatusBadge status="info" label="Em andamento" size="md" />
            <StatusBadge status="neutral" label="Sem informação" size="md" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button><Plus className="mr-1.5 h-4 w-4" />Ação principal</Button>
            <Button variant="outline"><Download className="mr-1.5 h-4 w-4" />Exportar</Button>
            <Button variant="secondary">Secundária</Button>
            <Button variant="ghost">Discreta</Button>
            <Button variant="destructive">Excluir</Button>
            <Button disabled>Desabilitado</Button>
          </div>
        </Section>
      </div>
    </main>
  );
}
