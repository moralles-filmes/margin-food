import { useState, useMemo } from 'react';
import {
  FileText, Plus, Search, Send, ClipboardCheck, TrendingDown,
  CheckCircle2, Inbox, ShieldAlert, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useCan } from '@/permissions/hooks';
import { useCotacoesStore } from '@/hooks/useCotacoesStore';
import { includesNormalized } from '@/lib/utils';
import { formatMoneyBR } from '@/lib/formatters';
import type { Cotacao, CotacaoStatus } from '@/types/cotacao';

const STATUS_META: Record<CotacaoStatus, { label: string; className: string }> = {
  RASCUNHO:    { label: 'Rascunho',     className: 'bg-secondary text-muted-foreground' },
  EM_COTACAO:  { label: 'Em cotação',   className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  RESPONDIDA:  { label: 'Respondida',   className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  EM_ANALISE:  { label: 'Em análise',   className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  NEGOCIANDO:  { label: 'Negociando',   className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  ENCERRADA:   { label: 'Encerrada',    className: 'bg-secondary text-muted-foreground' },
  CONVERTIDA:  { label: 'Convertida',   className: 'bg-success/15 text-success' },
  CANCELADA:   { label: 'Cancelada',    className: 'bg-destructive/15 text-destructive' },
};

/** yyyy-MM-dd → dd/MM/yyyy (sem shift de fuso — só rearranja a string). */
function fmtDateBR(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

function SummaryCard({ icon: Icon, label, value, tint }: {
  icon: typeof FileText; label: string; value: string; tint: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</p>
        <p className="text-base font-bold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
}

interface CotacaoViewProps {
  /** Store compartilhado (instanciado uma vez no ComprasView p/ evitar 2 canais Realtime). */
  store: ReturnType<typeof useCotacoesStore>;
}

export default function CotacaoView({ store }: CotacaoViewProps) {
  const canView = useCan('compras:cotacao:view');
  const canCreate = useCan('compras:cotacao:create');
  const { cotacoes, loading, counts } = store;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return cotacoes;
    return cotacoes.filter(c =>
      includesNormalized(c.titulo, query) || includesNormalized(c.codigo, query));
  }, [cotacoes, query]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="w-12 h-12 text-muted-foreground/40 mb-3" />
        <h3 className="text-lg font-semibold text-foreground">Acesso Negado</h3>
        <p className="text-sm text-muted-foreground mt-1">Sem permissão (compras:cotacao:view)</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Cotação</h2>
          <p className="text-xs text-muted-foreground">Compare preços, otimize por pedido mínimo e feche melhor</p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            className="gradient-salmon text-primary-foreground border-0 gap-1.5"
            onClick={() => toast.info('Criação de cotação chega na próxima fase (CRUD).')}
          >
            <Plus className="w-4 h-4" /> Nova Cotação
          </Button>
        )}
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <SummaryCard icon={FileText}      label="Em aberto"      value={String(counts.emAberto)}          tint="bg-primary/15 text-primary" />
        <SummaryCard icon={Send}          label="Aguardando"     value={String(counts.aguardandoResposta)} tint="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
        <SummaryCard icon={ClipboardCheck} label="Em análise"    value={String(counts.emAnalise)}          tint="bg-blue-500/15 text-blue-600 dark:text-blue-400" />
        <SummaryCard icon={CheckCircle2}  label="Convertidas"    value={String(counts.convertidas)}        tint="bg-success/15 text-success" />
        <SummaryCard icon={TrendingDown}  label="Economia (mês)" value={formatMoneyBR(counts.economiaMes)} tint="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por título ou código..."
          className="pl-9 bg-secondary border-border text-foreground"
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Inbox className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">
            {cotacoes.length === 0 ? 'Nenhuma cotação ainda' : 'Nenhuma cotação encontrada'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {cotacoes.length === 0
              ? 'Crie sua primeira cotação para comparar preços de fornecedores.'
              : 'Ajuste a busca para ver outras cotações.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c: Cotacao, i) => {
            const st = STATUS_META[c.status];
            return (
              <button
                key={c.id}
                onClick={() => toast.info('Detalhe da cotação chega na próxima fase.')}
                className="w-full text-left bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{c.titulo}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">{c.codigo}</span>
                        {c.data_validade && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> val. {fmtDateBR(c.data_validade)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${st.className}`}>{st.label}</span>
                    {c.total_estimado > 0 && (
                      <span className="text-[11px] font-semibold text-foreground">{formatMoneyBR(c.total_estimado)}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
