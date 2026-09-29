import { Check, CheckCircle2, ClipboardList, ListPlus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatarQuantidade, type MovimentacaoOperacionalRegistrada } from '@/domain/estoque/operacional';
import type { ItemSaidaLote } from '@/domain/estoque/operacionalLote';

const rotuloItens = (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`;

/**
 * Faixa da lista em andamento, no topo do leitor e da busca manual: o operador
 * vê que a saída ainda não foi registrada e o último item que entrou nela.
 */
export function ResumoLote({ itens, onRevisar }: { itens: ItemSaidaLote[]; onRevisar: () => void }) {
  const ultimo = itens[itens.length - 1];
  return (
    <section
      aria-label="Itens desta saída"
      className="flex items-center gap-3 rounded-xl border border-primary-border bg-primary-soft p-3"
    >
      <ClipboardList className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {rotuloItens(itens.length)} nesta saída
        </p>
        {ultimo && (
          <p className="truncate text-xs text-muted-foreground">
            Último: {ultimo.produto.nome} · −{formatarQuantidade(ultimo.quantidade)} {ultimo.produto.unidadeMedida}
          </p>
        )}
      </div>
      <Button
        type="button"
        onClick={onRevisar}
        // Não tira o foco do campo do leitor: o refoco do blur reabriria o teclado.
        onMouseDown={e => e.preventDefault()}
        className="h-11 shrink-0 rounded-xl bg-primary-strong px-4 text-sm font-semibold text-primary-foreground"
      >
        Revisar
      </Button>
    </section>
  );
}

interface RevisaoProps {
  itens: ItemSaidaLote[];
  /** Erro por id de item (validação do servidor). */
  erros: Record<string, string>;
  observacao: string;
  onObservacaoChange: (texto: string) => void;
  salvando: boolean;
  onConfirmar: () => void;
  onEditar: (item: ItemSaidaLote) => void;
  onRemover: (item: ItemSaidaLote) => void;
  onAdicionarMais: () => void;
  onDescartar: () => void;
}

/** Conferência da lista antes de gravar. A saída é registrada inteira ou nada. */
export function RevisaoLote({
  itens, erros, observacao, onObservacaoChange, salvando,
  onConfirmar, onEditar, onRemover, onAdicionarMais, onDescartar,
}: RevisaoProps) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-base font-semibold text-foreground">Confira os itens da saída</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A saída é registrada inteira: se um item for recusado, nenhum é registrado.
        </p>
      </div>

      <ul className="space-y-2">
        {itens.map(item => {
          const erro = erros[item.id];
          return (
            <li
              key={item.id}
              className={`rounded-xl border bg-card p-3 ${erro ? 'border-destructive-border' : 'border-border'}`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{item.produto.nome}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Setor: {item.setor.nome} · Disponível: {formatarQuantidade(item.produto.saldo)} {item.produto.unidadeMedida}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-bold tabular-nums text-destructive">
                  −{formatarQuantidade(item.quantidade)}
                  <span className="ml-1 text-xs font-medium text-muted-foreground">{item.produto.unidadeMedida}</span>
                </p>
              </div>

              {erro && <p className="mt-2 text-sm font-medium text-destructive">{erro}</p>}

              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1 rounded-lg"
                  onClick={() => onEditar(item)}
                  disabled={salvando}
                  aria-label={`Alterar quantidade de ${item.produto.nome}`}
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> Alterar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1 rounded-lg text-destructive hover:text-destructive"
                  onClick={() => onRemover(item)}
                  disabled={salvando}
                  aria-label={`Remover ${item.produto.nome}`}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Remover
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-2">
        <Label htmlFor="op-observacao-lote" className="text-sm font-medium text-foreground">
          Observação <span className="font-normal text-muted-foreground">(opcional, vale para todos os itens)</span>
        </Label>
        <Input
          id="op-observacao-lote"
          value={observacao}
          onChange={e => onObservacaoChange(e.target.value)}
          maxLength={500}
          disabled={salvando}
          className="h-11"
        />
      </div>

      <Button
        type="button"
        onClick={onConfirmar}
        disabled={salvando}
        className="h-14 w-full rounded-xl bg-primary-strong text-base font-semibold text-primary-foreground"
      >
        {salvando ? (
          <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Registrando…</>
        ) : (
          <><Check className="mr-2 h-5 w-5" /> Confirmar saída de {rotuloItens(itens.length)}</>
        )}
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={onAdicionarMais}
        disabled={salvando}
        className="h-12 w-full rounded-xl text-base"
      >
        <ListPlus className="mr-2 h-5 w-5" />
        Adicionar mais itens
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={salvando}
            className="h-11 w-full text-sm text-destructive hover:text-destructive"
          >
            Descartar lista
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar a lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {rotuloItens(itens.length)} saem da lista e nada é registrado no estoque.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter lista</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDescartar}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Resultado de uma saída com vários itens: o que saiu e o saldo de cada um. */
export function SucessoLote({ resultados }: { resultados: MovimentacaoOperacionalRegistrada[] }) {
  const reenvios = resultados.filter(r => r.idempotente).length;
  return (
    <div className="rounded-xl border border-destructive-border bg-destructive-soft p-5">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-destructive" />
        <p className="mt-2 text-sm font-bold uppercase tracking-wide text-destructive">
          Saída realizada
        </p>
        <p className="mt-1 text-base font-semibold text-foreground">{rotuloItens(resultados.length)}</p>
      </div>

      <ul className="mt-4 divide-y divide-destructive-border">
        {resultados.map((r, i) => (
          <li key={r.id || i} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{r.produtoNome}</p>
              <p className="text-xs text-muted-foreground">
                Setor: {r.setor} · Saldo agora: {formatarQuantidade(r.saldoNovo)} {r.unidadeMedida}
              </p>
            </div>
            <p className="shrink-0 text-base font-bold tabular-nums text-destructive">
              −{formatarQuantidade(r.quantidade)}
            </p>
          </li>
        ))}
      </ul>

      {reenvios > 0 && (
        <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
          {reenvios === resultados.length ? 'Esta saída' : 'Parte desta saída'} já havia sido
          registrada — nada foi duplicado.
        </p>
      )}
    </div>
  );
}
