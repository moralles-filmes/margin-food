/**
 * CMV Financeiro — resolução de filtros e períodos.
 *
 * Datas são dias civis em ISO (`yyyy-MM-dd`), sempre inclusivas nas duas pontas.
 * Nenhuma função aqui passa por `Date` local: a competência do boleto e a data do
 * fechamento não podem mudar de dia por causa de fuso.
 */
import { addDaysISO, daysBetweenISO, isValidIsoDate, weekBounds } from '@/domain/financeiro/bordero/period';

export type CmvModo = 'semanal' | 'quinzenal' | 'mensal' | 'periodo';

export interface CmvIntervalo {
  inicio: string;
  fim: string;
}

export interface CmvFiltro extends CmvIntervalo {
  modo: CmvModo;
}

export type CmvGranularidade = 'dia' | 'semana' | 'mes';

export interface CmvBucket extends CmvIntervalo {
  /** Rótulo curto do eixo ("Seg 08", "Sem 2", "Set/26"). */
  rotulo: string;
  /** Rótulo completo, para tooltip, tabela e PDF. */
  descricao: string;
}

export interface CmvJanelas {
  atual: CmvIntervalo;
  anterior: CmvIntervalo;
  /** Trecho do período atual efetivamente apurado (até o corte). `null` = período futuro. */
  efetivoAtual: CmvIntervalo | null;
  /** Trecho equivalente do período anterior. */
  efetivoAnterior: CmvIntervalo | null;
  parcial: boolean;
  futuro: boolean;
  /** Último dia considerado no período atual. */
  corte: string | null;
  diasAtual: number;
  diasAnterior: number;
  diasEfetivos: number;
  diasEfetivosAnterior: number;
}

export const CMV_MAX_DIAS = 367;

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function diasNoIntervalo(intervalo: CmvIntervalo): number {
  return daysBetweenISO(intervalo.inicio, intervalo.fim) + 1;
}

function partes(iso: string): { ano: number; mes: number; dia: number } {
  return { ano: Number(iso.slice(0, 4)), mes: Number(iso.slice(5, 7)), dia: Number(iso.slice(8, 10)) };
}

