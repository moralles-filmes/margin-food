/**
 * Chave de idempotência DERIVADA da operação — mesmo padrão de `chaveRequisicao`
 * (`src/domain/estoque/operacional.ts`), para envios cujo conteúdo é um objeto.
 *
 * A chave é `hash(semente + conteúdo)`:
 * - repetir o MESMO envio (duplo clique, retry depois de a resposta se perder)
 *   gera a mesma chave, e o servidor devolve o registro original;
 * - mudar qualquer campo gera chave nova sozinho, então um reenvio nunca é
 *   confundido com a operação anterior;
 * - a `semente` só troca quando começa uma operação nova (depois do sucesso,
 *   ou quando o usuário confirma explicitamente que quer repetir).
 *
 * Nunca guarde a chave em estado nem gere `crypto.randomUUID()` por chamada: o
 * primeiro prende a chave de um envio que falhou no próximo, o segundo faz o
 * retry virar outro registro. As telas não guardam semente: usam
 * `useChavesPendentes` (semente por conteúdo pendente, ver abaixo).
 */

/** Semente de uma operação nova. */
export function novaSemente(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * JSON com as chaves dos objetos em ordem alfabética: o mesmo conteúdo produz
 * sempre o mesmo texto, independente da ordem em que o objeto foi montado.
 * Arrays mantêm a ordem (ela faz parte do conteúdo); `undefined` some, como
 * no `JSON.stringify`.
 */
export function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor) ?? 'null';
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(v => (v === undefined ? 'null' : jsonCanonico(v))).join(',')}]`;
  }
  const obj = valor as Record<string, unknown>;
  const pares = Object.keys(obj)
    .filter(k => obj[k] !== undefined)
    .sort()
    .map(k => `${JSON.stringify(k)}:${jsonCanonico(obj[k])}`);
  return `{${pares.join(',')}}`;
}

async function sha256(texto: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return new Uint8Array(digest);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Chave derivada em texto (SHA-256, 64 caracteres hexadecimais). */
export async function chaveOperacao(semente: string, conteudo: unknown): Promise<string> {
  return hex(await sha256(`${semente}|${jsonCanonico(conteudo)}`));
}

/**
 * Chave derivada no formato UUID, para colunas `uuid` (ex.: `purchase_orders`).
 * Usa os 128 primeiros bits do SHA-256 marcados como UUIDv8 (RFC 9562, formato
 * livre) — determinística, ao contrário do v4.
 */
export async function chaveOperacaoUuid(semente: string, conteudo: unknown): Promise<string> {
  const b = (await sha256(`${semente}|${jsonCanonico(conteudo)}`)).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x80;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Chave de um envio de uma tela: o `escopo` separa telas que gravam na mesma
 * coluna (ex.: lançamento × transferência em `fin_lancamentos.idempotency_key`).
 */
export function chaveComEscopo(
  escopo: string,
  semente: string,
  conteudo: unknown,
  formato: FormatoChave = 'texto',
): Promise<string> {
  const alvo = { escopo, identidade: conteudo };
  return formato === 'uuid' ? chaveOperacaoUuid(semente, alvo) : chaveOperacao(semente, alvo);
}

// ─── Sementes por conteúdo pendente ─────────────────────────────────────────
//
// Uma semente só por tela, girada a cada sucesso, duplica assim: A é gravado
// mas a resposta se perde (a tela mostra erro) → o usuário lança B, que dá
// certo e gira a semente → reenvia A com semente nova → A duplicado. Fechar e
// reabrir o formulário tinha o mesmo efeito. Aqui cada conteúdo ainda não
// confirmado guarda a própria semente, e só a confirmação DAQUELE conteúdo a
// libera.

export type FormatoChave = 'texto' | 'uuid';

export interface ChavesPendentes<T = unknown> {
  /** Chave do envio: reaproveita a semente enquanto este conteúdo não for confirmado. */
  chave(conteudo: T): Promise<string>;
  /**
   * A semente pendente deste conteúdo, para chaves em outro formato (ex.:
   * `chaveRequisicao` do operacional). Chame só no envio, nunca no render: cada
   * chamada reserva uma semente para o conteúdo.
   */
  semente(conteudo: T): string;
  /** Envio confirmado: o mesmo conteúdo enviado de novo depois disto é uma operação nova. */
  confirmar(conteudo: T): void;
  /**
   * Reenvio consciente de algo que pode já ter saído (ex.: WhatsApp sem
   * confirmação, que a pessoa decide mandar de novo): troca só a semente deste
   * conteúdo, que continua pendente até ser confirmado.
   */
  renovar(conteudo: T): void;
}

export interface SementePendente {
  /** semente */
  s: string;
  /** último uso (ms): a validade conta a partir daqui */
  t: number;
}

/** Onde as sementes pendentes sobrevivem entre montagens da tela. */
export interface ArmazenamentoSementes {
  ler(): unknown;
  gravar(pendentes: Record<string, SementePendente>): void;
}

export interface OpcoesChavesPendentes {
  formato?: FormatoChave;
  gerarSemente?: () => string;
  armazenamento?: ArmazenamentoSementes | null;
  agora?: () => number;
}

/**
 * Validade de uma semente sem uso. Cobre o retry do mesmo turno de trabalho;
 * passado isso, o mesmo conteúdo digitado de novo é mais provavelmente uma
 * operação nova (a saída de estoque que se repete todo dia) do que o reenvio
 * de uma que falhou.
 */
export const VALIDADE_SEMENTE_PENDENTE_MS = 12 * 60 * 60 * 1000;
/** Limite de conteúdos pendentes por tela; o mais antigo sai primeiro. */
export const MAX_SEMENTES_PENDENTES = 100;

/**
 * Hash curto e síncrono do conteúdo (cyrb53, 64 bits): identifica o conteúdo
 * no mapa sem guardar o payload (valores, observações) no navegador. A semente
 * precisa ser escolhida antes do primeiro await, por isso não usa SHA-256.
 */
function hashConteudo(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function lerPendentes(dados: unknown): Map<string, SementePendente> {
  const mapa = new Map<string, SementePendente>();
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return mapa;
  const lidas = Object.entries(dados as Record<string, unknown>)
    .filter((par): par is [string, SementePendente] => {
      const p = par[1] as Partial<SementePendente> | null;
      return !!p && typeof p.s === 'string' && p.s.length > 0 && typeof p.t === 'number' && Number.isFinite(p.t);
    })
    .sort((a, b) => a[1].t - b[1].t);
  for (const [k, p] of lidas) mapa.set(k, { s: p.s, t: p.t });
  return mapa;
}

/**
 * Sementes por conteúdo ainda não confirmado, para uma tela (`escopo`).
 *
 * Enquanto um conteúdo não recebe resposta de sucesso, reenviá-lo — duplo
 * clique, retry, fechar e reabrir o formulário, outras criações bem-sucedidas
 * no meio — gera sempre a mesma chave. Depois de `confirmar`, o mesmo conteúdo
 * ganha semente nova: duas operações iguais em sequência são legítimas.
 *
 * O `conteudo` precisa ser o que o servidor compara no reenvio, em forma
 * canônica (ex.: itens de requisição ordenados): conteúdos que o servidor
 * considera iguais têm de produzir o mesmo JSON.
 */
export function criarChavesPendentes<T = unknown>(
  escopo: string,
  opcoes: OpcoesChavesPendentes = {},
): ChavesPendentes<T> {
  const {
    formato = 'texto',
    gerarSemente = novaSemente,
    armazenamento = null,
    agora = Date.now,
  } = opcoes;
  let lido: unknown = null;
  try {
    lido = armazenamento?.ler() ?? null;
  } catch {
    lido = null;
  }
  const pendentes = lerPendentes(lido);

  const persistir = () => {
    try {
      armazenamento?.gravar(Object.fromEntries(pendentes));
    } catch {
      // Sem armazenamento (aba anônima, cota): as sementes ficam só na memória.
    }
  };

  const expirar = () => {
    const limite = agora() - VALIDADE_SEMENTE_PENDENTE_MS;
    for (const [k, p] of pendentes) {
      if (p.t < limite) pendentes.delete(k);
    }
  };

  // Reinsere no fim a cada uso: a ordem do Map é a ordem de uso, e o descarte
  // por excesso tira o conteúdo parado há mais tempo.
  const reservar = (conteudo: T, trocar: boolean): string => {
    expirar();
    const k = hashConteudo(jsonCanonico(conteudo));
    const atual = pendentes.get(k);
    const semente = !trocar && atual ? atual.s : gerarSemente();
    pendentes.delete(k);
    pendentes.set(k, { s: semente, t: agora() });
    while (pendentes.size > MAX_SEMENTES_PENDENTES) {
      const maisAntigo = pendentes.keys().next().value;
      if (maisAntigo === undefined) break;
      pendentes.delete(maisAntigo);
    }
    persistir();
    return semente;
  };

  return {
    // A semente é escolhida antes do primeiro await: duas chamadas simultâneas
    // com o mesmo conteúdo nunca sorteiam sementes diferentes.
    chave: conteudo => chaveComEscopo(escopo, reservar(conteudo, false), conteudo, formato),
    semente: conteudo => reservar(conteudo, false),
    confirmar(conteudo) {
      if (pendentes.delete(hashConteudo(jsonCanonico(conteudo)))) persistir();
    },
    renovar(conteudo) {
      reservar(conteudo, true);
    },
  };
}

function armazenamentoDaAba(chave: string): ArmazenamentoSementes | null {
  let storage: Storage;
  try {
    if (typeof sessionStorage === 'undefined') return null;
    storage = sessionStorage;
  } catch {
    return null;
  }
  return {
    ler: () => {
      const texto = storage.getItem(chave);
      return texto ? JSON.parse(texto) : null;
    },
    gravar: pendentes => {
      if (Object.keys(pendentes).length === 0) storage.removeItem(chave);
      else storage.setItem(chave, JSON.stringify(pendentes));
    },
  };
}

const registroDaAba = new Map<string, ChavesPendentes<unknown>>();

/**
 * As sementes pendentes de uma tela, compartilhadas pela aba inteira.
 *
 * Vivem fora do componente — num modal que desmonta ao fechar, o mapa
 * morreria com ele e "fechar e reabrir" voltaria a duplicar — e são espelhadas
 * no `sessionStorage`, para sobreviver também ao recarregar a página. A
 * `particao` (empresa) separa as unidades: a mesma chave em outra empresa é
 * outro registro no servidor, e confirmá-lo lá não pode liberar a semente
 * pendente daqui.
 *
 * O mesmo `escopo` precisa ser usado sempre com o mesmo formato: a primeira
 * chamada fixa as opções da aba.
 */
export function chavesPendentesDaAba<T = unknown>(
  escopo: string,
  particao: string,
  opcoes: Pick<OpcoesChavesPendentes, 'formato'> = {},
): ChavesPendentes<T> {
  const id = `${escopo}@${particao}`;
  let instancia = registroDaAba.get(id);
  if (!instancia) {
    instancia = criarChavesPendentes<unknown>(escopo, {
      ...opcoes,
      armazenamento: armazenamentoDaAba(`chaves-pendentes:v1:${id}`),
    });
    registroDaAba.set(id, instancia);
  }
  return instancia as ChavesPendentes<T>;
}

/** Só para testes: esquece as instâncias da aba (o `sessionStorage` continua). */
export function limparRegistroDaAba(): void {
  registroDaAba.clear();
}
