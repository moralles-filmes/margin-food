/**
 * CMV Financeiro — contrato do relatório e ÚNICA implementação dos cálculos.
 *
 * O servidor (`get_fin_cmv_financeiro`) devolve fatos por dia em centavos; tudo
 * que a tela, os detalhes e o PDF mostram sai de `buildCmvReport`. Nenhum
 * componente recalcula total, percentual ou variação por conta própria.
 *
 *   R  = faturamento bruto do Fechamento de Caixa no intervalo efetivo
 *   C  = soma das linhas incluídas (boletos e lançamentos), pela competência
 *   CMV% = C / R × 100, só com R > 0 (sempre razão dos totais, nunca média de %)
 */
import {
  type CmvBucket,
  type CmvFiltro,
  type CmvGranularidade,
  type CmvIntervalo,
  type CmvJanelas,
  formatarIntervalo,
  gerarBuckets,
  granularidadeDe,
  resolverJanelas,
} from './period';

export class CmvContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CmvContractError';
  }
}

// ─── Payload do servidor ─────────────────────────────────────────────────────

export interface CmvCategoriaRef {
  id: string;
  nome: string;
  parentId: string | null;
  codigo: string | null;
  ordem: number;
  ativo: boolean;
  /** Posição estável da categoria no cadastro da empresa (define a cor). */
  indice: number;
}

export interface CmvContagem {
  titulos: number;
  centavos: number;
}

export interface CmvPayload {
  /** Nome da unidade, como o servidor resolveu o tenant. */
  empresa: string;
  geradoEm: string;
  hoje: string;
  classificacaoAtiva: boolean;
  periodo: CmvIntervalo;
  anterior: CmvIntervalo | null;
  faturamento: { data: string; centavos: number }[];
  cmv: { data: string; categoriaId: string | null; centavos: number }[];
  boletos: { data: string; quantidade: number }[];
  /** Lançamentos (Livro Razão e conciliação) com linha incluída, por dia. Banco sem o recurso: vazio. */
  lancamentos: { data: string; quantidade: number }[];
  qualidade: { data: string; situacao: 'pendente' | 'fora'; titulos: number; centavos: number }[];
  categorias: CmvCategoriaRef[];
  semCompetencia: CmvContagem;
  pendentesGeral: CmvContagem;
  /** Pendências por fonte; `null` quando o banco ainda não separa (antes da migration de lançamentos). */
  pendentesGeralPorFonte: { boleto: CmvContagem; lancamento: CmvContagem } | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function objeto(valor: unknown, campo: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new CmvContractError(`Resposta do CMV sem o campo "${campo}".`);
  }
  return valor as Record<string, unknown>;
}

function lista(valor: unknown, campo: string): unknown[] {
  if (!Array.isArray(valor)) throw new CmvContractError(`Resposta do CMV sem a lista "${campo}".`);
  return valor;
}

function inteiro(valor: unknown, campo: string): number {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  if (typeof numero !== 'number' || !Number.isSafeInteger(numero)) {
    throw new CmvContractError(`Valor inválido em "${campo}".`);
  }
  return numero;
}

function data(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !ISO_DATE.test(valor)) {
    throw new CmvContractError(`Data inválida em "${campo}".`);
  }
  return valor;
}

function intervalo(valor: unknown, campo: string): CmvIntervalo {
  const o = objeto(valor, campo);
  return { inicio: data(o.inicio, `${campo}.inicio`), fim: data(o.fim, `${campo}.fim`) };
}

function contagem(valor: unknown, campo: string): CmvContagem {
  const o = objeto(valor, campo);
  return { titulos: inteiro(o.titulos, `${campo}.titulos`), centavos: inteiro(o.centavos, `${campo}.centavos`) };
}

