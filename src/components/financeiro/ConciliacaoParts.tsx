import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/ui/StatusBadge';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ConciliacaoBadge } from './conciliacaoView';
import { extratoTipoBadge } from './conciliacaoView';

/**
 * Peças de apresentação da Conciliação Bancária (Redesign V2, Fase 04B). Só recebem props e
 * desenham: estado, efeitos, regras de conferência e handlers continuam em
 * `ConciliacaoBancariaSection`.
 */

const dataBR = (iso: string) => formatDateBR(parseLocalDate(iso));

/** Cabeçalho "Linha do extrato" repetido nos diálogos (descrição inteira, data, valor e tipo). */
export function ExtratoLinhaResumo({ descricao, data, valor, tipo, rotulo = 'Linha do extrato', badge, valorClassName }: {
  descricao: string;
  data: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA';
  rotulo?: string;
  /** Selo no lugar do tipo (ex.: "Saída"/"Entrada" na transferência). */
  badge?: ConciliacaoBadge;
  valorClassName?: string;
}) {
  const selo = badge ?? extratoTipoBadge(tipo, false);
  return (
    <div className="rounded-lg border bg-muted p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</p>
          <p className="break-words text-sm font-medium text-foreground">{descricao}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{dataBR(data)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className={cn('whitespace-nowrap text-lg font-bold tabular-nums text-foreground', valorClassName)}>{fmtBRL(valor)}</p>
          <StatusBadge status={selo.status} label={selo.label} />
        </div>
      </div>
    </div>
  );
}

/** Valor rotulado dentro dos painéis (extrato × sistema × diferença). */
function ValorRotulado({ rotulo, valor, className }: { rotulo: string; valor: ReactNode; className?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 rounded-lg border bg-card px-3 py-2 sm:block sm:py-3">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={cn('whitespace-nowrap text-base font-semibold tabular-nums text-foreground sm:mt-1', className)}>{valor}</dd>
    </div>
  );
}

export interface ConferenciaSaldo {
  sistema: number;
  projetado: number;
  pendentesDelta: number;
  diferenca: number;
}

/**
 * Banner de conferência de saldo — a rede final da conciliação. O veredito (`confere`) chega
 * pronto do pai, pela mesma regra de antes (|diferença| < 0,01); aqui só se desenha. O sistema é
 * lido na mesma data do saldo do extrato (`get_fin_saldo_conta_em` + linhas ainda pendentes).
 */
export function ConferenciaSaldoPainel({ saldoExtrato, conferencia, confere, diaDivergencia, atualizando }: {
  saldoExtrato: { valor: number; data: string };
  conferencia: ConferenciaSaldo;
  confere: boolean;
  diaDivergencia: { status: 'found' | 'before_period'; data: string } | null;
  atualizando: boolean;
}) {
  const comPendentes = Math.abs(conferencia.pendentesDelta) >= 0.01;
  // Resíduo de ponto flutuante (ex.: 0,0000001) não pode aparecer como "-R$0,00".
  const diferencaExibida = Math.abs(conferencia.diferenca) < 0.005 ? 0 : conferencia.diferenca;
  return (
    <section
      role={confere ? 'status' : 'alert'}
      aria-labelledby="conciliacao-conferencia-titulo"
      className={cn(
        'rounded-summary border p-4 sm:p-5',
        confere ? 'border-success-border bg-success-soft' : 'border-destructive-border bg-destructive-soft',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card', confere ? 'text-success' : 'text-destructive')}>
          {confere ? <CheckCircle2 aria-hidden="true" className="h-5 w-5" /> : <AlertTriangle aria-hidden="true" className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id="conciliacao-conferencia-titulo" className="text-sm font-semibold text-foreground">
              {/* Com linhas pendentes o "confere" é projeção — o aviso fica no próprio título, como antes. */}
              {confere
                ? <>Saldo confere com o extrato do banco{comPendentes && <>{' '}<span className="font-normal text-muted-foreground">(projetado com as linhas ainda pendentes)</span></>}</>
                : <>Saldo NÃO confere com o extrato do banco — diferença de <span className="whitespace-nowrap tabular-nums">{fmtBRL(conferencia.diferenca)}</span></>}
            </h3>
            <StatusBadge status={confere ? 'success' : 'danger'} label={confere ? 'Confere' : 'Não confere'} />
            {atualizando && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" /> Atualizando…
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Extrato e sistema comparados na mesma data.</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-2 sm:grid-cols-3">
        <ValorRotulado rotulo={`Banco em ${dataBR(saldoExtrato.data)}`} valor={fmtBRL(saldoExtrato.valor)} />
        <ValorRotulado
          rotulo={comPendentes ? 'Sistema na mesma data (com linhas pendentes)' : 'Sistema na mesma data'}
          valor={fmtBRL(conferencia.projetado)}
        />
        <ValorRotulado rotulo="Diferença" valor={fmtBRL(diferencaExibida)} className={confere ? undefined : 'text-destructive'} />
      </dl>

      {!confere && (
        <div className="mt-3 space-y-1 text-sm text-muted-foreground">
          {diaDivergencia && (
            <p>
              {diaDivergencia.status === 'found' ? (
                <>A diferença começou em{' '}
                  <span className="font-medium tabular-nums text-foreground">{dataBR(diaDivergencia.data)}</span>
                  {' '}— revise as linhas dessa data.</>
              ) : (
                <>A diferença já existia antes de{' '}
                  <span className="font-medium tabular-nums text-foreground">{dataBR(diaDivergencia.data)}</span>
                  {' '}(fora do período deste extrato).</>
              )}
            </p>
          )}
          <p className="text-xs">
            Pode haver linha marcada como duplicata/ignorada que na verdade é uma transação real,
            ou lançamento incorreto no período. Revise antes de confiar no saldo.
          </p>
        </div>
      )}
    </section>
  );
}

/** Conferência ainda sem resposta (primeira leitura do saldo do sistema). */
export function ConferenciaSaldoCarregando({ data }: { data: string }) {
  return (
    <section role="status" className="flex items-center gap-3 rounded-summary border bg-card p-4 text-sm text-muted-foreground shadow-card">
      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
      Conferindo o saldo do sistema com o extrato de {dataBR(data)}…
    </section>
  );
}

/** A leitura do saldo do sistema falhou: sem veredito, e a tela diz isso em vez de esconder o banner. */
export function ConferenciaSaldoErro({ data, onRetry, retrying }: { data: string; onRetry: () => void; retrying: boolean }) {
  return (
    <section role="alert" className="rounded-summary border border-warning-border bg-warning-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-warning">
          <AlertTriangle aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Não foi possível conferir o saldo com o extrato</h3>
          <p className="text-sm text-muted-foreground">
            O saldo do sistema em {dataBR(data)} não pôde ser lido. Sem a conferência, não há como saber se o saldo bate.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
          <RefreshCw aria-hidden="true" className={cn('mr-1.5 h-4 w-4', retrying && 'animate-spin')} />
          {retrying ? 'Tentando…' : 'Tentar novamente'}
        </Button>
      </div>
    </section>
  );
}

/** Aviso da visão Importar (extrato anterior ausente, ContaMax aguardando). */
export function AvisoConciliacao({ tom, icon: Icon, titulo, children, acao }: {
  tom: 'warning' | 'info';
  icon: typeof AlertTriangle;
  titulo: ReactNode;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <section className={cn(
      'rounded-summary border p-4 sm:p-5',
      tom === 'warning' ? 'border-warning-border bg-warning-soft' : 'border-info-border bg-info-soft',
    )}>
      <div className="flex flex-wrap items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card', tom === 'warning' ? 'text-warning' : 'text-info')}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
          {children && <div className="space-y-2 text-sm text-muted-foreground">{children}</div>}
        </div>
        {acao && <div className="w-full sm:w-auto">{acao}</div>}
      </div>
    </section>
  );
}
