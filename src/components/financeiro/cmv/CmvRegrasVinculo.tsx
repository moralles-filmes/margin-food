import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, History, Info, Lightbulb, ListChecks, Search, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import EmptyState from '@/components/ui/EmptyState';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useTravaEnvio } from '@/hooks/useTravaEnvio';
import { includesNormalized } from '@/lib/utils';
import {
  formatarCentavos, formatarPercentual, razaoPercentual, resumirBoleto,
  type CmvContagem, type CmvDecisao,
} from '@/domain/financeiro/cmv';
import {
  CMV_QUERY_ROOT, definirClassificacaoAtiva, definirPadraoCategoria, mensagemErroCmv, useCmvConfig,
  type CmvCategoriaConfig, type CmvSituacao,
} from '@/hooks/useCmvFinanceiro';
import { CmvPainel } from './CmvCards';
import CmvAplicarPadroesDialog from './CmvAplicarPadroesDialog';
import CmvDecisaoToggle from './CmvDecisaoToggle';

// Exemplo ilustrativo fixo — nunca gravado nem misturado aos dados da empresa.
const EXEMPLO = [
  { categoria: 'Peixes', valor: 1200, cmv_incluir: true },
  { categoria: 'Material de escritório', valor: 350, cmv_incluir: false },
  { categoria: 'Bebidas', valor: 600, cmv_incluir: true },
] as const;
const EXEMPLO_TOTAL = 2150;

