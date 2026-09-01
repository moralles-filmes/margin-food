import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableActions from '@/components/ui/TableActions';
import CategoryCombobox from '@/components/financeiro/CategoryCombobox';
import { useCompanyId } from '@/hooks/useCompanyId';
import { supabase } from '@/integrations/supabase/client';
import { emitDataEvent } from '@/lib/dataEvents';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import { filterEligibleMarcaCategoryOptions } from '@/domain/financeiro/marcaCategoriaOptions';
import { Plus, Store } from 'lucide-react';
import { toast } from 'sonner';

export interface FechamentoMarca {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  categoria_id: string | null;
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
}

const MARCA_ERROR_MESSAGES: Record<string, string> = {
  financeiro_fechamento_marcas_nome_unique: 'Já existe uma marca com esse nome',
  CATEGORIA_MARCA_OBRIGATORIA: 'Selecione a categoria vinculada à marca',
  CATEGORIA_MARCA_INVALIDA: 'A categoria precisa ser de receita, ativa e operacional',
  CATEGORIA_MARCA_NAO_FOLHA: 'Só é possível vincular a uma categoria/sub-categoria sem itens abaixo dela',
};

function mapMarcaError(message: string): string {
  const match = Object.keys(MARCA_ERROR_MESSAGES).find(key => message.includes(key));
  return match ? MARCA_ERROR_MESSAGES[match] : 'Erro ao salvar marca';
}

export default function FechamentoMarcasTab({
  items,
  loading,
  canCreate,
  canEdit,
}: FechamentoMarcasTabProps) {
  const { companyId, loading: companyLoading, error: companyError } = useCompanyId();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<FechamentoMarca | null>(null);
  const [nome, setNome] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<CategoriaRow[]>([]);

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
          return;
        }
        setCategorias((data as CategoriaRow[]) || []);
      });
    return () => { cancelled = true; };
  }, [companyId]);

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

  const openNew = () => {
    setEditItem(null);
    setNome('');
    setCategoriaId('');
    setShowForm(true);
  };

  const openEdit = (item: FechamentoMarca) => {
    setEditItem(item);
    setNome(item.nome);
    setCategoriaId(item.categoria_id || '');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditItem(null);
    setNome('');
    setCategoriaId('');
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
    if (!companyId) {
      toast.error(companyError || 'Não foi possível identificar a empresa');
      return;
    }

    setSaving(true);
    try {
      if (editItem) {
        const { error } = await supabase
          .from('financeiro_fechamento_marcas')
          .update({ nome: normalizedName, categoria_id: categoriaId })
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Marcas e dark kitchens</h3>
          <p className="text-sm text-muted-foreground">
            Cadastre Salão, deliveries e todas as marcas que precisam aparecer no fechamento diário.
          </p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={openNew} disabled={companyLoading || !companyId}>
            <Plus className="mr-1 h-4 w-4" /> Nova marca
          </Button>
        )}
      </div>

      {companyError && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{companyError}</CardContent>
        </Card>
      )}

      {!loading && marcasPendentes.length > 0 && (
        <Card className="border-warning/40 bg-warning-soft">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">
                {marcasPendentes.length === 1
                  ? '1 marca sem categoria vinculada'
                  : `${marcasPendentes.length} marcas sem categoria vinculada`}
              </p>
              <p className="text-muted-foreground">
                Sem a categoria, o faturamento líquido dessa loja não pode ser calculado na Apresentação Sócios:{' '}
                {marcasPendentes.map(m => m.nome).join(', ')}.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Marca / operação</TableHead>
            <TableHead>Categoria vinculada</TableHead>
            <TableHead className="w-28">Status</TableHead>
            {canEdit && <TableHead className="w-28 text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                {canEdit && <TableCell><Skeleton className="ml-auto h-7 w-20" /></TableCell>}
              </TableRow>
            ))
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 4 : 3} className="py-10 text-center text-muted-foreground">
                <Store className="mx-auto mb-2 h-8 w-8 opacity-30" />
                Nenhuma marca cadastrada
              </TableCell>
            </TableRow>
          ) : items.map(item => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.nome}</TableCell>
              <TableCell>
                {item.categoria_id ? (
                  <span className="text-sm">{categoriaNomeById.get(item.categoria_id) || '—'}</span>
                ) : (
                  <Badge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> Sem categoria
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={item.ativo ? 'success' : 'outline'}>
                  {item.ativo ? 'Ativa' : 'Inativa'}
                </Badge>
              </TableCell>
              {canEdit && (
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Switch
                      checked={item.ativo}
                      disabled={togglingId === item.id}
                      onCheckedChange={ativo => toggleActive(item, ativo)}
                      aria-label={`${item.ativo ? 'Desativar' : 'Ativar'} ${item.nome}`}
                    />
                    <TableActions
                      onEdit={() => openEdit(item)}
                      canEditOverride={canEdit}
                    />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={open => { if (!open && !saving) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar marca' : 'Nova marca'}</DialogTitle>
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
                autoFocus
                onKeyDown={event => {
                  if (event.key === 'Enter') save();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fechamento-marca-categoria">Categoria vinculada (livro razão)</Label>
              <CategoryCombobox
                value={categoriaId}
                onValueChange={setCategoriaId}
                options={categoryOptions}
                placeholder="Selecione a categoria de receita desta marca..."
              />
              <p className="text-xs text-muted-foreground">
                Só aparecem categorias/sub-categorias de receita, ativas e sem itens abaixo delas. Duas marcas podem
                apontar para a mesma categoria (ex.: Salão e Jantar caindo na mesma linha do extrato).
              </p>
            </div>
            <Button className="w-full" onClick={save} disabled={saving || !nome.trim() || !categoriaId}>
              {saving ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Cadastrar marca'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
