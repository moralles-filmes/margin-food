import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, CheckCircle2, ListChecks, Loader2, Minus, Plus, ScanLine, Search, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LeitorCamera from '@/components/camera/LeitorCamera';
import type {
  AjusteContagemResult, BarcodeLookupResult, Inventario, InventarioItem, OpcoesAjusteContagem,
} from '@/hooks/useInventarioStore';
import { useContagemPorCodigo, type ProdutoLido } from '@/hooks/useContagemPorCodigo';
import { ajustarQuantidade, formatarQuantidade, parseQuantidade, quantidadeParaCampo } from '@/domain/estoque/operacional';
import {
  decidirBuscaAutomatica, ESPERA_BUSCA_AUTOMATICA_MS, ESPERA_BUSCA_AUTOMATICA_PREFIXO_MS, normalizarBarcode,
} from '@/domain/estoque/barcode';
import { formatDisplayBR } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';

interface Props {
  inventario: Inventario;
  itens: InventarioItem[];
  canCount: boolean;
  onBack: () => void;
  onVerListaCompleta: () => void;
  onFinalizar: () => void;
  buscarPorBarcode: (inventarioId: string, barcode: string) => Promise<BarcodeLookupResult>;
  ajustarContagem: (itemId: string, deltaBase: number, opcoes: OpcoesAjusteContagem) => Promise<AjusteContagemResult>;
  /** Códigos cadastrados dos produtos do inventário, para a busca automática. */
  listarCodigos: (inventarioId: string) => Promise<string[]>;
}

interface Aviso {
  tom: 'sucesso' | 'alerta' | 'erro';
  texto: string;
}

const STATUS_LABEL: Record<Inventario['status'], string> = {
  RASCUNHO: 'Rascunho',
  EM_CONTAGEM: 'Em contagem',
  EM_REVISAO: 'Em revisão',
  SOB_ANALISE: 'Sob análise',
  FINALIZADO: 'Finalizado',
};

const ESTILO_AVISO: Record<Aviso['tom'], string> = {
  sucesso: 'border-success-border bg-success-soft',
  alerta: 'border-warning-border bg-warning-soft',
  erro: 'border-destructive-border bg-destructive-soft',
};

/**
 * Contagem via código em dois passos: ler o código e depois informar a
 * quantidade daquele produto. O código chega pelo leitor HID (que manda Enter),
 * ou digitado: teclado numérico de celular/tablet não tem Enter, então um
 * código de barras (GTIN) cadastrado completo é buscado sozinho e o botão
 * Buscar cobre o resto (ver decidirBuscaAutomatica). A câmera (LeitorCamera)
 * entrega o código pelo mesmo buscarCodigo.
 *
 * Leitor próprio em vez do LeitorCodigoBarras da Movimentação Operacional:
 * aquele devolve o foco ao campo do código a cada blur, o que roubaria o foco
 * do campo de quantidade desta tela.
 */
