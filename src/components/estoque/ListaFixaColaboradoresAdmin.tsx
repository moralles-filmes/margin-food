import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Users, X } from 'lucide-react';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Button } from '@/components/ui/button';
import SearchableSelect from '@/components/ui/SearchableSelect';

interface Usuario { id: string; nome: string; email: string }
interface Vinculo { id: string; user_id: string }

interface Props {
  listaId: string;
  setor: string;
}

/**
 * ─── Colaboradores da lista fixa ───
 *
 * Define quem vê a lista fixa na "Requisição por Lista Fixa". Lista sem
 * colaborador continua visível para todos que fazem requisição; com
 * colaboradores, só eles a veem. O filtro é aplicado pela RLS de
 * `listas_fixas_setor` — esta tela só grava os vínculos.
 */
export default function ListaFixaColaboradoresAdmin({ listaId, setor }: Props) {
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const toast = useScopedToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuariosErro, setUsuariosErro] = useState(false);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [salvando, setSalvando] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    void supabase
      .rpc('list_profiles_minimal', { p_search: '', p_limit: 200 })
      .then(({ data, error }) => {
        if (error) {
          console.error('[ListaFixaColaboradoresAdmin] usuarios', error);
          setUsuariosErro(true);
          return;
        }
        const lista = (data ?? []).map(u => ({ id: u.id, nome: u.nome, email: u.email }));
        lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        setUsuarios(lista);
      });
  }, [supabase]);

  const carregarVinculos = useCallback(async (id: string) => {
    // Trocar de setor no meio de uma carga não pode deixar os vínculos da
    // lista anterior na tela.
    const request = ++requestId.current;
    setStatus('loading');
    const { data, error } = await supabase
      .from('listas_fixas_setor_usuarios')
      .select('id, user_id')
      .eq('lista_fixa_id', id);
    if (request !== requestId.current) return;
    if (error) {
      console.error('[ListaFixaColaboradoresAdmin] vinculos', error);
      setStatus('error');
      return;
    }
    setVinculos(data ?? []);
    setStatus('ready');
  }, [supabase]);

  useEffect(() => { void carregarVinculos(listaId); }, [carregarVinculos, listaId]);

  const usuarioPorId = useMemo(() => new Map(usuarios.map(u => [u.id, u])), [usuarios]);
  const vinculados = useMemo(() => new Set(vinculos.map(v => v.user_id)), [vinculos]);

  // O e-mail entra no label porque o SearchableSelect filtra pelo label — sem
  // ele, dois homônimos ficam indistinguíveis na lista.
  const opcoes = useMemo(
    () => usuarios
      .filter(u => !vinculados.has(u.id))
      .map(u => ({ value: u.id, label: u.email ? `${u.nome} — ${u.email}` : u.nome })),
    [usuarios, vinculados],
  );

  // Vínculo de quem não é mais membro ativo da unidade não vem no
  // list_profiles_minimal; o nome some, mas o vínculo continua removível.
  const nomeDe = (userId: string) => usuarioPorId.get(userId)?.nome || 'Usuário sem acesso à unidade';

  const adicionar = async (userId: string) => {
    if (!userId) return;
    if (!companyId) { toast.error('Selecione uma unidade.'); return; }

    // O 1º colaborador muda a lista de "todos" para "só os selecionados".
    if (vinculos.length === 0) {
      const ok = await confirm({
        title: `Restringir a lista de ${setor}`,
        description: `A partir de agora, só ${nomeDe(userId)} e os próximos colaboradores que você adicionar verão esta lista. Quem gerencia requisições continua vendo todas.`,
        confirmLabel: 'Restringir lista',
      });
      if (!ok) return;
    }

    setSalvando(true);
    const { error } = await supabase.from('listas_fixas_setor_usuarios').insert({
      company_id: companyId,
      lista_fixa_id: listaId,
      user_id: userId,
    });
    setSalvando(false);
    // 23505: outra aba já vinculou este colaborador — o reload mostra o estado real.
    if (error && error.code !== '23505') {
      console.error('[ListaFixaColaboradoresAdmin] adicionar', error);
      toast.error('Não foi possível adicionar o colaborador.');
    }
    void carregarVinculos(listaId);
  };

  const remover = async (vinculo: Vinculo) => {
    const nome = nomeDe(vinculo.user_id);
    const ultimo = vinculos.length === 1;
    const ok = await confirm({
      title: `Remover ${nome}`,
      description: ultimo
        ? `Sem colaboradores selecionados, a lista de ${setor} volta a aparecer para todos que fazem requisição.`
        : `${nome} deixa de ver a lista de ${setor}.`,
      confirmLabel: 'Remover',
      variant: 'destructive',
    });
    if (!ok) return;

    setSalvando(true);
    const { error } = await supabase.from('listas_fixas_setor_usuarios').delete().eq('id', vinculo.id);
    setSalvando(false);
    if (error) {
      console.error('[ListaFixaColaboradoresAdmin] remover', error);
      toast.error('Não foi possível remover o colaborador.');
    }
    void carregarVinculos(listaId);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <ConfirmDialog />
      <div className="flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-primary" />
        <p className="text-[11px] font-medium text-muted-foreground">Colaboradores que veem esta lista</p>
      </div>

      {status === 'loading' && (
        <p className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </p>
      )}

      {status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
          <span>Não foi possível carregar os colaboradores desta lista.</span>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => carregarVinculos(listaId)}>
            Tentar novamente
          </Button>
        </div>
      )}

      {status === 'ready' && (
        <>
          {vinculos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum colaborador selecionado — a lista aparece para todos que fazem requisição.
            </p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-1.5" aria-label="Colaboradores vinculados">
                {vinculos.map(vinculo => (
                  <li key={vinculo.id} className="flex items-center gap-1 rounded-full border border-border bg-background-subtle py-0.5 pl-2.5 pr-0.5 text-xs text-foreground">
                    <span className="min-w-0 truncate">{nomeDe(vinculo.user_id)}</span>
                    <button
                      type="button"
                      onClick={() => remover(vinculo)}
                      disabled={salvando}
                      aria-label={`Remover ${nomeDe(vinculo.user_id)} da lista`}
                      className="rounded-full p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Só estes colaboradores veem a lista de <strong>{setor}</strong>. Quem gerencia requisições continua vendo todas.
              </p>
            </>
          )}

          {usuariosErro ? (
            <p className="text-xs text-destructive">Não foi possível carregar a lista de usuários da unidade.</p>
          ) : (
            <SearchableSelect
              value=""
              onValueChange={adicionar}
              options={opcoes}
              placeholder="Adicionar colaborador…"
              searchPlaceholder="Buscar por nome ou e-mail…"
              emptyMessage="Nenhum usuário encontrado."
              ariaLabel="Adicionar colaborador à lista"
              disabled={salvando}
              className="h-8 text-xs bg-secondary border-border"
            />
          )}
        </>
      )}
    </div>
  );
}
