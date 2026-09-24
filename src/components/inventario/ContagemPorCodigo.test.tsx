/**
 * Tela de contagem via código.
 *
 * Garantias que não podem regredir:
 *   · o código é enviado por botão — celular/tablet não tem Enter no teclado numérico;
 *   · a leitura só identifica o produto; a quantidade é informada antes de gravar;
 *   · o que vai ao banco é a soma (delta em unidade base), nunca um total;
 *   · código de barras digitado no campo de quantidade não vira quantidade.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContagemPorCodigo from '@/components/inventario/ContagemPorCodigo';
import type { AjusteContagemResult, BarcodeLookupResult, Inventario, OpcoesAjusteContagem } from '@/hooks/useInventarioStore';

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

function renderTela(overrides?: { ajustarContagem?: AjustarContagem }) {
  const buscarPorBarcode = vi.fn(async () => LOOKUP);
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
    />,
  );
  return { buscarPorBarcode, ajustarContagem };
}

async function lerPorBotao(codigo: string) {
  fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: codigo } });
  fireEvent.click(screen.getByRole('button', { name: /buscar/i }));
  return screen.findByText('Coca-Cola 350ml');
}

afterEach(() => cleanup());

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

  it('erro do banco aparece traduzido na tela', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>(async () => { throw new Error('INVENTARIO_FINALIZADO'); });
    renderTela({ ajustarContagem });
    await lerPorBotao('7891234567890');
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));

    expect(await screen.findByText('Este inventário já foi finalizado.')).toBeInTheDocument();
  });
});