export function parseCmvPayload(raw: unknown): CmvPayload {
  const o = objeto(raw, 'payload');
  if (o.contrato !== 'cmv-financeiro/v1') {
    throw new CmvContractError('Versão do relatório de CMV não reconhecida. Atualize a página.');
  }
  return {
    empresa: typeof o.empresa === 'string' && o.empresa.trim() ? o.empresa.trim() : 'Unidade',
    geradoEm: String(o.gerado_em ?? ''),
    hoje: data(o.hoje, 'hoje'),
    classificacaoAtiva: o.classificacao_ativa === true,
    periodo: intervalo(o.periodo, 'periodo'),
    anterior: o.anterior == null ? null : intervalo(o.anterior, 'anterior'),
    faturamento: lista(o.faturamento, 'faturamento').map((item, i) => {
      const f = objeto(item, `faturamento[${i}]`);
      return { data: data(f.data, 'faturamento.data'), centavos: inteiro(f.centavos, 'faturamento.centavos') };
    }),
    cmv: lista(o.cmv, 'cmv').map((item, i) => {
      const c = objeto(item, `cmv[${i}]`);
      return {
        data: data(c.data, 'cmv.data'),
        categoriaId: typeof c.categoria_id === 'string' ? c.categoria_id : null,
        centavos: inteiro(c.centavos, 'cmv.centavos'),
      };
    }),
    boletos: lista(o.boletos, 'boletos').map((item, i) => {
      const b = objeto(item, `boletos[${i}]`);
      return { data: data(b.data, 'boletos.data'), quantidade: inteiro(b.quantidade, 'boletos.quantidade') };
    }),
    lancamentos: o.lancamentos == null ? [] : lista(o.lancamentos, 'lancamentos').map((item, i) => {
      const b = objeto(item, `lancamentos[${i}]`);
      return { data: data(b.data, 'lancamentos.data'), quantidade: inteiro(b.quantidade, 'lancamentos.quantidade') };
    }),
    qualidade: lista(o.qualidade, 'qualidade').map((item, i) => {
      const q = objeto(item, `qualidade[${i}]`);
      if (q.situacao !== 'pendente' && q.situacao !== 'fora') {
        throw new CmvContractError('Situação desconhecida em "qualidade".');
      }
      return {
        data: data(q.data, 'qualidade.data'),
        situacao: q.situacao,
        titulos: inteiro(q.titulos, 'qualidade.titulos'),
        centavos: inteiro(q.centavos, 'qualidade.centavos'),
      };
    }),
    categorias: lista(o.categorias, 'categorias').map((item, i) => {
      const c = objeto(item, `categorias[${i}]`);
      if (typeof c.id !== 'string') throw new CmvContractError('Categoria sem identificador.');
      return {
        id: c.id,
        nome: typeof c.nome === 'string' && c.nome.trim() ? c.nome : 'Categoria sem nome',
        parentId: typeof c.parent_id === 'string' ? c.parent_id : null,
        codigo: typeof c.codigo === 'string' && c.codigo ? c.codigo : null,
        ordem: typeof c.ordem === 'number' ? c.ordem : 0,
        ativo: c.ativo !== false,
        indice: typeof c.indice === 'number' && Number.isInteger(c.indice) && c.indice >= 0 ? c.indice : 0,
      };
    }),
    semCompetencia: contagem(o.sem_competencia, 'sem_competencia'),
    pendentesGeral: contagem(o.pendentes_geral, 'pendentes_geral'),
    pendentesGeralPorFonte: o.pendentes_geral_por_fonte == null ? null : (() => {
      const p = objeto(o.pendentes_geral_por_fonte, 'pendentes_geral_por_fonte');
      return {
        boleto: contagem(p.boleto, 'pendentes_geral_por_fonte.boleto'),
        lancamento: contagem(p.lancamento, 'pendentes_geral_por_fonte.lancamento'),
      };
    })(),
  };
}

// ─── Fórmulas ────────────────────────────────────────────────────────────────

/** `numerador / denominador × 100`; `null` quando o denominador não é positivo. */
export function razaoPercentual(numerador: number, denominador: number | null): number | null {
  if (denominador === null || !(denominador > 0)) return null;
  return (numerador / denominador) * 100;
}

/** `(atual − anterior) / anterior × 100`; `null` sem base anterior positiva. */
export function variacaoPercentual(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || !(anterior > 0)) return null;
  return ((atual - anterior) / anterior) * 100;
}

export function diferenca(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null) return null;
  return atual - anterior;
}

// ─── Formatação (a mesma na tela e no PDF) ───────────────────────────────────

const MOEDA = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatarCentavos(centavos: number | null): string {
  if (centavos === null || !Number.isFinite(centavos)) return '—';
  const valor = MOEDA.format(Math.abs(centavos) / 100);
  return `${centavos < 0 ? '-' : ''}R$ ${valor}`;
}

export function formatarCentavosComSinal(centavos: number | null): string {
  if (centavos === null || !Number.isFinite(centavos)) return '—';
  return `${centavos > 0 ? '+' : ''}${formatarCentavos(centavos)}`;
}

export function formatarPercentual(valor: number | null, casas = 2): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function formatarVariacao(valor: number | null, casas = 1): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  return `${valor > 0 ? '+' : ''}${formatarPercentual(valor, casas)}`;
}

export function formatarPontos(valor: number | null, casas = 2): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  const numero = valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return `${valor > 0 ? '+' : ''}${numero} p.p.`;
}

// ─── Relatório ───────────────────────────────────────────────────────────────