function iso(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function diaDaSemana(data: string): number {
  return new Date(`${data}T00:00:00Z`).getUTCDay();
}

/** Mês inteiro que contém `ref`. */
export function mesDe(ref: string): CmvIntervalo {
  const { ano, mes } = partes(ref);
  return { inicio: iso(ano, mes, 1), fim: iso(ano, mes, ultimoDiaDoMes(ano, mes)) };
}

/** Quinzena de calendário: 1–15 ou 16–último dia (13 a 16 dias, nunca "15 fixos"). */
export function quinzenaDe(ref: string): CmvIntervalo {
  const { ano, mes, dia } = partes(ref);
  return dia <= 15
    ? { inicio: iso(ano, mes, 1), fim: iso(ano, mes, 15) }
    : { inicio: iso(ano, mes, 16), fim: iso(ano, mes, ultimoDiaDoMes(ano, mes)) };
}

/** Semana de segunda a domingo (o sistema não tem início de semana configurável). */
export function semanaDe(ref: string): CmvIntervalo {
  const semana = weekBounds(ref);
  return { inicio: semana.start, fim: semana.end };
}

export function intervaloDoModo(modo: Exclude<CmvModo, 'periodo'>, ref: string): CmvIntervalo {
  if (modo === 'semanal') return semanaDe(ref);
  if (modo === 'quinzenal') return quinzenaDe(ref);
  return mesDe(ref);
}

/** Abertura padrão da tela: semana corrente. */
export function filtroPadrao(hoje: string): CmvFiltro {
  return { modo: 'semanal', ...semanaDe(hoje) };
}

/** Troca de modo mantendo a referência no período que já estava na tela. */
export function trocarModo(filtro: CmvFiltro, modo: CmvModo, hoje: string): CmvFiltro {
  if (modo === 'periodo') return { modo, inicio: filtro.inicio, fim: filtro.fim };
  const ref = hoje >= filtro.inicio && hoje <= filtro.fim ? hoje : filtro.inicio;
  return { modo, ...intervaloDoModo(modo, ref) };
}

/** Período imediatamente anterior, conforme o modo. */
export function intervaloAnterior(filtro: CmvFiltro): CmvIntervalo {
  const vespera = addDaysISO(filtro.inicio, -1);
  if (filtro.modo === 'semanal') return semanaDe(vespera);
  if (filtro.modo === 'quinzenal') return quinzenaDe(vespera);
  if (filtro.modo === 'mensal') return mesDe(vespera);
  const dias = diasNoIntervalo(filtro);
  return { inicio: addDaysISO(filtro.inicio, -dias), fim: vespera };
}

/** Navegação anterior/próximo. No modo livre desloca pela própria duração. */
export function deslocarFiltro(filtro: CmvFiltro, direcao: -1 | 1): CmvFiltro {
  if (direcao === -1) return { modo: filtro.modo, ...intervaloAnterior(filtro) };
  const seguinte = addDaysISO(filtro.fim, 1);
  if (filtro.modo === 'periodo') {
    return { modo: 'periodo', inicio: seguinte, fim: addDaysISO(seguinte, diasNoIntervalo(filtro) - 1) };
  }
  return { modo: filtro.modo, ...intervaloDoModo(filtro.modo, seguinte) };
}

/** Mensagem de erro do intervalo, ou `null` quando ele pode ser consultado. */
export function validarFiltro(filtro: CmvIntervalo): string | null {
  if (!filtro.inicio || !filtro.fim) return 'Informe a data inicial e a data final.';
  if (!isValidIsoDate(filtro.inicio) || !isValidIsoDate(filtro.fim)) return 'Data inválida.';
  if (filtro.fim < filtro.inicio) return 'A data final não pode ser anterior à data inicial.';
  if (diasNoIntervalo(filtro) > CMV_MAX_DIAS) return 'O período máximo é de 12 meses.';
  return null;
}

/**
 * Resolve o que é efetivamente apurado e comparado.
 *
 * Período em andamento é cortado no último dia encerrado: hoje, quando o
 * fechamento de hoje já foi registrado; senão ontem. No primeiro dia do período,
 * ainda sem fechamento, o corte fica em hoje (custo por competência aparece e o
 * faturamento sai como "sem fechamento"). O anterior é limitado ao mesmo número
 * de dias a partir do seu início — custo e faturamento usam o mesmo corte.
 */
export function resolverJanelas(filtro: CmvFiltro, hoje: string, fechamentoHoje: boolean): CmvJanelas {
  const atual: CmvIntervalo = { inicio: filtro.inicio, fim: filtro.fim };
  const anterior = intervaloAnterior(filtro);
  const diasAtual = diasNoIntervalo(atual);
  const diasAnterior = diasNoIntervalo(anterior);

  if (atual.inicio > hoje) {
    return {
      atual, anterior, efetivoAtual: null, efetivoAnterior: null, parcial: false, futuro: true,
      corte: null, diasAtual, diasAnterior, diasEfetivos: 0, diasEfetivosAnterior: 0,
    };
  }

  if (atual.fim < hoje) {
    return {
      atual, anterior, efetivoAtual: atual, efetivoAnterior: anterior, parcial: false, futuro: false,
      corte: atual.fim, diasAtual, diasAnterior, diasEfetivos: diasAtual, diasEfetivosAnterior: diasAnterior,
    };
  }

  const ultimoEncerrado = fechamentoHoje ? hoje : addDaysISO(hoje, -1);
  const corte = ultimoEncerrado < atual.inicio ? hoje : ultimoEncerrado;
  const diasEfetivos = daysBetweenISO(atual.inicio, corte) + 1;
  const diasEfetivosAnterior = Math.min(diasEfetivos, diasAnterior);
  return {
    atual,
    anterior,
    efetivoAtual: { inicio: atual.inicio, fim: corte },
    efetivoAnterior: { inicio: anterior.inicio, fim: addDaysISO(anterior.inicio, diasEfetivosAnterior - 1) },
    parcial: corte < atual.fim,
    futuro: false,
    corte,
    diasAtual,
    diasAnterior,
    diasEfetivos,
    diasEfetivosAnterior,
  };
}

/** Diária no semanal/quinzenal, semanal no mensal, adaptativa no período livre. */
export function granularidadeDe(filtro: CmvFiltro): CmvGranularidade {
  if (filtro.modo === 'semanal' || filtro.modo === 'quinzenal') return 'dia';
  if (filtro.modo === 'mensal') return 'semana';
  const dias = diasNoIntervalo(filtro);
  if (dias <= 16) return 'dia';
  if (dias <= 92) return 'semana';
  return 'mes';
}

export function formatarDiaMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

export function formatarData(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

export function formatarIntervalo(intervalo: CmvIntervalo): string {
  return intervalo.inicio === intervalo.fim
    ? formatarData(intervalo.inicio)
    : `${formatarData(intervalo.inicio)} a ${formatarData(intervalo.fim)}`;
}

/**
 * Divide o intervalo em faixas contíguas que cobrem TODOS os dias, sem
 * sobreposição e sem ultrapassar as bordas (a primeira e a última semana/mês
 * podem ser parciais).
 */
export function gerarBuckets(intervalo: CmvIntervalo, granularidade: CmvGranularidade): CmvBucket[] {
  const buckets: CmvBucket[] = [];
  let cursor = intervalo.inicio;
  let indice = 1;
  while (cursor <= intervalo.fim) {
    let fimNatural: string;
    if (granularidade === 'dia') fimNatural = cursor;
    else if (granularidade === 'semana') fimNatural = semanaDe(cursor).fim;
    else fimNatural = mesDe(cursor).fim;
    const fim = fimNatural > intervalo.fim ? intervalo.fim : fimNatural;

    let rotulo: string;
    let descricao: string;
    if (granularidade === 'dia') {
      rotulo = `${DIAS_SEMANA[diaDaSemana(cursor)]} ${cursor.slice(8, 10)}`;
      descricao = formatarData(cursor);
    } else if (granularidade === 'semana') {
      rotulo = `Sem ${indice}`;
      descricao = `Semana ${indice} · ${formatarDiaMes(cursor)} a ${formatarDiaMes(fim)}`;
    } else {
      const { ano, mes } = partes(cursor);
      rotulo = `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}`;
      descricao = `${MESES_CURTOS[mes - 1]}/${ano} · ${formatarDiaMes(cursor)} a ${formatarDiaMes(fim)}`;
    }
    buckets.push({ inicio: cursor, fim, rotulo, descricao });
    cursor = addDaysISO(fim, 1);
    indice += 1;
  }
  return buckets;
}

/** Rótulo do período no cabeçalho, conforme o modo. */
export function tituloDoFiltro(filtro: CmvFiltro): string {
  if (filtro.modo === 'mensal') {
    const { ano, mes } = partes(filtro.inicio);
    return `${MESES_CURTOS[mes - 1]}/${ano} · ${formatarIntervalo(filtro)}`;
  }
  if (filtro.modo === 'quinzenal') {
    const { dia } = partes(filtro.inicio);
    return `${dia === 1 ? '1ª' : '2ª'} quinzena · ${formatarIntervalo(filtro)}`;
  }
  return formatarIntervalo(filtro);
}
