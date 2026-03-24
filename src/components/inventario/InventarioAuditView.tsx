/**
 * Inventario Audit Log sub-view — extracted from InventarioView monolith.
 */
import { ArrowLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseUTCToBR } from '@/lib/datetime';
import type { AuditLog } from '@/hooks/useInventarioStore';

interface Props {
  auditLogs: AuditLog[];
  onBack: () => void;
}

export default function InventarioAuditView({ auditLogs, onBack }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
        <h2 className="text-lg font-display font-bold text-foreground">🔐 Log de Auditoria</h2>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="space-y-2">
          {auditLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum registro de auditoria</p>
          ) : auditLogs.map(log => (
            <div key={log.id} className="flex items-start gap-3 border-b border-border/30 pb-2 last:border-0">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Shield className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{log.acao}</span>
                  <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{log.user_role}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{parseUTCToBR(log.created_at)}</p>
                {log.ip_address && <p className="text-[9px] text-muted-foreground">IP: {log.ip_address}</p>}
                {log.depois && (
                  <pre className="text-[9px] text-muted-foreground mt-1 bg-muted/30 p-1.5 rounded overflow-x-auto">
                    {typeof log.depois === 'string' ? log.depois : JSON.stringify(log.depois, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
