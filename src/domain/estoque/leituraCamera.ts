/**
 * Regras da leitura de código de barras pela câmera (sem React nem DOM).
 *
 * A câmera enxerga o mesmo código várias vezes por segundo enquanto o produto
 * está na frente; o filtro de repetição transforma isso em uma leitura só.
 */
import { normalizarBarcode } from '@/domain/estoque/barcode';

/** Código de barras de produto (EAN/UPC) e etiqueta interna Code 128. */
export const FORMATOS_CAMERA = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] as const;
export type FormatoCamera = typeof FORMATOS_CAMERA[number];

/** Tempo que um código precisa ficar fora da câmera para valer de novo. */
export const JANELA_REPETICAO_CAMERA_MS = 2000;
/** Pausa entre uma análise de imagem e a próxima (~8 por segundo). */
export const INTERVALO_LEITURA_CAMERA_MS = 125;

/** Moldura de mira: fração da largura e da altura da imagem na tela, centralizada. */
export const MIRA_CAMERA = { largura: 0.75, altura: 1 / 3 } as const;

export interface Retangulo { x: number; y: number; width: number; height: number }
export interface Dimensoes { largura: number; altura: number }

/**
 * O código só vale com o centro dentro da moldura de mira. A imagem aparece
 * com object-cover, que corta o que sobra do vídeo: sem essa conta, um código
 * na parte cortada (que o operador nem vê) ou na prateleira ao fundo abriria
 * o produto errado. Sem medidas para comparar, aceita — melhor ler do que travar.
 *
 * `caixa` e `video` em pixels da imagem da câmera; `tela` em pixels do <video>.
 */
export function dentroDaMira(caixa: Retangulo | undefined, video: Dimensoes, tela: Dimensoes): boolean {
  if (!caixa || !(caixa.width > 0) || !(caixa.height > 0)) return true;
  if (!(video.largura > 0 && video.altura > 0 && tela.largura > 0 && tela.altura > 0)) return true;
  const escala = Math.max(tela.largura / video.largura, tela.altura / video.altura);
  const dx = (caixa.x + caixa.width / 2 - video.largura / 2) * escala;
  const dy = (caixa.y + caixa.height / 2 - video.altura / 2) * escala;
  return Math.abs(dx) <= (tela.largura * MIRA_CAMERA.largura) / 2
    && Math.abs(dy) <= (tela.altura * MIRA_CAMERA.altura) / 2;
}

export type ErroCamera = 'negado' | 'sem_camera' | 'em_uso' | 'sem_suporte' | 'desconhecido';

/** O navegador não tem câmera acessível por site ou o leitor não carregou. */
export class SemSuporteError extends Error {
  constructor(message = 'Leitura pela câmera indisponível neste navegador.') {
    super(message);
    this.name = 'SemSuporteError';
  }
}

const ERRO_POR_NOME: Record<string, ErroCamera> = {
  NotAllowedError: 'negado',
  SecurityError: 'negado',
  PermissionDeniedError: 'negado',
  NotFoundError: 'sem_camera',
  DevicesNotFoundError: 'sem_camera',
  OverconstrainedError: 'sem_camera',
  NotReadableError: 'em_uso',
  TrackStartError: 'em_uso',
  AbortError: 'em_uso',
  SemSuporteError: 'sem_suporte',
  TypeError: 'sem_suporte',
};

export function classificarErroCamera(erro: unknown): ErroCamera {
  if (typeof erro !== 'object' || erro === null) return 'desconhecido';
  const nome = (erro as { name?: unknown }).name;
  return typeof nome === 'string' ? ERRO_POR_NOME[nome] ?? 'desconhecido' : 'desconhecido';
}

export const MENSAGEM_ERRO_CAMERA: Record<ErroCamera, string> = {
  negado: 'A câmera está bloqueada para este site. Libere a câmera nas configurações do navegador e toque em Ler pela câmera de novo. Enquanto isso, use o leitor ou digite o código.',
  sem_camera: 'Nenhuma câmera encontrada neste aparelho. Use o leitor ou digite o código.',
  em_uso: 'A câmera está sendo usada por outro app. Feche o outro app e tente de novo.',
  sem_suporte: 'Este navegador não consegue ler código pela câmera. Use o leitor ou digite o código.',
  desconhecido: 'Não foi possível abrir a câmera. Tente de novo.',
};

export interface FiltroRepeticao {
  /** true quando o código deve abrir o produto; false se ainda está "na frente" da câmera. */
  aceitar(codigo: string, agora: number): boolean;
  /** Ao retomar a leitura: o que ainda estiver na frente da câmera não reabre. */
  reiniciar(agora: number): void;
}

/**
 * Cada código visto renova a própria janela; só vale de novo depois de ficar
 * `janelaMs` sem aparecer. Guarda todos os códigos recentes (não só o último)
 * para dois códigos no mesmo quadro não se alternarem sem parar.
 */
export function criarFiltroRepeticao(janelaMs = JANELA_REPETICAO_CAMERA_MS): FiltroRepeticao {
  const vistoEm = new Map<string, number>();

  const esquecerAntigos = (agora: number) => {
    for (const [codigo, em] of vistoEm) {
      if (agora - em >= janelaMs) vistoEm.delete(codigo);
    }
  };

  return {
    aceitar(raw, agora) {
      const codigo = normalizarBarcode(raw);
      if (!codigo) return false;
      esquecerAntigos(agora);
      const recente = vistoEm.has(codigo);
      vistoEm.set(codigo, agora);
      return !recente;
    },
    reiniciar(agora) {
      for (const codigo of vistoEm.keys()) vistoEm.set(codigo, agora);
    },
  };
}
