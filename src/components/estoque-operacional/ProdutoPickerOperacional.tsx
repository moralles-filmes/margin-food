import { useEffect, useState } from 'react';
import { Loader2, PackageSearch, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatarQuantidade, type ProdutoOperacional } from '@/domain/estoque/operacional';

interface Props {
  setorId: string;
  setorNome: string;
  buscarProdutos: (setorId: string, termo: string) => Promise<{
    produtos: ProdutoOperacional[];
    erro: string | null;
    obsoleto: boolean;
  }>;
  onSelecionar: (produto: ProdutoOperacional) => void;
  /** Saída mostra o saldo com destaque; entrada não precisa dele para decidir. */
  destacarSaldo: boolean;
}

/**
 * Busca de produto dentro de um setor. O que aparece aqui vem de `op_list_produtos`,
 * que projeta só nome, SKU, unidade e saldo — nenhum campo de custo chega ao cliente.
 */
export default function ProdutoPickerOperacional({
  setorId, setorNome, buscarProdutos, onSelecionar, destacarSaldo,
}: Props) {
  const [termo, setTermo] = useState('');
  const termoDebounced = useDebouncedValue(termo, 250);
  const [produtos, setProdutos] = useState<ProdutoOperacional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    void buscarProdutos(setorId, termoDebounced).then(res => {
      if (cancelado || res.obsoleto) return;
      setProdutos(res.produtos);
      setErro(res.erro);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [buscarProdutos, setorId, termoDebounced]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={termo}
          onChange={e => setTermo(e.target.value)}
          placeholder="Pesquisar por nome ou código…"
          aria-label={`Pesquisar produto no setor ${setorNome}`}
          className="h-12 pl-11 text-base"
          autoComplete="off"
        />
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive-border bg-destructive-soft p-3">
          <p className="text-sm font-medium text-destructive">{erro}</p>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando produtos…
        </div>
      ) : produtos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <PackageSearch className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhum produto encontrado</p>
          <p className="text-xs text-muted-foreground">
            {termo
              ? `Nada em ${setorNome} corresponde a "${termo}".`
              : `Nenhum produto disponível em ${setorNome}.`}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {produtos.map(produto => {
            const semSaldo = destacarSaldo && produto.saldo <= 0;
            return (
              <li key={produto.produtoId}>
                <button
                  type="button"
                  onClick={() => onSelecionar(produto)}
                  disabled={semSaldo}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-background-subtle disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-foreground">{produto.nome}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {produto.sku ? `${produto.sku} · ` : ''}{produto.unidadeMedida}
                    </p>
                  </div>
                  {destacarSaldo && (
                    <Badge variant={semSaldo ? 'destructive' : 'secondary'} className="shrink-0 tabular-nums">
                      {semSaldo
                        ? 'Sem estoque'
                        : `Disponível: ${formatarQuantidade(produto.saldo)}`}
                    </Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
