import { useState, useEffect, useCallback, useRef } from 'react';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useCan } from '@/permissions/hooks';
import { toast } from 'sonner';
import { RefreshCw, Repeat, Play, ExternalLink, ShieldX, Download, FileText } from 'lucide-react';
import { fmtBRL } from '@/lib/money';
import * as XLSX from 'xlsx';

// ─── Types ───
type OrigemType = 'lancamento' | 'conta_pagar' | 'conta_receber';

interface RecorrenciaConsolidada {
  id: string;
  origem: OrigemType;
  chave_unica: string;
  descricao: string;
  tipo: string;
  status: string;
  valor: number;
  dia_vencimento: number | null;
  frequencia: string;
  ativo: boolean;
  proxima_data: string | null;
  filhos_mes: number;
  gerado_mes: boolean;
  updated_at: string;
  parcelas_geradas: number;
  parcelas_max: number;
}

// ─── Constants ───
const PAGE_SIZE = 50;

const ORIGEM_LABELS: Record<OrigemType, string> = {
  lancamento: 'Livro Razão',
  conta_pagar: 'Contas a Pagar',
  conta_receber: 'Contas a Receber',
};

const ORIGEM_BADGE_VARIANT: Record<OrigemType, 'default' | 'destructive' | 'secondary'> = {
  lancamento: 'default',
  conta_pagar: 'destructive',
  conta_receber: 'secondary',
};

const ORIGEM_TAB: Record<OrigemType, string> = {
  lancamento: 'lancamentos',
  conta_pagar: 'pagar',
  conta_receber: 'receber',
};

const FREQ_LABELS: Record<string, string> = {
  mensal: 'Mensal',
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  anual: 'Anual',
  trimestral: 'Trimestral',
};

interface Props {
  onNavigate?: (tab: string) => void;
}

// ─── NoAccess ───
function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <ShieldX className="w-10 h-10 opacity-40" />
      <p className="font-medium">Acesso restrito</p>
      <p className="text-sm">Você não tem permissão para visualizar as recorrências financeiras.</p>
    </div>
  );
}

