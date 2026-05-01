/**
 * ─── Alertas de Falta de Estoque (Sub-aba Compras) ───
 *
 * Lists operational alerts from stock requisitions where items
 * had insufficient stock. NOT a purchase order — purely informational.
 *
 * Features:
 *  ✅ RBAC enforcement
 *  ✅ Confirm action (mark as seen)
 *  ✅ Filtering / search
 *  ✅ Multi-tenant RLS
 *  ✅ Audit trail
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useCan } from '@/permissions';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Search,
  RefreshCw,
  Inbox,
  Package,
  Eye,
} from 'lucide-react';
import { parseUTCToBR } from '@/lib/datetime';
import { includesNormalized } from '@/lib/utils';

interface AlertaFalta {
  id: string;
  produto_id: string;
  produto_nome: string;
  quantidade_solicitada: number;
  unidade: string;
  saldo_no_momento: number;
  requisicao_id: string | null;
  setor_solicitante: string;
  origem: string;
  status: string;
  confirmado_por: string | null;
  confirmado_em: string | null;
  created_at: string;
  created_by: string;
}

function NoAccess() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
      <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
      <p className="font-medium text-foreground">Acesso negado</p>
      <p className="text-xs text-muted-foreground mt-1">Você não tem permissão para visualizar alertas de falta.</p>
    </div>
  );
}

export default function AlertasFaltaEstoqueView() {
  const canView = useCan('compras:alertas_falta:view') || useCan('compras:pedidos:view') || useCan('system:global:manage');
  const canConfirm = useCan('compras:alertas_falta:approve') || useCan('compras:pedidos:edit') || useCan('system:global:manage');
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [alertas, setAlertas] = useState<AlertaFalta[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'PENDENTE' | 'CONFIRMADO' | 'todos'>('PENDENTE');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('alertas_falta_estoque')
        .select('id, produto_id, produto_nome, quantidade_solicitada, unidade, saldo_no_momento, requisicao_id, setor_solicitante, origem, status, confirmado_por, confirmado_em, created_at, created_by')
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== 'todos') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.error(error);
        toast.error('Erro ao carregar alertas');
        return;
      }
      setAlertas((data || []) as AlertaFalta[]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return alertas;
    return alertas.filter(a =>
      includesNormalized(a.produto_nome, search) ||
      includesNormalized(a.setor_solicitante, search)
    );
  }, [alertas, search]);

  const handleConfirm = async (alerta: AlertaFalta) => {
    const ok = await confirm({
      title: 'Confirmar recebimento do alerta',
      description: `Confirmar que o alerta de falta de "${alerta.produto_nome}" (${alerta.quantidade_solicitada} ${alerta.unidade}) foi visualizado e tratado?`,
      confirmLabel: 'Confirmar',
      variant: 'default',
    });
    if (!ok) return;

    setConfirming(alerta.id);
    try {
      const { error } = await supabase
        .from('alertas_falta_estoque')
        .update({
          status: 'CONFIRMADO',
          confirmado_em: new Date().toISOString(),
        })
        .eq('id', alerta.id);

      if (error) throw error;
      toast.success(`Alerta de "${alerta.produto_nome}" confirmado.`);
      await load();
    } catch (e) {
      console.error('[alertas-estoque.confirm]', e);
      toast.error('Erro ao confirmar alerta');
    } finally {
      setConfirming(null);
    }
  };

  const pendingCount = alertas.filter(a => a.status === 'PENDENTE').length;

  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-warning" />
            Itens em Falta
          </p>
          <p className="text-[10px] text-muted-foreground">
            Alertas de itens sem estoque originados de requisições
            {statusFilter === 'PENDENTE' && pendingCount > 0 && ` • ${pendingCount} pendente${pendingCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto ou setor…"
            className="pl-8 h-8 text-xs bg-secondary border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDENTE">Pendentes</SelectItem>
            <SelectItem value="CONFIRMADO">Confirmados</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Inbox className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            {statusFilter === 'PENDENTE'
              ? 'Nenhum alerta pendente. Tudo em ordem!'
              : 'Nenhum alerta encontrado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(alerta => (
            <div
              key={alerta.id}
              className={`bg-card border rounded-xl p-3 flex items-center gap-3 transition-all ${
                alerta.status === 'PENDENTE'
                  ? 'border-warning/40 bg-warning/5'
                  : 'border-border opacity-70'
              }`}
            >
              {/* Icon */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                alerta.status === 'PENDENTE' ? 'bg-warning/15' : 'bg-success/15'
              }`}>
                {alerta.status === 'PENDENTE'
                  ? <AlertTriangle className="w-4 h-4 text-warning" />
                  : <CheckCircle2 className="w-4 h-4 text-success" />
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-foreground truncate">{alerta.produto_nome}</p>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    Requisição de Estoque
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    alerta.status === 'PENDENTE'
                      ? 'bg-warning/15 text-warning'
                      : 'bg-success/15 text-success'
                  }`}>
                    {alerta.status === 'PENDENTE' ? 'Pendente' : 'Confirmado'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-[10px] text-muted-foreground">
                    Qtd: <span className="font-medium text-foreground">{alerta.quantidade_solicitada} {alerta.unidade}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Saldo: <span className="font-medium text-destructive">{alerta.saldo_no_momento}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Setor: {alerta.setor_solicitante}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {parseUTCToBR(alerta.created_at)}
                  </p>
                </div>
                {alerta.status === 'CONFIRMADO' && alerta.confirmado_em && (
                  <p className="text-[9px] text-success mt-0.5">
                    ✓ Confirmado em {parseUTCToBR(alerta.confirmado_em)}
                  </p>
                )}
              </div>

              {/* Actions */}
              {alerta.status === 'PENDENTE' && canConfirm && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[10px] border-success/30 text-success hover:bg-success/10"
                  disabled={confirming === alerta.id}
                  onClick={() => handleConfirm(alerta)}
                >
                  <Eye className="w-3 h-3" />
                  Confirmar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog />
    </div>
  );
}
