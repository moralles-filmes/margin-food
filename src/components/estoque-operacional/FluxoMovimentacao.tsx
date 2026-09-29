import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Check, CheckCircle2, ListPlus, Loader2, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useScopedToast } from '@/hooks/useScopedToast';
import LeitorCamera from '@/components/camera/LeitorCamera';
import { mensagemBarcodeInvalido, validarBarcode } from '@/domain/estoque/barcode';
import {
  chaveRequisicao,
  formatarQuantidade,
  LOTE_MAXIMO_ITENS,
  parseQuantidade,
  quantidadeParaCampo,
  validarQuantidade,
  type MovimentacaoOperacionalRegistrada,
  type ProdutoOperacional,
  type SetorOperacional,
} from '@/domain/estoque/operacional';
import {
  adicionarAoLote,
  alterarQuantidadeNoLote,
  chaveItemLote,
  quantidadeNoLote,
  removerDoLote,
  validarQuantidadeNoLote,
  type ItemSaidaLote,
} from '@/domain/estoque/operacionalLote';
import type { useMovimentacaoOperacional } from '@/hooks/useMovimentacaoOperacional';
import LeitorCodigoBarras from './LeitorCodigoBarras';
import ProdutoPickerOperacional from './ProdutoPickerOperacional';
import QuantidadeStepper from './QuantidadeStepper';
import { ResumoLote, RevisaoLote, SucessoLote } from './SaidaLote';

type Passo = 'leitor' | 'setor' | 'produto' | 'setor-do-codigo' | 'quantidade' | 'revisao' | 'sucesso';

/** Passos em que a lista em andamento aparece no topo, com o atalho para revisar. */
const PASSOS_COM_RESUMO: Passo[] = ['leitor', 'setor', 'produto', 'setor-do-codigo'];

function semErro(erros: Record<string, string>, id: string): Record<string, string> {
  if (!(id in erros)) return erros;
  const resto = { ...erros };
  delete resto[id];
  return resto;
}

interface Props {
  setores: SetorOperacional[];
  dados: ReturnType<typeof useMovimentacaoOperacional>;
  onRegistrado: () => void;
}

