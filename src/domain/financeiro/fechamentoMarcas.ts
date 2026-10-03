import { normalizeBRLMoneyToNumber } from '@/lib/formatters';

export type FormaVenda = 'PEDIDOS' | 'PESSOAS';

export const FORMA_VENDA_LABEL: Record<FormaVenda, string> = {
  PEDIDOS: 'Pedidos',
  PESSOAS: 'Pessoas',
};

export const FORMA_VENDA_OPTIONS: { value: FormaVenda; label: string }[] = [
  { value: 'PEDIDOS', label: FORMA_VENDA_LABEL.PEDIDOS },
  { value: 'PESSOAS', label: FORMA_VENDA_LABEL.PESSOAS },
];

interface MarcaRef {
  id: string;
  forma_venda?: FormaVenda | null;
}

export interface FechamentoMarcaPayloadItem {
  marca_id: string;
  valor: number;
  quantidade: number | null;
}

/** Quantidade é contagem inteira; campo vazio é "não informado", nunca zero. */
export function parseQuantidadeInteira(raw: string | null | undefined): number | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const value = Number(digits.slice(0, 9));
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Forma de venda que vale para a marca NESTE fechamento: a que o dia já tinha
 * gravada manda sobre a atual da marca (mesma regra da RPC), para o campo de
 * quantidade não trocar de unidade ao editar um dia antigo.
 */
export function resolveFormaVendaDoDia<T extends MarcaRef>(
  brands: T[],
  formasDoDia: Record<string, FormaVenda | null | undefined>
): T[] {
  return brands.map(brand => ({ ...brand, forma_venda: formasDoDia[brand.id] ?? brand.forma_venda ?? null }));
}

/**
 * `optionalQuantidade`: marcas de um dia lançado antes de existir a quantidade.
 * Enquanto o campo ficar vazio, o dia pode ser editado sem inventar um número.
 */
export function buildFechamentoMarcaPayload(
  brands: MarcaRef[],
  values: Record<string, string>,
  quantities: Record<string, string> = {},
  optionalQuantidade: ReadonlySet<string> = new Set()
) {
  const items = brands.map<FechamentoMarcaPayloadItem>(brand => ({
    marca_id: brand.id,
    valor: normalizeBRLMoneyToNumber(values[brand.id] || '') ?? 0,
    // Marca legada sem forma de venda não tem unidade para a quantidade.
    quantidade: brand.forma_venda ? parseQuantidadeInteira(quantities[brand.id]) : null,
  }));

  const sumByForma = (forma: FormaVenda) => items.reduce(
    (sum, item, index) => sum + (brands[index].forma_venda === forma ? item.quantidade ?? 0 : 0),
    0
  );

  return {
    items,
    total: items.reduce((sum, item) => sum + item.valor, 0),
    totalPedidos: sumByForma('PEDIDOS'),
    totalPessoas: sumByForma('PESSOAS'),
    // Marca com faturamento precisa da quantidade (pedidos/pessoas) do dia.
    missingQuantidade: items
      .filter((item, index) => brands[index].forma_venda && item.valor > 0 && !item.quantidade)
      .filter(item => !(optionalQuantidade.has(item.marca_id) && item.quantidade == null))
      .map(item => item.marca_id),
  };
}

// ── Leitura: fechamento detalhado por marca ──

export interface FechamentoMarcaLinha {
  marcaId: string;
  nome: string;
  valor: number;
  quantidade: number | null;
  formaVenda: FormaVenda | null;
}

export interface FechamentoDia {
  id: string;
  data: string;
  bruto: number;
  taxas: number;
  descontos: number;
  liquido: number;
  observacao: string | null;
  marcas: FechamentoMarcaLinha[];
  totalPedidos: number;
  totalPessoas: number;
}

export interface FechamentoResumoMarca {
  marcaId: string;
  nome: string;
  formaVenda: FormaVenda | null;
  valor: number;
  quantidade: number;
  /** Faturamento apenas dos dias com quantidade informada — base do ticket médio. */
  valorComQuantidade: number;
}

interface FechamentoRowInput {
  id: string;
  data: string;
  faturamento_bruto: number;
  taxas: number;
  descontos: number;
  faturamento_liquido: number;
  observacao: string | null;
}

