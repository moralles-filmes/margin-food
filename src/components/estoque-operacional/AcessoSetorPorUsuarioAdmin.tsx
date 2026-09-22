import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface Setor { id: string; name: string }
interface Usuario { id: string; nome: string; email: string }

interface Props {
  canEdit: boolean;
}

/**
 * ─── Setores por Usuário ───
 *
 * Define quais setores cada pessoa pode movimentar na Movimentação Operacional.
 * Substitui `company_memberships.sector`, que guarda um setor só e não atende o
 * operador que cobre mais de um (ex.: Cozinha + Delivery).
 *
 * Quem administra estoque ou setores alcança todos os setores ativos sem linha
 * aqui — a tela avisa isso em vez de deixar a impressão de que o acesso está
 * vazio.
 */
export default function AcessoSetorPorUsuarioAdmin({ canEdit }: Props) {
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const toast = useScopedToast();

  const [setores, setSetores] = useState<Setor[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [userId, setUserId] = useState('');
  const [concedidos, setConcedidos] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [salvandoSetor, setSalvandoSetor] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('stock_sectors')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order', { nullsFirst: false })
      .order('name')
      .then(({ data }) => setSetores((data ?? []) as Setor[]));

    void supabase
      .rpc('list_profiles_minimal', { p_search: '', p_limit: 200 })
      .then(({ data }) => {
        const lista = (data ?? []).map(u => ({ id: u.id, nome: u.nome, email: u.email }));
        lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        setUsuarios(lista);
      });
  }, [supabase]);

  const carregarConcedidos = useCallback(async (id: string) => {
    if (!id) { setConcedidos(new Map()); return; }
    setCarregando(true);
    const { data, error } = await supabase
      .from('estoque_usuario_setores')
      .select('id, setor_id')
      .eq('user_id', id);

    if (error) {
      console.error('[AcessoSetorPorUsuarioAdmin] carregar', error);
      toast.error('Não foi possível carregar os setores do usuário.');
      setConcedidos(new Map());
    } else {
      setConcedidos(new Map((data ?? []).map(row => [row.setor_id, row.id])));
    }
    setCarregando(false);
  }, [supabase, toast]);

  useEffect(() => { void carregarConcedidos(userId); }, [carregarConcedidos, userId]);

  // O e-mail entra no label porque o SearchableSelect filtra pelo label — sem
  // ele, dois homônimos ficam indistinguíveis na lista.
  const opcoesUsuario = useMemo(
    () => usuarios.map(u => ({ value: u.id, label: u.email ? `${u.nome} — ${u.email}` : u.nome })),
    [usuarios],
  );

  const alternar = async (setor: Setor, marcado: boolean) => {
    if (!companyId) { toast.error('Selecione uma unidade.'); return; }
    setSalvandoSetor(setor.id);

    if (marcado) {
      const { error } = await supabase.from('estoque_usuario_setores').insert({
        company_id: companyId,
        user_id: userId,
        setor_id: setor.id,
      });
      if (error) {
        console.error('[AcessoSetorPorUsuarioAdmin] conceder', error);
        toast.error('Não foi possível liberar o setor.');
      }
    } else {
      const vinculoId = concedidos.get(setor.id);
      if (vinculoId) {
        const { error } = await supabase.from('estoque_usuario_setores').delete().eq('id', vinculoId);
        if (error) {
          console.error('[AcessoSetorPorUsuarioAdmin] revogar', error);
          toast.error('Não foi possível remover o setor.');
        }
      }
    }

    setSalvandoSetor(null);
    void carregarConcedidos(userId);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">Usuário</Label>
        <SearchableSelect
          options={opcoesUsuario}
          value={userId}
          onValueChange={setUserId}
          placeholder="Selecione um usuário"
          searchPlaceholder="Buscar por nome ou e-mail…"
        />
      </div>

      {!userId ? (
        <p className="rounded-lg border border-border bg-background-subtle p-4 text-sm text-muted-foreground">
          Escolha um usuário para definir quais setores ele pode movimentar.
        </p>
      ) : carregando ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      ) : (
        <>
          <p className="rounded-lg border border-border bg-background-subtle p-3 text-xs text-muted-foreground">
            Quem administra estoque ou setores movimenta todos os setores ativos
            mesmo sem marcação aqui. Esta lista vale para o acesso operacional.
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {setores.map(setor => {
              const marcado = concedidos.has(setor.id);
              return (
                <li key={setor.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border p-3 hover:bg-background-subtle">
                    <Checkbox
                      checked={marcado}
                      disabled={!canEdit || salvandoSetor === setor.id}
                      onCheckedChange={valor => alternar(setor, valor === true)}
                      aria-label={`Liberar setor ${setor.name}`}
                    />
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{setor.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
