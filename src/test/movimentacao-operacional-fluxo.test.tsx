/**
 * Fluxo da Movimentação Operacional — entrada e saída manual.
 *
 * Cobre o caminho que o operador percorre (setor → produto → quantidade →
 * confirmação) e as garantias que não podem regredir:
 *   · nenhum valor financeiro renderizado em tela;
 *   · saída acima do saldo bloqueada antes de ir ao servidor;
 *   · reenvio reaproveita o mesmo clientRequestId, para o servidor deduplicar;
 *   · erro do servidor chega traduzido ao operador.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FluxoMovimentacao from '@/components/estoque-operacional/FluxoMovimentacao';
import type {
  MovimentacaoOperacionalTipo,
  ProdutoOperacional,
  SetorOperacional,
} from '@/domain/estoque/operacional';

const mockToastError = vi.fn();
vi.mock('@/hooks/useScopedToast', () => ({
  useScopedToast: () => ({ error: mockToastError, success: vi.fn() }),
}));

const SETORES: SetorOperacional[] = [
  { setorId: 'setor-cozinha', nome: 'Cozinha' },
  { setorId: 'setor-delivery', nome: 'Delivery' },
];

const COCA: ProdutoOperacional = {
  produtoId: 'prod-coca',
  nome: 'Coca-Cola Lata 350ml',
  sku: 'MP-0050',
  unidadeMedida: 'UN',
  saldo: 8,
  vinculado: true,
};

function dadosBase() {
  return {
    setores: SETORES,
    setoresLoading: false,
    setoresErro: null as string | null,
    recarregarSetores: vi.fn(),
    buscarProdutos: vi.fn().mockResolvedValue({ produtos: [COCA], erro: null, obsoleto: false }),
    registrar: vi.fn().mockResolvedValue({
      ok: true,
      resultado: {
        id: 'mov-1', idempotente: false,
        produtoNome: COCA.nome, unidadeMedida: 'UN', setor: 'Cozinha',
        tipo: 'SAIDA' as MovimentacaoOperacionalTipo, quantidade: 2,
        saldoAnterior: 8, saldoNovo: 6,
      },
    }),
    carregarHistorico: vi.fn().mockResolvedValue([]),
  };
}

function renderFluxo(
  tipo: MovimentacaoOperacionalTipo,
  dados: ReturnType<typeof dadosBase>,
  setores = SETORES,
) {
  return render(
    <FluxoMovimentacao
      tipo={tipo}
      setores={setores}
      dados={dados as never}
      onVoltarInicio={vi.fn()}
      onRegistrado={vi.fn()}
    />,
  );
}

const clicar = async (nome: RegExp | string) =>
  fireEvent.click(await screen.findByRole('button', { name: nome }));

/** Percorre setor → produto, deixando a tela no passo de quantidade. */
async function irAteQuantidade() {
  await clicar('Cozinha');
  await clicar(/Coca-Cola Lata 350ml/);
  return screen.findByRole('textbox', { name: 'Quantidade' });
}

const digitarQuantidade = (campo: HTMLElement, valor: string) =>
  fireEvent.change(campo, { target: { value: valor } });

beforeEach(() => { mockToastError.mockClear(); });
afterEach(() => cleanup());

describe('FluxoMovimentacao — navegação', () => {
  it('pede o setor quando há mais de um autorizado', async () => {
    renderFluxo('SAIDA', dadosBase());
    expect(await screen.findByText(/Em qual setor deseja retirar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cozinha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delivery' })).toBeInTheDocument();
  });

  it('pula a escolha de setor quando só um está autorizado', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados, [SETORES[0]]);

    expect(screen.queryByText(/Em qual setor deseja/)).not.toBeInTheDocument();
    await waitFor(() => expect(dados.buscarProdutos).toHaveBeenCalledWith('setor-cozinha', ''));
  });

  it('busca produtos apenas do setor escolhido', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);

    await clicar('Delivery');
    await waitFor(() => expect(dados.buscarProdutos).toHaveBeenCalledWith('setor-delivery', ''));
    expect(dados.buscarProdutos).not.toHaveBeenCalledWith('setor-cozinha', expect.anything());
  });

  it('permite trocar de setor sem sair do fluxo', async () => {
    renderFluxo('SAIDA', dadosBase());

    await clicar('Cozinha');
    expect(await screen.findByText(/Setor atual:/)).toBeInTheDocument();

    await clicar('Trocar');
    expect(await screen.findByText(/Em qual setor deseja/)).toBeInTheDocument();
  });
});

describe('FluxoMovimentacao — sem dados financeiros', () => {
  it('não renderiza valor, custo, margem nem fornecedor em nenhum passo', async () => {
    renderFluxo('SAIDA', dadosBase());
    await irAteQuantidade();

    expect(document.body.textContent).not.toMatch(/R\$/);
    expect(document.body.textContent).not.toMatch(/custo/i);
    expect(document.body.textContent).not.toMatch(/margem|markup|fornecedor/i);
  });

  it('mostra o saldo em unidades, não em valor', async () => {
    renderFluxo('SAIDA', dadosBase());
    await clicar('Cozinha');
    expect(await screen.findByText(/Disponível: 8/)).toBeInTheDocument();
  });
});

