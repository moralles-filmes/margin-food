import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, FileText, Upload, Download, AlertTriangle, CheckCircle2,
  Clock, Shield, CalendarIcon, Trash2, Eye, FileWarning, Search
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import { useCan } from '@/permissions/hooks';
interface Colaborador {
  id: string;
  nome: string;
  setor: string;
}

interface Documento {
  id: string;
  colaborador_id: string;
  tipo: string;
  nome: string;
  descricao: string;
  arquivo_path: string | null;
  arquivo_nome: string;
  arquivo_tamanho: number;
  data_emissao: string | null;
  data_vencimento: string | null;
  status: string;
  obrigatorio: boolean;
  alertar_vencimento: boolean;
  dias_alerta_antes: number;
  uploaded_by: string;
  created_at: string;
}

interface Props {
  colaboradores: Colaborador[];
  canManage: boolean;
}

const TIPOS_DOC = [
  { value: 'aso', label: 'ASO (Atestado Saúde Ocupacional)', obrigatorio: true },
  { value: 'contrato', label: 'Contrato de Trabalho', obrigatorio: true },
  { value: 'ctps', label: 'CTPS', obrigatorio: true },
  { value: 'rg', label: 'RG / Identidade', obrigatorio: true },
  { value: 'cpf', label: 'CPF', obrigatorio: true },
  { value: 'comprovante_residencia', label: 'Comprovante de Residência', obrigatorio: false },
  { value: 'certidao', label: 'Certidão (nascimento/casamento)', obrigatorio: false },
  { value: 'atestado', label: 'Atestado Médico', obrigatorio: false },
  { value: 'advertencia', label: 'Advertência', obrigatorio: false },
  { value: 'outro', label: 'Outro', obrigatorio: false },
];

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }> = {
  VIGENTE: { label: 'Vigente', variant: 'default', icon: CheckCircle2 },
  VENCIDO: { label: 'Vencido', variant: 'destructive', icon: AlertTriangle },
  PENDENTE: { label: 'Pendente', variant: 'outline', icon: Clock },
  ARQUIVADO: { label: 'Arquivado', variant: 'secondary', icon: FileText },
};

