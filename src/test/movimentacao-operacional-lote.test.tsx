/**
 * Movimentação Operacional — saída de vários itens no mesmo lançamento.
 *
 * O operador confirma um item direto ou toca "Adicionar mais itens": o item vai
 * para uma lista, o leitor volta, e a lista é conferida e gravada de uma vez
 * (tudo ou nada). Garantias que não podem regredir:
 *   · nada é gravado antes da confirmação da lista;
 *   · a lista vai numa chamada só — nunca N chamadas da saída unitária;
 *   · o saldo é conferido pela soma do produto na lista;
 *   · reenvio da mesma lista reaproveita as chaves de cada item;
 *   · item recusado pelo servidor aparece na própria linha.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { limparRegistroDaAba } from '@/lib/chaveOperacao';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FluxoMovimentacao from '@/components/estoque-operacional/FluxoMovimentacao';
import type { ProdutoOperacional, SetorOperacional } from '@/domain/estoque/operacional';

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('@/hooks/useScopedToast', () => ({
  useScopedToast: () => ({ error: mockToastError, success: mockToastSuccess }),
}));

vi.mock('@/components/camera/LeitorCamera', () => ({ default: () => null }));

const SETORES: SetorOperacional[] = [
  { setorId: 'setor-cozinha', nome: 'Cozinha' },
  { setorId: 'setor-delivery', nome: 'Delivery' },
];

const COCA: ProdutoOperacional = {
  produtoId: 'prod-coca', nome: 'Coca-Cola Lata 350ml', sku: 'MP-0050', unidadeMedida: 'UN', saldo: 8, vinculado: true,
};
const AGUA: ProdutoOperacional = {
  produtoId: 'prod-agua', nome: 'Água Mineral 500ml', sku: 'MP-0051', unidadeMedida: 'UN', saldo: 20, vinculado: true,
};

const COD_COCA = '7891234567890';
const COD_AGUA = '7891234567891';

type ItemEnviado = { produtoId: string; setorId: string; quantidade: number; clientRequestId: string };

function dadosBase() {
  return {
    setores: SETORES,
    setoresLoading: false,
    setoresErro: null as string | null,
    recarregarSetores: vi.fn(),
    buscarProdutos: vi.fn().mockResolvedValue({ produtos: [COCA, AGUA], erro: null, obsoleto: false }),
    buscarPorBarcode: vi.fn().mockImplementation(async (codigo: string) => ({
      status: 'encontrado',
      produto: codigo === COD_AGUA ? AGUA : COCA,
      setores: [SETORES[0]],
    })),
    registrar: vi.fn().mockResolvedValue({
      ok: true,
      resultado: {
        id: 'mov-1', idempotente: false, produtoNome: COCA.nome, unidadeMedida: 'UN',
        setor: 'Cozinha', quantidade: 1, saldoAnterior: 8, saldoNovo: 7,
      },
    }),
    registrarLote: vi.fn().mockImplementation(async ({ itens }: { itens: ItemEnviado[] }) => ({
      ok: true,
      resultados: itens.map((i, idx) => {
        const produto = i.produtoId === AGUA.produtoId ? AGUA : COCA;
        return {
          id: `mov-${idx}`, idempotente: false, produtoNome: produto.nome, unidadeMedida: 'UN',
          setor: 'Cozinha', quantidade: i.quantidade, saldoAnterior: produto.saldo,
          saldoNovo: produto.saldo - i.quantidade,
        };
      }),
    })),
    carregarHistorico: vi.fn().mockResolvedValue([]),
  };
}

function renderFluxo(dados = dadosBase(), setores = SETORES) {
  const onRegistrado = vi.fn();
  render(<FluxoMovimentacao setores={setores} dados={dados as never} onRegistrado={onRegistrado} />);
  return { dados, onRegistrado };
}

const clicar = async (nome: RegExp | string) =>
  fireEvent.click(await screen.findByRole('button', { name: nome }));

async function escanear(codigo: string) {
  const campo = await screen.findByRole('textbox', { name: 'Código de barras' });
  fireEvent.change(campo, { target: { value: codigo } });
  fireEvent.keyDown(campo, { key: 'Enter' });
}

async function quantidade(valor: string) {
  const campo = await screen.findByRole('textbox', { name: 'Quantidade' });
  fireEvent.change(campo, { target: { value: valor } });
}

/** Bipa, informa a quantidade e manda o item para a lista. */
async function adicionar(codigo: string, qtd: string, botao: RegExp) {
  await escanear(codigo);
  await quantidade(qtd);
  await clicar(botao);
}

