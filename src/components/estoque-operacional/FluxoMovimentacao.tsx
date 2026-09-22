import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, Loader2, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useScopedToast } from '@/hooks/useScopedToast';
import {
  chaveRequisicao,
  formatarQuantidade,
  parseQuantidade,
  validarQuantidade,
  type MovimentacaoOperacionalRegistrada,
  type MovimentacaoOperacionalTipo,
  type ProdutoOperacional,
  type SetorOperacional,
} from '@/domain/estoque/operacional';
import type { useMovimentacaoOperacional } from '@/hooks/useMovimentacaoOperacional';
import LeitorCodigoBarras from './LeitorCodigoBarras';
import ProdutoPickerOperacional from './ProdutoPickerOperacional';
import QuantidadeStepper from './QuantidadeStepper';

type Passo = 'leitor' | 'setor' | 'produto' | 'setor-do-codigo' | 'quantidade' | 'sucesso';

interface Props {
  tipo: MovimentacaoOperacionalTipo;
  setores: SetorOperacional[];
  dados: ReturnType<typeof useMovimentacaoOperacional>;
  onVoltarInicio: () => void;
  onRegistrado: () => void;
}

const TITULOS: Record<MovimentacaoOperacionalTipo, string> = {
  ENTRADA: 'Entrada de Estoque',
  SAIDA: 'Saída de Estoque',
};

