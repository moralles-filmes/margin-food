import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { useCan } from '@/permissions';
import { useEmitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useScopedToast } from '@/hooks/useScopedToast';
import { fmtBRL, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { Plus, Edit, Trash2, Tag, Zap, FileWarning, Search, RefreshCw, ListChecks, ExternalLink } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { ListaCarregando, ResumoCarregando } from './ContasParts';
import { useConteinerEstreito } from './useConteinerEstreito';
import { useRetornoFoco } from './useRetornoFoco';
import { devolverFoco, elementoComFoco } from './devolverFoco';
import { MATCH_LABELS, REGRAS_LISTA_LIMITE_PX } from './fechamentoView';

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
  /** Quantos lançamentos o padrão pega ao todo (a prévia traz no máximo 20). */
  total?: number;
}

interface CategorizacaoSectionProps {
  /** Abre o Livro Razão filtrado em "Sem categoria"; ausente quando o usuário não vê Lançamentos. */
  onVerSemCategoria?: () => void;
}

// A RLS descarta o UPDATE sem permissão e devolve 0 linhas, sem erro.
const REGRA_NAO_GRAVADA = 'sem permissão para editar regras ou a regra não existe mais';

export default function CategorizacaoSection({ onVerSemCategoria }: CategorizacaoSectionProps = {}) {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const canView = useCan('financeiro:categorizacao:view');
  const canCreate = useCan('financeiro:categorizacao:create');
  const canEdit = useCan('financeiro:categorizacao:edit');
  const canManage = useCan('financeiro:categorizacao:manage');
  // Desativar é UPDATE (ativo=false): a policy de UPDATE pede :edit ou :manage, não :delete.
  const canDesativar = canEdit || canManage;

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

  // Só apresentação: o que falhou na leitura (antes virava "Nenhuma regra" ou sumia em silêncio)
  // e qual padrão a prévia exibida testou.
  const [erros, setErros] = useState({ regras: false, nomes: false, contagem: false });
  const [previewErro, setPreviewErro] = useState(false);
  const [previewTestado, setPreviewTestado] = useState<{ padrao: string; tipo: string; categoria: string } | null>(null);
  const [listaRef, listaEstreita] = useConteinerEstreito(REGRAS_LISTA_LIMITE_PX);
  const retornoForm = useRetornoFoco();
  const campoId = useId();

  const { ConfirmDialog, confirm } = useConfirmDialog();

  const load = useCallback(async () => {
    setLoading(true);
    const [regrasRes, catRes, centrosRes, countRes] = await Promise.all([
      supabase.from('fin_regras_categorizacao').select('id, padrao, tipo_match, categoria_id, centro_custo_id, prioridade').eq('ativo', true).order('prioridade', { ascending: false }).limit(1000),
      supabase.from('fin_categorias').select('id, nome, tipo').eq('ativo', true).order('nome').limit(1000),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome').limit(1000),
      supabase.rpc('contar_lancamentos_sem_categoria'),
    ]);
    if (regrasRes.error) console.error('[CategorizacaoSection.load] regras', regrasRes.error);
    if (catRes.error || centrosRes.error) console.error('[CategorizacaoSection.load] nomes', catRes.error ?? centrosRes.error);
    if (countRes.error) console.error('[CategorizacaoSection.load] contagem', countRes.error);
    setErros({
      regras: Boolean(regrasRes.error),
      nomes: Boolean(catRes.error || centrosRes.error),
      contagem: Boolean(countRes.error),
    });
    setRegras((regrasRes.data || []) as Regra[]);
    setCategorias((catRes.data || []) as Categoria[]);
    setCentros((centrosRes.data || []) as Centro[]);
    setSemCategoriaCount(typeof countRes.data === 'number' ? countRes.data : null);
    setLoading(false);
  }, [supabase]);

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
    setPreviewErro(false);
    setPreviewTestado(null);
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
    setPreviewErro(false);
    setPreviewTestado(null);
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
      } catch (_) {
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
        const { data, error } = await supabase.from('fin_regras_categorizacao').update(payload).eq('id', editId).select('id');
        if (error) { console.error('[CategorizacaoSection.save]', error); toast.error(error.message); return; }
        if (!data?.length) {
          console.error('[CategorizacaoSection.save] UPDATE sem linha gravada', editId);
          toast.error(`A regra não foi salva: ${REGRA_NAO_GRAVADA}.`);
          return;
        }
        toast.success('Regra atualizada');
      } else {
        const { error } = await supabase.from('fin_regras_categorizacao').insert(withCompanyId(companyId, payload));
        if (error) { console.error('[CategorizacaoSection.save]', error); toast.error(error.message); return; }
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
    // Só foco: a confirmação abre sem gatilho; ao cancelar, o foco volta ao botão da linha.
    const origemFoco = elementoComFoco();
    const ok = await confirm({
      title: 'Desativar regra',
      description: `Deseja desativar a regra "${regra.padrao}"? Ela não será mais aplicada.`,
      confirmLabel: 'Desativar',
      variant: 'destructive',
    });
    if (!ok) { devolverFoco(origemFoco); return; }

    const { data, error } = await supabase.from('fin_regras_categorizacao').update({ ativo: false }).eq('id', regra.id).select('id');
    if (error) { console.error('[CategorizacaoSection.remover]', error); toast.error(error.message); devolverFoco(origemFoco); return; }
    if (!data?.length) {
      console.error('[CategorizacaoSection.remover] UPDATE sem linha gravada', regra.id);
      toast.error(`A regra não foi desativada: ${REGRA_NAO_GRAVADA}.`);
      devolverFoco(origemFoco);
      return;
    }
    toast.success('Regra desativada');
    load();
    emitDataEvent('financeiro:categorizacao');
  };

  const aplicarRegras = async () => {
    if (aplicando || regras.length === 0) return;
    // Em lote e sem desfazer automático: confirma antes de gravar.
    const origemFoco = elementoComFoco();
    const ok = await confirm({
      title: 'Aplicar regras de categorização',
      description: `As ${regras.length} regra(s) ativa(s) vão classificar as receitas e despesas sem categoria que casarem com elas${semCategoriaCount ? ` (até ${semCategoriaCount.toLocaleString('pt-BR')})` : ''}. Cada lançamento recebe a categoria com uma justificativa automática; para desfazer, edite um a um no Livro Razão.`,
      confirmLabel: 'Aplicar',
    });
    if (!ok) { devolverFoco(origemFoco); return; }

    setAplicando(true);
    try {
      const { data, error } = await supabase.rpc('aplicar_regras_categorizacao');
      if (error) {
        console.error(error);
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Sem permissão para aplicar regras de categorização.');
        } else {
          toast.error('Erro ao aplicar regras: ' + error.message);
        }
        return;
      }

      const result = data as unknown as { total: number; categorizados: number; regras_com_erro?: string[] };
      if (result.total === 0) {
        toast.info('Nenhum lançamento sem categoria encontrado');
      } else {
        toast.success(`${result.categorizados} lançamento(s) categorizado(s) de ${result.total} analisados`);
        emitDataEvent('financeiro:lancamentos');
        emitDataEvent('financeiro:categorizacao');
      }
      // O banco recusou o Regex destas regras (a tela valida com o JS): as demais foram aplicadas.
      const comErro = result.regras_com_erro ?? [];
      if (comErro.length > 0) {
        toast.warning(`Regra(s) ignorada(s) porque o banco recusou o Regex: ${comErro.join(', ')}. Corrija o padrão e aplique de novo.`);
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
      try { new RegExp(form.padrao); } catch (_) {
        toast.error('Regex inválido');
        return;
      }
    }
    setPreviewing(true);
    try {
      const { data, error } = await supabase.rpc('preview_regra_categorizacao', {
        p_padrao: form.padrao.trim(),
        p_tipo_match: form.tipo_match,
        // Com categoria, a prévia traz só o tipo dela (despesa/receita), como a aplicação.
        ...(form.categoria_id ? { p_categoria_id: form.categoria_id } : {}),
      });
      if (error) {
        console.error(error);
        toast.error('Erro ao testar regra');
        setPreviewErro(true);
        return;
      }
      const items = (data as unknown as PreviewItem[]) || [];
      setPreviewErro(false);
      setPreviewTestado({ padrao: form.padrao.trim(), tipo: form.tipo_match, categoria: form.categoria_id });
      setPreviewItems(items);
      setShowPreview(true);
      if (items.length === 0) {
        toast.info('Nenhum lançamento correspondente encontrado');
      }
    } finally {
      setPreviewing(false);
    }
  };

  const catNome = (id: string) => categorias.find(c => c.id === id)?.nome || (erros.nomes ? 'Indisponível' : '—');
  const centroNome = (id: string) => centros.find(c => c.id === id)?.nome || (erros.nomes ? 'Indisponível' : '—');

  if (!canView) return <AccessDenied title="Acesso restrito" description="Você não tem permissão para visualizar as regras de categorização." />;

  // ─── Apresentação ───
  const contagemValor = erros.contagem || semCategoriaCount === null ? '—' : semCategoriaCount.toLocaleString('pt-BR');
  const regrasValor = erros.regras ? '—' : String(regras.length);
  const resumoGrid = kpiGridClassFor(longestValueLength([regrasValor, contagemValor]), 2);
  const temPendentes = semCategoriaCount !== null && semCategoriaCount > 0;
  const previewTotal = previewItems[0]?.total ?? previewItems.length;
  const previewDesatualizada = previewTestado !== null
    && (previewTestado.padrao !== form.padrao.trim() || previewTestado.tipo !== form.tipo_match
      || previewTestado.categoria !== form.categoria_id);
  const temAcoes = canEdit || canDesativar;
  const ids = {
    padrao: `${campoId}-padrao`,
    tipo: `${campoId}-tipo`,
    categoria: `${campoId}-categoria`,
    centro: `${campoId}-centro`,
    prioridade: `${campoId}-prioridade`,
    preview: `${campoId}-preview`,
  };

  const acoesRegra = (regra: Regra) => (
    <div className="flex items-center justify-end gap-0.5">
      {canEdit && (
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(regra)} title={`Editar regra ${regra.padrao}`} aria-label={`Editar regra ${regra.padrao}`}>
          <Edit aria-hidden="true" className="w-4 h-4" />
        </Button>
      )}
      {canDesativar && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remover(regra)} title={`Desativar regra ${regra.padrao}`} aria-label={`Desativar regra ${regra.padrao}`}>
          <Trash2 aria-hidden="true" className="w-4 h-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <ConfirmDialog />

      <FinScreenHeader
        title="Regras de Categorização Automática"
        description="Classificam pela descrição as receitas e despesas do Livro Razão que estão sem categoria. Não atuam na conciliação."
        actions={(
          <>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={aplicarRegras}
                disabled={aplicando || loading || regras.length === 0 || (semCategoriaCount !== null && semCategoriaCount === 0)}
              >
                <Zap aria-hidden="true" className={`w-4 h-4 mr-1 ${aplicando ? 'animate-pulse' : ''}`} />
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
                <Plus aria-hidden="true" className="w-4 h-4 mr-1" /> Nova Regra
              </Button>
            )}
          </>
        )}
      />

      <FinSectionGroup id="cat-situacao" title="Situação" caption="Toda a unidade, sem filtro de período">
        {loading && regras.length === 0 ? (
          <ResumoCarregando cards={2} className={resumoGrid} />
        ) : (
          <FinKpiGrid className={resumoGrid}>
            <KpiCard
              appearance="summary"
              icon={ListChecks}
              label="Regras ativas"
              value={regrasValor}
              sub={erros.regras ? 'Indisponível: as regras não carregaram' : 'Aplicadas da maior para a menor prioridade'}
            />
            <KpiCard
              appearance="summary"
              icon={FileWarning}
              label="Lançamentos sem categoria"
              value={contagemValor}
              sub={erros.contagem || semCategoriaCount === null
                ? 'Indisponível: a contagem não carregou'
                : 'Receitas e despesas sem categoria; transferências e cancelados ficam de fora'}
              variant={temPendentes ? 'warning' : 'default'}
            />
          </FinKpiGrid>
        )}
        {!loading && erros.contagem && canManage && (
          <FinNote>Sem a contagem, “Aplicar Regras” continua disponível; o servidor informa quantos lançamentos analisou.</FinNote>
        )}
      </FinSectionGroup>

      {/* Uncategorized alert */}
      {temPendentes && (
        <div className="flex flex-wrap items-start gap-3 rounded-summary border border-warning-border bg-warning-soft p-4 text-sm">
          <FileWarning aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">
            <span className="font-medium text-foreground">
              {semCategoriaCount} lançamento(s) sem categoria.
            </span>
            <span className="ml-1 text-muted-foreground">
              {regras.length > 0
                ? 'Clique em "Aplicar Regras" para categorizar automaticamente.'
                : erros.regras
                  ? 'As regras não carregaram; tente de novo na lista abaixo.'
                  : 'Crie regras de categorização para classificá-los automaticamente.'}
            </span>
          </p>
          {onVerSemCategoria && (
            <Button size="sm" variant="outline" onClick={onVerSemCategoria}>
              <ExternalLink aria-hidden="true" className="w-4 h-4 mr-1" /> Ver no Livro Razão
            </Button>
          )}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) guardedClose(); else setShowForm(true); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" {...retornoForm}>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Regra' : 'Nova Regra de Categorização'}</DialogTitle>
            <DialogDescription>
              A regra classifica receitas e despesas sem categoria cuja descrição corresponde ao padrão, só com categoria do mesmo tipo. Contém e Exato ignoram acento e maiúsculas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={ids.padrao}>Padrão de texto</Label>
              <Input
                id={ids.padrao}
                value={form.padrao}
                onChange={e => { setForm({ ...form, padrao: e.target.value }); setPreviewErro(false); }}
                placeholder="Ex: aluguel, energia, ifood"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={ids.tipo}>Tipo de correspondência</Label>
                <Select value={form.tipo_match} onValueChange={v => { setForm({ ...form, tipo_match: v }); setPreviewErro(false); }}>
                  <SelectTrigger id={ids.tipo}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contem">Contém</SelectItem>
                    <SelectItem value="exato">Exato</SelectItem>
                    <SelectItem value="regex">Regex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.prioridade}>Prioridade (maior = primeiro)</Label>
                <Input
                  id={ids.prioridade}
                  type="text"
                  inputMode="numeric"
                  value={form.prioridade || ''}
                  onChange={e => setForm({ ...form, prioridade: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.categoria}>Categoria</Label>
              {/* Select por id, como antes: a lista não traz o código, e nomes repetidos ("Outros (despesa)")
                  se confundiriam numa busca por rótulo. */}
              <Select value={form.categoria_id} onValueChange={v => setForm({ ...form, categoria_id: v })}>
                <SelectTrigger id={ids.categoria}><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome} ({c.tipo})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.centro}>Centro de Custo (opcional)</Label>
              <Select value={form.centro_custo_id || '__none__'} onValueChange={v => setForm({ ...form, centro_custo_id: v === '__none__' ? '' : v })}>
                <SelectTrigger id={ids.centro}><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {centros.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {erros.nomes && (
              <p role="alert" className="text-xs text-destructive">
                As categorias ou os centros de custo não carregaram; as listas acima podem estar vazias.
              </p>
            )}

            {/* Preview button */}
            <Button variant="outline" onClick={handlePreview} disabled={previewing || !form.padrao.trim()} className="w-full">
              {previewing ? <RefreshCw aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" /> : <Search aria-hidden="true" className="w-4 h-4 mr-1" />}
              {previewing ? 'Testando...' : 'Testar Regra'}
            </Button>

            {/* Preview results */}
            <div aria-live="polite">
              {previewErro ? (
                <p role="alert" className="rounded-md border border-destructive-border bg-destructive-soft p-3 text-xs text-foreground">
                  Não foi possível testar a regra. Confira o padrão (no Regex, o banco pode recusar uma sintaxe aceita aqui) e tente de novo.
                </p>
              ) : showPreview && (
                <section aria-labelledby={ids.preview} className="space-y-2 rounded-md border p-3">
                  <div className="space-y-0.5">
                    <p id={ids.preview} className="text-xs font-medium text-foreground">
                      {previewItems.length === 0
                        ? 'Nenhum lançamento correspondente'
                        : previewTotal > previewItems.length
                          ? `${previewTotal.toLocaleString('pt-BR')} lançamento(s) seriam categorizados; os ${previewItems.length} mais recentes:`
                          : `${previewTotal} lançamento(s) seriam categorizados:`}
                    </p>
                    {previewTestado && (
                      <p className="text-xs text-muted-foreground">
                        Padrão testado: “{previewTestado.padrao}” ({MATCH_LABELS[previewTestado.tipo] || previewTestado.tipo}) · {previewTestado.categoria ? 'lançamentos do tipo da categoria' : 'receitas e despesas'} sem categoria nem rateio, os mais recentes por competência. Só este padrão: ao aplicar, regras de prioridade maior classificam antes.
                      </p>
                    )}
                    {previewDesatualizada && (
                      <p className="text-xs font-medium text-warning">O padrão ou a categoria mudou depois do teste: teste de novo.</p>
                    )}
                  </div>
                  {previewItems.length > 0 && (
                    <ul className="max-h-48 space-y-1 overflow-y-auto">
                      {previewItems.map(item => (
                        <li key={item.id} className="flex items-start justify-between gap-2 border-b pb-1 text-xs last:border-b-0">
                          <span className="min-w-0 break-words text-foreground">
                            {item.descricao}
                            {item.data_competencia && (
                              <span className="block text-muted-foreground">{formatDateBR(parseLocalDate(item.data_competencia))}</span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{fmtBRL(item.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>

            <Button onClick={save} className="w-full" disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Salvar Alterações' : 'Criar Regra'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Content */}
      <FinSectionGroup
        id="cat-regras"
        title="Regras"
        caption={loading || erros.regras || regras.length === 0 ? undefined : 'Ordenadas pela prioridade, maior primeiro'}
      >
        <div ref={listaRef}>
          {loading && regras.length === 0 ? (
            <ListaCarregando estreito={listaEstreita} texto="Carregando regras…" />
          ) : erros.regras ? (
            <ErrorState title="Não foi possível carregar as regras" onRetry={() => { void load(); }} />
          ) : regras.length === 0 ? (
            <div className="space-y-3 rounded-xl border border-dashed bg-card p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Tag aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">Nenhuma regra cadastrada</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Crie regras para categorizar lançamentos automaticamente pela descrição.
              </p>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">
                Exemplo: uma regra com padrão "aluguel" e tipo "Contém" aplicará a categoria selecionada a todos os lançamentos cuja descrição contenha a palavra "aluguel".
              </p>
            </div>
          ) : listaEstreita ? (
            <ul className="space-y-2">
              {regras.map(regra => (
                <li key={regra.id} className="space-y-2 rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-all font-mono text-sm font-medium text-foreground">{regra.padrao}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Prioridade <span className="font-semibold tabular-nums text-foreground">{regra.prioridade}</span>
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 gap-2 text-xs min-[400px]:grid-cols-2">
                    <div className="space-y-0.5">
                      <dt className="text-muted-foreground">Correspondência</dt>
                      <dd><StatusBadge status="neutral" label={MATCH_LABELS[regra.tipo_match] || regra.tipo_match} /></dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-muted-foreground">Categoria</dt>
                      <dd className="break-words text-foreground">{catNome(regra.categoria_id)}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-muted-foreground">Centro de custo</dt>
                      <dd className="break-words text-foreground">{regra.centro_custo_id ? centroNome(regra.centro_custo_id) : '—'}</dd>
                    </div>
                  </dl>
                  {temAcoes && <div className="border-t pt-2">{acoesRegra(regra)}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Padrão</TableHead>
                  <TableHead>Correspondência</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Centro de Custo</TableHead>
                  <TableHead className="text-right">Prioridade</TableHead>
                  {temAcoes && <TableHead className="w-24 text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {regras.map(regra => (
                  <TableRow key={regra.id}>
                    <TableCell className="max-w-xs break-all font-mono text-sm font-medium">{regra.padrao}</TableCell>
                    <TableCell>
                      <StatusBadge status="neutral" label={MATCH_LABELS[regra.tipo_match] || regra.tipo_match} />
                    </TableCell>
                    <TableCell className="break-words">{catNome(regra.categoria_id)}</TableCell>
                    <TableCell className="break-words text-muted-foreground">
                      {regra.centro_custo_id ? centroNome(regra.centro_custo_id) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{regra.prioridade}</TableCell>
                    {temAcoes && <TableCell>{acoesRegra(regra)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && erros.nomes && !erros.regras && regras.length > 0 && (
            <FinNote className="mt-3">Os nomes de categoria ou centro de custo não carregaram e aparecem como “Indisponível”.</FinNote>
          )}
        </div>
      </FinSectionGroup>
      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}