interface MarcaValorInput {
  fechamento_id: string;
  marca_id: string;
  valor_bruto: number;
  quantidade?: number | null;
  forma_venda?: FormaVenda | null;
}

interface MarcaInfo {
  id: string;
  nome: string;
  ordem?: number;
}

export function ticketMedio(valor: number, quantidade: number | null | undefined): number | null {
  if (!quantidade || quantidade <= 0) return null;
  return valor / quantidade;
}

export function sumQuantidade(linhas: Pick<FechamentoMarcaLinha, 'quantidade' | 'formaVenda'>[], forma: FormaVenda) {
  return linhas.reduce((sum, linha) => sum + (linha.formaVenda === forma ? linha.quantidade ?? 0 : 0), 0);
}

export function formatQuantidadeForma(quantidade: number | null, forma: FormaVenda | null): string {
  if (quantidade == null || !forma) return '—';
  const unidade = forma === 'PEDIDOS'
    ? (quantidade === 1 ? 'pedido' : 'pedidos')
    : (quantidade === 1 ? 'pessoa' : 'pessoas');
  return `${quantidade.toLocaleString('pt-BR')} ${unidade}`;
}

export function buildFechamentoDias(
  rows: FechamentoRowInput[],
  valores: MarcaValorInput[],
  marcas: MarcaInfo[]
): FechamentoDia[] {
  const marcaById = new Map(marcas.map((marca, index) => [marca.id, { marca, index }]));
  const linhasByFechamento = new Map<string, (FechamentoMarcaLinha & { sort: number })[]>();

  valores.forEach(valor => {
    const info = marcaById.get(valor.marca_id);
    const linhas = linhasByFechamento.get(valor.fechamento_id) || [];
    linhas.push({
      marcaId: valor.marca_id,
      nome: info?.marca.nome || 'Marca removida',
      valor: Number(valor.valor_bruto),
      quantidade: valor.quantidade ?? null,
      formaVenda: valor.quantidade == null ? null : valor.forma_venda ?? null,
      sort: info?.marca.ordem ?? info?.index ?? Number.MAX_SAFE_INTEGER,
    });
    linhasByFechamento.set(valor.fechamento_id, linhas);
  });

  return rows.map(row => {
    const marcasDoDia = (linhasByFechamento.get(row.id) || [])
      .sort((a, b) => a.sort - b.sort || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map(({ sort: _sort, ...linha }) => linha);

    return {
      id: row.id,
      data: row.data,
      bruto: Number(row.faturamento_bruto),
      taxas: Number(row.taxas),
      descontos: Number(row.descontos),
      liquido: Number(row.faturamento_liquido),
      observacao: row.observacao,
      marcas: marcasDoDia,
      totalPedidos: sumQuantidade(marcasDoDia, 'PEDIDOS'),
      totalPessoas: sumQuantidade(marcasDoDia, 'PESSOAS'),
    };
  });
}

/**
 * Consolida o período por marca. Uma marca que trocou de forma de venda no
 * meio do período aparece em uma linha por forma — pedidos e pessoas não somam.
 */
export function buildResumoPorMarca(dias: FechamentoDia[]): FechamentoResumoMarca[] {
  const resumo = new Map<string, FechamentoResumoMarca>();

  dias.forEach(dia => dia.marcas.forEach(linha => {
    const key = `${linha.marcaId}|${linha.formaVenda ?? ''}`;
    const atual = resumo.get(key) || {
      marcaId: linha.marcaId,
      nome: linha.nome,
      formaVenda: linha.formaVenda,
      valor: 0,
      quantidade: 0,
      valorComQuantidade: 0,
    };
    atual.valor += linha.valor;
    if (linha.quantidade != null && linha.formaVenda) {
      atual.quantidade += linha.quantidade;
      atual.valorComQuantidade += linha.valor;
    }
    resumo.set(key, atual);
  }));

  // Dias sem quantidade (legado) entram na linha da forma única da marca, em
  // vez de virarem uma segunda linha "sem forma" para a mesma marca.
  Array.from(resumo.entries()).forEach(([key, semForma]) => {
    if (semForma.formaVenda) return;
    const comForma = Array.from(resumo.values()).filter(
      item => item.marcaId === semForma.marcaId && item.formaVenda
    );
    if (comForma.length !== 1) return;
    comForma[0].valor += semForma.valor;
    resumo.delete(key);
  });

  return Array.from(resumo.values()).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
}