/** Semente do identificador de confirmação — troca a cada lançamento novo. */
function novaSemente(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Fluxo de saída de estoque. O operacional não registra entrada: ela é lançada
 * no Controle de Estoque (módulo administrativo), e o banco recusa outro tipo.
 *
 * Um item só é confirmado direto na tela de quantidade. Para vários, o operador
 * toca "Adicionar mais itens": o item vai para uma lista, o leitor volta, e a
 * lista é conferida e confirmada de uma vez (`op_registrar_saidas_lote`, tudo
 * ou nada).
 */
export default function FluxoMovimentacao({ setores, dados, onRegistrado }: Props) {
  const toast = useScopedToast();

  // Com um setor só autorizado, pular a escolha é o comportamento certo:
  // perguntar algo que tem uma única resposta é um clique desperdiçado.
  const setorUnico = setores.length === 1 ? setores[0] : null;

  /** O passo inicial do modo manual, respeitando o atalho de setor único. */
  const passoManualInicial: Passo = setorUnico ? 'produto' : 'setor';

  // O leitor é o modo padrão: é o caminho de maior volume na operação.
  const [passo, setPasso] = useState<Passo>('leitor');
  const [setor, setSetor] = useState<SetorOperacional | null>(setorUnico);
  const [produto, setProduto] = useState<ProdutoOperacional | null>(null);
  const [quantidadeTexto, setQuantidadeTexto] = useState('1');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<MovimentacaoOperacionalRegistrada | null>(null);

  // Saída com vários itens. A lista só existe na tela até ser confirmada; nada
  // é gravado antes disso. `editandoId` reaproveita o passo de quantidade para
  // alterar um item da lista.
  const [itensLote, setItensLote] = useState<ItemSaidaLote[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [errosLote, setErrosLote] = useState<Record<string, string>>({});
  const [resultadosLote, setResultadosLote] = useState<MovimentacaoOperacionalRegistrada[] | null>(null);

  // Estado do leitor
  const [lendo, setLendo] = useState(false);
  const [avisoLeitor, setAvisoLeitor] = useState<string | undefined>();
  const [setoresDoCodigo, setSetoresDoCodigo] = useState<SetorOperacional[]>([]);
  const [focoLeitor, setFocoLeitor] = useState(0);
  // De onde veio o produto em lançamento: decide para onde o Voltar leva. Não
  // dá para inferir por `setoresDoCodigo`, que só é preenchido com vários setores.
  const [origemProduto, setOrigemProduto] = useState<'leitor' | 'manual'>('leitor');
  // A câmera fica montada entre as operações (escondida e pausada fora do
  // leitor): reabrir a cada item custaria ligar a câmera e o leitor de novo.
  const [cameraAberta, setCameraAberta] = useState(false);

  // A semente só troca quando um lançamento novo começa; a chave enviada ao
  // servidor combina a semente com a identidade da operação.
  const [semente, setSemente] = useState(novaSemente);

  const quantidade = useMemo(() => parseQuantidade(quantidadeTexto), [quantidadeTexto]);

  // Chave derivada, não estado: repetir a MESMA confirmação depois de uma falha
  // de rede reaproveita a chave (o servidor devolve o lançamento original em vez
  // de duplicar), mas trocar de produto/setor/quantidade gera chave nova.
  // Guardar a chave em estado deixava o id de uma confirmação que falhou preso
  // no próximo produto — e um envio que o servidor já tinha gravado, mas cuja
  // resposta se perdeu, devolvia "sucesso" sem registrar nada para o item novo.
  const requestId = useMemo(
    () => chaveRequisicao(
      semente,
      produto?.produtoId ?? '',
      setor?.setorId ?? '',
      quantidade,
    ),
    [semente, produto, setor, quantidade],
  );
  // Com a lista em andamento, o saldo disponível desconta o que ela já retira
  // do mesmo produto (em qualquer setor — o saldo é um só).
  const validacao = useMemo(
    () => (produto
      ? validarQuantidadeNoLote(quantidade, produto, itensLote, editandoId ?? undefined)
      : validarQuantidade(quantidade, 0, '')),
    [quantidade, produto, itensLote, editandoId],
  );
  const produtoNaLista = produto ? quantidadeNoLote(itensLote, produto.produtoId, editandoId ?? undefined) : 0;

  // Erro de quantidade só aparece depois de uma tentativa de confirmar; avisar
  // enquanto a pessoa ainda digita é ruído.
  const [tentouConfirmar, setTentouConfirmar] = useState(false);
  useEffect(() => { setTentouConfirmar(false); }, [quantidadeTexto]);

  const selecionarProduto = useCallback((p: ProdutoOperacional) => {
    setProduto(p);
    setOrigemProduto('manual');
    setQuantidadeTexto('1');
    setPasso('quantidade');
  }, []);

  // ─── Leitura de código de barras ───
  //
  // Cada leitura leva um número; sair do leitor com a busca em voo (ex.:
  // "Lançar manualmente" com a rede lenta) invalida o número. Sem isso, a
  // resposta atrasada trocava produto, setor e quantidade do lançamento manual
  // que o operador já estava preenchendo — e a confirmação gravava o item errado.
  const leituraAtualRef = useRef(0);
  const descartarLeituraEmVoo = useCallback(() => {
    leituraAtualRef.current += 1;
    setLendo(false);
  }, []);

  const processarLeitura = useCallback(async (codigo: string) => {
    const leitura = ++leituraAtualRef.current;
    setLendo(true);
    setAvisoLeitor(undefined);
    const res = await dados.buscarPorBarcode(codigo);
    if (leitura !== leituraAtualRef.current) return;
    setLendo(false);

    if (res.status === 'erro') {
      setAvisoLeitor(res.erro);
      return;
    }
    if (res.status === 'nao_encontrado') {
      // O operador não cadastra produto: a mensagem manda procurar quem cadastra.
      setAvisoLeitor(
        `Produto não encontrado para o código ${codigo}. `
        + 'Procure um responsável para cadastrar o código deste produto.',
      );
      return;
    }
    if (res.status === 'sem_acesso_ao_setor') {
      setAvisoLeitor(
        'Este produto existe, mas só nos setores que você não tem autorização para movimentar.',
      );
      return;
    }

    setProduto(res.produto);
    setOrigemProduto('leitor');
    setQuantidadeTexto('1');

    // Um setor acessível resolve sozinho; vários exigem a escolha, que é rápida
    // mas não pode ser adivinhada — o lançamento iria para o setor errado.
    if (res.setores.length === 1) {
      setSetor(res.setores[0]);
      setPasso('quantidade');
    } else {
      setSetoresDoCodigo(res.setores);
      setPasso('setor-do-codigo');
    }
  }, [dados]);

  // Mesma validação do leitor HID, mas sem a janela anti-repique dele: o
  // filtro da câmera já segura o código parado na frente da lente, e somar as
  // duas janelas impediria duas saídas seguidas do mesmo produto. A câmera só
  // abre o passo de quantidade — registrar continua exigindo o toque.
  const lerDaCamera = useCallback((raw: string) => {
    if (passo !== 'leitor' || lendo) return;
    const { valido, codigo, motivo } = validarBarcode(raw);
    if (!valido) {
      setAvisoLeitor(mensagemBarcodeInvalido(motivo!));
      return;
    }
    // iPhone não deixa site vibrar; lá a confirmação é a tela de quantidade abrindo.
    navigator.vibrate?.(80);
    void processarLeitura(codigo);
  }, [passo, lendo, processarLeitura]);

  const fecharCamera = useCallback(() => setCameraAberta(false), []);

  const irParaManual = useCallback(() => {
    descartarLeituraEmVoo();
    // Quem saiu do leitor não precisa da câmera ligada por trás da lista.
    setCameraAberta(false);
    setAvisoLeitor(undefined);
    setProduto(null);
    setSetoresDoCodigo([]);
    setSetor(setorUnico);
    setPasso(passoManualInicial);
  }, [descartarLeituraEmVoo, setorUnico, passoManualInicial]);

  const irParaLeitor = useCallback(() => {
    descartarLeituraEmVoo();
    setAvisoLeitor(undefined);
    setProduto(null);
    setPasso('leitor');
    setFocoLeitor(t => t + 1);
  }, [descartarLeituraEmVoo]);

  const confirmar = useCallback(async () => {
    if (salvando || !produto || !setor) return;
    setTentouConfirmar(true);
    if (!validacao.valida || quantidade === null) return;

    setSalvando(true);
    const res = await dados.registrar({
      produtoId: produto.produtoId,
      setorId: setor.setorId,
      quantidade,
      observacao,
      clientRequestId: requestId,
    });
    setSalvando(false);

    // Comparação explícita: com `strict: false` o `!res.ok` não estreita a união.
    if (res.ok === false) {
      toast.error(res.erro);
      return;
    }

    setResultado(res.resultado);
    setPasso('sucesso');
    onRegistrado();
  }, [salvando, produto, setor, validacao, quantidade, dados, observacao, requestId, toast, onRegistrado]);

  // ─── Saída com vários itens ───

  /** Próximo item da lista, no mesmo modo em que o anterior foi escolhido. */
  const seguirAdicionando = useCallback(() => {
    setEditandoId(null);
    if (origemProduto === 'manual' && setor) {
      setProduto(null);
      setAvisoLeitor(undefined);
      setPasso('produto');
      return;
    }
    irParaLeitor();
  }, [origemProduto, setor, irParaLeitor]);

  const adicionarItemAtual = useCallback((depois: 'continuar' | 'revisar') => {
    if (salvando || !produto || !setor) return;
    setTentouConfirmar(true);
    if (!validacao.valida || quantidade === null) return;

    const { itens, somadoEm } = adicionarAoLote(itensLote, {
      id: novaSemente(), produto, setor, quantidade,
    });
    if (itens.length > LOTE_MAXIMO_ITENS) {
      toast.error(`Uma saída pode ter no máximo ${LOTE_MAXIMO_ITENS} itens. Confirme esta e comece outra.`);
      return;
    }

    setItensLote(itens);
    if (somadoEm) {
      setErrosLote(e => semErro(e, somadoEm));
      toast.success(`${produto.nome}: quantidade somada ao item que já estava na lista.`);
    }
    setQuantidadeTexto('1');
    setTentouConfirmar(false);

    if (depois === 'revisar') {
      setProduto(null);
      setPasso('revisao');
      return;
    }
    seguirAdicionando();
  }, [salvando, produto, setor, validacao, quantidade, itensLote, toast, seguirAdicionando]);

  const revisarLote = useCallback(() => {
    descartarLeituraEmVoo();
    setAvisoLeitor(undefined);
    setProduto(null);
    setPasso('revisao');
  }, [descartarLeituraEmVoo]);

  const editarItemLote = useCallback((item: ItemSaidaLote) => {
    setEditandoId(item.id);
    setProduto(item.produto);
    setSetor(item.setor);
    setQuantidadeTexto(quantidadeParaCampo(item.quantidade));
    setPasso('quantidade');
  }, []);

  const encerrarEdicao = useCallback(() => {
    setEditandoId(null);
    setProduto(null);
    setQuantidadeTexto('1');
    setPasso('revisao');
  }, []);

  const salvarEdicao = useCallback(() => {
    if (!editandoId) return;
    setTentouConfirmar(true);
    if (!validacao.valida || quantidade === null) return;

    setItensLote(itens => alterarQuantidadeNoLote(itens, editandoId, quantidade));
    setErrosLote(e => semErro(e, editandoId));
    encerrarEdicao();
  }, [editandoId, validacao, quantidade, encerrarEdicao]);

  const removerItemLote = useCallback((item: ItemSaidaLote) => {
    const restantes = removerDoLote(itensLote, item.id);
    setItensLote(restantes);
    setErrosLote(e => semErro(e, item.id));
    if (restantes.length === 0) seguirAdicionando();
  }, [itensLote, seguirAdicionando]);

  const descartarLote = useCallback(() => {
    setItensLote([]);
    setErrosLote({});
    setObservacao('');
    setSemente(novaSemente());
    setEditandoId(null);
    irParaLeitor();
  }, [irParaLeitor]);

  const confirmarLote = useCallback(async () => {
    if (salvando || itensLote.length === 0) return;

    setSalvando(true);
    setErrosLote({});
    const res = await dados.registrarLote({
      itens: itensLote.map(item => ({
        produtoId: item.produto.produtoId,
        setorId: item.setor.setorId,
        quantidade: item.quantidade,
        clientRequestId: chaveItemLote(semente, item),
      })),
      observacao,
    });
    setSalvando(false);

    if (res.ok === false) {
      const recusado = res.indice !== null ? itensLote[res.indice] : undefined;
      if (recusado) {
        // Recusa de um item desfaz a lista inteira no servidor: dizer isso evita
        // o operador achar que os outros itens já saíram.
        setErrosLote({ [recusado.id]: res.erro });
        toast.error(`${recusado.produto.nome}: ${res.erro} Nenhum item foi registrado.`);
      } else {
        toast.error(res.erro);
      }
      return;
    }

    setResultadosLote(res.resultados);
    setPasso('sucesso');
    onRegistrado();
  }, [salvando, itensLote, dados, semente, observacao, toast, onRegistrado]);

  /**
   * Volta para o modo que originou o lançamento: quem estava bipando continua
   * bipando, com o campo já focado para o próximo produto.
   */
  const novoLancamento = useCallback((modo: 'leitor' | 'manual') => {
    setProduto(null);
    setQuantidadeTexto('1');
    setObservacao('');
    setResultado(null);
    setItensLote([]);
    setErrosLote({});
    setResultadosLote(null);
    setEditandoId(null);
    setSemente(novaSemente());
    setAvisoLeitor(undefined);

    if (modo === 'leitor') {
      setPasso('leitor');
      setFocoLeitor(t => t + 1);
    } else {
      setCameraAberta(false);
      setSetor(setorUnico);
      setPasso(passoManualInicial);
    }
  }, [setorUnico, passoManualInicial]);

  const voltar = useCallback(() => {
    // Alterando um item da lista: voltar desiste da alteração.
    if (passo === 'quantidade' && editandoId) { encerrarEdicao(); return; }
    if (passo === 'revisao') { seguirAdicionando(); return; }
    // Se o produto veio do leitor, voltar é voltar ao leitor.
    if (passo === 'setor-do-codigo' || (passo === 'quantidade' && origemProduto === 'leitor')) {
      irParaLeitor();
      return;
    }
    if (passo === 'quantidade') { setPasso('produto'); return; }
    if (passo === 'produto' && !setorUnico) { setSetor(null); setPasso('setor'); return; }
    irParaLeitor();
  }, [passo, editandoId, origemProduto, setorUnico, irParaLeitor, encerrarEdicao, seguirAdicionando]);

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      {/* Cabeçalho do fluxo. O leitor é a tela inicial do módulo: não há para onde voltar. */}
      <div className="flex items-center gap-3">
        {passo !== 'sucesso' && passo !== 'leitor' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={voltar}
            // Sair da tela com a confirmação em voo deixaria a resposta chegando
            // para um produto que não está mais selecionado.
            disabled={salvando}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive-soft">
          <ArrowUp className="h-5 w-5 text-destructive" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-foreground">Saída de Estoque</h2>
          {/* Na revisão cada item mostra o próprio setor. */}
          {setor && passo !== 'sucesso' && passo !== 'revisao' && (
            <p className="truncate text-xs text-muted-foreground">
              Setor: <span className="font-medium text-foreground">{setor.nome}</span>
            </p>
          )}
        </div>
      </div>

      {itensLote.length > 0 && PASSOS_COM_RESUMO.includes(passo) && (
        <ResumoLote itens={itensLote} onRevisar={revisarLote} />
      )}

      {/* Fora do bloco do leitor, que desmonta a cada passo: a câmera segue
          ligada (escondida e pausada) até o próximo "Ler próximo código". */}
      {cameraAberta && (
        <LeitorCamera
          pausado={passo !== 'leitor' || lendo}
          oculto={passo !== 'leitor'}
          onCodigo={lerDaCamera}
          onFechar={fecharCamera}
        />
      )}

      {/* Modo padrão — leitor de código de barras */}
      {passo === 'leitor' && (
        <LeitorCodigoBarras
          onLeitura={processarLeitura}
          onLancarManualmente={irParaManual}
          ocupado={lendo}
          aviso={avisoLeitor}
          focoToken={focoLeitor}
          cameraAberta={cameraAberta}
          onAbrirCamera={() => setCameraAberta(true)}
        />
      )}

      {/* Código lido em mais de um setor acessível */}
      {passo === 'setor-do-codigo' && produto && (
        <section className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-base font-semibold text-foreground">{produto.nome}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {produto.sku ? `${produto.sku} · ` : ''}{produto.unidadeMedida}
            </p>
          </div>
          <p className="text-sm font-medium text-foreground">
            De qual setor deseja retirar?
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {setoresDoCodigo.map(s => (
              <li key={s.setorId}>
                <button
                  type="button"
                  onClick={() => { setSetor(s); setPasso('quantidade'); }}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left text-base font-semibold text-foreground transition-colors hover:border-primary hover:bg-background-subtle"
                >
                  {s.nome}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Passo 1 — setor */}
      {passo === 'setor' && (
        <section className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            Em qual setor deseja retirar o produto?
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {setores.map(s => (
              <li key={s.setorId}>
                <button
                  type="button"
                  onClick={() => { setSetor(s); setPasso('produto'); }}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left text-base font-semibold text-foreground transition-colors hover:border-primary hover:bg-background-subtle"
                >
                  {s.nome}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Passo 2 — produto */}
      {passo === 'produto' && setor && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-background-subtle px-3 py-2">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Setor atual: <span className="text-foreground">{setor.nome}</span>
            </p>
            {!setorUnico && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 text-xs"
                onClick={() => { setSetor(null); setPasso('setor'); }}
              >
                Trocar
              </Button>
            )}
          </div>
          <ProdutoPickerOperacional
            setorId={setor.setorId}
            setorNome={setor.nome}
            buscarProdutos={dados.buscarProdutos}
            onSelecionar={selecionarProduto}
          />
          <Button
            type="button"
            variant="outline"
            onClick={irParaLeitor}
            className="h-12 w-full rounded-xl text-base"
          >
            <ScanLine className="mr-2 h-5 w-5" />
            Usar leitor de código de barras
          </Button>
        </section>
      )}

      {/* Passo 3 — quantidade e confirmação */}
      {passo === 'quantidade' && produto && setor && (
        <section className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-base font-semibold text-foreground">{produto.nome}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {produto.sku ? `${produto.sku} · ` : ''}{produto.unidadeMedida} · Disponível: {formatarQuantidade(produto.saldo)}
            </p>
            {produtoNaLista > 0 && (
              <p className="mt-1 text-xs font-medium text-primary-ink">
                Já na lista: {formatarQuantidade(produtoNaLista)} {produto.unidadeMedida}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">Quantidade</Label>
            <QuantidadeStepper
              valorTexto={quantidadeTexto}
              onValorTextoChange={setQuantidadeTexto}
              valor={quantidade}
              unidade={produto.unidadeMedida}
              erro={tentouConfirmar ? validacao.erro : undefined}
              disabled={salvando}
            />
          </div>

          {editandoId ? (
            <Button
              type="button"
              onClick={salvarEdicao}
              className="h-14 w-full rounded-xl bg-primary-strong text-base font-semibold text-primary-foreground"
            >
              <Check className="mr-2 h-5 w-5" /> Salvar quantidade
            </Button>
          ) : itensLote.length === 0 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="op-observacao" className="text-sm font-medium text-foreground">
                  Observação <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="op-observacao"
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  maxLength={500}
                  disabled={salvando}
                  className="h-11"
                />
              </div>

              <Button
                type="button"
                onClick={confirmar}
                disabled={salvando}
                className="h-14 w-full rounded-xl bg-primary-strong text-base font-semibold text-primary-foreground"
              >
                {salvando ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Registrando…</>
                ) : (
                  <><Check className="mr-2 h-5 w-5" /> Confirmar saída</>
                )}
              </Button>

              {/* Entrada para a saída com vários itens: este vai para a lista e o leitor volta. */}
              <Button
                type="button"
                variant="outline"
                onClick={() => adicionarItemAtual('continuar')}
                disabled={salvando}
                className="h-12 w-full rounded-xl text-base"
              >
                <ListPlus className="mr-2 h-5 w-5" />
                Adicionar mais itens
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                onClick={() => adicionarItemAtual('continuar')}
                className="h-14 w-full rounded-xl bg-primary-strong text-base font-semibold text-primary-foreground"
              >
                <ListPlus className="mr-2 h-5 w-5" />
                {origemProduto === 'leitor' ? 'Adicionar e ler próximo' : 'Adicionar e escolher outro'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => adicionarItemAtual('revisar')}
                className="h-12 w-full rounded-xl text-base"
              >
                Adicionar e revisar a saída
              </Button>
            </>
          )}
        </section>
      )}

      {/* Conferência da saída com vários itens */}
      {passo === 'revisao' && (
        <RevisaoLote
          itens={itensLote}
          erros={errosLote}
          observacao={observacao}
          onObservacaoChange={setObservacao}
          salvando={salvando}
          onConfirmar={confirmarLote}
          onEditar={editarItemLote}
          onRemover={removerItemLote}
          onAdicionarMais={seguirAdicionando}
          onDescartar={descartarLote}
        />
      )}

      {/* Passo 4 — sucesso */}
      {passo === 'sucesso' && (resultado || resultadosLote) && (
        <section className="space-y-4">
          {resultadosLote ? (
            <SucessoLote resultados={resultadosLote} />
          ) : resultado && (
            <div className="rounded-xl border border-destructive-border bg-destructive-soft p-5 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-destructive" />
              <p className="mt-2 text-sm font-bold uppercase tracking-wide text-destructive">
                Saída realizada
              </p>
              <p className="mt-3 text-4xl font-bold tabular-nums text-destructive">
                −{formatarQuantidade(resultado.quantidade)}
              </p>
              <p className="mt-2 text-base font-semibold text-foreground">{resultado.produtoNome}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Setor: {resultado.setor} · Saldo agora: {formatarQuantidade(resultado.saldoNovo)} {resultado.unidadeMedida}
              </p>
              {resultado.idempotente && (
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  Este lançamento já havia sido registrado — nada foi duplicado.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              onClick={() => novoLancamento('leitor')}
              className="h-12 rounded-xl bg-primary-strong text-base font-semibold text-primary-foreground"
            >
              <ScanLine className="mr-2 h-5 w-5" />
              Ler próximo código
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => novoLancamento('manual')}
              className="h-12 rounded-xl text-base"
            >
              Outra saída manual
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
