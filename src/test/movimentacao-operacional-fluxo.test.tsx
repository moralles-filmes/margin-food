/**
 * Fluxo da Movimentação Operacional — saída (o operacional não registra entrada).
 *
 * Cobre o caminho que o operador percorre (setor → produto → quantidade →
 * confirmação) e as garantias que não podem regredir:
 *   · nenhum valor financeiro renderizado em tela;
 *   · saída acima do saldo bloqueada antes de ir ao servidor;
 *   · reenvio reaproveita o mesmo clientRequestId, para o servidor deduplicar;
 *   · erro do servidor chega traduzido ao operador.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FluxoMovimentacao from '@/components/estoque-operacional/FluxoMovimentacao';
import type {
  ProdutoOperacional,
  SetorOperacional,
} from '@/domain/estoque/operacional';

const mockToastError = vi.fn();
vi.mock('@/hooks/useScopedToast', () => ({
  useScopedToast: () => ({ error: mockToastError, success: vi.fn() }),
}));

// A câmera de verdade é coberta em useLeitorCamera.test.tsx; aqui só o contrato com o fluxo.
const camera = vi.hoisted(() => ({ codigo: '7891234567890' }));
vi.mock('@/components/camera/LeitorCamera', () => ({
  default: ({ pausado, oculto, onCodigo, onFechar }: {
    pausado: boolean; oculto: boolean; onCodigo: (codigo: string) => void; onFechar: () => void;
  }) => (
    <div data-testid="camera">
      <span data-testid="camera-estado">{oculto ? 'oculta' : pausado ? 'pausada' : 'lendo'}</span>
      <button type="button" onClick={() => onCodigo(camera.codigo)}>simular leitura</button>
      <button type="button" onClick={onFechar}>fechar câmera fake</button>
    </div>
  ),
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
        quantidade: 2, saldoAnterior: 8, saldoNovo: 6,
      },
    }),
    carregarHistorico: vi.fn().mockResolvedValue([]),
  };
}

function renderFluxo(
  dados: ReturnType<typeof dadosBase>,
  setores = SETORES,
) {
  return render(
    <FluxoMovimentacao
      setores={setores}
      dados={dados as never}
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
    renderFluxo(dadosBase());
    expect(await screen.findByText(/Aguardando leitura do código de barras/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
  });

  it('pede o setor quando há mais de um autorizado', async () => {
    renderFluxo(dadosBase());
    await irParaManual();

    expect(await screen.findByText(/Em qual setor deseja retirar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cozinha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delivery' })).toBeInTheDocument();
  });

  it('pula a escolha de setor quando só um está autorizado', async () => {
    const dados = dadosBase();
    renderFluxo(dados, [SETORES[0]]);
    await irParaManual();

    expect(screen.queryByText(/Em qual setor deseja/)).not.toBeInTheDocument();
    await waitFor(() => expect(dados.buscarProdutos).toHaveBeenCalledWith('setor-cozinha', ''));
  });

  it('busca produtos apenas do setor escolhido', async () => {
    const dados = dadosBase();
    renderFluxo(dados);
    await irParaManual();

    await clicar('Delivery');
    await waitFor(() => expect(dados.buscarProdutos).toHaveBeenCalledWith('setor-delivery', ''));
    expect(dados.buscarProdutos).not.toHaveBeenCalledWith('setor-cozinha', expect.anything());
  });

  it('permite trocar de setor sem sair do fluxo', async () => {
    renderFluxo(dadosBase());
    await irParaManual();

    await clicar('Cozinha');
    expect(await screen.findByText(/Setor atual:/)).toBeInTheDocument();

    await clicar('Trocar');
    expect(await screen.findByText(/Em qual setor deseja/)).toBeInTheDocument();
  });

  it('não mostra Voltar no leitor — ele é a tela inicial do módulo', async () => {
    renderFluxo(dadosBase());
    await screen.findByRole('textbox', { name: 'Código de barras' });
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument();
  });

  it('o sucesso não oferece voltar a uma escolha de tipo que não existe mais', async () => {
    renderFluxo(dadosBase());
    await escanear('7891234567890');
    await clicar(/Confirmar saída/);

    expect(await screen.findByText(/Saída realizada/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voltar ao início/ })).not.toBeInTheDocument();
  });

  it('volta do manual para o leitor sem perder o fluxo', async () => {
    renderFluxo(dadosBase());
    await irParaManual();
    await clicar('Cozinha');

    await clicar(/Usar leitor de código de barras/);
    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
  });
});

describe('FluxoMovimentacao — sem dados financeiros', () => {
  it('não renderiza valor, custo, margem nem fornecedor em nenhum passo', async () => {
    renderFluxo(dadosBase());
    await irAteQuantidade();

    expect(document.body.textContent).not.toMatch(/R\$/);
    expect(document.body.textContent).not.toMatch(/custo/i);
    expect(document.body.textContent).not.toMatch(/margem|markup|fornecedor/i);
  });

  it('mostra o saldo em unidades, não em valor', async () => {
    renderFluxo(dadosBase());
    await irParaManual();
    await clicar('Cozinha');
    expect(await screen.findByText(/Disponível: 8/)).toBeInTheDocument();
  });
});

describe('FluxoMovimentacao — leitor de código de barras', () => {
  it('resolve o setor sozinho quando o produto está em um só acessível', async () => {
    const dados = dadosBase();
    renderFluxo(dados);

    await escanear('7891234567890');
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledWith('7891234567890'));
    expect(await screen.findByRole('button', { name: /Confirmar saída/ })).toBeInTheDocument();
  });

  it('pergunta o setor quando o produto está em vários acessíveis', async () => {
    const dados = dadosBase();
    dados.buscarPorBarcode = vi.fn().mockResolvedValue({
      status: 'encontrado', produto: COCA, setores: SETORES,
    });
    renderFluxo(dados);

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
    renderFluxo(dados);

    await escanear('0007894900011517');
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledWith('0007894900011517'));
  });

  it('limpa espaço e sufixo de controle que o leitor HID injeta', async () => {
    const dados = dadosBase();
    renderFluxo(dados);

    await escanear('  789123 4567890 \t');
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledWith('7891234567890'));
  });

  it('ignora o segundo disparo imediato do mesmo código (repique do leitor)', async () => {
    const dados = dadosBase();
    dados.buscarPorBarcode = vi.fn().mockResolvedValue({ status: 'nao_encontrado' });
    renderFluxo(dados);

    await escanear('7891234567890');
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledTimes(1));
    await escanear('7891234567890');

    // A janela anti-repique segura a segunda leitura idêntica.
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledTimes(1));
  });

  it('recusa código curto demais sem ir ao servidor', async () => {
    const dados = dadosBase();
    renderFluxo(dados);

    await escanear('12');
    expect(await screen.findByText(/Código muito curto/)).toBeInTheDocument();
    expect(dados.buscarPorBarcode).not.toHaveBeenCalled();
  });

  it('recusa código com caractere inválido sem ir ao servidor', async () => {
    const dados = dadosBase();
    renderFluxo(dados);

    await escanear('789$%#123');
    expect(await screen.findByText(/caracteres inválidos/)).toBeInTheDocument();
    expect(dados.buscarPorBarcode).not.toHaveBeenCalled();
  });

  it('manda procurar um responsável quando o código não existe', async () => {
    const dados = dadosBase();
    dados.buscarPorBarcode = vi.fn().mockResolvedValue({ status: 'nao_encontrado' });
    renderFluxo(dados);

    await escanear('7891234567890');
    const aviso = await screen.findByText(/Produto não encontrado para o código/);
    expect(aviso.textContent).toContain('7891234567890');
    expect(aviso.textContent).toContain('Procure um responsável');
  });

  it('avisa de permissão quando o produto existe só em setor sem acesso', async () => {
    const dados = dadosBase();
    dados.buscarPorBarcode = vi.fn().mockResolvedValue({ status: 'sem_acesso_ao_setor' });
    renderFluxo(dados);

    await escanear('7891234567890');
    expect(await screen.findByText(/não tem autorização para movimentar/)).toBeInTheDocument();
    // Não pode cair no fluxo de lançamento por outro caminho.
    expect(screen.queryByRole('button', { name: /Confirmar saída/ })).not.toBeInTheDocument();
  });

  it('Voltar na quantidade volta ao leitor quando o código resolveu um setor só', async () => {
    // Regressão: a origem "leitor" era inferida por setoresDoCodigo, que só é
    // preenchido quando há vários setores — com um setor, o Voltar caía na busca manual.
    renderFluxo(dadosBase());

    await escanear('7891234567890');
    await screen.findByRole('button', { name: /Confirmar saída/ });

    await clicar('Voltar');
    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Pesquisar produto/ })).not.toBeInTheDocument();
  });

  it('Voltar na quantidade volta à lista quando o produto veio da busca manual', async () => {
    renderFluxo(dadosBase());
    await irAteQuantidade();

    await clicar('Voltar');
    expect(await screen.findByRole('textbox', { name: /Pesquisar produto/ })).toBeInTheDocument();
  });

  it('resposta atrasada de uma leitura não troca o produto escolhido depois no manual', async () => {
    // Regressão: a busca em voo, ao resolver, sobrescrevia produto/setor/quantidade
    // de um lançamento manual iniciado enquanto ela esperava a rede.
    const dados = dadosBase();
    let resolverBusca: (v: unknown) => void = () => {};
    dados.buscarPorBarcode = vi.fn().mockReturnValue(new Promise(res => { resolverBusca = res; }));
    dados.buscarProdutos = vi.fn().mockResolvedValue({
      produtos: [COCA, AGUA], erro: null, obsoleto: false,
    });
    renderFluxo(dados);

    await escanear('7891234567890');
    await screen.findByText('Buscando produto…');
    // "Lançar manualmente" segue disponível: é a saída quando a rede trava.
    await irParaManual();
    await clicar('Cozinha');
    await clicar(/Água Mineral 500ml/);
    const campo = await screen.findByRole('textbox', { name: 'Quantidade' });
    digitarQuantidade(campo, '5');

    await act(async () => {
      resolverBusca({ status: 'encontrado', produto: COCA, setores: [SETORES[1]] });
    });

    expect(screen.getByText('Água Mineral 500ml')).toBeInTheDocument();
    expect(screen.queryByText('Coca-Cola Lata 350ml')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Quantidade' })).toHaveValue('5');
    expect(screen.getByText(/Setor:/).textContent).toContain('Cozinha');
  });

  it('aviso de uma leitura atrasada não aparece numa leitura nova', async () => {
    const dados = dadosBase();
    let resolverBusca: (v: unknown) => void = () => {};
    dados.buscarPorBarcode = vi.fn().mockReturnValue(new Promise(res => { resolverBusca = res; }));
    renderFluxo(dados);

    await escanear('7891234567890');
    await screen.findByText('Buscando produto…');
    await irParaManual();
    await clicar('Cozinha');
    await clicar(/Usar leitor de código de barras/);
    await screen.findByText('Aguardando leitura do código de barras');

    await act(async () => { resolverBusca({ status: 'nao_encontrado' }); });

    expect(screen.queryByText(/Produto não encontrado para o código/)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Código de barras' })).toBeEnabled();
  });

  it('continua pronto para a próxima leitura depois de concluir uma', async () => {
    const dados = dadosBase();
    renderFluxo(dados);

    await escanear('7891234567890');
    await clicar(/Confirmar saída/);
    await waitFor(() => expect(screen.getByText(/Saída realizada/i)).toBeInTheDocument());

    await clicar(/Ler próximo código/);
    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
  });

  it('o leitor não expõe valor financeiro', async () => {
    renderFluxo(dadosBase());
    await escanear('7891234567890');
    await screen.findByRole('button', { name: /Confirmar saída/ });

    expect(document.body.textContent).not.toMatch(/R\$/);
    expect(document.body.textContent).not.toMatch(/custo|margem|markup|fornecedor/i);
  });
});

describe('FluxoMovimentacao — validação de saída', () => {
  it('bloqueia saída acima do saldo sem chamar o servidor', async () => {
    const dados = dadosBase();
    renderFluxo(dados);
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, '20');
    await clicar(/Confirmar saída/);

    expect(await screen.findByText(/apenas 8 UN neste setor/)).toBeInTheDocument();
    expect(dados.registrar).not.toHaveBeenCalled();
  });

  it('não mostra erro de quantidade antes da primeira tentativa', async () => {
    renderFluxo(dadosBase());
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, '99');
    expect(screen.queryByText(/apenas 8 UN/)).not.toBeInTheDocument();
  });

  it('bloqueia quantidade inválida digitada', async () => {
    const dados = dadosBase();
    renderFluxo(dados);
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
    renderFluxo(dados);
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, '2');
    await clicar(/Confirmar saída/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        produtoId: 'prod-coca',
        setorId: 'setor-cozinha',
        quantidade: 2,
      }),
    ));
  });

  it('usa quantidade 1 por padrão', async () => {
    const dados = dadosBase();
    renderFluxo(dados);
    await irAteQuantidade();

    await clicar(/Confirmar saída/);
    await waitFor(() => expect(dados.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ quantidade: 1 }),
    ));
  });

  it('os botões [-] e [+] alteram a quantidade enviada', async () => {
    const dados = dadosBase();
    renderFluxo(dados);
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
    renderFluxo(dados);
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
    renderFluxo(dados);
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
    renderFluxo(dados);
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
    renderFluxo(dados);
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
    renderFluxo(dados);
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
    dados.buscarProdutos = vi.fn().mockResolvedValue({
      produtos: [{ ...COCA, saldo: 5000 }], erro: null, obsoleto: false,
    });
    renderFluxo(dados);
    const campo = await irAteQuantidade();

    digitarQuantidade(campo, '1000');
    await clicar('Aumentar quantidade');
    await clicar(/Confirmar saída/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ quantidade: 1001 }),
    ));
  });

  it('mostra o resultado com o saldo atualizado', async () => {
    renderFluxo(dadosBase());
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
    renderFluxo(dados);
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
    renderFluxo(dados);
    await irAteQuantidade();

    await clicar(/Confirmar saída/);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('Procure um responsável'),
    ));
    expect(screen.queryByText(/Saída realizada/i)).not.toBeInTheDocument();
  });
});

describe('FluxoMovimentacao — câmera', () => {
  beforeEach(() => {
    camera.codigo = '7891234567890';
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
  });

  afterEach(() => {
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  });

  const abrirCamera = () => clicar(/Ler pela câmera/);
  const estadoCamera = () => screen.getByTestId('camera-estado').textContent;
  const lerPelaCamera = () => clicar('simular leitura');

  /** Deixa rodar o refoco do blur (setTimeout 0) antes de conferir o foco. */
  async function esperarRefoco() {
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  }

  it('o botão "Ler pela câmera" abre a câmera lendo', async () => {
    renderFluxo(dadosBase());
    await abrirCamera();

    expect(estadoCamera()).toBe('lendo');
    expect(screen.queryByRole('button', { name: /Ler pela câmera/ })).not.toBeInTheDocument();
  });

  it('o código da câmera abre a quantidade com a câmera escondida, sem registrar', async () => {
    const dados = dadosBase();
    renderFluxo(dados);
    await abrirCamera();
    await lerPelaCamera();

    expect(await screen.findByRole('button', { name: /Confirmar saída/ })).toBeInTheDocument();
    expect(dados.buscarPorBarcode).toHaveBeenCalledWith('7891234567890');
    expect(estadoCamera()).toBe('oculta');
    expect(dados.registrar).not.toHaveBeenCalled();
  });

  it('volta a ler depois de confirmar e tocar "Ler próximo código"', async () => {
    renderFluxo(dadosBase());
    await abrirCamera();
    await lerPelaCamera();
    await clicar(/Confirmar saída/);

    expect(await screen.findByText(/Saída realizada/i)).toBeInTheDocument();
    expect(estadoCamera()).toBe('oculta');

    await clicar(/Ler próximo código/);
    await waitFor(() => expect(estadoCamera()).toBe('lendo'));
  });

  it('duas saídas seguidas do mesmo produto pela câmera buscam e registram as duas', async () => {
    const dados = dadosBase();
    renderFluxo(dados);
    await abrirCamera();

    await lerPelaCamera();
    await clicar(/Confirmar saída/);
    await screen.findByText(/Saída realizada/i);
    await clicar(/Ler próximo código/);

    await lerPelaCamera();
    await clicar(/Confirmar saída/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(2));
    expect(dados.buscarPorBarcode).toHaveBeenCalledTimes(2);
  });

  it('produto em vários setores pergunta o setor com a câmera escondida', async () => {
    const dados = dadosBase();
    dados.buscarPorBarcode = vi.fn().mockResolvedValue({
      status: 'encontrado', produto: COCA, setores: SETORES,
    });
    renderFluxo(dados);
    await abrirCamera();
    await lerPelaCamera();

    expect(await screen.findByText(/De qual setor deseja retirar/)).toBeInTheDocument();
    expect(estadoCamera()).toBe('oculta');
  });

  it('código inválido da câmera avisa sem ir ao servidor', async () => {
    const dados = dadosBase();
    camera.codigo = '12';
    renderFluxo(dados);
    await abrirCamera();
    await lerPelaCamera();

    expect(await screen.findByText(/Código muito curto/)).toBeInTheDocument();
    expect(dados.buscarPorBarcode).not.toHaveBeenCalled();
  });

  it('leitura da câmera fora do passo de leitura é ignorada', async () => {
    const dados = dadosBase();
    renderFluxo(dados);
    await abrirCamera();
    await lerPelaCamera();
    await screen.findByRole('button', { name: /Confirmar saída/ });

    // A câmera real fica pausada aqui; o fluxo não confia só nisso.
    await lerPelaCamera();
    expect(dados.buscarPorBarcode).toHaveBeenCalledTimes(1);
  });

  it('Voltar na quantidade volta ao leitor com a câmera lendo', async () => {
    renderFluxo(dadosBase());
    await abrirCamera();
    await lerPelaCamera();
    await screen.findByRole('button', { name: /Confirmar saída/ });

    await clicar('Voltar');
    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    expect(estadoCamera()).toBe('lendo');
  });

  it('"Lançar manualmente" fecha a câmera', async () => {
    renderFluxo(dadosBase());
    await abrirCamera();

    await irParaManual();
    expect(screen.queryByTestId('camera')).not.toBeInTheDocument();
  });

  it('com a câmera aberta o campo do código não puxa o foco (teclado cobriria a imagem)', async () => {
    renderFluxo(dadosBase());
    const campo = await screen.findByRole('textbox', { name: 'Código de barras' });
    await waitFor(() => expect(campo).toHaveFocus());

    await abrirCamera();
    await esperarRefoco();
    expect(campo).not.toHaveFocus();

    // Nem ao voltar para o leitor depois de uma leitura.
    await lerPelaCamera();
    await screen.findByRole('button', { name: /Confirmar saída/ });
    await clicar('Voltar');
    const campoNovo = await screen.findByRole('textbox', { name: 'Código de barras' });
    await esperarRefoco();
    expect(campoNovo).not.toHaveFocus();
  });

  it('leitor físico continua funcionando com a câmera aberta', async () => {
    const dados = dadosBase();
    renderFluxo(dados);
    await abrirCamera();
    await esperarRefoco();
    const campo = screen.getByRole('textbox', { name: 'Código de barras' });
    expect(campo).not.toHaveFocus();

    // Atalho do navegador e Espaço (aciona o botão focado) não são bipe.
    fireEvent.keyDown(document.body, { key: 'r', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(campo).not.toHaveFocus();

    // O primeiro dígito do bipe leva o foco ao campo; o resto cai nele.
    fireEvent.keyDown(document.body, { key: '7' });
    expect(campo).toHaveFocus();
    fireEvent.change(campo, { target: { value: '7891234567890' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(dados.buscarPorBarcode).toHaveBeenCalledWith('7891234567890'));
  });

  it('fechar a câmera devolve o foco ao campo do código', async () => {
    renderFluxo(dadosBase());
    await abrirCamera();
    await clicar('fechar câmera fake');

    expect(screen.queryByTestId('camera')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Código de barras' })).toHaveFocus());
  });

  it('navegador sem acesso à câmera não mostra o botão', async () => {
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    renderFluxo(dadosBase());

    await screen.findByRole('textbox', { name: 'Código de barras' });
    expect(screen.queryByRole('button', { name: /Ler pela câmera/ })).not.toBeInTheDocument();
  });
});
