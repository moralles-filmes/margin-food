import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldAlert, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateBR } from '@/lib/formatters';
import { exportTableToExcel } from '@/lib/exportHelpers';
import { includesNormalized } from '@/lib/utils';

interface AuditEntry {
  id: string;
  user_id: string | null;
  acao: string;
  tabela: string;
  registro_id: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'user.created': { label: 'Usuário criado', color: 'bg-success-soft text-success' },
  'user.disabled': { label: 'Usuário desativado', color: 'bg-destructive-soft text-destructive' },
  'role.changed': { label: 'Role alterado', color: 'bg-warning-soft text-warning' },
  'compras.approval': { label: 'Compra aprovada', color: 'bg-primary-soft text-primary-soft-foreground' },
  'compras.rejected': { label: 'Compra reprovada', color: 'bg-destructive-soft text-destructive' },
};

export default function SecurityAuditView() {
  const { hasAnyRole } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  useEffect(() => {
    const loadAudit = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('audit_log')
        .select('id, user_id, acao, tabela, registro_id, campo, valor_anterior, valor_novo, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      setEntries(data || []);
      setLoading(false);
    };
    loadAudit();
  }, []);

  const filtered = useMemo(() => {
    let list = entries;
    if (filterAction) list = list.filter(e => includesNormalized(e.acao, filterAction));
    if (filterSearch) {
      list = list.filter(e =>
        includesNormalized(e.acao, filterSearch) ||
        includesNormalized(e.tabela, filterSearch) ||
        includesNormalized(e.valor_novo || '', filterSearch) ||
        includesNormalized(e.valor_anterior || '', filterSearch)
      );
    }
    return list;
  }, [entries, filterAction, filterSearch]);

  if (!hasAnyRole('admin')) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <ShieldAlert className="w-12 h-12 mx-auto text-destructive/30 mb-3" />
        <p className="text-sm font-medium text-foreground">Acesso Negado</p>
        <p className="text-xs text-muted-foreground">Apenas administradores podem acessar o log de auditoria.</p>
      </div>
    );
  }

  const handleExport = () => {
    exportTableToExcel({
      module: 'auditoria',
      section: 'seguranca',
      title: 'Log de Auditoria de Segurança',
      columns: [
        { header: 'Data', key: 'created_at', format: (v) => formatDateBR(new Date(String(v))) },
        { header: 'Ação', key: 'acao' },
        { header: 'Tabela', key: 'tabela' },
        { header: 'Registro', key: 'registro_id' },
        { header: 'Anterior', key: 'valor_anterior' },
        { header: 'Novo', key: 'valor_novo' },
      ],
      rows: filtered as unknown as Record<string, unknown>[],
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" /> Log de Auditoria de Segurança
          </p>
          <p className="text-xs text-muted-foreground">{filtered.length} eventos</p>
        </div>
        <Button onClick={handleExport} size="sm" variant="outline" className="gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="Buscar em ação, tabela, valor..."
            className="h-8 text-xs"
          />
        </div>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="h-8 rounded-md border border-border bg-secondary px-2 text-xs text-foreground">
          <option value="">Todas ações</option>
          <option value="user.">Usuários</option>
          <option value="role.">Roles</option>
          <option value="compras.">Compras</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(entry => {
            const actionInfo = ACTION_LABELS[entry.acao] || { label: entry.acao, color: 'bg-muted text-muted-foreground' };
            return (
              <div key={entry.id} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${actionInfo.color}`}>
                      {actionInfo.label}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{entry.tabela}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                    {formatDateBR(new Date(entry.created_at))}
                  </span>
                </div>
                {(entry.valor_anterior || entry.valor_novo) && (
                  <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                    {entry.valor_anterior && (
                      <span className="text-muted-foreground line-through">{entry.valor_anterior.substring(0, 50)}</span>
                    )}
                    {entry.valor_novo && (
                      <span className="text-foreground font-medium">{entry.valor_novo.substring(0, 80)}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum evento registrado</p>
          )}
        </div>
      )}
    </div>
  );
}