export interface CmvLado {
  intervalo: CmvIntervalo | null;
  dias: number;
  /** `null` = nenhum fechamento registrado no intervalo (≠ faturamento zero). */
  faturamentoCentavos: number | null;
  diasComFechamento: number;
  diasSemFechamento: string[];
  cmvCentavos: number;
  /** CMV% = C / R × 100; `null` quando R não é positivo. */
  cmvPercentual: number | null;
  /** Por que o CMV% não pôde ser calculado. */
  motivoSemPercentual: string | null;
  boletos: number;
  lancamentos: number;
  /** Boletos + lançamentos com linha incluída no CMV. */
  documentos: number;
  pendentes: CmvContagem;
  fora: CmvContagem;
}

export interface CmvIndicador {
  atual: number | null;
  anterior: number | null;
  diferenca: number | null;
  variacaoPercentual: number | null;
}

export interface CmvPontoSerie {
  bucket: CmvBucket;
  /** Faixa depois do corte: ainda não aconteceu, não é zero realizado. */
  futuro: boolean;
  /** Faixa cortada no dia do corte. */
  parcial: boolean;
  faturamentoCentavos: number | null;
  cmvCentavos: number | null;
  cmvPercentual: number | null;
  /** Centavos por grupo de análise (chave = id do grupo). */
  porGrupo: Record<string, number>;
}

export interface CmvCategoriaLinha {
  /** Id da categoria; `__sem_categoria__` e `direto:<id>` são linhas sintéticas. */
  id: string;
  categoriaId: string | null;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  /** Índice estável de cor; `null` em "Sem categoria" e no total (cor neutra). */
  cor: number | null;
  profundidade: number;
  atualCentavos: number;
  anteriorCentavos: number;
  diferencaCentavos: number;
  variacaoPercentual: number | null;
  /** Participação no CMV total = CMV da categoria / CMV total. */
  participacao: number | null;
  /** Peso no faturamento = CMV da categoria / R. */
  pesoFaturamento: number | null;
  pesoFaturamentoAnterior: number | null;
  filhos: CmvCategoriaLinha[];
}

export type CmvGrupo = CmvCategoriaLinha;

export type CmvInsightTipo = 'participacao' | 'aumento' | 'reducao' | 'percentual' | 'peso' | 'pendencia' | 'fechamento';

export interface CmvInsight {
  tipo: CmvInsightTipo;
  tom: 'neutro' | 'alerta' | 'informativo';
  texto: string;
}

export interface CmvAviso {
  tipo: 'parcial' | 'futuro' | 'pendencia' | 'sem_competencia' | 'fechamento' | 'duracao';
  texto: string;
}

export interface CmvReport {
  empresa: string;
  filtro: CmvFiltro;
  janelas: CmvJanelas;
  geradoEm: string;
  hoje: string;
  classificacaoAtiva: boolean;
  granularidade: CmvGranularidade;
  atual: CmvLado;
  anterior: CmvLado;
  faturamento: CmvIndicador;
  cmv: CmvIndicador;
  percentual: { atual: number | null; anterior: number | null; pontos: number | null };
  boletos: CmvIndicador;
  lancamentos: CmvIndicador;
  /** Despesas vinculadas ao CMV = boletos + lançamentos. */
  documentos: CmvIndicador;
  /** R − C: "Saldo após CMV, antes das demais despesas". */
  saldoAposCmvCentavos: number | null;
  serie: CmvPontoSerie[];
  serieAnterior: CmvPontoSerie[];
  /** Grupos de análise (nível em que o CMV se divide), maior primeiro. */
  grupos: CmvGrupo[];
  /** `false` quando há grupo negativo ou total não positivo: rosca não se aplica. */
  composicaoEmRosca: boolean;
  totalCategorias: CmvCategoriaLinha;
  insights: CmvInsight[];
  avisos: CmvAviso[];
  semCompetencia: CmvContagem;
  pendentesGeral: CmvContagem;
  pendentesGeralPorFonte: { boleto: CmvContagem; lancamento: CmvContagem } | null;
}

export const CMV_SEM_CATEGORIA_ID = '__sem_categoria__';

function dentro(dataISO: string, faixa: CmvIntervalo | null): boolean {
  return faixa !== null && dataISO >= faixa.inicio && dataISO <= faixa.fim;
}

function listarDias(faixa: CmvIntervalo): string[] {
  return gerarBuckets(faixa, 'dia').map(b => b.inicio);
}

