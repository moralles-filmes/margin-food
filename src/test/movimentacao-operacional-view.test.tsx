/**
 * Tela da Movimentação Operacional — o módulo só registra saída.
 *
 * Com um tipo só, a escolha Entrada/Saída virou um clique a mais: a tela abre
 * direto no fluxo de saída, com o histórico embaixo. As entradas feitas antes
 * dessa mudança continuam no histórico — nada é apagado nem escondido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import MovimentacaoOperacionalView from '@/components/estoque-operacional/MovimentacaoOperacionalView';
import type { HistoricoOperacionalItem } from '@/hooks/useMovimentacaoOperacional';

const permissoes = new Set<string>();
vi.mock('@/permissions', () => ({
  useCan: (chave: string) => permissoes.has(chave),
}));

vi.mock('@/hooks/useScopedToast', () => ({
  useScopedToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

const HISTORICO: HistoricoOperacionalItem[] = [
  {
    id: 'mov-saida', criadoEm: '2026-09-24T17:12:00Z', produtoNome: 'Coca-Cola Lata 350ml',
    unidadeMedida: 'UN', tipo: 'SAIDA', quantidade: 2, setor: 'Cozinha', responsavel: 'Ana',
  },
  {
    id: 'mov-entrada-antiga', criadoEm: '2026-09-22T19:46:35Z', produtoNome: 'Água Mineral 500ml',
    unidadeMedida: 'UN', tipo: 'ENTRADA', quantidade: 12, setor: 'Cozinha', responsavel: 'Ana',
  },
];

const dados = {
  setores: [{ setorId: 'setor-cozinha', nome: 'Cozinha' }],
  setoresLoading: false,
  setoresErro: null as string | null,
  recarregarSetores: vi.fn(),
  buscarProdutos: vi.fn().mockResolvedValue({ produtos: [], erro: null, obsoleto: false }),
  buscarPorBarcode: vi.fn(),
  registrar: vi.fn(),
  carregarHistorico: vi.fn().mockResolvedValue(HISTORICO),
};
vi.mock('@/hooks/useMovimentacaoOperacional', () => ({
  useMovimentacaoOperacional: () => dados,
}));

beforeEach(() => {
  permissoes.clear();
  permissoes.add('operacional:movimentacao:view');
});
afterEach(() => cleanup());

describe('MovimentacaoOperacionalView', () => {
  it('abre direto no fluxo de saída, sem escolha de tipo', async () => {
    permissoes.add('operacional:movimentacao:create');
    render(<MovimentacaoOperacionalView />);

    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Saída de Estoque' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Entrada$/i })).not.toBeInTheDocument();
  });

  it('mostra o histórico embaixo do fluxo, com as entradas antigas', async () => {
    permissoes.add('operacional:movimentacao:create');
    permissoes.add('operacional:historico:view');
    render(<MovimentacaoOperacionalView />);

    expect(await screen.findByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    expect(await screen.findByText('Água Mineral 500ml')).toBeInTheDocument();
    expect(screen.getByText('+12 UN')).toBeInTheDocument();
    expect(screen.getByText('−2 UN')).toBeInTheDocument();
  });

  it('sem permissão de registrar, mostra só o aviso de consulta e o histórico', async () => {
    permissoes.add('operacional:historico:view');
    render(<MovimentacaoOperacionalView />);

    expect(await screen.findByText(/somente de consulta/)).toBeInTheDocument();
    expect(await screen.findByText('Coca-Cola Lata 350ml')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Código de barras' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Saída/ })).not.toBeInTheDocument();
  });
});
