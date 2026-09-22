/**
 * Lista de códigos de barras no cadastro de produto.
 *
 * Cobre o que não pode regredir:
 *   · o Enter do leitor acrescenta o código, NUNCA salva o produto;
 *   · N códigos convivem no mesmo produto;
 *   · o produto não é gravado quando um código pertence a outro produto;
 *   · o que vai ao banco é o diff, com o DELETE antes do INSERT.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProdutoFormPanel, { emptyProdForm } from '@/components/estoque/ProdutoFormPanel';
import type { ProdutoFormData, ProdutoExtended } from '@/types/estoque';
import type { CodigoBarrasProduto, DiffCodigos } from '@/domain/estoque/barcode';

const mockToastError = vi.fn();
vi.mock('@/hooks/useScopedToast', () => ({
  useScopedToast: () => ({ error: mockToastError, success: vi.fn(), info: vi.fn() }),
}));

/** Formulário mínimo que passa nas validações de produto. */
const FORM_VALIDO: ProdutoFormData = {
  ...emptyProdForm,
  nomeProduto: 'Açúcar Refinado 1kg',
  fatorConversaoPadrao: 1,
  minPurchaseQty: 2,
  idealPurchaseQty: 4,
};

function criarProps(over: Partial<Record<string, unknown>> = {}) {
  return {
    categorias: ['Mercearia'],
    locais: ['Estoque Seco'],
    batchMode: false,
    setBatchMode: vi.fn(),
    onClose: vi.fn(),
    onSave: vi.fn(),
    onUpdate: vi.fn(),
    addProduto: vi.fn().mockResolvedValue({ id: 'prod-novo', sku: 'MP-0100' } as unknown as ProdutoExtended),
    updateProduto: vi.fn().mockResolvedValue(undefined),
    fetchCodigosBarras: vi.fn().mockResolvedValue([] as CodigoBarrasProduto[]),
    // A RPC devolve a lista gravada, já com os ids do banco.
    salvarCodigosBarras: vi.fn().mockResolvedValue([] as CodigoBarrasProduto[]),
    verificarCodigosLivres: vi.fn().mockResolvedValue(null),
    ...over,
  };
}

/** Segura `prodForm`/`saving` como o EstoqueGeralView faz. */
function Harness({ editProdId = null, ...props }: Record<string, unknown> & { editProdId?: string | null }) {
  const [prodForm, setProdForm] = useState<ProdutoFormData>(FORM_VALIDO);
  const [saving, setSaving] = useState(false);
  return (
    <ProdutoFormPanel
      {...(props as never)}
      editProdId={editProdId}
      prodForm={prodForm}
      setProdForm={setProdForm}
      saving={saving}
      setSaving={setSaving}
    />
  );
}

const campoCodigo = () => screen.getByLabelText('Código de barras');
const campoMarca = () => screen.getByLabelText('Marca do código de barras');
const botaoAdicionar = () => screen.getByLabelText('Adicionar código de barras');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe('lista de códigos de barras', () => {
  it('adiciona o código pelo botão [+]', () => {
    render(<Harness {...criarProps()} />);

    fireEvent.change(campoCodigo(), { target: { value: '7891234567890' } });
    fireEvent.change(campoMarca(), { target: { value: 'União' } });
    fireEvent.click(botaoAdicionar());

    expect(screen.getByText('7891234567890')).toBeInTheDocument();
    expect(screen.getByText('União')).toBeInTheDocument();
    // O campo esvazia para a próxima leitura.
    expect((campoCodigo() as HTMLInputElement).value).toBe('');
  });

  it('o Enter do leitor adiciona o código e NÃO salva o produto', async () => {
    const props = criarProps();
    render(<Harness {...props} />);

    fireEvent.change(campoCodigo(), { target: { value: '7891234567890' } });
    fireEvent.keyDown(campoCodigo(), { key: 'Enter' });

    expect(screen.getByText('7891234567890')).toBeInTheDocument();
    // A armadilha: o leitor HID manda Enter no fim da leitura. Antes disso o
    // formulário era submetido e o produto nascia no meio do cadastro.
    await waitFor(() => {
      expect(props.addProduto).not.toHaveBeenCalled();
    });
  });

  it('guarda marcas diferentes do mesmo produto', () => {
    render(<Harness {...criarProps()} />);

    fireEvent.change(campoCodigo(), { target: { value: '7891234567890' } });
    fireEvent.change(campoMarca(), { target: { value: 'União' } });
    fireEvent.click(botaoAdicionar());

    fireEvent.change(campoCodigo(), { target: { value: '7890000000017' } });
    fireEvent.change(campoMarca(), { target: { value: 'Caravelas' } });
    fireEvent.click(botaoAdicionar());

    expect(screen.getByText('7891234567890')).toBeInTheDocument();
    expect(screen.getByText('7890000000017')).toBeInTheDocument();
    expect(screen.getByText(/Bipar qualquer um destes códigos/)).toBeInTheDocument();
  });

  it('recusa o mesmo código duas vezes sem ir ao servidor', () => {
    const props = criarProps();
    render(<Harness {...props} />);

    fireEvent.change(campoCodigo(), { target: { value: '7891234567890' } });
    fireEvent.click(botaoAdicionar());
    fireEvent.change(campoCodigo(), { target: { value: '7891234567890' } });
    fireEvent.click(botaoAdicionar());

    expect(screen.getByText(/já está na lista/)).toBeInTheDocument();
    expect(props.verificarCodigosLivres).not.toHaveBeenCalled();
  });

  it('carrega os códigos existentes ao abrir em edição', async () => {
    const props = criarProps({
      fetchCodigosBarras: vi.fn().mockResolvedValue([
        { id: 'row-1', codigo: '7891234567890', rotulo: 'União' },
        { id: 'row-2', codigo: '7890000000017', rotulo: 'Caravelas' },
      ] as CodigoBarrasProduto[]),
    });
    render(<Harness editProdId="prod-1" {...props} />);

    await waitFor(() => {
      expect(screen.getByText('7891234567890')).toBeInTheDocument();
    });
    expect(screen.getByText('Caravelas')).toBeInTheDocument();
    expect(props.fetchCodigosBarras).toHaveBeenCalledWith('prod-1');
  });
});