function montarLado(payload: CmvPayload, faixa: CmvIntervalo | null, dias: number): CmvLado {
  if (faixa === null) {
    return {
      intervalo: null, dias: 0, faturamentoCentavos: null, diasComFechamento: 0, diasSemFechamento: [],
      cmvCentavos: 0, cmvPercentual: null, motivoSemPercentual: 'Período ainda não iniciado.', boletos: 0, lancamentos: 0, documentos: 0,
      pendentes: { titulos: 0, centavos: 0 }, fora: { titulos: 0, centavos: 0 },
    };
  }
  const fechamentos = payload.faturamento.filter(f => dentro(f.data, faixa));
  const comFechamento = new Set(fechamentos.map(f => f.data));
  const faturamentoCentavos = fechamentos.length === 0 ? null : fechamentos.reduce((s, f) => s + f.centavos, 0);
  const cmvCentavos = payload.cmv.filter(c => dentro(c.data, faixa)).reduce((s, c) => s + c.centavos, 0);
  const somar = (situacao: 'pendente' | 'fora'): CmvContagem => payload.qualidade
    .filter(q => q.situacao === situacao && dentro(q.data, faixa))
    .reduce((acc, q) => ({ titulos: acc.titulos + q.titulos, centavos: acc.centavos + q.centavos }), { titulos: 0, centavos: 0 });
  const cmvPercentual = razaoPercentual(cmvCentavos, faturamentoCentavos);
  let motivoSemPercentual: string | null = null;
  if (cmvPercentual === null) {
    if (faturamentoCentavos === null) motivoSemPercentual = 'Sem fechamento de caixa no período.';
    else if (faturamentoCentavos === 0) motivoSemPercentual = 'Faturamento zero confirmado no fechamento de caixa.';
    else motivoSemPercentual = 'Faturamento negativo: o percentual não se aplica.';
  }
  const boletos = payload.boletos.filter(b => dentro(b.data, faixa)).reduce((s, b) => s + b.quantidade, 0);
  const lancamentos = payload.lancamentos.filter(b => dentro(b.data, faixa)).reduce((s, b) => s + b.quantidade, 0);
  return {
    intervalo: faixa,
    dias,
    faturamentoCentavos,
    diasComFechamento: comFechamento.size,
    diasSemFechamento: listarDias(faixa).filter(d => !comFechamento.has(d)),
    cmvCentavos,
    cmvPercentual,
    motivoSemPercentual,
    boletos,
    lancamentos,
    documentos: boletos + lancamentos,
    pendentes: somar('pendente'),
    fora: somar('fora'),
  };
}

function indicador(atual: number | null, anterior: number | null): CmvIndicador {
  return { atual, anterior, diferenca: diferenca(atual, anterior), variacaoPercentual: variacaoPercentual(atual, anterior) };
}

interface NoBruto {
  ref: CmvCategoriaRef;
  filhos: NoBruto[];
  proprioAtual: number;
  proprioAnterior: number;
  totalAtual: number;
  totalAnterior: number;
}

function ordenarLinhas<T extends { atualCentavos: number; anteriorCentavos: number; nome: string; id: string }>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) =>
    b.atualCentavos - a.atualCentavos
    || b.anteriorCentavos - a.anteriorCentavos
    || a.nome.localeCompare(b.nome, 'pt-BR')
    || a.id.localeCompare(b.id));
}

