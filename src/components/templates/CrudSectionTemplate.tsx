/**
 * ─── CRUD Section Template (Enterprise Safe) ───
 *
 * Use for: list + create + edit + delete sub-tabs.
 *
 * Built-in:
 *  ✅ RBAC (view / create / edit / delete / export)
 *  ✅ NoAccess fallback
 *  ✅ Loading + Skeleton
 *  ✅ Submit guard (double-click protection)
 *  ✅ Destructive confirm dialog
 *  ✅ useDataEvent auto-refresh
 *  ✅ Typed state (no any)
 *  ✅ Timezone helper
 *  ✅ Error feedback via toast
 *
 * Replace all TODO markers before use.
 */

import { useState, useCallback, useEffect } from 'react';
import { useCan } from '@/permissions';
import { useDataEvent, emitDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Plus, Trash2, Loader2 } from 'lucide-react';
import { todayBR } from '@/lib/datetime';

// ── NoAccess ──
function NoAccess() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
      <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
      <p className="font-medium text-foreground">Acesso negado</p>
      <p className="text-xs text-muted-foreground mt-1">Você não tem permissão para visualizar esta seção.</p>
    </div>
  );
}

// ── Types (TODO: replace with real entity) ──
interface SampleEntity {
  id: string;
  nome: string;
  created_at: string;
}

// ── Component ──
export default function CrudSectionTemplate() {
  // ── RBAC ──
  const canView   = useCan('modulo:subaba:view');    // TODO: replace
  const canCreate = useCan('modulo:subaba:create');  // TODO: replace
  const canEdit   = useCan('modulo:subaba:edit');    // TODO: replace
  const canDelete = useCan('modulo:subaba:delete');  // TODO: replace
  const canExport = useCan('modulo:subaba:export');  // TODO: replace

  // ── State ──
  const [items, setItems] = useState<SampleEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      /*
       * TODO: replace with actual RPC or query with explicit projection, e.g.:
       * const { data, error } = await supabase
       *   .from('your_table')
       *   .select('id, nome, created_at')
       *   .order('created_at', { ascending: false })
       *   .limit(100);
       * if (error) { toast.error('Erro ao carregar dados'); return; }
       * setItems((data ?? []) as SampleEntity[]);
       */
      void toast; void supabase; void todayBR; // prevent unused warnings
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Auto-refresh on external mutations ──
  useDataEvent('modulo:subaba', load); // TODO: replace event key

  // ── Create ──
  const handleCreate = async () => {
    if (saving) return;
    setSaving(true);
    try {
      /*
       * TODO: replace with actual insert / RPC, e.g.:
       * const { error } = await supabase.from('your_table').insert({ nome: 'Novo item' });
       * if (error) throw error;
       */
      toast.success('Item criado');
      emitDataEvent('modulo:subaba'); // TODO: replace
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete (with confirm) ──
  const handleDelete = async (item: SampleEntity) => {
    const ok = await confirm({
      title: 'Excluir registro',
      description: `Tem certeza que deseja excluir "${item.nome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'destructive',
    });
    if (!ok) return;
    setSaving(true);
    try {
      /*
       * TODO: replace — prefer RPC for critical deletes, e.g.:
       * const { error } = await supabase.from('your_table').delete().eq('id', item.id);
       * if (error) throw error;
       */
      toast.success('Registro excluído');
      emitDataEvent('modulo:subaba'); // TODO: replace
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally {
      setSaving(false);
    }
  };

  // ── Guard: no view permission ──
  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-bold text-foreground">
          📋 Título da Seção {/* TODO */}
        </h2>
        <div className="flex gap-2">
          {canExport && (
            <Button variant="outline" size="sm" className="text-xs" disabled={loading}>
              Exportar {/* TODO: wire export */}
            </Button>
          )}
          {canCreate && (
            <Button size="sm" className="gap-1.5 text-xs" onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Novo
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum registro encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{item.nome}</span>
              <div className="flex gap-1">
                {canDelete && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(item)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog />
    </div>
  );
}
