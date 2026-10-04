/**
 * Grade dos cards da família V2 (`KpiCard` summary/highlight: Inter 24 px, `tabular-nums`, padding de
 * 20 px). Segue a largura do próprio grupo (container query), não a da janela — a sidebar
 * redimensionável (160–480 px) muda o espaço disponível. O limiar depende do valor mais longo exibido:
 * cada caractere ocupa ~13,5 px (medido em navegador: "R$123.456,78" = 162 px, "R$-1.234.567,89" =
 * 197 px), e o grupo só passa a 2, 3 ou 4 colunas quando esse valor cabe inteiro em cada card. Nunca se
 * reduz a fonte nem se corta o valor; com valor maior, a grade reorganiza.
 *
 * O wrapper da grade precisa de `[container-type:inline-size]`. As classes ficam literais para o
 * Tailwind encontrá-las.
 */
export type KpiGridColumns = 2 | 3 | 4;

const KPI_GRID_BY_LENGTH: ReadonlyArray<{ maxChars: number; className: Record<KpiGridColumns, string> }> = [
  {
    maxChars: 12,
    className: {
      2: 'grid grid-cols-1 gap-4 [@container(min-width:27rem)]:grid-cols-2',
      3: 'grid grid-cols-1 gap-4 [@container(min-width:27rem)]:grid-cols-2 [@container(min-width:41rem)]:grid-cols-3',
      4: 'grid grid-cols-1 gap-4 [@container(min-width:27rem)]:grid-cols-2 [@container(min-width:55rem)]:grid-cols-4',
    },
  },
  {
    maxChars: 13,
    className: {
      2: 'grid grid-cols-1 gap-4 [@container(min-width:29rem)]:grid-cols-2',
      3: 'grid grid-cols-1 gap-4 [@container(min-width:29rem)]:grid-cols-2 [@container(min-width:44rem)]:grid-cols-3',
      4: 'grid grid-cols-1 gap-4 [@container(min-width:29rem)]:grid-cols-2 [@container(min-width:59rem)]:grid-cols-4',
    },
  },
  {
    maxChars: 14,
    className: {
      2: 'grid grid-cols-1 gap-4 [@container(min-width:31rem)]:grid-cols-2',
      3: 'grid grid-cols-1 gap-4 [@container(min-width:31rem)]:grid-cols-2 [@container(min-width:47rem)]:grid-cols-3',
      4: 'grid grid-cols-1 gap-4 [@container(min-width:31rem)]:grid-cols-2 [@container(min-width:62rem)]:grid-cols-4',
    },
  },
  {
    maxChars: 15,
    className: {
      2: 'grid grid-cols-1 gap-4 [@container(min-width:33rem)]:grid-cols-2',
      3: 'grid grid-cols-1 gap-4 [@container(min-width:33rem)]:grid-cols-2 [@container(min-width:50rem)]:grid-cols-3',
      4: 'grid grid-cols-1 gap-4 [@container(min-width:33rem)]:grid-cols-2 [@container(min-width:66rem)]:grid-cols-4',
    },
  },
  {
    maxChars: 16,
    className: {
      2: 'grid grid-cols-1 gap-4 [@container(min-width:34rem)]:grid-cols-2',
      3: 'grid grid-cols-1 gap-4 [@container(min-width:34rem)]:grid-cols-2 [@container(min-width:52rem)]:grid-cols-3',
      4: 'grid grid-cols-1 gap-4 [@container(min-width:34rem)]:grid-cols-2 [@container(min-width:69rem)]:grid-cols-4',
    },
  },
  {
    maxChars: 17,
    className: {
      2: 'grid grid-cols-1 gap-4 [@container(min-width:36rem)]:grid-cols-2',
      3: 'grid grid-cols-1 gap-4 [@container(min-width:36rem)]:grid-cols-2 [@container(min-width:55rem)]:grid-cols-3',
      4: 'grid grid-cols-1 gap-4 [@container(min-width:36rem)]:grid-cols-2 [@container(min-width:72rem)]:grid-cols-4',
    },
  },
];
const KPI_GRID_FALLBACK = 'grid grid-cols-1 gap-4 [@container(min-width:40rem)]:grid-cols-2';

/**
 * Classe da grade para o valor formatado mais longo (em caracteres) entre os cards exibidos.
 * `maxColumns` limita a grade larga: 4 para grupos de quatro cards, 3 para cinco/seis, 2 para pares.
 */
export function kpiGridClassFor(longestValueChars: number, maxColumns: KpiGridColumns = 4): string {
  return KPI_GRID_BY_LENGTH.find(step => longestValueChars <= step.maxChars)?.className[maxColumns] ?? KPI_GRID_FALLBACK;
}

/** Comprimento do valor exibido mais longo — o argumento de `kpiGridClassFor`. */
export function longestValueLength(values: ReadonlyArray<string>): number {
  return values.reduce((max, value) => Math.max(max, value.length), 0);
}
