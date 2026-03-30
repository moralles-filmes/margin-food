import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useCan } from '@/permissions';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from 'sonner';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { Plus, Edit, Trash2, Tag, Zap, FileWarning, ShieldX, Search, RefreshCw, X } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';

// ─── Types ───
interface Regra {
  id: string;
  padrao: string;
  tipo_match: string;
  categoria_id: string;
  centro_custo_id: string | null;
  prioridade: number;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
}

interface Centro {
  id: string;
  nome: string;
}

interface PreviewItem {
  id: string;
  descricao: string;
  valor: number;
  data_competencia: string;
}

const MATCH_LABELS: Record<string, string> = { contem: 'Contém', exato: 'Exato', regex: 'Regex' };

// ─── NoAccess ───
function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <ShieldX className="w-10 h-10 opacity-40" />
      <p className="font-medium">Acesso restrito</p>
      <p className="text-sm">Você não tem permissão para visualizar as regras de categorização.</p>
    </div>
  );
}

// ─── Skeleton ───
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 6 }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export default function CategorizacaoSection() {
  const canView = useCan('financeiro:categorizacao:view');
  const canCreate = useCan('financeiro:categorizacao:create');
  const canEdit = useCan('financeiro:categorizacao:edit');
  const canDelete = useCan('financeiro:categorizacao:delete');
  const canManage = useCan('financeiro:categorizacao:manage');

  const [regras, setRegras] = useState<Regra[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [semCategoriaCount, setSemCategoriaCount] = useState<number | null>(null);
  const [form, setForm] = useState({
    padrao: '', tipo_match: 'contem', categoria_id: '', centro_custo_id: '', prioridade: 0,
  });

  // Preview state
  const [previewing, setPreviewing] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const { ConfirmDialog, confirm } = useConfirmDialog();

  const load = useCallback(async () => {
    setLoading(true);
    const [regrasRes, catRes, centrosRes, countRes] = await Promise.all([
      supabase.from('fin_regras_categorizacao').select('id, padrao, tipo_match, categoria_id, centro_custo_id, prioridade').eq('ativo', true).order('prioridade', { ascending: false }).limit(1000),
      supabase.from('fin_categorias').select('id, nome, tipo').eq('ativo', true).order('nome').limit(1000),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome').limit(1000),
      supabase.rpc('contar_lancamentos_sem_categoria'),
    ]);
    setRegras((regrasRes.data || []) as Regra[]);
    setCategorias((catRes.data || []) as Categoria[]);
    setCentros((centrosRes.data || []) as Centro[]);
    setSemCategoriaCount(typeof countRes.data === 'number' ? countRes.data : null);
    setLoading(false);
  }, []);

  useEffect(() => { if (canView) load(); }, [load, canView]);

  useDataEvent('financeiro:categorizacao', load);
  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:cadastros', load);
  useDataEvent('financeiro:conciliacao', load);

  const handleCloseForm = () => {
    setEditId(null);
    setForm({ padrao: '', tipo_match: 'contem', categoria_id: '', centro_custo_id: '', prioridade: 0 });
    setShowForm(false);
    setShowPreview(false);
    setPreviewItems([]);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: handleCloseForm });

  const openCreate = () => { handleCloseForm(); setShowForm(true); };

  const openEdit = (regra: Regra) => {
    setEditId(regra.id);
    setForm({
      padrao: regra.padrao || '',
      tipo_match: regra.tipo_match || 'contem',
      categoria_id: regra.categoria_id || '',
      centro_custo_id: regra.centro_custo_id || '',
      prioridade: regra.prioridade || 0,
    });
    setShowPreview(false);
    setPreviewItems([]);
    setShowForm(true);
  };

  const save = async () => {
    if (saving) return;
    if (!form.padrao.trim() || !form.categoria_id) {
      toast.error('Padrão e categoria são obrigatórios');
      return;
    }

    // Regex validation
    if (form.tipo_match === 'regex') {
      try {
        new RegExp(form.padrao);
      } catch {
        toast.error('Regex inválido. Corrija o padrão antes de salvar.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        padrao: form.padrao.trim(),
        tipo_match: form.tipo_match,
        categoria_id: form.categoria_id,
        centro_custo_id: form.centro_custo_id || null,
        prioridade: form.prioridade || 0,
      };

      if (editId) {
        const { error } = await supabase.from('fin_regras_categorizacao').update(payload).eq('id', editId);
        if (error) { toast.error(error.message); return; }
        toast.success('Regra atualizada');
      } else {
        const { error } = await supabase.from('fin_regras_categorizacao').insert(payload);
        if (error) { toast.error(error.message); return; }
        toast.success('Regra criada');
      }

      handleCloseForm();
      load();
      emitDataEvent('financeiro:categorizacao');
    } finally {
      setSaving(false);
    }
  };

  const remover = async (regra: Regra) => {
    const ok = await confirm({
      title: 'Desativar regra',
      description: `Deseja desativar a regra "${regra.padrao}"? Ela não será mais aplicada.`,
      confirmLabel: 'Desativar',
      variant: 'destructive',
    });
    if (!ok) return;

    const { error } = await supabase.from('fin_regras_categorizacao').update({ ativo: false }).eq('id', regra.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Regra desativada');
    load();
    emitDataEvent('financeiro:categorizacao');
  };

  const aplicarRegras = async () => {
    if (aplicando || regras.length === 0) return;
    setAplicando(true);
    try {
      const { data, error } = await supabase.rpc('aplicar_regras_categorizacao');
      if (error) {
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Sem permissão para aplicar regras de categorização.');
        } else {
          toast.error('Erro ao aplicar regras: ' + error.message);
        }
        console.error(error);
        return;
      }

      const result = data as unknown as { total: number; categorizados: number };
      if (result.total === 0) {
        toast.info('Nenhum lançamento sem categoria encontrado');
      } else {
        toast.success(`${result.categorizados} lançamento(s) categorizado(s) de ${result.total} analisados`);
        emitDataEvent('financeiro:lancamentos');
        emitDataEvent('financeiro:categorizacao');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao aplicar regras');
    } finally {
      setAplicando(false);
    }
  };

  // ─── Preview ───
  const handlePreview = async () => {
    if (!form.padrao.trim()) {
      toast.error('Informe o padrão para testar');
      return;
    }
    if (form.tipo_match === 'regex') {
      try { new RegExp(form.padrao); } catch {
        toast.error('Regex inválido');
        return;
      }
    }
    setPreviewing(true);
    try {
      const { data, error } = await supabase.rpc('preview_regra_categorizacao', {
        p_padrao: form.padrao.trim(),
        p_tipo_match: form.tipo_match,
      });
      if (error) {
        toast.error('Erro ao testar regra');
        console.error(error);
        return;
      }
      const items = (data as unknown as PreviewItem[]) || [];
      setPreviewItems(items);
      setShowPreview(true);
      if (items.length === 0) {
        toast.info('Nenhum lançamento correspondente encontrado');
      }
    } finally {
      setPreviewing(false);
    }
  };

  const catNome = (id: string) => categorias.find(c => c.id === id)?.nome || '—';
  const centroNome = (id: string) => centros.find(c => c.id === id)?.nome || '—';

  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-4">
      <ConfirmDialog />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Regras de Categorização Automática</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? '...' : `${regras.length} regra(s) ativa(s)`}
            {semCategoriaCount !== null && semCategoriaCount > 0 && (
              <span className="ml-2 text-destructive">
                • {semCategoriaCount} lançamento(s) sem categoria
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={aplicarRegras}
              disabled={aplicando || loading || regras.length === 0 || (semCategoriaCount !== null && semCategoriaCount === 0)}
            >
              <Zap className={`w-4 h-4 mr-1 ${aplicando ? 'animate-pulse' : ''}`} />
              {aplicando ? 'Aplicando...' : 'Aplicar Regras'}
              {semCategoriaCount !== null && semCategoriaCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1.5">
                  {semCategoriaCount}
                </Badge>
              )}
            </Button>
          )}
          {canCreate && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1" /> Nova Regra
            </Button>
          )}
        </div>
      </div>

      {/* Uncategorized alert */}
      {semCategoriaCount !== null && semCategoriaCount > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-3 flex items-center gap-3">
            <FileWarning className="w-5 h-5 text-warning shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-foreground">
                {semCategoriaCount} lançamento(s) sem categoria.
              </span>
              <span className="text-muted-foreground ml-1">
                {regras.length > 0
                  ? 'Clique em "Aplicar Regras" para categorizar automaticamente.'
                  : 'Crie regras de categorização para classificá-los automaticamente.'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) guardedClose(); else setShowForm(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editId ? 'Editar Regra' : 'Nova Regra de Categorização'}</DialogTitle>
              <button type="button" onClick={guardedClose} aria-label="Fechar" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Padrão de texto</Label>
              <Input
                value={form.padrao}
                onChange={e => setForm({ ...form, padrao: e.target.value })}
                placeholder="Ex: aluguel, energia, ifood"
              />
            </div>
            <div>
              <Label>Tipo de correspondência</Label>
              <Select value={form.tipo_match} onValueChange={v => setForm({ ...form, tipo_match: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contem">Contém</SelectItem>
                  <SelectItem value="exato">Exato</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria_id} onValueChange={v => setForm({ ...form, categoria_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome} ({c.tipo})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Centro de Custo (opcional)</Label>
              <Select value={form.centro_custo_id || '__none__'} onValueChange={v => setForm({ ...form, centro_custo_id: v === '__none__' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {centros.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade (maior = primeiro)</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={form.prioridade || ''}
                onChange={e => setForm({ ...form, prioridade: parseInt(e.target.value, 10) || 0 })}
              />
            </div>

            {/* Preview button */}
            <Button variant="outline" onClick={handlePreview} disabled={previewing || !form.padrao.trim()} className="w-full">
              {previewing ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
              {previewing ? 'Testando...' : 'Testar Regra'}
            </Button>

            {/* Preview results */}
            {showPreview && (
              <div className="border border-border rounded-md p-3 max-h-48 overflow-y-auto space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {previewItems.length === 0
                    ? 'Nenhum lançamento correspondente'
                    : `${previewItems.length} lançamento(s) seriam categorizados (máx. 20):`}
                </p>
                {previewItems.map(item => (
                  <div key={item.id} className="text-xs flex justify-between border-b border-border/50 pb-1">
                    <span className="truncate flex-1 mr-2">{item.descricao}</span>
                    <span className="text-muted-foreground shrink-0">{fmtBRL(item.valor)}</span>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={save} className="w-full" disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Salvar Alterações' : 'Criar Regra'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Content */}
      {loading ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Padrão</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Centro de Custo</TableHead>
                  <TableHead className="text-center">Prioridade</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SkeletonRows />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : regras.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma regra cadastrada</p>
          <p className="text-sm mt-1">
            Crie regras para categorizar lançamentos automaticamente pela descrição.
          </p>
          <p className="text-xs mt-2 text-muted-foreground/70">
            Exemplo: uma regra com padrão "aluguel" e tipo "Contém" aplicará a categoria selecionada a todos os lançamentos cuja descrição contenha a palavra "aluguel".
          </p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Padrão</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Centro de Custo</TableHead>
                  <TableHead className="text-center">Prioridade</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regras.map(regra => (
                  <TableRow key={regra.id}>
                    <TableCell className="font-mono text-sm font-medium">{regra.padrao}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{MATCH_LABELS[regra.tipo_match] || regra.tipo_match}</Badge>
                    </TableCell>
                    <TableCell>{catNome(regra.categoria_id)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {regra.centro_custo_id ? centroNome(regra.centro_custo_id) : '—'}
                    </TableCell>
                    <TableCell className="text-center">{regra.prioridade}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {canEdit && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(regra)} title="Editar regra">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remover(regra)} title="Desativar regra">
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
