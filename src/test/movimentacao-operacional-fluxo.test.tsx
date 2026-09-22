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

const AGUA: ProdutoOperacional = {
  produtoId: 'prod-agua',
  nome: 'Água Mineral 500ml',
  sku: 'MP-0051',
  unidadeMedida: 'UN',
  saldo: 20,
  vinculado: true,
};

function dadosBase() {
  return {
    setores: SETORES,
    setoresLoading: false,
    setoresErro: null as string | null,
    recarregarSetores: vi.fn(),
    buscarProdutos: vi.fn().mockResolvedValue({ produtos: [COCA], erro: null, obsoleto: false }),
    buscarPorBarcode: vi.fn().mockResolvedValue({
      status: 'encontrado', produto: COCA, setores: [SETORES[0]],
    }),
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

/** A tela abre no leitor; o modo manual é a alternativa explícita. */
const irParaManual = () => clicar(/Lançar manualmente/);

/** Percorre manual → setor → produto, deixando a tela no passo de quantidade. */
async function irAteQuantidade() {
  await irParaManual();
  await clicar('Cozinha');
  await clicar(/Coca-Cola Lata 350ml/);
  return screen.findByRole('textbox', { name: 'Quantidade' });
}

const digitarQuantidade = (campo: HTMLElement, valor: string) =>
  fireEvent.change(campo, { target: { value: valor } });

/** Simula um leitor HID: digita o código e manda Enter. */
async function escanear(codigo: string) {
  const campo = await screen.findByRole('textbox', { name: 'Código de barras' });
  fireEvent.change(campo, { target: { value: codigo } });
  fireEvent.keyDown(campo, { key: 'Enter' });
  return campo;
}

beforeEach(() => { mockToastError.mockClear(); });
afterEach(() => cleanup());

describe('FluxoMovimentacao — navegação', () => {
  it('abre no leitor de código de barras, não no manual', async () => {
    renderFluxo('SAIDA', dadosBase());
    expect(await screen.findByText(/Aguardando leitura do código de barras/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
  });

  it('pede o setor quando há mais de um autorizado', async () => {
    renderFluxo('SAIDA', dadosBase());
    await irParaManual();

    expect(await screen.findByText(/Em qual setor deseja retirar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cozinha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delivery' })).toBeInTheDocument();
  });

  it('pula a escolha de setor quando só um está autorizado', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados, [SETORES[0]]);
    await irParaManual();

    expect(screen.queryByText(/Em qual setor deseja/)).not.toBeInTheDocument();
    await waitFor(() => expect(dados.buscarProdutos).toHaveBeenCalledWith('setor-cozinha', ''));
  });

  it('busca produtos apenas do setor escolhido', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);
    await irParaManual();

    await clicar('Delivery');
    await waitFor(() => expect(dados.buscarProdutos).toHaveBeenCalledWith('setor-delivery', ''));
    expect(dados.buscarProdutos).not.toHaveBeenCalledWith('setor-cozinha', expect.anything());
  });

  it('permite trocar de setor sem sair do fluxo', async () => {
    renderFluxo('SAIDA', dadosBase());
    await irParaManual();

    await clicar('Cozinha');
    expect(await screen.findByText(/Setor atual:/)).toBeInTheDocument();

    await clicar('Trocar');
    expect(await screen.findByText(/Em qual setor deseja/)).toBeInTheDocument();
  });

  it('volta do manual para o leitor sem perder o fluxo', async () => {
    renderFluxo('SAIDA', dadosBase());
    await irParaManual();
    await clicar('Cozinha');

    await clicar(/Usar leitor de código de barras/);
    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
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
    await irParaManual();
    await clicar('Cozinha');
    expect(await screen.findByText(/Disponível: 8/)).toBeInTheDocument();
  });
});

describe('FluxoMovimentacao — leitor de código de barras', () => {
  it('resolve o setor sozinho quando o produto está em um só acessível', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);

    await escanear('7891234567890');
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledWith('7891234567890'));
    expect(await screen.findByRole('button', { name: /Confirmar saída/ })).toBeInTheDocument();
  });

  it('pergunta o setor quando o produto está em vários acessíveis', async () => {
    const dados = dadosBase();
    dados.buscarPorBarcode = vi.fn().mockResolvedValue({
      status: 'encontrado', produto: COCA, setores: SETORES,
    });
    renderFluxo('SAIDA', dados);

    await escanear('7891234567890');
    expect(await screen.findByText(/De qual setor deseja retirar/)).toBeInTheDocument();

    await clicar('Delivery');
    await clicar(/Confirmar saída/);
    await waitFor(() => expect(dados.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ setorId: 'setor-delivery' }),
    ));
  });

  it('preserva zeros à esquerda — o código é string do campo ao banco', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);

    await escanear('0007894900011517');
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledWith('0007894900011517'));
  });

  it('limpa espaço e sufixo de controle que o leitor HID injeta', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);

    await escanear('  789123 4567890 \t');
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledWith('7891234567890'));
  });

  it('ignora o segundo disparo imediato do mesmo código (repique do leitor)', async () => {
    const dados = dadosBase();
    dados.buscarPorBarcode = vi.fn().mockResolvedValue({ status: 'nao_encontrado' });
    renderFluxo('SAIDA', dados);

    await escanear('7891234567890');
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledTimes(1));
    await escanear('7891234567890');

    // A janela anti-repique segura a segunda leitura idêntica.
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledTimes(1));
  });

  it('recusa código curto demais sem ir ao servidor', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);

    await escanear('12');
    expect(await screen.findByText(/Código muito curto/)).toBeInTheDocument();
    expect(dados.buscarPorBarcode).not.toHaveBeenCalled();
  });

  it('recusa código com caractere inválido sem ir ao servidor', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);

    await escanear('789$%#123');
    expect(await screen.findByText(/caracteres inválidos/)).toBeInTheDocument();
    expect(dados.buscarPorBarcode).not.toHaveBeenCalled();
  });

  it('manda procurar um responsável quando o código não existe', async () => {
    const dados = dadosBase();
    dados.buscarPorBarcode = vi.fn().mockResolvedValue({ status: 'nao_encontrado' });
    renderFluxo('SAIDA', dados);

    await escanear('7891234567890');
    const aviso = await screen.findByText(/Produto não encontrado para o código/);
    expect(aviso.textContent).toContain('7891234567890');
    expect(aviso.textContent).toContain('Procure um responsável');
  });

  it('avisa de permissão quando o produto existe só em setor sem acesso', async () => {
    const dados = dadosBase();
    dados.buscarPorBarcode = vi.fn().mockResolvedValue({ status: 'sem_acesso_ao_setor' });
    renderFluxo('SAIDA', dados);

    await escanear('7891234567890');
    expect(await screen.findByText(/não tem autorização para movimentar/)).toBeInTheDocument();
    // Não pode cair no fluxo de lançamento por outro caminho.
    expect(screen.queryByRole('button', { name: /Confirmar saída/ })).not.toBeInTheDocument();
  });

  it('continua pronto para a próxima leitura depois de concluir uma', async () => {
    const dados = dadosBase();
    renderFluxo('SAIDA', dados);

    await escanear('7891234567890');
    await clicar(/Confirmar saída/);
    await waitFor(() => expect(screen.getByText(/Saída realizada/i)).toBeInTheDocument());

    await clicar(/Ler próximo código/);
    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
  });

  it('o leitor não expõe valor financeiro', async () => {
    renderFluxo('SAIDA', dadosBase());
    await escanear('7891234567890');
    await screen.findByRole('button', { name: /Confirmar saída/ });

    expect(document.body.textContent).not.toMatch(/R\$/);
    expect(document.body.textContent).not.toMatch(/custo|margem|markup|fornecedor/i);
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

    await clicar(/Outra saída manual/);
    await clicar('Cozinha');
    await clicar(/Coca-Cola Lata 350ml/);
    await clicar(/Confirmar saída/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(2));
    const primeiro = dados.registrar.mock.calls[0][0].clientRequestId;
    const segundo = dados.registrar.mock.calls[1][0].clientRequestId;
    expect(segundo).not.toBe(primeiro);
  });

  it('renova o clientRequestId ao trocar de produto depois de uma falha', async () => {
    // Uma confirmação que falhou na rede pode ter sido gravada no servidor.
    // Reaproveitar a chave num produto diferente faria o servidor devolver o
    // lançamento anterior como sucesso, sem registrar nada para o produto novo.
    const dados = dadosBase();
    dados.buscarProdutos = vi.fn().mockResolvedValue({
      produtos: [COCA, AGUA], erro: null, obsoleto: false,
    });
    dados.registrar = vi.fn().mockResolvedValue({ ok: false, erro: 'Falha de rede' });
    renderFluxo('SAIDA', dados);
    await irAteQuantidade();

    await clicar(/Confirmar saída/);
    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(1));

    await clicar('Voltar');
    await clicar(/Água Mineral 500ml/);
    await clicar(/Confirmar saída/);
    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(2));

    const [primeira, segunda] = dados.registrar.mock.calls;
    expect(segunda[0].produtoId).toBe('prod-agua');
    expect(segunda[0].clientRequestId).not.toBe(primeira[0].clientRequestId);
  });

  it('renova o clientRequestId quando a quantidade muda', async () => {
    const dados = dadosBase();
    dados.registrar = vi.fn().mockResolvedValue({ ok: false, erro: 'Falha de rede' });
    renderFluxo('SAIDA', dados);
    const campo = await irAteQuantidade();

    await clicar(/Confirmar saída/);
    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(1));

    digitarQuantidade(campo, '4');
    await clicar(/Confirmar saída/);
    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(2));

    const [primeira, segunda] = dados.registrar.mock.calls;
    expect(segunda[0].quantidade).toBe(4);
    expect(segunda[0].clientRequestId).not.toBe(primeira[0].clientRequestId);
  });

  it('bloqueia o Voltar enquanto a confirmação está em voo', async () => {
    const dados = dadosBase();
    let liberar: (v: unknown) => void = () => {};
    dados.registrar = vi.fn().mockReturnValue(new Promise(res => { liberar = res; }));
    renderFluxo('SAIDA', dados);
    await irAteQuantidade();

    await clicar(/Confirmar saída/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled());

    liberar({ ok: false, erro: 'Falha de rede' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Voltar' })).toBeEnabled());
  });

  it('clicar [+] com 1000 no campo envia 1001, não 1,001', async () => {
    // Regressão: o stepper escrevia o texto agrupado ("1.001") de volta no
    // campo, e o parse o relia como decimal.
    const dados = dadosBase();
    renderFluxo('ENTRADA', dados);
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, '1000');
    await clicar('Aumentar quantidade');
    await clicar(/Confirmar entrada/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ quantidade: 1001 }),
    ));
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
