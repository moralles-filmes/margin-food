import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeSearchText } from '@/lib/utils';
import { useCanAny } from '@/permissions/hooks';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface Setor { id: string; name: string }
interface ProdutoVinculado { id: string; produto_id: string; nome: string; sku: string }
interface ProdutoCandidato { id: string; nome_produto: string; sku: string | null }

interface Props {
  canEdit: boolean;
}

/**
 * ─── Produtos por Setor ───
 *
 * Define o catálogo que o submódulo Movimentação Operacional mostra em cada
 * setor. Tela administrativa: quem chega aqui já tem `estoque:cadastros:*`, e a
 * RLS de `estoque_setor_produtos` exige isso de novo no servidor.
 *
 * Setor sem nenhum produto vinculado devolve o catálogo ativo inteiro ao
 * operador — assim a operação não para enquanto o vínculo está sendo montado.
 */
export default function ProdutosPorSetorAdmin({ canEdit }: Props) {
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const toast = useScopedToast();
  // Guarda própria, além do gate da aba que monta este componente: um
  // componente exportado não pode depender de quem o renderiza para ser seguro.
  const canView = useCanAny('estoque:cadastros:view', 'estoque:cadastros:manage', 'stock:read');
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [setores, setSetores] = useState<Setor[]>([]);
  const [setorId, setSetorId] = useState('');
  const [vinculados, setVinculados] = useState<ProdutoVinculado[]>([]);
  const [carregando, setCarregando] = useState(false);

  const [busca, setBusca] = useState('');
  const buscaDebounced = useDebouncedValue(busca, 250);
  const [candidatos, setCandidatos] = useState<ProdutoCandidato[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('stock_sectors')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order', { nullsFirst: false })
      .order('name')
      .then(({ data }) => setSetores((data ?? []) as Setor[]));
  }, [supabase]);

  const carregarVinculados = useCallback(async (id: string) => {
    if (!id) { setVinculados([]); return; }
    setCarregando(true);
    const { data, error } = await supabase
      .from('estoque_setor_produtos')
      .select('id, produto_id, produtos ( nome_produto, sku )')
      .eq('setor_id', id);

    if (error) {
      console.error('[ProdutosPorSetorAdmin] carregar vínculos', error);
      toast.error('Não foi possível carregar os produtos do setor.');
      setVinculados([]);
    } else {
      const linhas = (data ?? []).map(row => {
        const produto = row.produtos as { nome_produto?: string; sku?: string | null } | null;
        return {
          id: row.id,
          produto_id: row.produto_id,
          nome: produto?.nome_produto ?? '(produto removido)',
          sku: produto?.sku ?? '',
        };
      });
      linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setVinculados(linhas);
    }
    setCarregando(false);
  }, [supabase, toast]);

  useEffect(() => { void carregarVinculados(setorId); }, [carregarVinculados, setorId]);

  const idsVinculados = useMemo(
    () => new Set(vinculados.map(v => v.produto_id)),
    [vinculados],
  );

  useEffect(() => {
    const termo = buscaDebounced.trim();
    if (!setorId || termo.length < 2) { setCandidatos([]); return; }

    let cancelado = false;
    setBuscando(true);
    const normalizado = normalizeSearchText(termo).replace(/[%_\\]/g, '\\$&');
    void supabase
      .from('produtos')
      .select('id, nome_produto, sku')
      .eq('ativo', true)
      // eslint-disable-next-line no-restricted-syntax -- coluna *_unaccent já normalizada
      .or(`nome_produto_unaccent.ilike.%${normalizado}%,sku_unaccent.ilike.%${normalizado}%`)
      .order('nome_produto')
      .limit(20)
      .then(({ data }) => {
        if (cancelado) return;
        setCandidatos((data ?? []) as ProdutoCandidato[]);
        setBuscando(false);
      });
    return () => { cancelado = true; };
  }, [buscaDebounced, setorId, supabase]);

  const vincular = async (produto: ProdutoCandidato) => {
    if (!companyId) { toast.error('Selecione uma unidade.'); return; }
    setSalvandoId(produto.id);
    const { error } = await supabase.from('estoque_setor_produtos').insert({
      company_id: companyId,
      setor_id: setorId,
      produto_id: produto.id,
    });
    setSalvandoId(null);

    if (error) {
      console.error('[ProdutosPorSetorAdmin] vincular', error);
      toast.error(
        error.code === '23505'
          ? 'Este produto já está vinculado ao setor.'
          : 'Não foi possível vincular o produto.',
      );
      return;
    }
    setBusca('');
    void carregarVinculados(setorId);
  };

  const desvincular = async (vinculo: ProdutoVinculado) => {
    const ok = await confirm({
      title: 'Remover produto do setor',
      description: `"${vinculo.nome}" deixa de aparecer na Movimentação Operacional deste setor. O produto e o estoque não são afetados.`,
      confirmLabel: 'Remover',
      variant: 'destructive',
    });
    if (!ok) return;

    setSalvandoId(vinculo.id);
    const { error } = await supabase.from('estoque_setor_produtos').delete().eq('id', vinculo.id);
    setSalvandoId(null);

    if (error) {
      console.error('[ProdutosPorSetorAdmin] desvincular', error);
      toast.error('Não foi possível remover o vínculo.');
      return;
    }
    void carregarVinculados(setorId);
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <ShieldAlert className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para ver os cadastros de estoque.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog />
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">Setor</Label>
        <Select value={setorId} onValueChange={setSetorId}>
          <SelectTrigger><SelectValue placeholder="Selecione um setor" /></SelectTrigger>
          <SelectContent>
            {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!setorId ? (
        <p className="rounded-lg border border-border bg-background-subtle p-4 text-sm text-muted-foreground">
          Escolha um setor para definir quais produtos ficam disponíveis nele na
          Movimentação Operacional.
        </p>
      ) : (
        <>
          {vinculados.length === 0 && !carregando && (
            <p className="rounded-lg border border-warning-border bg-warning-soft p-3 text-sm text-foreground">
              Este setor ainda não tem produtos vinculados, então a Movimentação
              Operacional mostra o catálogo ativo inteiro nele.
            </p>
          )}

          {canEdit && (
            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground">Adicionar produto</Label>
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Digite ao menos 2 letras do nome ou do código…"
                autoComplete="off"
              />
              {buscando && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                </p>
              )}
              {candidatos.length > 0 && (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                  {candidatos.map(produto => {
                    const jaVinculado = idsVinculados.has(produto.id);
                    return (
                      <li key={produto.id}>
                        <button
                          type="button"
                          onClick={() => vincular(produto)}
                          disabled={jaVinculado || salvandoId === produto.id}
                          className="flex w-full items-center justify-between gap-2 rounded-md p-2 text-left text-sm hover:bg-background-subtle disabled:opacity-50"
                        >
                          <span className="min-w-0 truncate">
                            {produto.nome_produto}
                            {produto.sku && <span className="ml-2 text-xs text-muted-foreground">{produto.sku}</span>}
                          </span>
                          {jaVinculado
                            ? <Badge variant="secondary" className="shrink-0 text-[10px]">Já vinculado</Badge>
                            : <Plus className="h-4 w-4 shrink-0 text-primary" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground">
              Vinculados ({vinculados.length})
            </Label>
            {carregando ? (
              <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {vinculados.map(v => (
                  <li key={v.id} className="flex items-center justify-between gap-2 p-2.5">
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {v.nome}
                      {v.sku && <span className="ml-2 text-xs text-muted-foreground">{v.sku}</span>}
                    </span>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive"
                        onClick={() => desvincular(v)}
                        disabled={salvandoId === v.id}
                        aria-label={`Remover ${v.nome} do setor`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
                {vinculados.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">Nenhum produto vinculado.</li>
                )}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