export default function DocumentosComplianceSection({
 colaboradores, canManage }: Props) {
  const canViewRbac = useCan('rh:documentos:view');
  const { user } = useAuth();
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterColab, setFilterColab] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    colaborador_id: '', tipo: 'aso', nome: '', descricao: '',
    obrigatorio: true, alertar_vencimento: true, dias_alerta_antes: 30,
  });
  const [dateEmissao, setDateEmissao] = useState<Date | undefined>();
  const [dateVencimento, setDateVencimento] = useState<Date | undefined>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [docPage, setDocPage] = useState(0);
  const [docHasMore, setDocHasMore] = useState(true);
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async (p = 0, append = false) => {
    if (!append) setLoading(true);
    try {
      const { data, error } = await supabase.from('rh_documentos').select('id, colaborador_id, tipo, nome, descricao, arquivo_path, arquivo_nome, arquivo_tamanho, data_emissao, data_vencimento, status, obrigatorio, alertar_vencimento, dias_alerta_antes, uploaded_by, created_at').order('created_at', { ascending: false })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      const newItems = (data || []) as Documento[];
      if (append) {
        setDocumentos(prev => [...prev, ...newItems]);
      } else {
        setDocumentos(newItems);
      }
      setDocHasMore(newItems.length === PAGE_SIZE);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-set name & obrigatorio when tipo changes
  const handleTipoChange = (tipo: string) => {
    const tipoConfig = TIPOS_DOC.find(t => t.value === tipo);
    setForm(p => ({
      ...p,
      tipo,
      nome: tipoConfig?.label || '',
      obrigatorio: tipoConfig?.obrigatorio || false,
    }));
  };

  const handleUpload = async () => {
    if (!form.colaborador_id || !form.nome.trim()) {
      toast.error('Preencha colaborador e nome do documento'); return;
    }

    setUploading(true);
    try {
      let arquivo_path: string | null = null;
      let arquivo_nome = '';
      let arquivo_tamanho = 0;

      if (selectedFile) {
        const ext = selectedFile.name.split('.').pop();
        const path = `${form.colaborador_id}/${Date.now()}_${form.tipo}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('rh-documentos')
          .upload(path, selectedFile);
        if (uploadError) { toast.error('Erro no upload: ' + uploadError.message); setUploading(false); return; }
        arquivo_path = path;
        arquivo_nome = selectedFile.name;
        arquivo_tamanho = selectedFile.size;
      }

      const { error } = await supabase.from('rh_documentos').insert({
        colaborador_id: form.colaborador_id,
        tipo: form.tipo,
        nome: form.nome,
        descricao: form.descricao,
        arquivo_path,
        arquivo_nome,
        arquivo_tamanho,
        data_emissao: dateEmissao ? format(dateEmissao, 'yyyy-MM-dd') : null,
        data_vencimento: dateVencimento ? format(dateVencimento, 'yyyy-MM-dd') : null,
        obrigatorio: form.obrigatorio,
        alertar_vencimento: form.alertar_vencimento,
        dias_alerta_antes: form.dias_alerta_antes,
        uploaded_by: user?.id ?? null,
      });
      if (error) { toast.error('Erro: ' + error.message); setUploading(false); return; }
      toast.success('Documento registrado!');
      setShowNew(false);
      resetForm();
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error('Erro inesperado');
    }
    setUploading(false);
  };

  const resetForm = () => {
    setForm({ colaborador_id: '', tipo: 'aso', nome: '', descricao: '', obrigatorio: true, alertar_vencimento: true, dias_alerta_antes: 30 });
    setDateEmissao(undefined);
    setDateVencimento(undefined);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = async (doc: Documento) => {
    if (!doc.arquivo_path) { toast.error('Sem arquivo anexado'); return; }
    try {
      const { data, error } = await supabase.storage.from('rh-documentos').download(doc.arquivo_path);
      if (error) { toast.error('Erro: ' + error.message); return; }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.arquivo_nome || 'documento';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao baixar arquivo');
    }
  };

  const handleDelete = async (id: string, path: string | null) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
      if (path) {
        await supabase.storage.from('rh-documentos').remove([path]);
      }
      const { error } = await supabase.from('rh_documentos').delete().eq('id', id);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Documento excluído');
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const getColabNome = (id: string) => colaboradores.find(c => c.id === id)?.nome || 'Desconhecido';
  const getTipoLabel = (tipo: string) => TIPOS_DOC.find(t => t.value === tipo)?.label || tipo;

  const getVencimentoInfo = (doc: Documento) => {
    if (!doc.data_vencimento) return null;
    try {
      const dias = differenceInDays(parseISO(doc.data_vencimento), new Date());
      if (dias < 0) return { label: `Vencido há ${Math.abs(dias)} dias`, color: 'text-destructive', urgent: true };
      if (dias <= doc.dias_alerta_antes) return { label: `Vence em ${dias} dias`, color: 'text-warning', urgent: true };
      return { label: format(parseISO(doc.data_vencimento), 'dd/MM/yyyy'), color: 'text-muted-foreground', urgent: false };
    } catch { return null; }
  };

  // Filter
  const filtered = documentos.filter(d => {
    if (filterColab && filterColab !== 'all' && d.colaborador_id !== filterColab) return false;
    if (filterTipo && filterTipo !== 'all' && d.tipo !== filterTipo) return false;
    if (filterStatus && filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const nome = d.nome.toLowerCase();
      const colab = getColabNome(d.colaborador_id).toLowerCase();
      if (!nome.includes(term) && !colab.includes(term)) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Stats
  const vencidos = documentos.filter(d => {
    if (!d.data_vencimento) return false;
    try { return differenceInDays(parseISO(d.data_vencimento), new Date()) < 0; } catch { return false; }
  }).length;
  const vencendo = documentos.filter(d => {
    if (!d.data_vencimento) return false;
    try {
      const dias = differenceInDays(parseISO(d.data_vencimento), new Date());
      return dias >= 0 && dias <= 30;
    } catch { return false; }
  }).length;
  const pendentes = documentos.filter(d => d.status === 'PENDENTE').length;

  // Compliance: check obrigatórios per colaborador
  const complianceData = colaboradores.map(c => {
    const docs = documentos.filter(d => d.colaborador_id === c.id);
    const obrigatorios = TIPOS_DOC.filter(t => t.obrigatorio);
    const faltando = obrigatorios.filter(t => !docs.some(d => d.tipo === t.value && d.status !== 'ARQUIVADO'));
    return { colab: c, total: docs.length, faltando: faltando.length, obrigatorios: obrigatorios.length, compliant: faltando.length === 0 };
  });
  const complianceRate = colaboradores.length > 0
    ? Math.round((complianceData.filter(c => c.compliant).length / colaboradores.length) * 100)
    : 100;

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Total Documentos</CardDescription>
            <CardTitle className="text-lg">{documentos.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1">
              {vencidos > 0 && <AlertTriangle className="w-3 h-3 text-destructive" />} Vencidos
            </CardDescription>
            <CardTitle className="text-lg text-destructive">{vencidos}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Vencendo (30d)</CardDescription>
            <CardTitle className="text-lg text-warning">{vencendo}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs flex items-center gap-1"><Shield className="w-3 h-3" /> Compliance</CardDescription>
            <CardTitle className={cn("text-lg", complianceRate >= 80 ? "text-success" : "text-destructive")}>{complianceRate}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Compliance alerts */}
      {complianceData.filter(c => !c.compliant).length > 0 && canManage && (
        <Card className="border-warning/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-warning">
              <FileWarning className="w-4 h-4" /> Documentos Obrigatórios Faltando
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {complianceData.filter(c => !c.compliant).map(c => (
              <div key={c.colab.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                <span className="font-medium">{c.colab.nome}</span>
                <Badge variant="destructive" className="text-[10px]">{c.faltando} doc(s) faltando</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-8 text-xs pl-8 w-40" />
          </div>
          <Select value={filterColab} onValueChange={setFilterColab}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Colaborador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {TIPOS_DOC.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Dialog open={showNew} onOpenChange={v => { setShowNew(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8"><Plus className="w-3.5 h-3.5" /> Novo Documento</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Registrar Documento</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label>Colaborador *</Label>
                  <Select value={form.colaborador_id} onValueChange={v => setForm(p => ({ ...p, colaborador_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={handleTipoChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS_DOC.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></div>
                <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} rows={2} /></div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data Emissão</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !dateEmissao && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateEmissao ? format(dateEmissao, 'dd/MM/yyyy') : 'Selecione'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dateEmissao} onSelect={setDateEmissao} locale={ptBR} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>Data Vencimento</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10", !dateVencimento && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateVencimento ? format(dateVencimento, 'dd/MM/yyyy') : 'Selecione'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dateVencimento} onSelect={setDateVencimento} locale={ptBR} className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div>
                  <Label>Arquivo</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                      className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-muted file:text-muted-foreground"
                    />
                  </div>
                  {selectedFile && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.obrigatorio} onCheckedChange={v => setForm(p => ({ ...p, obrigatorio: v }))} />
                    <Label className="text-xs">Obrigatório</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.alertar_vencimento} onCheckedChange={v => setForm(p => ({ ...p, alertar_vencimento: v }))} />
                    <Label className="text-xs">Alertar vencimento</Label>
                  </div>
                </div>

                {form.alertar_vencimento && (
                  <div>
                    <Label className="text-xs">Alertar X dias antes</Label>
                    <Input type="number" value={form.dias_alerta_antes || ''} onChange={e => setForm(p => ({ ...p, dias_alerta_antes: Number(e.target.value) }))} className="h-8" />
                  </div>
                )}

                <Button onClick={handleUpload} disabled={uploading} className="w-full">
                  {uploading ? 'Enviando...' : 'Registrar Documento'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Documents table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Documentos ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">Nenhum documento encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Colaborador</TableHead>
                    <TableHead className="text-xs">Documento</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(doc => {
                    const status = STATUS_CONFIG[doc.status] || STATUS_CONFIG.VIGENTE;
                    const vencInfo = getVencimentoInfo(doc);
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="text-xs font-medium">{getColabNome(doc.colaborador_id)}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>{doc.nome}</span>
                            {doc.obrigatorio && <Badge variant="outline" className="text-[8px] px-1">Obrig.</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{getTipoLabel(doc.tipo)}</TableCell>
                        <TableCell className="text-xs">
                          {vencInfo ? (
                            <span className={cn("flex items-center gap-1", vencInfo.color)}>
                              {vencInfo.urgent && <AlertTriangle className="w-3 h-3" />}
                              {vencInfo.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-[10px] gap-1">
                            <StatusIcon className="w-2.5 h-2.5" /> {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {doc.arquivo_path && (
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDownload(doc)}>
                                <Download className="w-3 h-3" />
                              </Button>
                            )}
                            {canManage && (
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDelete(doc.id, doc.arquivo_path)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