function montarArvore(
  payload: CmvPayload,
  efetivoAtual: CmvIntervalo | null,
  efetivoAnterior: CmvIntervalo | null,
  cmvTotal: number,
  fatAtual: number | null,
  fatAnterior: number | null,
): { raizes: CmvCategoriaLinha[]; grupos: CmvGrupo[] } {
  const atualPorCat = new Map<string, number>();
  const anteriorPorCat = new Map<string, number>();
  for (const linha of payload.cmv) {
    const chave = linha.categoriaId ?? CMV_SEM_CATEGORIA_ID;
    if (dentro(linha.data, efetivoAtual)) atualPorCat.set(chave, (atualPorCat.get(chave) ?? 0) + linha.centavos);
    else if (dentro(linha.data, efetivoAnterior)) anteriorPorCat.set(chave, (anteriorPorCat.get(chave) ?? 0) + linha.centavos);
  }

  const nos = new Map<string, NoBruto>();
  for (const ref of payload.categorias) {
    nos.set(ref.id, {
      ref, filhos: [],
      proprioAtual: atualPorCat.get(ref.id) ?? 0,
      proprioAnterior: anteriorPorCat.get(ref.id) ?? 0,
      totalAtual: 0, totalAnterior: 0,
    });
  }
  // Categoria usada num boleto mas ausente do cadastro devolvido: vira raiz própria.
  for (const id of new Set([...atualPorCat.keys(), ...anteriorPorCat.keys()])) {
    if (!nos.has(id)) {
      nos.set(id, {
        ref: {
          id, nome: id === CMV_SEM_CATEGORIA_ID ? 'Sem categoria' : 'Categoria removida',
          parentId: null, codigo: null, ordem: Number.MAX_SAFE_INTEGER, ativo: id === CMV_SEM_CATEGORIA_ID, indice: -1,
        },
        filhos: [],
        proprioAtual: atualPorCat.get(id) ?? 0,
        proprioAnterior: anteriorPorCat.get(id) ?? 0,
        totalAtual: 0, totalAnterior: 0,
      });
    }
  }
  const raizesBrutas: NoBruto[] = [];
  for (const no of nos.values()) {
    const pai = no.ref.parentId ? nos.get(no.ref.parentId) : undefined;
    // Ciclo defensivo: pai que é o próprio nó conta como raiz.
    if (pai && pai !== no) pai.filhos.push(no);
    else raizesBrutas.push(no);
  }
  const visitados = new Set<NoBruto>();
  const totalizar = (no: NoBruto): void => {
    if (visitados.has(no)) return;
    visitados.add(no);
    no.totalAtual = no.proprioAtual;
    no.totalAnterior = no.proprioAnterior;
    for (const filho of no.filhos) {
      totalizar(filho);
      no.totalAtual += filho.totalAtual;
      no.totalAnterior += filho.totalAnterior;
    }
  };
  raizesBrutas.forEach(totalizar);

  const temValor = (no: NoBruto) => no.totalAtual !== 0 || no.totalAnterior !== 0;

  const linha = (
    id: string, categoriaId: string | null, nome: string, codigo: string | null, ativo: boolean,
    cor: number | null, profundidade: number, atual: number, anterior: number, filhos: CmvCategoriaLinha[],
  ): CmvCategoriaLinha => ({
    id, categoriaId, nome, codigo, ativo, cor, profundidade,
    atualCentavos: atual,
    anteriorCentavos: anterior,
    diferencaCentavos: atual - anterior,
    variacaoPercentual: variacaoPercentual(atual, anterior),
    participacao: razaoPercentual(atual, cmvTotal),
    pesoFaturamento: razaoPercentual(atual, fatAtual),
    pesoFaturamentoAnterior: razaoPercentual(anterior, fatAnterior),
    filhos,
  });

  const converter = (no: NoBruto, profundidade: number): CmvCategoriaLinha => {
    const filhos = no.filhos.filter(temValor).map(f => converter(f, profundidade + 1));
    // Valor lançado direto numa categoria que também tem filhos: linha própria,
    // para o total do grupo fechar com a soma do que está abaixo dele.
    if (filhos.length > 0 && (no.proprioAtual !== 0 || no.proprioAnterior !== 0)) {
      filhos.push(linha(
        `direto:${no.ref.id}`, no.ref.id, `${no.ref.nome} (lançado direto)`, null, no.ref.ativo,
        no.ref.indice >= 0 ? no.ref.indice : null, profundidade + 1, no.proprioAtual, no.proprioAnterior, [],
      ));
    }
    const categoriaId = no.ref.id === CMV_SEM_CATEGORIA_ID ? null : no.ref.id;
    return linha(no.ref.id, categoriaId, no.ref.nome, no.ref.codigo, no.ref.ativo,
      no.ref.indice >= 0 ? no.ref.indice : null, profundidade, no.totalAtual, no.totalAnterior, ordenarLinhas(filhos));
  };

  // Nível de análise: desce enquanto o CMV inteiro estiver pendurado num único
  // ramo sem valor próprio (ex.: "Despesas" → "Mercadorias" → Peixes, Bebidas…).
  // "Sem categoria" não participa da descida: é sempre um grupo à parte.
  const semCategoria = raizesBrutas.filter(no => no.ref.id === CMV_SEM_CATEGORIA_ID && temValor(no));
  let nivel = raizesBrutas.filter(no => no.ref.id !== CMV_SEM_CATEGORIA_ID && temValor(no));
  while (
    nivel.length === 1
    && nivel[0].proprioAtual === 0
    && nivel[0].proprioAnterior === 0
    && nivel[0].filhos.filter(temValor).length > 0
  ) {
    nivel = nivel[0].filhos.filter(temValor);
  }

  const raizes = ordenarLinhas([...nivel, ...semCategoria].map(no => converter(no, 0)));
  return { raizes, grupos: raizes };
}

function grupoDeCadaCategoria(grupos: CmvGrupo[]): Map<string, string> {
  const mapa = new Map<string, string>();
  const marcar = (linha: CmvCategoriaLinha, grupoId: string) => {
    mapa.set(linha.categoriaId ?? CMV_SEM_CATEGORIA_ID, grupoId);
    linha.filhos.forEach(f => marcar(f, grupoId));
  };
  grupos.forEach(g => marcar(g, g.id));
  return mapa;
}

