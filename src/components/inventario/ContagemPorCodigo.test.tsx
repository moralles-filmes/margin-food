/**
 * Tela de contagem via código.
 *
 * Garantias que não podem regredir:
 *   · o código é enviado por botão — celular/tablet não tem Enter no teclado numérico;
 *   · a leitura só identifica o produto; a quantidade é informada antes de gravar;
 *   · o que vai ao banco é a soma (delta em unidade base), nunca um total;
 *   · código de barras digitado no campo de quantidade não vira quantidade;
 *   · com a câmera aberta, o campo do código não puxa o foco (o teclado cobriria a imagem),
 *     mas o leitor físico continua funcionando.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContagemPorCodigo from '@/components/inventario/ContagemPorCodigo';
import type { AjusteContagemResult, BarcodeLookupResult, Inventario, OpcoesAjusteContagem } from '@/hooks/useInventarioStore';

// A câmera de verdade é coberta em useLeitorCamera.test.tsx; aqui só o contrato com a tela.
vi.mock('@/components/camera/LeitorCamera', () => ({
  default: ({ pausado, oculto, onCodigo, onFechar }: {
    pausado: boolean; oculto: boolean; onCodigo: (codigo: string) => void; onFechar: () => void;
  }) => (
    <div data-testid="camera">
      <span data-testid="camera-estado">{oculto ? 'oculta' : pausado ? 'pausada' : 'lendo'}</span>
      <button type="button" onClick={() => onCodigo('7891234567890')}>simular leitura</button>
      <button type="button" onClick={onFechar}>fechar câmera fake</button>
    </div>
  ),
}));

const INVENTARIO = {
  id: 'inv-1',
  data: '2026-09-24',
  status: 'RASCUNHO',
  metodo_contagem: 'codigo',
} as Inventario;

const LOOKUP: BarcodeLookupResult = {
  status: 'found',
  item_id: 'item-1',
  produto_id: 'produto-1',
  nome_produto: 'Coca-Cola 350ml',
  sku: 'COCA350',
  barcode: '7891234567890',
  unidade_medida: 'UN',
  unidade_compra: 'CX',
  fator_conversao_padrao: 12,
  saldo_teorico: 100,
  contagem_fisica: null,
  classificacao: 'NORMAL',
};

type AjustarContagem = (itemId: string, deltaBase: number, opcoes: OpcoesAjusteContagem) => Promise<AjusteContagemResult>;

function renderTela(overrides?: { ajustarContagem?: AjustarContagem; codigos?: string[] }) {
  const buscarPorBarcode = vi.fn(async () => LOOKUP);
  const listarCodigos = vi.fn(async () => overrides?.codigos ?? ['7891234567895']);
  const ajustarContagem = overrides?.ajustarContagem ?? vi.fn<AjustarContagem>(async (_itemId, deltaBase) => ({
    item_id: 'item-1',
    idempotente: false,
    conflito: false,
    contagem_anterior: null,
    contagem_apos: deltaBase,
    contagem_fisica: deltaBase,
    diferenca_qtd: deltaBase - 100,
    diferenca_percent: 0,
    impacto_financeiro: 0,
    classificacao: 'NORMAL',
    status_inventario: 'EM_CONTAGEM',
  }));
  render(
    <ContagemPorCodigo
      inventario={INVENTARIO}
      itens={[]}
      canCount
      onBack={vi.fn()}
      onVerListaCompleta={vi.fn()}
      onFinalizar={vi.fn()}
      buscarPorBarcode={buscarPorBarcode}
      ajustarContagem={ajustarContagem}
      listarCodigos={listarCodigos}
    />,
  );
  return { buscarPorBarcode, ajustarContagem, listarCodigos };
}

/** Relógio falso: deixa a lista de códigos carregar antes de digitar. */
async function renderComRelogio(overrides?: Parameters<typeof renderTela>[0]) {
  vi.useFakeTimers();
  const tela = renderTela(overrides);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return tela;
}

