import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, History } from 'lucide-react';
import { formatarQuantidade } from '@/domain/estoque/operacional';
import type { HistoricoOperacionalItem } from '@/hooks/useMovimentacaoOperacional';

interface Props {
  carregar: (limite?: number) => Promise<HistoricoOperacionalItem[]>;
  /** Muda a cada movimentação registrada, para a lista recarregar. */
  versao: number;
}

function horaCurta(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Últimas movimentações feitas pelo próprio módulo operacional.
 * Deliberadamente sem valores: `op_list_historico` nem devolve custo, então não
 * há o que esconder aqui — e a lista não vira um segundo painel administrativo.
 */
export default function HistoricoOperacional({ carregar, versao }: Props) {
  const [itens, setItens] = useState<HistoricoOperacionalItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    void carregar(10).then(lista => {
      if (cancelado) return;
      setItens(lista);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [carregar, versao]);

  if (carregando && itens.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-xl space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <History className="h-4 w-4" />
        Últimas movimentações
      </h3>

      {itens.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Nenhuma movimentação operacional registrada ainda.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {itens.map(item => {
            const isSaida = item.tipo === 'SAIDA';
            return (
              <li key={item.id} className="flex items-center gap-3 p-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isSaida ? 'bg-destructive-soft' : 'bg-success-soft'}`}>
                  {isSaida
                    ? <ArrowUp className="h-4 w-4 text-destructive" />
                    : <ArrowDown className="h-4 w-4 text-success" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.produtoNome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {horaCurta(item.criadoEm)}
                    {item.setor && ` · ${item.setor}`}
                    {item.responsavel && ` · ${item.responsavel}`}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${isSaida ? 'text-destructive' : 'text-success'}`}>
                  {isSaida ? '−' : '+'}{formatarQuantidade(item.quantidade)} {item.unidadeMedida}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
