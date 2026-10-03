import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { requestNavigation } from '@/hooks/useNavigationRequest';
import { formatarCentavos, formatarData, type CmvDecisao } from '@/domain/financeiro/cmv';
import {
  CMV_QUERY_ROOT, classificarCmv, mensagemErroCmv, useCmvLinhas,
  type CmvLinhaDetalhe, type CmvSituacao,
} from '@/hooks/useCmvFinanceiro';
import CmvDecisaoToggle from './CmvDecisaoToggle';

export interface CmvBoletosAlvo {
  titulo: string;
  descricao: string;
  inicio: string | null;
  fim: string | null;
  situacao: CmvSituacao;
  categoriaId: string | null;
  soDireto?: boolean;
}

interface Props {
  alvo: CmvBoletosAlvo | null;
  onClose: () => void;
  companyId: string | null | undefined;
  /** Pode alterar a decisão de um boleto (Contas a Pagar → editar, ou gerenciar o CMV). */
  canClassificar: boolean;
  /** Pode aplicar a decisão em lote (revisão do histórico). */
  canLote: boolean;
  /** Pode abrir o lançamento original em Contas a Pagar. */
  canAbrirBoleto: boolean;
}

const PAGINA = 50;
const chaveLinha = (l: Pick<CmvLinhaDetalhe, 'contaPagarId' | 'rateioId'>) => `${l.contaPagarId}:${l.rateioId ?? ''}`;

const SITUACAO_TEXTO: Record<'sim' | 'nao' | 'pendente', string> = {
  sim: 'Sim (entra no CMV)',
  nao: 'Não (fora do CMV)',
  pendente: 'Pendente de classificação',
};

function textoDecisao(decisao: CmvDecisao): string {
  return decisao === true ? SITUACAO_TEXTO.sim : decisao === false ? SITUACAO_TEXTO.nao : SITUACAO_TEXTO.pendente;
}

/**
 * Boletos e rateios por trás de um número do relatório, e revisão de pendências.
 * A decisão de uma linha é gravada na hora; o lote passa por prévia e confirmação.
 */