function ExemploPratico() {
  const resumo = resumirBoleto(EXEMPLO_TOTAL, EXEMPLO);
  return (
    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-muted/40 p-4 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <h3 className="text-base font-semibold text-foreground">Exemplo prático</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Um boleto com três categorias. Só as linhas marcadas com “Sim” entram no cálculo do CMV financeiro.
        </p>
        <p className="mt-2 inline-flex rounded-md bg-neutral-soft px-2 py-1 text-xs font-medium text-neutral">
          Demonstração — não são dados da empresa
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card lg:col-span-6">
        <div className="flex items-center gap-3 border-b border-border p-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Boleto de exemplo</p>
            <p className="text-xs text-muted-foreground">Fornecedor fictício</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">Valor total do boleto</p>
            <p className="text-base font-bold tabular-nums text-foreground">{formatarCentavos(resumo.totalCentavos)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <caption className="sr-only">Rateio do boleto de exemplo</caption>
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">Categoria</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Valor da categoria</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">% do boleto</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Aparecer no CMV financeiro?</th>
              </tr>
            </thead>
            <tbody>
              {EXEMPLO.map(linha => (
                <tr key={linha.categoria} className="border-b border-border last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">{linha.categoria}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarCentavos(linha.valor * 100)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarPercentual(razaoPercentual(linha.valor, EXEMPLO_TOTAL), 1)}</td>
                  <td className="px-3 py-2">
                    <span className={linha.cmv_incluir
                      ? 'inline-flex rounded-md bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-ink'
                      : 'inline-flex rounded-md bg-neutral-soft px-2 py-0.5 text-xs font-semibold text-neutral'}
                    >
                      {linha.cmv_incluir ? 'Sim (entra no CMV)' : 'Não (não entra no CMV)'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex gap-2 rounded-xl bg-primary-soft p-3 text-sm text-primary-ink lg:col-span-3">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1.5">
          <p>Neste exemplo, <strong>{formatarCentavos(resumo.incluidoCentavos)}</strong> (Peixes + Bebidas) entram no CMV e <strong>{formatarCentavos(resumo.foraCentavos)}</strong> (Material de escritório) ficam fora.</p>
          <p>O boleto continua valendo {formatarCentavos(resumo.totalCentavos)} em Contas a Pagar: cobrança e pagamento não mudam.</p>
          <p>Vale igual para um PIX lançado no Livro Razão ou criado pela Conciliação Bancária: cada linha com a sua resposta, na data de competência.</p>
        </div>
      </div>
    </div>
  );
}

interface Props {
  companyId: string | null | undefined;
  canManage: boolean;
  canRevisar: boolean;
  pendentesGeral: CmvContagem | null;
  pendentesGeralPorFonte: { boleto: CmvContagem; lancamento: CmvContagem } | null;
  semCompetencia: CmvContagem | null;
  onAbrirLista: (situacao: CmvSituacao, escopo: 'geral' | 'periodo') => void;
}

export default function CmvRegrasVinculo({ companyId, canManage, canRevisar, pendentesGeral, pendentesGeralPorFonte, semCompetencia, onAbrirLista }: Props) {
  const supabase = useSupabase();
  const toast = useScopedToast();
  const queryClient = useQueryClient();
  const emitDataEvent = useEmitDataEvent();
  const { executar, enviando } = useTravaEnvio();
  const config = useCmvConfig({ companyId, enabled: true });
  const [busca, setBusca] = useState('');
  const [alterando, setAlterando] = useState<string | null>(null);
  const [aplicarAberto, setAplicarAberto] = useState(false);

  const categorias = useMemo(() => {
    const todas = config.data?.categorias ?? [];
    const porId = new Map(todas.map(c => [c.id, c]));
    const termo = busca.trim();
    return todas
      .filter(c => c.ativo || c.cmvSugerir !== null)
      .filter(c => !termo || includesNormalized(c.nome, termo) || includesNormalized(c.codigo ?? '', termo))
      .map(c => ({ ...c, pai: c.parentId ? porId.get(c.parentId)?.nome ?? null : null }));
  }, [config.data, busca]);

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: [...CMV_QUERY_ROOT, 'config'] });
    emitDataEvent('financeiro:cadastros');
  };

  const alterarPadrao = (categoria: CmvCategoriaConfig, sugerir: CmvDecisao) => {
    if (categoria.cmvSugerir === sugerir) return;
    void executar(async () => {
      setAlterando(categoria.id);
      try {
        await definirPadraoCategoria(supabase, categoria.id, sugerir, categoria.updatedAt);
        toast.success(sugerir === null
          ? `${categoria.nome}: padrão removido. Novos lançamentos ficam sem sugestão.`
          : `${categoria.nome}: novos lançamentos virão sugeridos como “${sugerir ? 'Sim' : 'Não'}”.`);
        recarregar();
      } catch (error) {
        toast.error(mensagemErroCmv(error));
        void config.refetch();
      } finally {
        setAlterando(null);
      }
    });
  };

  const alterarAtivacao = (ativo: boolean) => {
    void executar(async () => {
      try {
        await definirClassificacaoAtiva(supabase, ativo);
        toast.success(ativo
          ? 'Classificação ativada: as novas despesas passam a pedir a resposta Sim/Não.'
          : 'Classificação desativada: Contas a Pagar, Lançamentos e Conciliação voltam ao comportamento anterior.');
        recarregar();
        emitDataEvent('financeiro:pagar');
        emitDataEvent('financeiro:lancamentos');
        emitDataEvent('financeiro:conciliacao');
      } catch (error) {
        console.error('[CMV Financeiro] Falha ao alterar a classificação:', error);
        toast.error(mensagemErroCmv(error));
      }
    });
  };

  const ativa = config.data?.classificacaoAtiva ?? false;

  return (
    <div className="space-y-4">
      <CmvPainel titulo={<span className="inline-flex items-center gap-2">Regras de vínculo ao CMV <Info className="h-4 w-4 text-primary-ink" aria-hidden="true" /></span>}>
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          A escolha é feita em cada linha de rateio da despesa — boleto de Contas a Pagar, lançamento do Livro Razão ou linha da Conciliação Bancária. Quando uma despesa tem mais de uma categoria, só as linhas marcadas para aparecer no CMV financeiro entram no cálculo — cada linha com a sua decisão.
        </p>
        <ExemploPratico />
      </CmvPainel>

      <CmvPainel
        titulo={<span className="inline-flex items-center gap-2"><Settings2 className="h-4 w-4 text-primary-ink" aria-hidden="true" />1. Padrão sugerido por categoria</span>}
        acoes={(
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar categoria" aria-label="Buscar categoria" className="h-8 w-52 pl-8 text-sm" />
          </div>
        )}
      >
        <p className="mb-3 text-sm text-muted-foreground">
          O padrão será sugerido em novos lançamentos. Alterações não modificam despesas já cadastradas.
          {!canManage && ' Você pode consultar os padrões; alterar exige a permissão de gerenciar o CMV Financeiro.'}
        </p>
        {config.isPending ? (
          <div className="space-y-2" role="status" aria-label="Carregando categorias">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : config.data === null || config.isError ? (
          <EmptyState title="Não foi possível carregar as categorias" description="Verifique a conexão e tente de novo." actionLabel="Tentar novamente" onAction={() => void config.refetch()} compact />
        ) : categorias.length === 0 ? (
          <EmptyState title={busca.trim() ? 'Nenhuma categoria encontrada' : 'Nenhuma categoria de despesa cadastrada'} compact />
        ) : (
          <div className="max-h-[28rem] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">Padrão sugerido de inclusão no CMV por categoria de despesa</caption>
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Categoria</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Grupo</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Sugerir inclusão no CMV para novos lançamentos</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map(categoria => (
                  <tr key={categoria.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">
                      {categoria.codigo && <span className="mr-1.5 tabular-nums text-muted-foreground">{categoria.codigo}</span>}
                      {categoria.nome}
                      {!categoria.ativo && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">inativa</span>}
                    </th>
                    <td className="px-3 py-2 text-muted-foreground">{categoria.pai ?? categoria.grupo ?? '—'}</td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <CmvDecisaoToggle
                            size="sm" value={categoria.cmvSugerir} disabled={enviando}
                            onChange={v => alterarPadrao(categoria, v)}
                            label={`Sugerir inclusão no CMV — ${categoria.nome}`}
                          />
                          {categoria.cmvSugerir === null ? (
                            <span className="text-xs text-muted-foreground">Sem padrão: a decisão nasce em branco</span>
                          ) : (
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={enviando} onClick={() => alterarPadrao(categoria, null)}>
                              Remover padrão
                            </Button>
                          )}
                          {alterando === categoria.id && <span className="text-xs text-muted-foreground">Salvando…</span>}
                        </span>
                      ) : (
                        <span>{categoria.cmvSugerir === true ? 'Sim' : categoria.cmvSugerir === false ? 'Não' : 'Sem padrão'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CmvPainel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CmvPainel titulo={<span className="inline-flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary-ink" aria-hidden="true" />2. Decisão em cada lançamento</span>}>
          <p className="text-sm text-muted-foreground">
            A resposta “Aparecer no CMV financeiro?” fica gravada em cada linha da despesa e é ela que a apuração usa. Edite em Contas a Pagar, no Livro Razão ou clique numa categoria do relatório para conferir as despesas.
          </p>
          <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-border p-3">
            <div>
              <Label htmlFor="cmv-ativar" className="text-sm font-semibold text-foreground">Pedir a resposta nas novas despesas</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ativa
                  ? 'Ativo: Contas a Pagar exige Sim ou Não em cada linha de um boleto novo; Lançamentos e a Conciliação mostram a pergunta já preenchida pelo padrão da categoria, sem travar o salvar.'
                  : 'Desativado: Contas a Pagar, Lançamentos e Conciliação funcionam como antes e as despesas novas ficam pendentes de classificação.'}
              </p>
            </div>
            <Switch id="cmv-ativar" checked={ativa} disabled={!canManage || enviando || config.isPending || !config.data} onCheckedChange={alterarAtivacao} />
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => onAbrirLista('todos', 'periodo')}>
            Conferir lançamentos do período
          </Button>
        </CmvPainel>

        <CmvPainel titulo={<span className="inline-flex items-center gap-2"><History className="h-4 w-4 text-primary-ink" aria-hidden="true" />3. Revisão do histórico</span>}>
          <p className="text-sm text-muted-foreground">
            Nada do histórico é classificado sem alguém confirmar. Aplique o padrão da categoria às pendentes (com prévia) ou revise linha a linha; cada alteração fica na auditoria com o antes e o depois.
            {!canRevisar && ' Aplicar em lote exige a permissão de gerenciar o CMV Financeiro.'}
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3">
              <dt className="text-xs text-muted-foreground">Pendentes de classificação (todo o histórico)</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{pendentesGeral ? pendentesGeral.titulos : '—'}</dd>
              <dd className="text-xs tabular-nums text-muted-foreground">{pendentesGeral ? formatarCentavos(pendentesGeral.centavos) : ''}</dd>
              {pendentesGeralPorFonte && (
                <dd className="text-xs tabular-nums text-muted-foreground">
                  {pendentesGeralPorFonte.boleto.titulos} {pendentesGeralPorFonte.boleto.titulos === 1 ? 'boleto' : 'boletos'} ·{' '}
                  {pendentesGeralPorFonte.lancamento.titulos} {pendentesGeralPorFonte.lancamento.titulos === 1 ? 'lançamento' : 'lançamentos'}
                </dd>
              )}
            </div>
            <div className="rounded-xl border border-border p-3">
              <dt className="text-xs text-muted-foreground">Sem data de competência</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{semCompetencia ? semCompetencia.titulos : '—'}</dd>
              <dd className="text-xs text-muted-foreground">Ainda não podem ser atribuídos a um período</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onAbrirLista('pendente', 'geral')}>Revisar pendências</Button>
            {canRevisar && (
              <Button type="button" variant="outline" size="sm" onClick={() => setAplicarAberto(true)}>Aplicar padrões às pendentes</Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => onAbrirLista('sem_competencia', 'geral')}>Ver boletos sem competência</Button>
          </div>
        </CmvPainel>
      </div>

      <CmvAplicarPadroesDialog
        open={aplicarAberto}
        onOpenChange={setAplicarAberto}
        onAplicado={() => {
          void queryClient.invalidateQueries({ queryKey: CMV_QUERY_ROOT });
          emitDataEvent('financeiro:pagar');
          emitDataEvent('financeiro:lancamentos');
        }}
      />
    </div>
  );
}