function montarSerie(
  payload: CmvPayload,
  faixaCompleta: CmvIntervalo,
  efetivo: CmvIntervalo | null,
  granularidade: CmvGranularidade,
  grupoPorCategoria: Map<string, string>,
): CmvPontoSerie[] {
  return gerarBuckets(faixaCompleta, granularidade).map(bucket => {
    if (efetivo === null || bucket.inicio > efetivo.fim) {
      return { bucket, futuro: true, parcial: false, faturamentoCentavos: null, cmvCentavos: null, cmvPercentual: null, porGrupo: {} };
    }
    const faixa: CmvIntervalo = { inicio: bucket.inicio, fim: bucket.fim > efetivo.fim ? efetivo.fim : bucket.fim };
    const fechamentos = payload.faturamento.filter(f => dentro(f.data, faixa));
    const faturamentoCentavos = fechamentos.length === 0 ? null : fechamentos.reduce((s, f) => s + f.centavos, 0);
    const porGrupo: Record<string, number> = {};
    let cmvCentavos = 0;
    for (const linha of payload.cmv) {
      if (!dentro(linha.data, faixa)) continue;
      cmvCentavos += linha.centavos;
      const grupo = grupoPorCategoria.get(linha.categoriaId ?? CMV_SEM_CATEGORIA_ID) ?? CMV_SEM_CATEGORIA_ID;
      porGrupo[grupo] = (porGrupo[grupo] ?? 0) + linha.centavos;
    }
    return {
      bucket,
      futuro: false,
      parcial: faixa.fim < bucket.fim,
      faturamentoCentavos,
      cmvCentavos,
      cmvPercentual: razaoPercentual(cmvCentavos, faturamentoCentavos),
      porGrupo,
    };
  });
}

function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

