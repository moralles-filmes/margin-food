import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableActions from '@/components/ui/TableActions';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import CategoryCombobox from '@/components/financeiro/CategoryCombobox';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import { filterEligibleMarcaCategoryOptions } from '@/domain/financeiro/marcaCategoriaOptions';
import { FORMA_VENDA_LABEL, FORMA_VENDA_OPTIONS, type FormaVenda } from '@/domain/financeiro/fechamentoMarcas';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Plus, Store } from 'lucide-react';
import { useScopedToast } from '@/hooks/useScopedToast';
import { FinSectionGroup } from './finV2Layout';
import { ListaCarregando } from './ContasParts';
import { useConteinerEstreito } from './useConteinerEstreito';
import { useRetornoFoco } from './useRetornoFoco';
import { MARCAS_LISTA_LIMITE_PX } from './fechamentoView';

export interface FechamentoMarca {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  categoria_id: string | null;
  forma_venda: FormaVenda | null;
}

interface CategoriaRow {
  id: string;
  nome: string;
  tipo: string | null;
  codigo: string | null;
  parent_id: string | null;
  ativo: boolean;
  excluir_dos_totais: boolean;
}

interface FechamentoMarcasTabProps {
  items: FechamentoMarca[];
  loading: boolean;
  canCreate: boolean;
  canEdit: boolean;
  /** A leitura das marcas falhou (o toast já saiu no pai): a lista não é "vazia", é indisponível. */
  erro?: boolean;
  onRetry?: () => void;
}

const MARCA_ERROR_MESSAGES: Record<string, string> = {
  financeiro_fechamento_marcas_nome_unique: 'Já existe uma marca com esse nome',
  CATEGORIA_MARCA_OBRIGATORIA: 'Selecione a categoria vinculada à marca',
  CATEGORIA_MARCA_INVALIDA: 'A categoria precisa ser de receita, ativa e operacional',
  FORMA_VENDA_OBRIGATORIA: 'Selecione a forma de venda da marca (pedidos ou pessoas)',
  CATEGORIA_MARCA_NAO_FOLHA: 'Só é possível vincular a uma categoria/sub-categoria sem itens abaixo dela',
};

function mapMarcaError(message: string): string {
  const match = Object.keys(MARCA_ERROR_MESSAGES).find(key => message.includes(key));
  return match ? MARCA_ERROR_MESSAGES[match] : 'Erro ao salvar marca';
}