export default function CmvBoletosDialog({ alvo, onClose, companyId, canClassificar, canLote, canAbrirBoleto }: Props) {
  const supabase = useSupabase();
  const toast = useScopedToast();
  const queryClient = useQueryClient();
  const emitDataEvent = useEmitDataEvent();
  const { executar: trava } = useTravaEnvio();
  const [pagina, setPagina] = useState(0);
  const [selecionadas, setSelecionadas] = useState<Map<string, CmvLinhaDetalhe>>(() => new Map());
  const [salvando, setSalvando] = useState<string | null>(null);
  const [lote, setLote] = useState<{ incluir: boolean } | null>(null);
  const [justificativa, setJustificativa] = useState('');

  useEffect(() => {
    setPagina(0);
    setSelecionadas(new Map());
    setLote(null);
    setJustificativa('');
  }, [alvo]);

  const params = useMemo(() => ({
    inicio: alvo?.inicio ?? null,
    fim: alvo?.fim ?? null,
    situacao: alvo?.situacao ?? 'incluido' as CmvSituacao,
    categoriaId: alvo?.categoriaId ?? null,
    soDireto: alvo?.soDireto ?? false,
    limite: PAGINA,
    offset: pagina * PAGINA,
  }), [alvo, pagina]);

  const query = useCmvLinhas({ companyId, params, enabled: alvo !== null });
  const lista = query.data;
  const itens = lista?.itens ?? [];
  const totalPaginas = lista ? Math.max(1, Math.ceil(lista.totalLinhas / PAGINA)) : 1;

  // A seleção guarda a linha como estava ao ser marcada; a cada recarga, as que
  // estão na página trocam pela versão nova (o `updatedAt` é o lock do boleto).
  useEffect(() => {
    if (!lista) return;
    setSelecionadas(atual => {
      let mudou = false;
      const proximo = new Map(atual);
      for (const linha of lista.itens) {
        const chave = chaveLinha(linha);
        const antiga = proximo.get(chave);
        if (antiga && antiga !== linha) { proximo.set(chave, linha); mudou = true; }
      }
      return mudou ? proximo : atual;
    });
  }, [lista]);

  // Espera a recarga: até lá a linha ainda carrega a versão antiga do boleto.
  const aposGravar = async () => {
    emitDataEvent('financeiro:pagar');
    await queryClient.invalidateQueries({ queryKey: CMV_QUERY_ROOT });
  };

  const classificarLinha = async (linha: CmvLinhaDetalhe, incluir: boolean) => {
    if (linha.cmvIncluir === incluir) return;
    await trava(async () => {
      setSalvando(chaveLinha(linha));
      try {
        await classificarCmv(supabase, [{
          contaPagarId: linha.contaPagarId, rateioId: linha.rateioId, incluir, expectedUpdatedAt: linha.updatedAt,
        }]);
        toast.success(incluir ? 'Linha incluída no CMV financeiro.' : 'Linha retirada do CMV financeiro.');
        // O boleto mudou de versão: as linhas dele saem da seleção do lote.
        setSelecionadas(atual => {
          const proximo = new Map([...atual].filter(([, l]) => l.contaPagarId !== linha.contaPagarId));
          return proximo.size === atual.size ? atual : proximo;
        });
        await aposGravar();
      } catch (error) {
        toast.error(mensagemErroCmv(error));
        void query.refetch();
      } finally {
        setSalvando(null);
      }
    });
  };

  const alternarSelecao = (linha: CmvLinhaDetalhe, marcada: boolean) => {
    setSelecionadas(atual => {
      const proximo = new Map(atual);
      if (marcada) proximo.set(chaveLinha(linha), linha); else proximo.delete(chaveLinha(linha));
      return proximo;
    });
  };
  const todasDaPagina = itens.length > 0 && itens.every(l => selecionadas.has(chaveLinha(l)));
  const alternarPagina = (marcada: boolean) => {
    setSelecionadas(atual => {
      const proximo = new Map(atual);
      for (const linha of itens) {
        if (marcada) proximo.set(chaveLinha(linha), linha); else proximo.delete(chaveLinha(linha));
      }
      return proximo;
    });
  };

  const previa = useMemo(() => {
    const linhas = [...selecionadas.values()];
    return {
      linhas,
      titulos: new Set(linhas.map(l => l.contaPagarId)).size,
      centavos: linhas.reduce((s, l) => s + l.linhaCentavos, 0),
    };
  }, [selecionadas]);

  const aplicarLote = async () => {
    if (!lote) return;
    const incluir = lote.incluir;
    await trava(async () => {
      setSalvando('lote');
      try {
        const resultado = await classificarCmv(
          supabase,
          previa.linhas.map(l => ({ contaPagarId: l.contaPagarId, rateioId: l.rateioId, incluir, expectedUpdatedAt: l.updatedAt })),
          justificativa,
        );
        toast.success(`${resultado.itens} ${resultado.itens === 1 ? 'linha classificada' : 'linhas classificadas'} em ${resultado.titulos} ${resultado.titulos === 1 ? 'boleto' : 'boletos'}.`);
        setSelecionadas(new Map());
        setLote(null);
        setJustificativa('');
        await aposGravar();
      } catch (error) {
        toast.error(`${mensagemErroCmv(error)} Nada foi alterado e a seleção foi limpa: selecione de novo.`);
        setLote(null);
        // A seleção pode conter linha com versão antiga: repetir o mesmo lote falharia de novo.
        setSelecionadas(new Map());
        void query.refetch();
      } finally {
        setSalvando(null);
      }
    });
  };

  const abrirBoleto = (id: string) => {
    onClose();
    requestNavigation({ tab: 'financeiro', subtab: 'pagar', record: { type: 'conta_pagar', id } });
  };

  const colunas = 7 + (canLote ? 1 : 0) + (canAbrirBoleto ? 1 : 0);

  return (
    <>
      <Dialog open={alvo !== null} onOpenChange={aberto => { if (!aberto) onClose(); }}>
        <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{alvo?.titulo}</DialogTitle>
            <DialogDescription>{alvo?.descricao}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
            {lista && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                <strong className="font-semibold text-foreground">{lista.totalTitulos}</strong> {lista.totalTitulos === 1 ? 'boleto' : 'boletos'},{' '}
                <strong className="font-semibold text-foreground">{lista.totalLinhas}</strong> {lista.totalLinhas === 1 ? 'linha' : 'linhas'} de rateio,{' '}
                total de <strong className="font-semibold tabular-nums text-foreground">{formatarCentavos(lista.totalCentavos)}</strong>.
              </p>
            )}

            {canLote && selecionadas.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-border bg-primary-soft p-3 text-sm">
                <span className="text-primary-ink">
                  {previa.linhas.length} {previa.linhas.length === 1 ? 'linha selecionada' : 'linhas selecionadas'} ({formatarCentavos(previa.centavos)})
                </span>
                <span className="ml-auto flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => setLote({ incluir: true })}>Marcar como Sim</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setLote({ incluir: false })}>Marcar como Não</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSelecionadas(new Map())}>Limpar seleção</Button>
                </span>
              </div>
            )}

            {query.isError ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
                <p>{mensagemErroCmv(query.error, 'Não foi possível carregar os boletos.')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Tentar novamente</Button>
              </div>
            ) : query.isPending ? (
              <div className="space-y-2" role="status" aria-label="Carregando boletos">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : itens.length === 0 ? (
              <EmptyState title="Nenhum boleto neste recorte" description="Não há linhas de rateio com esta situação no intervalo consultado." compact />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[940px] border-collapse text-sm">
                  <caption className="sr-only">Boletos e linhas de rateio do recorte</caption>
                  <thead>
                    <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                      {canLote && (
                        <th scope="col" className="w-10 px-3 py-2 text-left">
                          <Checkbox checked={todasDaPagina} onCheckedChange={v => alternarPagina(v === true)} aria-label="Selecionar todas as linhas desta página" />
                        </th>
                      )}
                      <th scope="col" className="px-3 py-2 text-left font-medium">Fornecedor / boleto</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Competência</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Vencimento</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Situação</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Categoria</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Valor do boleto</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Valor da linha</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Aparecer no CMV?</th>
                      {canAbrirBoleto && <th scope="col" className="w-10 px-3 py-2"><span className="sr-only">Abrir lançamento</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map(linha => {
                      const chave = chaveLinha(linha);
                      return (
                        <tr key={chave} className="border-b border-border last:border-0">
                          {canLote && (
                            <td className="px-3 py-2">
                              <Checkbox
                                checked={selecionadas.has(chave)} onCheckedChange={v => alternarSelecao(linha, v === true)}
                                aria-label={`Selecionar ${linha.descricao}`}
                              />
                            </td>
                          )}
                          <th scope="row" className="max-w-[16rem] px-3 py-2 text-left font-normal">
                            <span className="block truncate font-medium text-foreground" title={linha.fornecedor ?? linha.descricao}>{linha.fornecedor || linha.descricao}</span>
                            {linha.fornecedor && <span className="block truncate text-xs text-muted-foreground" title={linha.descricao}>{linha.descricao}</span>}
                          </th>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {linha.dataCompetencia ? formatarData(linha.dataCompetencia) : <span className="font-medium text-warning">Sem competência</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{linha.dataVencimento ? formatarData(linha.dataVencimento) : '—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={linha.status} size="xs" /></td>
                          <td className="max-w-[12rem] truncate px-3 py-2" title={linha.categoriaNome ?? 'Sem categoria'}>{linha.categoriaNome ?? <span className="text-muted-foreground">Sem categoria</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">{formatarCentavos(linha.tituloCentavos)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-foreground">{formatarCentavos(linha.linhaCentavos)}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {canClassificar && linha.status !== 'CANCELADO' ? (
                              <span className="inline-flex items-center gap-2">
                                <CmvDecisaoToggle
                                  size="sm" value={linha.cmvIncluir} disabled={salvando !== null}
                                  onChange={v => void classificarLinha(linha, v)}
                                  label={`Aparecer no CMV financeiro? — ${linha.descricao}`}
                                />
                                {salvando === chave && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Salvando" />}
                                {linha.cmvIncluir === null && salvando !== chave && <span className="text-xs font-medium text-warning">Pendente</span>}
                              </span>
                            ) : (
                              <span className={linha.cmvIncluir === null ? 'font-medium text-warning' : undefined}>{textoDecisao(linha.cmvIncluir)}</span>
                            )}
                          </td>
                          {canAbrirBoleto && (
                            <td className="px-3 py-2">
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirBoleto(linha.contaPagarId)} aria-label={`Abrir ${linha.descricao} em Contas a Pagar`}>
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {itens.length === 0 && <tr><td colSpan={colunas} /></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {lista && lista.totalLinhas > PAGINA && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3 text-sm">
              <span className="text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
              <span className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={pagina === 0 || query.isFetching} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
                <Button type="button" variant="outline" size="sm" disabled={pagina + 1 >= totalPaginas || query.isFetching} onClick={() => setPagina(p => p + 1)}>Próxima</Button>
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={lote !== null} onOpenChange={aberto => { if (!aberto && salvando === null) setLote(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lote?.incluir ? 'Incluir no CMV financeiro?' : 'Deixar fora do CMV financeiro?'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Esta ação altera <strong className="text-foreground">{previa.linhas.length}</strong> {previa.linhas.length === 1 ? 'linha' : 'linhas'} de{' '}
                  <strong className="text-foreground">{previa.titulos}</strong> {previa.titulos === 1 ? 'boleto' : 'boletos'}, somando{' '}
                  <strong className="tabular-nums text-foreground">{formatarCentavos(previa.centavos)}</strong>.
                </p>
                <p>Só a decisão do CMV muda: valor, categoria, cobrança e pagamento dos boletos ficam como estão. A alteração fica registrada na auditoria e pode ser revertida linha a linha.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cmv-lote-justificativa" className="text-xs text-muted-foreground">Observação para a auditoria (opcional)</Label>
            <Textarea id="cmv-lote-justificativa" value={justificativa} onChange={e => setJustificativa(e.target.value)} maxLength={300} rows={2} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={salvando !== null} onClick={e => { e.preventDefault(); void aplicarLote(); }}>
              {salvando === 'lote' ? 'Aplicando…' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