/** Coca (2) e Água (3) na lista, tela na revisão. */
async function montarListaComDoisItens() {
  await adicionar(COD_COCA, '2', /Adicionar mais itens/);
  await adicionar(COD_AGUA, '3', /Adicionar e revisar a saída/);
  await screen.findByText(/Confira os itens da saída/);
}

const linhaDe = (nome: string) => screen.getByText(nome).closest('li') as HTMLElement;

beforeEach(() => {
  mockToastError.mockClear();
  mockToastSuccess.mockClear();
  limparRegistroDaAba();
  sessionStorage.clear();
});
afterEach(() => cleanup());

describe('Saída com vários itens — montagem da lista', () => {
  it('a tela de quantidade oferece confirmar direto ou adicionar mais itens', async () => {
    renderFluxo();
    await escanear(COD_COCA);

    expect(await screen.findByRole('button', { name: /Confirmar saída/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Adicionar mais itens/ })).toBeInTheDocument();
  });

  it('confirmar direto continua sendo a saída de um item só', async () => {
    const { dados } = renderFluxo();
    await escanear(COD_COCA);
    await clicar(/Confirmar saída/);

    await waitFor(() => expect(dados.registrar).toHaveBeenCalledTimes(1));
    expect(dados.registrarLote).not.toHaveBeenCalled();
  });

  it('"Adicionar mais itens" guarda o item e volta ao leitor, sem gravar nada', async () => {
    const { dados } = renderFluxo();
    await adicionar(COD_COCA, '2', /Adicionar mais itens/);

    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    const resumo = screen.getByRole('region', { name: 'Itens desta saída' });
    expect(within(resumo).getByText('1 item nesta saída')).toBeInTheDocument();
    expect(within(resumo).getByText(/Último: Coca-Cola Lata 350ml · −2 UN/)).toBeInTheDocument();
    expect(dados.registrar).not.toHaveBeenCalled();
    expect(dados.registrarLote).not.toHaveBeenCalled();
  });

  it('com a lista em andamento, o próximo item é adicionado — não confirmado sozinho', async () => {
    renderFluxo();
    await adicionar(COD_COCA, '2', /Adicionar mais itens/);
    await escanear(COD_AGUA);

    expect(await screen.findByRole('button', { name: /Adicionar e ler próximo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Adicionar e revisar a saída/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Confirmar saída$/ })).not.toBeInTheDocument();
  });

  it('bipar de novo o mesmo produto soma na linha que já existe', async () => {
    renderFluxo();
    await adicionar(COD_COCA, '2', /Adicionar mais itens/);
    await adicionar(COD_COCA, '3', /Adicionar e revisar a saída/);

    await screen.findByText(/Confira os itens da saída/);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(within(linhaDe(COCA.nome)).getByText('−5')).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/quantidade somada/));
  });

  it('confere o saldo pela soma do produto na lista', async () => {
    const { dados } = renderFluxo();
    await adicionar(COD_COCA, '6', /Adicionar mais itens/);
    await escanear(COD_COCA);

    expect(await screen.findByText(/Já na lista: 6 UN/)).toBeInTheDocument();
    await quantidade('3');
    await clicar(/Adicionar e ler próximo/);

    expect(await screen.findByText(/A lista já tem 6 UN deste produto; restam 2 UN/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Código de barras' })).not.toBeInTheDocument();
    expect(dados.registrarLote).not.toHaveBeenCalled();
  });

  it('no manual, o próximo item é escolhido na lista do mesmo setor', async () => {
    const { dados } = renderFluxo();
    await clicar(/Lançar manualmente/);
    await clicar('Delivery');
    await clicar(/Coca-Cola Lata 350ml/);
    await clicar(/Adicionar mais itens/);

    expect(await screen.findByText(/Setor atual:/)).toBeInTheDocument();
    expect(dados.buscarProdutos).toHaveBeenLastCalledWith('setor-delivery', '');
    await clicar(/Água Mineral 500ml/);
    expect(await screen.findByRole('button', { name: /Adicionar e escolher outro/ })).toBeInTheDocument();
  });

  it('Voltar na revisão volta a ler, sem perder a lista', async () => {
    renderFluxo();
    await montarListaComDoisItens();
    await clicar('Voltar');

    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    expect(screen.getByText('2 itens nesta saída')).toBeInTheDocument();
  });
});