async function avancar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function lerPorBotao(codigo: string) {
  fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: codigo } });
  fireEvent.click(screen.getByRole('button', { name: /buscar/i }));
  return screen.findByText('Coca-Cola 350ml');
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ContagemPorCodigo', () => {
  it('envia o código pelo botão Buscar, sem precisar de Enter', async () => {
    const { buscarPorBarcode, ajustarContagem } = renderTela();
    await lerPorBotao('7891234567890');

    expect(buscarPorBarcode).toHaveBeenCalledWith('inv-1', '7891234567890');
    expect(ajustarContagem).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Quantidade \(CX\)/)).toHaveValue('1');
  });

  it('soma a quantidade informada depois da leitura (em unidade base)', async () => {
    const { ajustarContagem } = renderTela();
    await lerPorBotao('7891234567890');

    fireEvent.change(screen.getByLabelText(/Quantidade \(CX\)/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));

    await waitFor(() => expect(ajustarContagem).toHaveBeenCalledWith('item-1', 60, expect.objectContaining({ origem: 'leitura' })));
    expect(await screen.findByText(/\+5 → 5 CX/)).toBeInTheDocument();
    // volta a esperar o próximo código
    expect(screen.getByLabelText('Código de barras')).toBeInTheDocument();
  });

  it('botões de + e − ajustam a quantidade antes de confirmar', async () => {
    const { ajustarContagem } = renderTela();
    await lerPorBotao('7891234567890');

    fireEvent.click(screen.getByRole('button', { name: /aumentar quantidade/i }));
    fireEvent.click(screen.getByRole('button', { name: /aumentar quantidade/i }));
    fireEvent.click(screen.getByRole('button', { name: /diminuir quantidade/i }));
    expect(screen.getByLabelText(/Quantidade \(CX\)/)).toHaveValue('2');

    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    await waitFor(() => expect(ajustarContagem).toHaveBeenCalledWith('item-1', 24, expect.objectContaining({ origem: 'leitura' })));
  });

  it('cancelar não grava nada', async () => {
    const { ajustarContagem } = renderTela();
    await lerPorBotao('7891234567890');

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(screen.queryByText('Coca-Cola 350ml')).not.toBeInTheDocument();
    expect(ajustarContagem).not.toHaveBeenCalled();
  });

  it('código de barras lido por engano no campo de quantidade não vira quantidade', async () => {
    const { ajustarContagem } = renderTela();
    await lerPorBotao('7891234567890');

    fireEvent.change(screen.getByLabelText(/Quantidade \(CX\)/), { target: { value: '7894900011517' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));

    expect(await screen.findByText(/parece um código de barras/i)).toBeInTheDocument();
    expect(ajustarContagem).not.toHaveBeenCalled();
  });

  it('desfazer subtrai o que a última leitura somou', async () => {
    const { ajustarContagem } = renderTela();
    await lerPorBotao('7891234567890');
    fireEvent.change(screen.getByLabelText(/Quantidade \(CX\)/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    await screen.findByText(/\+3 → 3 CX/);

    fireEvent.click(screen.getByRole('button', { name: /desfazer última leitura/i }));
    await waitFor(() => expect(ajustarContagem).toHaveBeenLastCalledWith('item-1', -36, expect.objectContaining({
      origem: 'desfazer', esperado: 36, restaurarNaoContado: true,
    })));
    expect(await screen.findByText(/Leitura desfeita/)).toBeInTheDocument();
  });

  describe('busca automática ao digitar', () => {
    it('código de barras cadastrado completo busca sozinho, sem Enter nem botão', async () => {
      const { buscarPorBarcode } = await renderComRelogio();
      fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: '7891234567895' } });

      await avancar(300);
      expect(buscarPorBarcode).toHaveBeenCalledTimes(1);
      expect(buscarPorBarcode).toHaveBeenCalledWith('inv-1', '7891234567895');
      expect(screen.getByText('Coca-Cola 350ml')).toBeInTheDocument();
    });

    it('código curto cadastrado não busca sozinho: pode ser o começo de outro código sendo digitado', async () => {
      const { buscarPorBarcode } = await renderComRelogio({ codigos: ['7891'] });
      fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: '7891' } });

      await avancar(1500);
      expect(buscarPorBarcode).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Código de barras')).toHaveValue('7891');
    });

    it('código não cadastrado não busca sozinho', async () => {
      const { buscarPorBarcode } = await renderComRelogio();
      fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: '7890000000000' } });

      await avancar(1500);
      expect(buscarPorBarcode).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Código de barras')).toHaveValue('7890000000000');
    });

    // EAN-8 78912342 é o começo do EAN-13 7891234200013 — os dois cadastrados.
    it('código que é começo de outro cadastrado espera mais antes de buscar', async () => {
      const { buscarPorBarcode } = await renderComRelogio({ codigos: ['78912342', '7891234200013'] });
      fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: '78912342' } });

      await avancar(400);
      expect(buscarPorBarcode).not.toHaveBeenCalled();
      await avancar(600);
      expect(buscarPorBarcode).toHaveBeenCalledWith('inv-1', '78912342');
    });

    it('continuar digitando reinicia a espera', async () => {
      const { buscarPorBarcode } = await renderComRelogio({ codigos: ['78912342', '7891234200013'] });
      fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: '78912342' } });
      await avancar(500);
      fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: '7891234200013' } });

      await avancar(300);
      expect(buscarPorBarcode).toHaveBeenCalledTimes(1);
      expect(buscarPorBarcode).toHaveBeenCalledWith('inv-1', '7891234200013');
    });

    it('leitor que manda Enter logo depois do código não busca duas vezes', async () => {
      const { buscarPorBarcode } = await renderComRelogio();
      fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: '7891234567895' } });
      fireEvent.click(screen.getByRole('button', { name: /buscar/i }));

      await avancar(1000);
      expect(buscarPorBarcode).toHaveBeenCalledTimes(1);
    });
  });

  describe('câmera', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
    });

    afterEach(() => {
      delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    });

    /** Deixa rodar o refoco do blur (setTimeout 0) antes de conferir o foco. */
    async function esperarRefoco() {
      await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    }

    it('botão "Ler pela câmera" abre a câmera', () => {
      renderTela();
      fireEvent.click(screen.getByRole('button', { name: /ler pela câmera/i }));

      expect(screen.getByTestId('camera-estado')).toHaveTextContent('lendo');
      expect(screen.queryByRole('button', { name: /ler pela câmera/i })).not.toBeInTheDocument();
    });

    it('código lido pela câmera abre o cartão de quantidade, com a câmera escondida', async () => {
      const { buscarPorBarcode, ajustarContagem } = renderTela();
      fireEvent.click(screen.getByRole('button', { name: /ler pela câmera/i }));
      fireEvent.click(screen.getByRole('button', { name: 'simular leitura' }));

      expect(await screen.findByText('Coca-Cola 350ml')).toBeInTheDocument();
      expect(buscarPorBarcode).toHaveBeenCalledWith('inv-1', '7891234567890');
      expect(ajustarContagem).not.toHaveBeenCalled();
      expect(screen.getByTestId('camera-estado')).toHaveTextContent('oculta');

      fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
      await waitFor(() => expect(ajustarContagem).toHaveBeenCalledWith('item-1', 12, expect.objectContaining({ origem: 'leitura' })));
      await waitFor(() => expect(screen.getByTestId('camera-estado')).toHaveTextContent('lendo'));
    });

    it('com a câmera aberta o campo do código não puxa o foco (teclado cobriria a imagem)', async () => {
      renderTela();
      const campo = screen.getByLabelText('Código de barras');
      expect(campo).toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: /ler pela câmera/i }));
      await esperarRefoco();
      expect(campo).not.toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'simular leitura' }));
      await screen.findByText('Coca-Cola 350ml');
      fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
      await esperarRefoco();
      expect(screen.getByLabelText('Código de barras')).not.toHaveFocus();
    });

    it('leitor físico continua funcionando com a câmera aberta', async () => {
      const { buscarPorBarcode } = renderTela();
      fireEvent.click(screen.getByRole('button', { name: /ler pela câmera/i }));
      await esperarRefoco();
      const campo = screen.getByLabelText('Código de barras');
      expect(campo).not.toHaveFocus();

      // atalho do navegador e Espaço (aciona o botão focado) não são bipe
      fireEvent.keyDown(document.body, { key: 'r', ctrlKey: true });
      fireEvent.keyDown(document.body, { key: ' ' });
      expect(campo).not.toHaveFocus();

      // o primeiro dígito do bipe leva o foco ao campo; o resto cai nele
      fireEvent.keyDown(document.body, { key: '7' });
      expect(campo).toHaveFocus();
      fireEvent.change(campo, { target: { value: '7891234567890' } });
      fireEvent.submit(campo.closest('form')!);
      await waitFor(() => expect(buscarPorBarcode).toHaveBeenCalledWith('inv-1', '7891234567890'));
    });

    it('fechar a câmera devolve o foco ao campo do código', async () => {
      renderTela();
      fireEvent.click(screen.getByRole('button', { name: /ler pela câmera/i }));
      fireEvent.click(screen.getByRole('button', { name: 'fechar câmera fake' }));

      expect(screen.queryByTestId('camera')).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText('Código de barras')).toHaveFocus());
    });

    it('navegador sem acesso à câmera não mostra o botão', () => {
      delete (navigator as { mediaDevices?: unknown }).mediaDevices;
      renderTela();
      expect(screen.queryByRole('button', { name: /ler pela câmera/i })).not.toBeInTheDocument();
    });
  });

  it('erro do banco aparece traduzido na tela', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>(async () => { throw new Error('INVENTARIO_FINALIZADO'); });
    renderTela({ ajustarContagem });
    await lerPorBotao('7891234567890');
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));

    expect(await screen.findByText('Este inventário já foi finalizado.')).toBeInTheDocument();
  });
});