describe('gravação dos códigos', () => {
  it('manda só o diff: remove o que saiu, adiciona o que entrou', async () => {
    const props = criarProps({
      fetchCodigosBarras: vi.fn().mockResolvedValue([
        { id: 'row-1', codigo: '7891234567890', rotulo: 'União' },
      ] as CodigoBarrasProduto[]),
    });
    render(<Harness editProdId="prod-1" {...props} />);

    await waitFor(() => expect(screen.getByText('7891234567890')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Remover código 7891234567890'));
    fireEvent.change(campoCodigo(), { target: { value: '7890000000017' } });
    fireEvent.click(botaoAdicionar());

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => expect(props.salvarCodigosBarras).toHaveBeenCalled());
    const [produtoId, diff] = (props.salvarCodigosBarras as ReturnType<typeof vi.fn>).mock.calls[0] as [string, DiffCodigos];
    expect(produtoId).toBe('prod-1');
    expect(diff.remover).toEqual(['row-1']);
    expect(diff.adicionar.map(c => c.codigo)).toEqual(['7890000000017']);
  });

  it('código de outro produto impede a gravação INTEIRA, não só a dos códigos', async () => {
    const props = criarProps({
      verificarCodigosLivres: vi.fn().mockResolvedValue(
        'O código 7891234567890 já está vinculado a "Açúcar Cristal 5kg".',
      ),
    });
    render(<Harness {...props} />);

    fireEvent.change(campoCodigo(), { target: { value: '7891234567890' } });
    fireEvent.click(botaoAdicionar());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'O código 7891234567890 já está vinculado a "Açúcar Cristal 5kg".',
      );
    });
    // O produto NÃO pode nascer: senão ficaria um cadastro pela metade, criado
    // sem os códigos que a pessoa tinha acabado de digitar.
    expect(props.addProduto).not.toHaveBeenCalled();
    expect(props.salvarCodigosBarras).not.toHaveBeenCalled();
  });

  it('produto sem nenhum código salva normalmente', async () => {
    const props = criarProps();
    render(<Harness {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(props.addProduto).toHaveBeenCalled());
    expect(props.verificarCodigosLivres).not.toHaveBeenCalled();
    const [, diff] = (props.salvarCodigosBarras as ReturnType<typeof vi.fn>).mock.calls[0] as [string, DiffCodigos];
    expect(diff).toEqual({ adicionar: [], remover: [] });
  });

  it('adota os ids que a RPC devolveu — salvar de novo não reinsere o mesmo código', async () => {
    // Sem adotar o retorno, o código recém-gravado continuaria sem id no estado
    // local e o diff seguinte tentaria inseri-lo outra vez, colidindo no índice
    // único contra a linha que acabou de ser criada.
    const props = criarProps({
      salvarCodigosBarras: vi.fn().mockResolvedValue([
        { id: 'row-gerado', codigo: '7891234567890', rotulo: 'União' },
      ] as CodigoBarrasProduto[]),
    });
    render(<Harness editProdId="prod-1" {...props} />);

    fireEvent.change(campoCodigo(), { target: { value: '7891234567890' } });
    fireEvent.change(campoMarca(), { target: { value: 'União' } });
    fireEvent.click(botaoAdicionar());
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => expect(props.salvarCodigosBarras).toHaveBeenCalledTimes(1));

    // Segundo salvamento, sem o usuário mexer em nada: o diff tem de ser vazio.
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(props.salvarCodigosBarras).toHaveBeenCalledTimes(2));

    const [, segundoDiff] = (props.salvarCodigosBarras as ReturnType<typeof vi.fn>).mock.calls[1] as [string, DiffCodigos];
    expect(segundoDiff).toEqual({ adicionar: [], remover: [] });
  });

  it('grava os códigos no produto recém-criado, com o id que voltou do INSERT', async () => {
    const props = criarProps();
    render(<Harness {...props} />);

    fireEvent.change(campoCodigo(), { target: { value: '7891234567890' } });
    fireEvent.click(botaoAdicionar());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(props.salvarCodigosBarras).toHaveBeenCalled());
    const [produtoId] = (props.salvarCodigosBarras as ReturnType<typeof vi.fn>).mock.calls[0] as [string, DiffCodigos];
    expect(produtoId).toBe('prod-novo');
  });
});