function montarInsights(report: Omit<CmvReport, 'insights' | 'avisos'>): CmvInsight[] {
  const insights: CmvInsight[] = [];
  const { grupos, atual, anterior } = report;

  const maior = grupos.find(g => g.atualCentavos > 0);
  if (maior && maior.participacao !== null) {
    insights.push({
      tipo: 'participacao', tom: 'neutro',
      texto: `${maior.nome} tem a maior participação no CMV: ${formatarPercentual(maior.participacao, 1)} (${formatarCentavos(maior.atualCentavos)}).`,
    });
  }

  const temBase = anterior.intervalo !== null && anterior.cmvCentavos > 0;
  if (temBase) {
    const porDiferenca = [...grupos].sort((a, b) => b.diferencaCentavos - a.diferencaCentavos);
    const subiu = porDiferenca[0];
    if (subiu && subiu.diferencaCentavos > 0) {
      const pct = subiu.variacaoPercentual === null ? 'sem base anterior' : formatarVariacao(subiu.variacaoPercentual);
      insights.push({
        tipo: 'aumento', tom: 'informativo',
        texto: `${subiu.nome} teve o maior aumento em reais: ${formatarCentavosComSinal(subiu.diferencaCentavos)} (${pct}) sobre o período anterior.`,
      });
    }
    const caiu = porDiferenca[porDiferenca.length - 1];
    if (caiu && caiu.diferencaCentavos < 0 && caiu !== subiu) {
      insights.push({
        tipo: 'reducao', tom: 'informativo',
        texto: `${caiu.nome} teve a maior redução em reais: ${formatarCentavosComSinal(caiu.diferencaCentavos)} (${formatarVariacao(caiu.variacaoPercentual)}) sobre o período anterior.`,
      });
    }
  }

  if (report.percentual.pontos !== null) {
    const pontos = report.percentual.pontos;
    const verbo = pontos > 0 ? 'subiu' : pontos < 0 ? 'caiu' : 'ficou estável em';
    insights.push({
      tipo: 'percentual', tom: 'neutro',
      texto: pontos === 0
        ? `O % CMV ficou estável em ${formatarPercentual(report.percentual.atual)}.`
        : `O % CMV ${verbo} ${formatarPontos(Math.abs(pontos)).replace('+', '')}: de ${formatarPercentual(report.percentual.anterior)} para ${formatarPercentual(report.percentual.atual)}.`,
    });
  }

  const comPeso = grupos
    .filter(g => g.pesoFaturamento !== null && g.pesoFaturamentoAnterior !== null)
    .map(g => ({ grupo: g, delta: (g.pesoFaturamento as number) - (g.pesoFaturamentoAnterior as number) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  if (comPeso[0] && Math.abs(comPeso[0].delta) >= 0.005) {
    const { grupo, delta } = comPeso[0];
    insights.push({
      tipo: 'peso', tom: 'neutro',
      texto: `${grupo.nome} foi a categoria que mais mudou de peso sobre o faturamento: ${formatarPontos(delta)} (de ${formatarPercentual(grupo.pesoFaturamentoAnterior)} para ${formatarPercentual(grupo.pesoFaturamento)}).`,
    });
  }

  if (atual.pendentes.titulos > 0) {
    insights.push({
      tipo: 'pendencia', tom: 'alerta',
      texto: `${plural(atual.pendentes.titulos, 'despesa', 'despesas')} do período (${formatarCentavos(atual.pendentes.centavos)}) ${atual.pendentes.titulos === 1 ? 'aguarda' : 'aguardam'} classificação: a apuração pode estar incompleta.`,
    });
  }
  if (atual.intervalo !== null && atual.diasSemFechamento.length > 0) {
    insights.push({
      tipo: 'fechamento', tom: 'alerta',
      texto: `${plural(atual.diasSemFechamento.length, 'dia', 'dias')} do período sem fechamento de caixa registrado: o faturamento pode estar incompleto.`,
    });
  }
  return insights;
}

function montarAvisos(report: Omit<CmvReport, 'insights' | 'avisos'>): CmvAviso[] {
  const avisos: CmvAviso[] = [];
  const { janelas, atual, anterior } = report;
  if (janelas.futuro) {
    avisos.push({ tipo: 'futuro', texto: 'O período selecionado ainda não começou: não há valores realizados.' });
    return avisos;
  }
  if (janelas.parcial && janelas.efetivoAtual && janelas.efetivoAnterior) {
    avisos.push({
      tipo: 'parcial',
      texto: `Período parcial: apurado de ${formatarIntervalo(janelas.efetivoAtual)} (${plural(janelas.diasEfetivos, 'dia', 'dias')}), comparado com ${formatarIntervalo(janelas.efetivoAnterior)} (${plural(janelas.diasEfetivosAnterior, 'dia', 'dias')}).`,
    });
  } else if (janelas.diasEfetivos !== janelas.diasEfetivosAnterior) {
    avisos.push({
      tipo: 'duracao',
      texto: `Os períodos têm durações diferentes: ${plural(janelas.diasEfetivos, 'dia', 'dias')} no atual e ${plural(janelas.diasEfetivosAnterior, 'dia', 'dias')} no anterior.`,
    });
  }
  if (atual.pendentes.titulos > 0) {
    avisos.push({
      tipo: 'pendencia',
      texto: `Apuração possivelmente incompleta: ${plural(atual.pendentes.titulos, 'despesa', 'despesas')} do período (${formatarCentavos(atual.pendentes.centavos)}) sem classificação no CMV.`,
    });
  }
  if (report.semCompetencia.titulos > 0) {
    avisos.push({
      tipo: 'sem_competencia',
      texto: `${plural(report.semCompetencia.titulos, 'boleto', 'boletos')} sem data de competência (${formatarCentavos(report.semCompetencia.centavos)}) ainda não ${report.semCompetencia.titulos === 1 ? 'pode ser atribuído' : 'podem ser atribuídos'} a nenhum período.`,
    });
  }
  if (atual.faturamentoCentavos === null) {
    avisos.push({ tipo: 'fechamento', texto: 'Sem fechamento de caixa no período: o % CMV não pode ser calculado.' });
  } else if (atual.diasSemFechamento.length > 0) {
    avisos.push({
      tipo: 'fechamento',
      texto: `${plural(atual.diasSemFechamento.length, 'dia', 'dias')} sem fechamento de caixa no período atual: o faturamento considera só os dias fechados.`,
    });
  }
  if (anterior.intervalo !== null && anterior.faturamentoCentavos !== null && anterior.diasSemFechamento.length > 0) {
    avisos.push({
      tipo: 'fechamento',
      texto: `${plural(anterior.diasSemFechamento.length, 'dia', 'dias')} sem fechamento de caixa no período anterior.`,
    });
  }
  return avisos;
}

/** Monta o relatório inteiro a partir do payload e do filtro que o originou. */
export function buildCmvReport(payload: CmvPayload, filtro: CmvFiltro): CmvReport {
  if (payload.periodo.inicio !== filtro.inicio || payload.periodo.fim !== filtro.fim) {
    throw new CmvContractError('O período devolvido pelo servidor não corresponde ao filtro.');
  }
  const fechamentoHoje = payload.faturamento.some(f => f.data === payload.hoje);
  const janelas = resolverJanelas(filtro, payload.hoje, fechamentoHoje);
  const granularidade = granularidadeDe(filtro);

  const atual = montarLado(payload, janelas.efetivoAtual, janelas.diasEfetivos);
  const anterior = montarLado(payload, janelas.efetivoAnterior, janelas.diasEfetivosAnterior);

  const { raizes, grupos } = montarArvore(
    payload, janelas.efetivoAtual, janelas.efetivoAnterior,
    atual.cmvCentavos, atual.faturamentoCentavos, anterior.faturamentoCentavos,
  );
  const grupoPorCategoria = grupoDeCadaCategoria(grupos);

  const pontos = atual.cmvPercentual !== null && anterior.cmvPercentual !== null
    ? atual.cmvPercentual - anterior.cmvPercentual
    : null;

  const totalCategorias: CmvCategoriaLinha = {
    id: '__total__', categoriaId: null, nome: 'Total do CMV', codigo: null, ativo: true, cor: null, profundidade: 0,
    atualCentavos: atual.cmvCentavos,
    anteriorCentavos: anterior.cmvCentavos,
    diferencaCentavos: atual.cmvCentavos - anterior.cmvCentavos,
    variacaoPercentual: variacaoPercentual(atual.cmvCentavos, anterior.cmvCentavos),
    participacao: razaoPercentual(atual.cmvCentavos, atual.cmvCentavos),
    pesoFaturamento: atual.cmvPercentual,
    pesoFaturamentoAnterior: anterior.cmvPercentual,
    filhos: raizes,
  };

  const base: Omit<CmvReport, 'insights' | 'avisos'> = {
    empresa: payload.empresa,
    filtro,
    janelas,
    geradoEm: payload.geradoEm,
    hoje: payload.hoje,
    classificacaoAtiva: payload.classificacaoAtiva,
    granularidade,
    atual,
    anterior,
    faturamento: indicador(atual.faturamentoCentavos, anterior.faturamentoCentavos),
    cmv: indicador(atual.cmvCentavos, anterior.intervalo === null ? null : anterior.cmvCentavos),
    percentual: { atual: atual.cmvPercentual, anterior: anterior.cmvPercentual, pontos },
    boletos: indicador(atual.boletos, anterior.intervalo === null ? null : anterior.boletos),
    lancamentos: indicador(atual.lancamentos, anterior.intervalo === null ? null : anterior.lancamentos),
    documentos: indicador(atual.documentos, anterior.intervalo === null ? null : anterior.documentos),
    saldoAposCmvCentavos: atual.faturamentoCentavos === null ? null : atual.faturamentoCentavos - atual.cmvCentavos,
    serie: montarSerie(payload, janelas.atual, janelas.efetivoAtual, granularidade, grupoPorCategoria),
    serieAnterior: montarSerie(payload, janelas.anterior, janelas.efetivoAnterior, granularidade, grupoPorCategoria),
    grupos,
    composicaoEmRosca: atual.cmvCentavos > 0 && grupos.every(g => g.atualCentavos >= 0),
    totalCategorias,
    semCompetencia: payload.semCompetencia,
    pendentesGeral: payload.pendentesGeral,
    pendentesGeralPorFonte: payload.pendentesGeralPorFonte,
  };
  return { ...base, insights: montarInsights(base), avisos: montarAvisos(base) };
}

export interface CmvLinhaPlana extends CmvCategoriaLinha {
  temFilhos: boolean;
  expandida: boolean;
}

/** Achata a árvore para tabela/PDF. Com busca, mantém o ramo até o que casou. */
export function achatarCategorias(
  raizes: readonly CmvCategoriaLinha[],
  opcoes: { expandidas?: ReadonlySet<string>; expandirTudo?: boolean; filtro?: (linha: CmvCategoriaLinha) => boolean } = {},
): CmvLinhaPlana[] {
  const { expandidas, expandirTudo = false, filtro } = opcoes;
  const casa = (linha: CmvCategoriaLinha): boolean =>
    !filtro || filtro(linha) || linha.filhos.some(casa);
  const saida: CmvLinhaPlana[] = [];
  const visitar = (linha: CmvCategoriaLinha) => {
    if (!casa(linha)) return;
    const temFilhos = linha.filhos.length > 0;
    const expandida = temFilhos && (expandirTudo || Boolean(filtro) || (expandidas?.has(linha.id) ?? false));
    saida.push({ ...linha, temFilhos, expandida });
    if (expandida) linha.filhos.forEach(visitar);
  };
  raizes.forEach(visitar);
  return saida;
}

export interface CmvFatia {
  id: string;
  nome: string;
  centavos: number;
  participacao: number | null;
  cor: number | null;
}

/** Fatias da composição: os maiores grupos e a cauda agrupada em "Outras". */
export function fatiasDaComposicao(grupos: readonly CmvGrupo[], cmvTotal: number, maximo = 6): CmvFatia[] {
  const comValor = grupos.filter(g => g.atualCentavos !== 0);
  if (comValor.length <= maximo) {
    return comValor.map(g => ({ id: g.id, nome: g.nome, centavos: g.atualCentavos, participacao: g.participacao, cor: g.cor }));
  }
  const principais = comValor.slice(0, maximo - 1);
  const outras = comValor.slice(maximo - 1).reduce((s, g) => s + g.atualCentavos, 0);
  return [
    ...principais.map(g => ({ id: g.id, nome: g.nome, centavos: g.atualCentavos, participacao: g.participacao, cor: g.cor })),
    { id: '__outras__', nome: `Outras (${comValor.length - principais.length})`, centavos: outras, participacao: razaoPercentual(outras, cmvTotal), cor: null },
  ];
}
