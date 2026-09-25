/**
 * Detector de código de barras para a câmera.
 *
 * Chrome no Android tem `BarcodeDetector` nativo; Safari no iPhone não, e aí
 * entra o ZXing-C++ em WebAssembly (`barcode-detector/ponyfill`). A lib busca
 * o `.wasm` no jsDelivr por padrão — aqui ele vem do próprio site (import
 * `?url` do Vite), porque a CSP só permite `connect-src 'self'` e o binário
 * não deve depender de CDN de terceiros. Os dois só são baixados quando alguém
 * abre a câmera.
 */
import { FORMATOS_CAMERA, SemSuporteError, type Retangulo } from '@/domain/estoque/leituraCamera';

export interface CodigoLido {
  valor: string;
  /** Onde o código está na imagem da câmera (para conferir a mira). */
  caixa?: Retangulo;
}

export interface DetectorCodigo {
  origem: 'nativo' | 'wasm';
  detectar(fonte: HTMLVideoElement): Promise<CodigoLido[]>;
}

interface DetectorDoNavegador {
  detect(fonte: HTMLVideoElement): Promise<Array<{ rawValue: string; boundingBox?: Retangulo }>>;
}

interface ClasseDetectorNativo {
  new (opcoes: { formats: string[] }): DetectorDoNavegador;
  getSupportedFormats(): Promise<readonly string[]>;
}

function embrulhar(origem: DetectorCodigo['origem'], detector: DetectorDoNavegador): DetectorCodigo {
  return {
    origem,
    async detectar(fonte) {
      const achados = await detector.detect(fonte);
      return achados.filter(b => b.rawValue).map(b => ({ valor: b.rawValue, caixa: b.boundingBox }));
    },
  };
}

async function carregarNativo(): Promise<DetectorCodigo | null> {
  const Nativo = (globalThis as { BarcodeDetector?: ClasseDetectorNativo }).BarcodeDetector;
  if (typeof Nativo !== 'function') return null;
  try {
    const suportados = await Nativo.getSupportedFormats();
    if (!suportados.includes('ean_13')) return null;
    return embrulhar('nativo', new Nativo({ formats: FORMATOS_CAMERA.filter(f => suportados.includes(f)) }));
  } catch {
    return null;
  }
}

async function carregarWasm(): Promise<DetectorCodigo> {
  try {
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    // Carrega e compila o .wasm agora, para uma falha aparecer ao abrir a
    // câmera e não em silêncio a cada quadro.
    await prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
      },
      fireImmediately: true,
    });
    return embrulhar('wasm', new BarcodeDetector({ formats: [...FORMATOS_CAMERA] }));
  } catch (erro) {
    console.error('[camera] leitor ZXing não carregou', erro);
    throw new SemSuporteError();
  }
}

let carregando: Promise<DetectorCodigo> | null = null;

/** Mesma instância para toda a sessão; uma falha libera nova tentativa. */
export function carregarDetector(): Promise<DetectorCodigo> {
  if (!carregando) {
    carregando = (async () => (await carregarNativo()) ?? carregarWasm())();
    carregando.catch(() => { carregando = null; });
  }
  return carregando;
}