// ─── Skeleton rows ───
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 8 }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export default function RecorrenciasSection({ onNavigate }: Props) {
  const canView = useCan('financeiro:recorrencias:view');
  const canCreate = useCan('financeiro:recorrencias:create');
  const canExport = useCan('financeiro:recorrencias:export');

  const [items, setItems] = useState<RecorrenciaConsolidada[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursorData, setCursorData] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [errorState, setErrorState] = useState(false);
  const [gerandoById, setGerandoById] = useState<Record<string, boolean>>({});

  const now = new Date();
  const [mesAno, setMesAno] = useState(() => {
    const br = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    return br.substring(0, 7);
  });

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  // ─── Debounce ───
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedReload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadPage(null, null, true), 500);
  }, []);

  // ─── Load page ───
  const loadPage = useCallback(async (
    cData: string | null,
    cId: string | null,
    reset: boolean
  ) => {
    if (reset) {
      setLoading(true);
      setErrorState(false);
    } else {
      setLoadingMore(true);
    }

    try {
      const { data, error } = await supabase.rpc('_guarded_list_recorrencias', {
        p_cursor_data: cData,
        p_cursor_id: cId,
        p_limit: PAGE_SIZE,
        p_mes: mesAno,
      });

      if (error) {
        toast.error('Erro ao carregar recorrências');
        console.error(error);
        setErrorState(true);
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const result = data as unknown as {
        items: RecorrenciaConsolidada[];
        has_more: boolean;
        next_cursor_data: string | null;
        next_cursor_id: string | null;
      };

      const newItems = result.items || [];

      if (reset) {
        setItems(newItems);
      } else {
        setItems(prev => {
          const existing = new Set(prev.map(p => p.chave_unica));
          const unique = newItems.filter(n => !existing.has(n.chave_unica));
          return [...prev, ...unique];
        });
      }

      setHasMore(result.has_more);
      setCursorData(result.next_cursor_data);
      setCursorId(result.next_cursor_id);
    } catch (err) {
      console.error(err);
      toast.error('Erro inesperado ao carregar recorrências');
      setErrorState(true);
    }

    setLoading(false);
    setLoadingMore(false);
  }, [mesAno]);

  useEffect(() => {
    if (canView) loadPage(null, null, true);
  }, [mesAno, canView, loadPage]);

  // ─── Reactivity (debounced) ───
  useDataEvent('financeiro:recorrencias', debouncedReload);
  useDataEvent('financeiro:lancamentos', debouncedReload);
  useDataEvent('financeiro:pagar', debouncedReload);
  useDataEvent('financeiro:receber', debouncedReload);

  // ─── Generate parcela ───
  const gerarParcela = async (item: RecorrenciaConsolidada) => {
    if (item.origem !== 'lancamento') {
      toast.info('Geração de parcela disponível apenas para recorrências do Livro Razão');
      return;
    }

    const rowKey = item.chave_unica;
    setGerandoById(prev => ({ ...prev, [rowKey]: true }));
    try {
      const { data, error } = await supabase.rpc('gerar_parcela_recorrente', {
        p_lancamento_pai_id: item.id,
      });

      if (error) {
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Seu perfil não possui permissão para gerar parcelas recorrentes.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      const result = data as Record<string, unknown>;
      if (result?.status === 'noop') {
        toast.info((result.message as string) || 'Parcela já existia');
      } else {
        toast.success(`Parcela ${result?.parcela_num || ''} gerada!`);
      }

      // Emit events
      emitDataEvent('financeiro:recorrencias');
      emitDataEvent('financeiro:lancamentos');

      // Reload
      loadPage(null, null, true);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar parcela');
    } finally {
      setGerandoById(prev => ({ ...prev, [rowKey]: false }));
    }
  };

  // ─── Navigate to origin ───
  const handleOpenOrigem = (item: RecorrenciaConsolidada) => {
    if (!onNavigate) return;
    onNavigate(ORIGEM_TAB[item.origem] || 'lancamentos');
  };

  // ─── Export Excel ───
  const handleExportExcel = () => {
    const rows = items.map(r => ({
      Origem: ORIGEM_LABELS[r.origem] || r.origem,
      Descrição: r.descricao,
      Tipo: r.tipo,
      Valor: r.valor,
      Frequência: FREQ_LABELS[r.frequencia] || r.frequencia,
      'Próxima Data': r.proxima_data || '—',
      'Filhos no Mês': r.filhos_mes,
      'Gerado no Mês': r.gerado_mes ? 'Sim' : 'Não',
      Ativo: r.ativo ? 'Sim' : 'Não',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recorrências');
    XLSX.writeFile(wb, `recorrencias-${mesAno}.xlsx`);
    toast.success('Exportação concluída');
  };

  // ─── RBAC gate ───
  if (!canView) return <NoAccess />;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-foreground">Recorrências do Mês</h2>
            <p className="text-sm text-muted-foreground">Visão consolidada de todas as recorrências financeiras</p>
          </div>
          <div className="flex items-center gap-2">
            {canExport && items.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportExcel}>
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
            )}
            <Select value={mesAno} onValueChange={setMesAno}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => loadPage(null, null, true)} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
        </div>

        {errorState && !loading ? (
          <Card><CardContent className="p-8 text-center text-destructive">
            <p className="font-medium">Erro ao carregar recorrências</p>
            <p className="text-sm text-muted-foreground mt-1">Tente novamente ou contate o administrador.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => loadPage(null, null, true)}>
              <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
            </Button>
          </CardContent></Card>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Frequência</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Status no Mês</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRows />
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Repeat className="w-10 h-10 mx-auto mb-3 opacity-30 text-muted-foreground" />
                    <p className="font-medium text-muted-foreground">Nenhuma recorrência cadastrada</p>
                    <p className="text-sm text-muted-foreground">Para criar, vá em <strong>Lançamentos</strong>, <strong>Contas a Pagar</strong> ou <strong>Contas a Receber</strong> e ative a opção "Recorrente".</p>
                  </TableCell>
                </TableRow>
              ) : (
                items.map(item => {
                  const isGerando = gerandoById[item.chave_unica] ?? false;
                  const maxReached = item.parcelas_max > 0 && item.parcelas_geradas >= item.parcelas_max;
                  return (
                    <TableRow key={item.chave_unica}>
                      <TableCell className="font-medium max-w-[200px] truncate">{item.descricao}</TableCell>
                      <TableCell>
                        <Badge variant={item.tipo === 'RECEITA' ? 'default' : 'destructive'}>{item.tipo}</Badge>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant={ORIGEM_BADGE_VARIANT[item.origem]} className="cursor-help">
                              {ORIGEM_LABELS[item.origem]}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Recorrência criada em {ORIGEM_LABELS[item.origem]}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-sm">{FREQ_LABELS[item.frequencia] || item.frequencia || '—'}</TableCell>
                      <TableCell className="text-right font-bold">{fmtBRL(item.valor)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.parcelas_geradas}/{item.parcelas_max > 0 ? item.parcelas_max : '∞'}
                      </TableCell>
                      <TableCell>
                        {item.gerado_mes ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            {item.filhos_mes} lançada(s)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {item.origem === 'lancamento' && canCreate && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => gerarParcela(item)}
                              disabled={isGerando || maxReached}
                            >
                              {isGerando ? (
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3 mr-1" />
                              )}
                              Gerar
                            </Button>
                          )}
                          {onNavigate && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" onClick={() => handleOpenOrigem(item)}>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Abrir {ORIGEM_LABELS[item.origem]}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadPage(cursorData, cursorId, false)}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : null}
              Carregar mais
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