/** Semente do identificador de confirmação — troca a cada lançamento novo. */
function novaSemente(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function FluxoMovimentacao({
  tipo, setores, dados, onVoltarInicio, onRegistrado,
}: Props) {
  const toast = useScopedToast();
  const isSaida = tipo === 'SAIDA';

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

  // Estado do leitor
  const [lendo, setLendo] = useState(false);
  const [avisoLeitor, setAvisoLeitor] = useState<string | undefined>();
  const [setoresDoCodigo, setSetoresDoCodigo] = useState<SetorOperacional[]>([]);
  const [focoLeitor, setFocoLeitor] = useState(0);

  // A semente só troca quando um lançamento novo começa; a chave enviada ao
  // servidor combina a semente com a identidade da operação.
  const [semente, setSemente] = useState(novaSemente);

  const quantidade = useMemo(() => parseQuantidade(quantidadeTexto), [quantidadeTexto]);

  // Chave derivada, não estado: repetir a MESMA confirmação depois de uma falha
  // de rede reaproveita a chave (o servidor devolve o lançamento original em vez
  // de duplicar), mas trocar de produto/setor/tipo/quantidade gera chave nova.
  // Guardar a chave em estado deixava o id de uma confirmação que falhou preso
  // no próximo produto — e um envio que o servidor já tinha gravado, mas cuja
  // resposta se perdeu, devolvia "sucesso" sem registrar nada para o item novo.
  const requestId = useMemo(
    () => chaveRequisicao(
      semente,
      produto?.produtoId ?? '',
      setor?.setorId ?? '',
      tipo,
      quantidade,
    ),
    [semente, produto, setor, tipo, quantidade],
  );
  const validacao = useMemo(
    () => validarQuantidade(quantidade, tipo, produto?.saldo ?? 0, produto?.unidadeMedida ?? ''),
    [quantidade, tipo, produto],
  );

  // Erro de quantidade só aparece depois de uma tentativa de confirmar; avisar
  // enquanto a pessoa ainda digita é ruído.
  const [tentouConfirmar, setTentouConfirmar] = useState(false);
  useEffect(() => { setTentouConfirmar(false); }, [quantidadeTexto]);

  const selecionarProduto = useCallback((p: ProdutoOperacional) => {
    setProduto(p);
    setQuantidadeTexto('1');
    setPasso('quantidade');
  }, []);

  // ─── Leitura de código de barras ───
  const processarLeitura = useCallback(async (codigo: string) => {
    setLendo(true);
    setAvisoLeitor(undefined);
    const res = await dados.buscarPorBarcode(codigo);
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

  const irParaManual = useCallback(() => {
    setAvisoLeitor(undefined);
    setProduto(null);
    setSetoresDoCodigo([]);
    setSetor(setorUnico);
    setPasso(passoManualInicial);
  }, [setorUnico, passoManualInicial]);

  const irParaLeitor = useCallback(() => {
    setAvisoLeitor(undefined);
    setProduto(null);
    setPasso('leitor');
    setFocoLeitor(t => t + 1);
  }, []);

  const confirmar = useCallback(async () => {
    if (salvando || !produto || !setor) return;
    setTentouConfirmar(true);
    if (!validacao.valida || quantidade === null) return;

    setSalvando(true);
    const res = await dados.registrar({
      produtoId: produto.produtoId,
      setorId: setor.setorId,
      tipo,
      quantidade,
      observacao,
      clientRequestId: requestId,
    });
    setSalvando(false);

    if (!res.ok) {
      toast.error(res.erro);
      return;
    }

    setResultado(res.resultado);
    setPasso('sucesso');
    onRegistrado();
  }, [salvando, produto, setor, validacao, quantidade, dados, tipo, observacao, requestId, toast, onRegistrado]);

  /**
   * Volta para o modo que originou o lançamento: quem estava bipando continua
   * bipando, com o campo já focado para o próximo produto.
   */
  const novoLancamento = useCallback((modo: 'leitor' | 'manual') => {
    setProduto(null);
    setQuantidadeTexto('1');
    setObservacao('');
    setResultado(null);
    setSemente(novaSemente());
    setAvisoLeitor(undefined);

    if (modo === 'leitor') {
      setPasso('leitor');
      setFocoLeitor(t => t + 1);
    } else {
      setSetor(setorUnico);
      setPasso(passoManualInicial);
    }
  }, [setorUnico, passoManualInicial]);

  const voltar = useCallback(() => {
    if (passo === 'quantidade' || passo === 'setor-do-codigo') {
      // Se o produto veio do leitor, voltar é voltar ao leitor.
      if (setoresDoCodigo.length > 0 || passo === 'setor-do-codigo') { irParaLeitor(); return; }
      setPasso('produto');
      return;
    }
    if (passo === 'produto' && !setorUnico) { setSetor(null); setPasso('setor'); return; }
    if (passo === 'produto' || passo === 'setor') { irParaLeitor(); return; }
    onVoltarInicio();
  }, [passo, setorUnico, setoresDoCodigo.length, irParaLeitor, onVoltarInicio]);

  const corAcento = isSaida ? 'text-destructive' : 'text-success';
  const fundoAcento = isSaida ? 'bg-destructive-soft' : 'bg-success-soft';
  const Icone = isSaida ? ArrowUp : ArrowDown;

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      {/* Cabeçalho do fluxo */}
      <div className="flex items-center gap-3">
        {passo !== 'sucesso' && (
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
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fundoAcento}`}>
          <Icone className={`h-5 w-5 ${corAcento}`} />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-foreground">{TITULOS[tipo]}</h2>
          {setor && passo !== 'sucesso' && (
            <p className="truncate text-xs text-muted-foreground">
              Setor: <span className="font-medium text-foreground">{setor.nome}</span>
            </p>
          )}
        </div>
      </div>

      {/* Modo padrão — leitor de código de barras */}
      {passo === 'leitor' && (
        <LeitorCodigoBarras
          onLeitura={processarLeitura}
          onLancarManualmente={irParaManual}
          ocupado={lendo}
          aviso={avisoLeitor}
          focoToken={focoLeitor}
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
            De qual setor deseja {isSaida ? 'retirar' : 'lançar'}?
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
            Em qual setor deseja {isSaida ? 'retirar' : 'lançar'} o produto?
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
            destacarSaldo={isSaida}
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
              {produto.sku ? `${produto.sku} · ` : ''}{produto.unidadeMedida}
              {isSaida && ` · Disponível: ${formatarQuantidade(produto.saldo)}`}
            </p>
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
              <><Check className="mr-2 h-5 w-5" /> Confirmar {isSaida ? 'saída' : 'entrada'}</>
            )}
          </Button>
        </section>
      )}

      {/* Passo 4 — sucesso */}
      {passo === 'sucesso' && resultado && (
        <section className="space-y-4">
          <div className={`rounded-xl border p-5 text-center ${isSaida ? 'border-destructive-border bg-destructive-soft' : 'border-success-border bg-success-soft'}`}>
            <CheckCircle2 className={`mx-auto h-12 w-12 ${corAcento}`} />
            <p className={`mt-2 text-sm font-bold uppercase tracking-wide ${corAcento}`}>
              {isSaida ? 'Saída realizada' : 'Entrada realizada'}
            </p>
            <p className={`mt-3 text-4xl font-bold tabular-nums ${corAcento}`}>
              {isSaida ? '−' : '+'}{formatarQuantidade(resultado.quantidade)}
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
              {isSaida ? 'Outra saída manual' : 'Outra entrada manual'}
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={onVoltarInicio} className="h-11 w-full text-sm">
            Voltar ao início
          </Button>
        </section>
      )}
    </div>
  );
}