/** Aviso de pendência das marcas (token de atenção, sem opacidade). */
function AvisoMarcas({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-summary border border-warning-border bg-warning-soft p-4 text-sm text-foreground">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0">
        <p className="font-medium">{titulo}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

export default function FechamentoMarcasTab({
  items,
  loading,
  canCreate,
  canEdit,
  erro = false,
  onRetry,
}: FechamentoMarcasTabProps) {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId, loading: companyLoading, error: companyError } = useCompanyId();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<FechamentoMarca | null>(null);
  const [nome, setNome] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [formaVenda, setFormaVenda] = useState<FormaVenda | ''>('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<CategoriaRow[]>([]);
  // Só apresentação: sem as categorias, o nome vinculado e as opções do formulário ficam indisponíveis.
  const [categoriasErro, setCategoriasErro] = useState(false);
  const [listaRef, listaEstreita] = useConteinerEstreito(MARCAS_LISTA_LIMITE_PX);
  const retornoForm = useRetornoFoco();

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    supabase
      .from('fin_categorias')
      .select('id, nome, tipo, codigo, parent_id, ativo, excluir_dos_totais')
      .eq('company_id', companyId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[FechamentoMarcasTab.loadCategorias]', error);
          setCategoriasErro(true);
          return;
        }
        setCategoriasErro(false);
        setCategorias((data as CategoriaRow[]) || []);
      });
    return () => { cancelled = true; };
  }, [companyId, supabase]);

  const categoryOptions = useMemo(
    () => buildCategoryOptions(filterEligibleMarcaCategoryOptions(categorias)),
    [categorias],
  );

  const categoriaNomeById = useMemo(() => {
    const map = new Map<string, string>();
    categorias.forEach(c => map.set(c.id, c.nome));
    return map;
  }, [categorias]);

  const marcasPendentes = useMemo(() => items.filter(item => !item.categoria_id), [items]);
  const marcasSemForma = useMemo(() => items.filter(item => item.ativo && !item.forma_venda), [items]);

  const openNew = () => {
    setEditItem(null);
    setNome('');
    setCategoriaId('');
    setFormaVenda('');
    setShowForm(true);
  };

  const openEdit = (item: FechamentoMarca) => {
    setEditItem(item);
    setNome(item.nome);
    setCategoriaId(item.categoria_id || '');
    setFormaVenda(item.forma_venda || '');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditItem(null);
    setNome('');
    setCategoriaId('');
    setFormaVenda('');
  };

  const save = async () => {
    if (saving) return;
    const normalizedName = nome.trim();
    if (!normalizedName) {
      toast.error('Informe o nome da marca');
      return;
    }
    if (!categoriaId) {
      toast.error('Selecione a categoria vinculada à marca');
      return;
    }
    if (!formaVenda) {
      toast.error('Selecione a forma de venda da marca (pedidos ou pessoas)');
      return;
    }
    if (!companyId) {
      toast.error(companyError || 'Não foi possível identificar a empresa');
      return;
    }

    setSaving(true);
    try {
      if (editItem) {
        const { error } = await supabase
          .from('financeiro_fechamento_marcas')
          .update({ nome: normalizedName, categoria_id: categoriaId, forma_venda: formaVenda })
          .eq('id', editItem.id);
        if (error) throw error;
        toast.success('Marca atualizada');
      } else {
        const nextOrder = items.reduce((max, item) => Math.max(max, item.ordem), 0) + 1;
        const { error } = await supabase
          .from('financeiro_fechamento_marcas')
          .insert({
            company_id: companyId,
            nome: normalizedName,
            categoria_id: categoriaId,
            forma_venda: formaVenda,
            ordem: nextOrder,
          });
        if (error) throw error;
        toast.success('Marca cadastrada');
      }

      closeForm();
      emitDataEvent('financeiro:fechamento-marcas');
    } catch (error: unknown) {
      console.error('[FechamentoMarcasTab.save]', error);
      const message = typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : '';
      toast.error(mapMarcaError(message));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: FechamentoMarca, ativo: boolean) => {
    setTogglingId(item.id);
    try {
      const { error } = await supabase
        .from('financeiro_fechamento_marcas')
        .update({ ativo })
        .eq('id', item.id);
      if (error) throw error;
      toast.success(ativo ? 'Marca ativada' : 'Marca desativada');
      emitDataEvent('financeiro:fechamento-marcas');
    } catch (error: unknown) {
      console.error('[FechamentoMarcasTab.toggleActive]', error);
      toast.error('Erro ao alterar o status da marca');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Apresentação ──

  const ativas = items.filter(item => item.ativo).length;
  const legenda = items.length === 0
    ? undefined
    : `${items.length === 1 ? '1 marca' : `${items.length} marcas`} · ${ativas === 1 ? '1 ativa' : `${ativas} ativas`}`;

  const formaVendaCelula = (item: FechamentoMarca) => item.forma_venda
    ? <span className="text-sm text-foreground">{FORMA_VENDA_LABEL[item.forma_venda]}</span>
    : <StatusBadge status="warning" label="Não definida" />;

  const categoriaCelula = (item: FechamentoMarca) => {
    if (!item.categoria_id) return <StatusBadge status="warning" label="Sem categoria" />;
    if (categoriasErro) return <span className="text-sm text-muted-foreground">Indisponível</span>;
    return <span className="break-words text-sm text-foreground">{categoriaNomeById.get(item.categoria_id) || '—'}</span>;
  };

  const statusCelula = (item: FechamentoMarca) => (
    <StatusBadge status={item.ativo ? 'success' : 'neutral'} label={item.ativo ? 'Ativa' : 'Inativa'} />
  );

  // O Switch grava no clique (UPDATE direto), como antes; só ganhou dica visível.
  const acoes = (item: FechamentoMarca) => (
    <div className="flex items-center justify-end gap-2">
      <Switch
        checked={item.ativo}
        disabled={togglingId === item.id}
        onCheckedChange={ativo => toggleActive(item, ativo)}
        aria-label={`${item.ativo ? 'Desativar' : 'Ativar'} ${item.nome}`}
        title={`${item.ativo ? 'Desativar' : 'Ativar'} ${item.nome}`}
      />
      <TableActions
        onEdit={() => openEdit(item)}
        canEditOverride={canEdit}
        editLabel={`Editar ${item.nome}`}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold text-foreground">Marcas e dark kitchens</h3>
          <p className="text-sm text-muted-foreground">
            Cadastre Salão, deliveries e todas as marcas que precisam aparecer no fechamento diário.
          </p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={openNew} disabled={companyLoading || !companyId}>
            <Plus aria-hidden="true" className="mr-1 h-4 w-4" /> Nova marca
          </Button>
        )}
      </div>

      {companyError && (
        <div role="alert" className="rounded-summary border border-destructive-border bg-destructive-soft p-4 text-sm text-foreground">
          {companyError}
        </div>
      )}

      {!loading && marcasPendentes.length > 0 && (
        <AvisoMarcas
          titulo={marcasPendentes.length === 1
            ? '1 marca sem categoria vinculada'
            : `${marcasPendentes.length} marcas sem categoria vinculada`}
        >
          Sem a categoria, o faturamento líquido dessa loja não pode ser calculado na Apresentação Sócios:{' '}
          {marcasPendentes.map(m => m.nome).join(', ')}.
        </AvisoMarcas>
      )}

      {!loading && marcasSemForma.length > 0 && (
        <AvisoMarcas
          titulo={marcasSemForma.length === 1
            ? '1 marca sem forma de venda'
            : `${marcasSemForma.length} marcas sem forma de venda`}
        >
          Edite a marca e escolha Pedidos ou Pessoas para o fechamento diário pedir a quantidade:{' '}
          {marcasSemForma.map(m => m.nome).join(', ')}.
        </AvisoMarcas>
      )}

      {categoriasErro && !erro && (
        <ErrorState
          compact
          title="Não foi possível carregar as categorias"
          description="Os nomes das categorias vinculadas e as opções do formulário ficam indisponíveis. Atualize a tela para tentar de novo."
        />
      )}

      <FinSectionGroup id="fech-marcas" title="Marcas" caption={loading || erro ? undefined : legenda}>
        {erro && items.length > 0 && (
          <ErrorState
            compact
            title="Não foi possível atualizar as marcas"
            description="A lista abaixo é da última carga."
            onRetry={onRetry}
          />
        )}
        <div ref={listaRef}>
          {loading && items.length === 0 ? (
            <ListaCarregando estreito={listaEstreita} texto="Carregando marcas…" />
          ) : erro && items.length === 0 ? (
            <ErrorState title="Não foi possível carregar as marcas" onRetry={onRetry} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Store}
              title="Nenhuma marca cadastrada"
              description={canCreate ? 'Use Nova marca para cadastrar Salão, deliveries e dark kitchens.' : undefined}
            />
          ) : listaEstreita ? (
            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="space-y-2 rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-medium text-foreground">{item.nome}</p>
                    {statusCelula(item)}
                  </div>
                  <dl className="grid grid-cols-1 gap-2 text-xs min-[400px]:grid-cols-2">
                    <div className="space-y-0.5">
                      <dt className="text-muted-foreground">Forma de venda</dt>
                      <dd>{formaVendaCelula(item)}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-muted-foreground">Categoria vinculada</dt>
                      <dd>{categoriaCelula(item)}</dd>
                    </div>
                  </dl>
                  {canEdit && <div className="border-t pt-2">{acoes(item)}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marca / operação</TableHead>
                  <TableHead className="w-36">Forma de venda</TableHead>
                  <TableHead>Categoria vinculada</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  {canEdit && <TableHead className="w-28 text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.nome}</TableCell>
                    <TableCell>{formaVendaCelula(item)}</TableCell>
                    <TableCell>{categoriaCelula(item)}</TableCell>
                    <TableCell>{statusCelula(item)}</TableCell>
                    {canEdit && <TableCell>{acoes(item)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </FinSectionGroup>

      <Dialog open={showForm} onOpenChange={open => { if (!open && !saving) closeForm(); }}>
        {/* Sem `autoFocus` no Nome: o Radix já foca o primeiro campo, e o autoFocus do React rodava antes
            de `useRetornoFoco` guardar a origem — o foco caía no corpo da página ao fechar. */}
        <DialogContent {...retornoForm}>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar marca' : 'Nova marca'}</DialogTitle>
            <DialogDescription>
              Nome, forma de venda e categoria de receita usados no fechamento diário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fechamento-marca-nome">Nome</Label>
              <Input
                id="fechamento-marca-nome"
                value={nome}
                onChange={event => setNome(event.target.value)}
                placeholder="Ex.: Salão, Delivery Ren, Delivery Royal"
                maxLength={100}
                onKeyDown={event => {
                  if (event.key === 'Enter') save();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <p aria-hidden="true" className="text-sm font-medium leading-none text-foreground">Forma de venda</p>
              <SegmentedControl
                options={FORMA_VENDA_OPTIONS}
                value={formaVenda}
                onChange={value => setFormaVenda(value as FormaVenda)}
                className="flex w-full"
                ariaLabel="Forma de venda"
              />
              <p className="text-xs text-muted-foreground">
                Define o que será contado no fechamento do dia: quantidade de pedidos (delivery, balcão) ou de
                pessoas atendidas (salão).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fechamento-marca-categoria">Categoria vinculada (livro razão)</Label>
              <CategoryCombobox
                id="fechamento-marca-categoria"
                value={categoriaId}
                onValueChange={setCategoriaId}
                options={categoryOptions}
                placeholder="Selecione a categoria de receita desta marca..."
              />
              {categoriasErro ? (
                <p role="alert" className="text-xs text-destructive">
                  As categorias não carregaram; a lista está vazia. Feche e atualize a tela antes de salvar.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Só aparecem categorias/sub-categorias de receita, ativas e sem itens abaixo delas. Duas marcas podem
                  apontar para a mesma categoria (ex.: Salão e Jantar caindo na mesma linha do extrato).
                </p>
              )}
            </div>
            <Button className="w-full" onClick={save} disabled={saving || !nome.trim() || !categoriaId || !formaVenda}>
              {saving ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Cadastrar marca'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