describe('Saída com vários itens — revisão e confirmação', () => {
  it('grava a lista inteira numa chamada só, com a observação para todos', async () => {
    const { dados, onRegistrado } = renderFluxo();
    await montarListaComDoisItens();
    fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: 'reposição do salão' } });
    await clicar(/Confirmar saída de 2 itens/);

    await waitFor(() => expect(dados.registrarLote).toHaveBeenCalledTimes(1));
    const { itens, observacao } = dados.registrarLote.mock.calls[0][0] as { itens: ItemEnviado[]; observacao: string };
    expect(observacao).toBe('reposição do salão');
    expect(itens.map(i => [i.produtoId, i.setorId, i.quantidade])).toEqual([
      ['prod-coca', 'setor-cozinha', 2],
      ['prod-agua', 'setor-cozinha', 3],
    ]);
    expect(new Set(itens.map(i => i.clientRequestId)).size).toBe(2);
    expect(dados.registrar).not.toHaveBeenCalled();

    expect(await screen.findByText(/Saída realizada/i)).toBeInTheDocument();
    expect(screen.getByText('2 itens')).toBeInTheDocument();
    expect(screen.getByText(/Saldo agora: 6 UN/)).toBeInTheDocument();
    expect(screen.getByText(/Saldo agora: 17 UN/)).toBeInTheDocument();
    expect(onRegistrado).toHaveBeenCalledTimes(1);
  });

  it('item recusado aparece na linha, avisa que nada foi gravado e mantém a lista', async () => {
    const dados = dadosBase();
    dados.registrarLote.mockResolvedValueOnce({
      ok: false, indice: 1, erro: 'Quantidade indisponível. Existem apenas 1 neste setor.',
    });
    const { onRegistrado } = renderFluxo(dados);
    await montarListaComDoisItens();
    await clicar(/Confirmar saída de 2 itens/);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(
      `${AGUA.nome}: Quantidade indisponível. Existem apenas 1 neste setor. Nenhum item foi registrado.`,
    ));
    expect(within(linhaDe(AGUA.nome)).getByText(/Existem apenas 1 neste setor/)).toBeInTheDocument();
    expect(within(linhaDe(COCA.nome)).queryByText(/Existem apenas/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saída realizada/i)).not.toBeInTheDocument();
    expect(onRegistrado).not.toHaveBeenCalled();
  });

  it('reenviar a mesma lista reaproveita as chaves, para o servidor deduplicar', async () => {
    const dados = dadosBase();
    dados.registrarLote.mockResolvedValueOnce({ ok: false, indice: null, erro: 'Falha de rede' });
    renderFluxo(dados);
    await montarListaComDoisItens();
    await clicar(/Confirmar saída de 2 itens/);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Falha de rede'));
    await clicar(/Confirmar saída de 2 itens/);

    await waitFor(() => expect(dados.registrarLote).toHaveBeenCalledTimes(2));
    const chaves = (n: number) =>
      (dados.registrarLote.mock.calls[n][0] as { itens: ItemEnviado[] }).itens.map(i => i.clientRequestId);
    expect(chaves(1)).toEqual(chaves(0));
  });

  it('lista sem resposta → descartar → montar a mesma lista de novo: as chaves se repetem', async () => {
    // A lista pode ter sido gravada: remontá-la não pode dar saída duas vezes.
    const dados = dadosBase();
    dados.registrarLote.mockResolvedValueOnce({ ok: false, indice: null, erro: 'Falha de rede' });
    renderFluxo(dados);
    await montarListaComDoisItens();
    await clicar(/Confirmar saída de 2 itens/);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Falha de rede'));

    await clicar('Descartar lista');
    await clicar('Descartar');
    await montarListaComDoisItens();
    await clicar(/Confirmar saída de 2 itens/);

    await waitFor(() => expect(dados.registrarLote).toHaveBeenCalledTimes(2));
    const chaves = (n: number) =>
      (dados.registrarLote.mock.calls[n][0] as { itens: ItemEnviado[] }).itens.map(i => i.clientRequestId);
    expect(chaves(1)).toEqual(chaves(0));
  });

  it('alterar a quantidade de um item muda só a chave dele', async () => {
    const dados = dadosBase();
    dados.registrarLote.mockResolvedValueOnce({ ok: false, indice: null, erro: 'Falha de rede' });
    renderFluxo(dados);
    await montarListaComDoisItens();
    await clicar(/Confirmar saída de 2 itens/);
    await waitFor(() => expect(dados.registrarLote).toHaveBeenCalledTimes(1));

    await clicar(`Alterar quantidade de ${COCA.nome}`);
    await quantidade('4');
    await clicar(/Salvar quantidade/);
    expect(within(linhaDe(COCA.nome)).getByText('−4')).toBeInTheDocument();
    await clicar(/Confirmar saída de 2 itens/);

    await waitFor(() => expect(dados.registrarLote).toHaveBeenCalledTimes(2));
    const [antes, depois] = dados.registrarLote.mock.calls.map(
      c => (c[0] as { itens: ItemEnviado[] }).itens,
    );
    expect(depois[0].quantidade).toBe(4);
    expect(depois[0].clientRequestId).not.toBe(antes[0].clientRequestId);
    expect(depois[1].clientRequestId).toBe(antes[1].clientRequestId);
  });

  it('alterar respeita o saldo sem contar a quantidade antiga do item', async () => {
    renderFluxo();
    await montarListaComDoisItens();
    await clicar(`Alterar quantidade de ${COCA.nome}`);

    await quantidade('8');
    await clicar(/Salvar quantidade/);
    expect(within(linhaDe(COCA.nome)).getByText('−8')).toBeInTheDocument();

    await clicar(`Alterar quantidade de ${COCA.nome}`);
    await quantidade('9');
    await clicar(/Salvar quantidade/);
    expect(await screen.findByText(/Existem apenas 8 UN/)).toBeInTheDocument();
  });

  it('Voltar ao alterar desiste da alteração', async () => {
    renderFluxo();
    await montarListaComDoisItens();
    await clicar(`Alterar quantidade de ${COCA.nome}`);
    await quantidade('7');
    await clicar('Voltar');

    await screen.findByText(/Confira os itens da saída/);
    expect(within(linhaDe(COCA.nome)).getByText('−2')).toBeInTheDocument();
  });

  it('remover um item tira só ele; remover o último volta ao leitor', async () => {
    renderFluxo();
    await montarListaComDoisItens();

    await clicar(`Remover ${COCA.nome}`);
    expect(screen.queryByText(COCA.nome)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar saída de 1 item/ })).toBeInTheDocument();

    await clicar(`Remover ${AGUA.nome}`);
    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Itens desta saída' })).not.toBeInTheDocument();
  });

  it('descartar a lista pede confirmação e não grava nada', async () => {
    const { dados } = renderFluxo();
    await montarListaComDoisItens();

    await clicar('Descartar lista');
    await clicar('Descartar');

    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Itens desta saída' })).not.toBeInTheDocument();
    expect(dados.registrarLote).not.toHaveBeenCalled();
  });

  it('depois do sucesso, o próximo lançamento começa com a lista vazia', async () => {
    renderFluxo();
    await montarListaComDoisItens();
    await clicar(/Confirmar saída de 2 itens/);
    await clicar(/Ler próximo código/);

    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Itens desta saída' })).not.toBeInTheDocument();
  });

  it('não mostra valor financeiro na revisão nem no resultado', async () => {
    renderFluxo();
    await montarListaComDoisItens();
    expect(document.body.textContent).not.toMatch(/R\$|custo|valor/i);

    await clicar(/Confirmar saída de 2 itens/);
    await screen.findByText(/Saída realizada/i);
    expect(document.body.textContent).not.toMatch(/R\$|custo|valor/i);
  });
});
