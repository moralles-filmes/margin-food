import { ClipboardList, History, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  pendentes: number;
  loading: boolean;
  canCreate: boolean;
  showActions: boolean;
  onRefresh: () => void;
  onHistory: () => void;
  onCreate: () => void;
  onFixedList: () => void;
}

export default function RequisicaoToolbar({ pendentes, loading, canCreate, showActions, onRefresh, onHistory, onCreate, onFixedList }: Props) {
  return <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-48">
            <h2 className="text-lg font-semibold text-foreground break-words">Requisições de Estoque</h2>
            <p className="text-sm text-muted-foreground">{pendentes} pendente{pendentes !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon" variant="ghost" aria-label="Atualizar requisições" className="h-11 w-11" onClick={() => onRefresh()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {showActions && (
              <Button variant="ghost" className="h-11 gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => onHistory()}>
                <History className="w-4 h-4" /> Histórico
              </Button>
            )}
          </div>
        </div>
        {canCreate && showActions && (
          <div className="grid w-full grid-cols-2 gap-3">
            <Button className="h-auto min-h-14 w-full min-w-0 gap-2 whitespace-normal px-2 py-3 text-base font-semibold sm:text-lg" onClick={() => onCreate()}>
              <Plus className="!w-5 !h-5" /> Criar
            </Button>
            <Button variant="outline" className="h-auto min-h-14 w-full min-w-0 gap-2 whitespace-normal px-2 py-3 text-base font-semibold sm:text-lg" onClick={() => onFixedList()}>
              <ClipboardList className="!w-5 !h-5" /> Lista Fixa
            </Button>
          </div>
        )}

  </div>;
}