describe('FluxoMovimentacao — validação de saída', () => {
  it('bloqueia saída acima do saldo sem chamar o servidor', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, '20');
    await clicar(/Confirmar saída/);

    expect(await screen.findByText(/apenas 8 UN neste setor/)).toBeInTheDocument();
    expect(dados.registrar).not.toHaveBeenCalled();
  });

  it('permite entrada acima do saldo — entrada não tem teto', async () => {
    const dados = dadosBase();
    renderFluxo('ENTRADA', dados);
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, '500');
    await clicar(/Confirmar entrada/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'ENTRADA', quantidade: 500 }),
    ));
  });

  it('não mostra erro de quantidade antes da primeira tentativa', async () => {
    renderFluxo('SAIDA', dadosBase());
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, '99');
    expect(screen.queryByText(/apenas 8 UN/)).not.toBeInTheDocument();
  });

  it('bloqueia quantidade inválida digitada', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, 'abc');
    await clicar(/Confirmar saída/);

    expect(await screen.findByText('Informe a quantidade.')).toBeInTheDocument();
    expect(dados.registrar).not.toHaveBeenCalled();
  });
});

describe('FluxoMovimentacao — confirmação', () => {
  it('registra com o setor, o produto e a quantidade escolhidos', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, '2');
    await clicar(/Confirmar saída/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        produtoId: 'prod-coca',
        setorId: 'setor-cozinha',
        tipo: 'SAIDA',
        quantidade: 2,
      }),
    ));
  });

  it('usa quantidade 1 por padrão', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);
    await irAteQuantidade();

    await clicar(/Confirmar saída/);
    await waitFor(() => expect(dados.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ quantidade: 1 }),
    ));
  });

  it('os botões [-] e [+] alteram a quantidade enviada', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);
    await irAteQuantidade();

    await clicar('Aumentar quantidade');
    await clicar('Aumentar quantidade');
    await clicar(/Confirmar saída/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ quantidade: 3 }),
    ));
  });

  it('reenvio reaproveita o clientRequestId, para o servidor deduplicar', async () => {
    const dados = dadosBase();
    dados.registrar = vi.fn().mockResolvedValue({ ok: false, erro: 'Falha de rede' });
    renderFluxo('SAIDA', dados);
    await irAteQuantidade();

    await clicar(/Confirmar saída/);
    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(1));
    await clicar(/Confirmar saída/);
    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(2));

    const primeiro = dados.registrar.mock.calls[0][0].clientRequestId;
    const segundo = dados.registrar.mock.calls[1][0].clientRequestId;
    expect(primeiro).toBeTruthy();
    expect(segundo).toBe(primeiro);
  });

  it('renova o clientRequestId ao iniciar um novo lançamento', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);
    await irAteQuantidade();

    await clicar(/Confirmar saída/);
    await waitFor(() => expect(screen.getByText(/Saída realizada/i)).toBeInTheDocument());

    await clicar(/Realizar outra saída/);
    await clicar(/Coca-Cola Lata 350ml/);
    await clicar(/Confirmar saída/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(2));
    const primeiro = dados.registrar.mock.calls[0][0].clientRequestId;
    const segundo = dados.registrar.mock.calls[1][0].clientRequestId;
    expect(segundo).not.toBe(primeiro);
  });

  it('mostra o resultado com o saldo atualizado', async () => {
    renderFluxo('SAIDA', dadosBase());
    await irAteQuantidade();

    await clicar(/Confirmar saída/);

    expect(await screen.findByText(/Saída realizada/i)).toBeInTheDocument();
    expect(screen.getByText('−2')).toBeInTheDocument();
    expect(screen.getByText(/Saldo agora: 6 UN/)).toBeInTheDocument();
  });

  it('avisa quando o servidor reconheceu o lançamento como reenvio', async () => {
    const dados = dadosBase();
    dados.registrar = vi.fn().mockResolvedValue({
      ok: true,
      resultado: {
        id: 'mov-1', idempotente: true,
        produtoNome: COCA.nome, unidadeMedida: 'UN', setor: 'Cozinha',
        tipo: 'SAIDA', quantidade: 1, saldoAnterior: 8, saldoNovo: 7,
      },
    });
    renderFluxo('SAIDA', dados);
    await irAteQuantidade();

    await clicar(/Confirmar saída/);
    expect(await screen.findByText(/nada foi duplicado/i)).toBeInTheDocument();
  });

  it('mostra o erro do servidor ao operador e não declara sucesso', async () => {
    const dados = dadosBase();
    dados.registrar = vi.fn().mockResolvedValue({
      ok: false,
      erro: 'Este produto ainda não tem custo cadastrado. Procure um responsável antes de dar saída.',
    });
    renderFluxo('SAIDA', dados);
    await irAteQuantidade();

    await clicar(/Confirmar saída/);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Procure um responsável'),
    ));
    expect(screen.queryByText(/Saída realizada/i)).not.toBeInTheDocument();
  });
});