export default function ContagemPorCodigo({
  inventario, itens, canCount, onBack, onVerListaCompleta, onFinalizar, buscarPorBarcode, ajustarContagem, listarCodigos,
}: Props) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [codigo, setCodigo] = useState('');
  const [pendente, setPendente] = useState<ProdutoLido | null>(null);
  const [quantidade, setQuantidade] = useState('1');
  const [codigosCadastrados, setCodigosCadastrados] = useState<ReadonlySet<string>>(() => new Set());
  const [cameraAberta, setCameraAberta] = useState(false);
  // Lido pelo refoco do blur, que roda num setTimeout com o closure antigo.
  const cameraAbertaRef = useRef(false);
  const temCamera = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
  const codigoRef = useRef<HTMLInputElement>(null);
  const quantidadeRef = useRef<HTMLInputElement>(null);

  const { buscarProduto, confirmarQuantidade, desfazerUltimaLeitura, historico, processando } = useContagemPorCodigo({
    inventarioId: inventario.id, buscarPorBarcode, ajustarContagem,
  });

  const totalItens = itens.length;
  const contados = itens.filter(i => i.contagem_fisica !== null).length;

  // Sem produto pendente, o campo do código fica pronto para o próximo bipe;
  // com produto pendente, o foco vai para a quantidade já selecionada, para
  // digitar por cima do "1". Com a câmera aberta o campo do código não puxa o
  // foco: no celular abriria o teclado por cima da imagem.
  useEffect(() => {
    if (processando || !canCount) return;
    if (pendente) {
      quantidadeRef.current?.focus();
      quantidadeRef.current?.select();
    } else if (!cameraAberta) {
      codigoRef.current?.focus();
    }
  }, [pendente, processando, canCount, cameraAberta]);

  // Com a câmera aberta nada fica focado e o leitor HID digitaria no vazio: a
  // primeira tecla solta leva o foco ao campo do código e o resto do bipe cai
  // nele. Sem teclado físico não há tecla, então o teclado da tela não abre.
  useEffect(() => {
    if (!cameraAberta || pendente || processando || !canCount) return;
    const aoTeclar = (e: KeyboardEvent) => {
      // Espaço aciona o botão focado (lanterna, zoom); bipe não começa com ele.
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ') return;
      const alvo = e.target;
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement
        || alvo instanceof HTMLSelectElement || (alvo instanceof HTMLElement && alvo.isContentEditable)) return;
      codigoRef.current?.focus();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [cameraAberta, pendente, processando, canCount]);

  useEffect(() => {
    let cancelado = false;
    void listarCodigos(inventario.id).then(lista => {
      if (!cancelado) setCodigosCadastrados(new Set(lista.map(normalizarBarcode)));
    });
    return () => { cancelado = true; };
  }, [inventario.id, listarCodigos]);

  const focarCodigo = () => {
    if (!pendente && !processando && !cameraAbertaRef.current) codigoRef.current?.focus();
  };

  const buscarCodigo = useCallback(async (valor: string) => {
    if (processando || pendente) return;
    if (!valor.trim()) {
      setAviso({ tom: 'alerta', texto: 'Digite ou leia um código de barras.' });
      return;
    }
    // Limpar o campo também cancela a busca automática agendada para ele.
    setCodigo('');
    const r = await buscarProduto(valor);
    if (r.tipo === 'encontrado') {
      setPendente(r.produto);
      setQuantidade('1');
      setAviso(null);
    } else if (r.tipo === 'nao_encontrado') {
      setAviso({ tom: 'alerta', texto: `Produto não encontrado para o código ${r.barcode}.` });
    } else if (r.tipo === 'fora_do_inventario') {
      setAviso({ tom: 'alerta', texto: `O código ${r.barcode} pertence a um produto fora deste inventário.` });
    } else {
      setAviso({ tom: r.tipo === 'erro' ? 'erro' : 'alerta', texto: r.mensagem });
    }
  }, [processando, pendente, buscarProduto]);

  const lerDaCamera = useCallback((valor: string) => {
    // iPhone não deixa site vibrar; lá a confirmação é o cartão abrindo.
    navigator.vibrate?.(80);
    void buscarCodigo(valor);
  }, [buscarCodigo]);

  const abrirCamera = () => {
    cameraAbertaRef.current = true;
    setCameraAberta(true);
    codigoRef.current?.blur();
  };

  const fecharCamera = useCallback(() => {
    cameraAbertaRef.current = false;
    setCameraAberta(false);
  }, []);

  // Código cadastrado completo é buscado sozinho depois de uma pausa curta;
  // cada tecla reinicia a espera.
  useEffect(() => {
    if (processando || pendente || !canCount) return;
    const decisao = decidirBuscaAutomatica(codigo, codigosCadastrados);
    if (decisao === 'nao') return;
    const espera = decisao === 'agora' ? ESPERA_BUSCA_AUTOMATICA_MS : ESPERA_BUSCA_AUTOMATICA_PREFIXO_MS;
    const timer = window.setTimeout(() => { void buscarCodigo(codigo); }, espera);
    return () => window.clearTimeout(timer);
  }, [codigo, codigosCadastrados, processando, pendente, canCount, buscarCodigo]);

  const passo = (delta: number) => {
    setQuantidade(atual => quantidadeParaCampo(ajustarQuantidade(parseQuantidade(atual), delta)));
  };

  const confirmar = async () => {
    if (!pendente || processando) return;
    const texto = quantidade.trim();
    const valor = parseQuantidade(texto);
    if (valor === null && texto) {
      // Leitor HID disparado com o foco na quantidade digita o código aqui.
      setAviso({
        tom: 'erro',
        texto: /^\d{8,}$/.test(texto)
          ? 'Isso parece um código de barras. Confirme ou cancele o produto atual antes de ler o próximo.'
          : 'Quantidade inválida. Use só números (ex.: 12 ou 2,5).',
      });
      setQuantidade('1');
      quantidadeRef.current?.focus();
      return;
    }
    const r = await confirmarQuantidade(pendente, valor);
    if (r.tipo === 'contabilizado') {
      const { item } = r;
      setAviso({
        tom: 'sucesso',
        texto: `${item.nomeProduto}: +${formatarQuantidade(item.quantidadeLidaCompra)} ${item.unidadeCompra} · total contado ${formatarQuantidade(item.quantidadeContadaCompra)} ${item.unidadeCompra}`,
      });
      setPendente(null);
    } else {
      setAviso({ tom: r.tipo === 'erro' ? 'erro' : 'alerta', texto: r.mensagem });
    }
  };

  const cancelar = () => {
    setPendente(null);
    setAviso(null);
  };

  const desfazer = async () => {
    const r = await desfazerUltimaLeitura();
    if (r.tipo === 'desfeito') {
      const { leitura } = r;
      setAviso({
        tom: 'alerta',
        texto: `Leitura desfeita: ${leitura.nomeProduto} −${formatarQuantidade(leitura.quantidadeLidaCompra)} ${leitura.unidadeCompra}.`,
      });
    } else if (r.tipo === 'erro') {
      setAviso({ tom: 'erro', texto: r.mensagem });
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Voltar"><ArrowLeft className="w-4 h-4" /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-display font-bold text-foreground">
            Inventário: {formatDisplayBR(parseLocalDate(inventario.data))}
          </h2>
          <p className="text-xs text-muted-foreground">
            {STATUS_LABEL[inventario.status]} · {contados}/{totalItens} produtos contabilizados
            {inventario.status === 'RASCUNHO' && ' · a contagem começa na primeira leitura'}
          </p>
        </div>
      </div>

      {canCount && cameraAberta && (
        <LeitorCamera
          pausado={!!pendente || processando}
          oculto={!!pendente}
          onCodigo={lerDaCamera}
          onFechar={fecharCamera}
        />
      )}

      {!canCount ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Você não tem permissão para contar itens deste inventário.
        </div>
      ) : pendente ? (
        <form
          onSubmit={e => { e.preventDefault(); void confirmar(); }}
          className="space-y-4 rounded-2xl border-2 border-primary-border bg-card p-5"
        >
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Produto lido</p>
            <p className="text-lg font-semibold text-foreground">{pendente.nomeProduto}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {pendente.sku ? `${pendente.sku} · ` : ''}{pendente.barcode}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pendente.contadoCompra === null
                ? 'Ainda não contado neste inventário.'
                : `Já contado: ${formatarQuantidade(pendente.contadoCompra)} ${pendente.unidadeCompra}`}
            </p>
          </div>

          <div>
            <label htmlFor="quantidade-lida" className="text-sm font-medium text-foreground">
              Quantidade ({pendente.unidadeCompra})
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <Button type="button" variant="outline" className="h-14 w-14 shrink-0" onClick={() => passo(-1)}
                disabled={processando} aria-label="Diminuir quantidade">
                <Minus className="h-5 w-5" />
              </Button>
              <Input
                id="quantidade-lida"
                ref={quantidadeRef}
                value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') cancelar(); }}
                disabled={processando}
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                className="h-14 min-w-0 flex-1 text-center text-2xl font-semibold"
              />
              <Button type="button" variant="outline" className="h-14 w-14 shrink-0" onClick={() => passo(1)}
                disabled={processando} aria-label="Aumentar quantidade">
                <Plus className="h-5 w-5" />
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Soma ao que já foi contado deste produto.</p>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={cancelar} disabled={processando}>
              Cancelar
            </Button>
            <Button type="submit" className="h-12 flex-[2] gap-1.5" disabled={processando}>
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Adicionar
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={e => { e.preventDefault(); void buscarCodigo(codigo); }}
          onClick={focarCodigo}
          className="rounded-2xl border-2 border-dashed border-primary-border bg-primary-soft p-6 text-center"
        >
          {processando ? (
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          ) : (
            <ScanLine className="mx-auto h-10 w-10 animate-pulse text-primary" />
          )}
          <p className="mt-3 text-base font-semibold text-foreground">
            {processando ? 'Buscando produto…' : 'Aguardando leitura do código de barras'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use o leitor, a câmera ou digite o código. Código de barras cadastrado é buscado sozinho; os demais, toque em Buscar.
          </p>
          <div className="mt-4 flex gap-2">
            <Input
              ref={codigoRef}
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              // O leitor HID some com o foco se o operador tocar em outro ponto
              // da tela; devolver no blur mantém o próximo bipe funcionando.
              onBlur={() => window.setTimeout(focarCodigo, 0)}
              disabled={processando}
              inputMode="numeric"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="Código de barras"
              placeholder="0000000000000"
              className="h-14 min-w-0 flex-1 text-center font-mono text-xl tracking-widest"
            />
            <Button type="submit" className="h-14 shrink-0 gap-1.5 px-5" disabled={processando}>
              <Search className="h-4 w-4" /> Buscar
            </Button>
          </div>
          {temCamera && !cameraAberta && (
            <Button
              type="button"
              variant="outline"
              className="mt-2 h-12 w-full gap-1.5"
              // Sem tirar o foco no toque: o refoco do blur reabriria o teclado.
              onMouseDown={e => e.preventDefault()}
              onClick={e => { e.stopPropagation(); abrirCamera(); }}
            >
              <Camera className="h-4 w-4" /> Ler pela câmera
            </Button>
          )}
        </form>
      )}

      {aviso && (
        <div className={`rounded-lg border p-3 ${ESTILO_AVISO[aviso.tom]}`} role="status">
          <p className="text-sm font-medium text-foreground">{aviso.texto}</p>
        </div>
      )}

      {historico.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Últimos produtos contabilizados</p>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => void desfazer()} disabled={processando}>
              <Undo2 className="h-3.5 w-3.5" /> Desfazer última leitura
            </Button>
          </div>
          <ul className="space-y-1.5">
            {historico.map(h => (
              <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{h.nomeProduto}</span>
                <span className="shrink-0 font-mono text-success">
                  +{formatarQuantidade(h.quantidadeLidaCompra)} → {formatarQuantidade(h.quantidadeContadaCompra)} {h.unidadeCompra}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="h-12 flex-1 gap-1.5" onClick={onVerListaCompleta}>
          <ListChecks className="h-4 w-4" /> Ver lista completa
        </Button>
        <Button className="h-12 flex-1 gap-1.5" onClick={onFinalizar}>
          <CheckCircle2 className="h-4 w-4" /> Finalizar inventário
        </Button>
      </div>
    </div>
  );
}
