import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ponyfill = vi.hoisted(() => ({
  prepareZXingModule: vi.fn(),
  detect: vi.fn(),
  opcoesDetector: [] as unknown[],
}));

vi.mock('barcode-detector/ponyfill', () => ({
  prepareZXingModule: ponyfill.prepareZXingModule,
  BarcodeDetector: class {
    constructor(opcoes: unknown) { ponyfill.opcoesDetector.push(opcoes); }
    detect = ponyfill.detect;
  },
}));

vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({ default: '/assets/zxing_reader-abc.wasm' }));

type Global = typeof globalThis & { BarcodeDetector?: unknown };

async function importarDetector() {
  vi.resetModules();
  return import('@/lib/camera/detectorCodigoBarras');
}

function instalarNativo(formatos: string[]) {
  const opcoes: unknown[] = [];
  const detect = vi.fn(async () => [
    { rawValue: '7891234567895', boundingBox: { x: 10, y: 20, width: 300, height: 90 } },
    { rawValue: '' },
  ]);
  (globalThis as Global).BarcodeDetector = class {
    static getSupportedFormats = vi.fn(async () => formatos);
    constructor(o: unknown) { opcoes.push(o); }
    detect = detect;
  };
  return { opcoes, detect };
}

beforeEach(() => {
  ponyfill.prepareZXingModule.mockReset().mockResolvedValue({});
  ponyfill.detect.mockReset().mockResolvedValue([{ rawValue: '78912342' }]);
  ponyfill.opcoesDetector.length = 0;
});

afterEach(() => {
  delete (globalThis as Global).BarcodeDetector;
});

describe('carregarDetector', () => {
  it('usa o leitor do navegador quando ele lê código de barras de produto (Chrome Android)', async () => {
    const nativo = instalarNativo(['qr_code', 'ean_13', 'ean_8', 'code_128']);
    const { carregarDetector } = await importarDetector();

    const detector = await carregarDetector();
    expect(detector.origem).toBe('nativo');
    expect(nativo.opcoes).toEqual([{ formats: ['ean_13', 'ean_8', 'code_128'] }]);
    expect(await detector.detectar(document.createElement('video'))).toEqual([
      { valor: '7891234567895', caixa: { x: 10, y: 20, width: 300, height: 90 } },
    ]);
    expect(ponyfill.prepareZXingModule).not.toHaveBeenCalled();
  });

  it('sem leitor no navegador (iPhone), carrega o ZXing com o .wasm do próprio site', async () => {
    const { carregarDetector } = await importarDetector();

    const detector = await carregarDetector();
    expect(detector.origem).toBe('wasm');
    expect(await detector.detectar(document.createElement('video'))).toEqual([{ valor: '78912342', caixa: undefined }]);

    const [{ overrides, fireImmediately }] = ponyfill.prepareZXingModule.mock.calls[0];
    expect(fireImmediately).toBe(true);
    expect(overrides.locateFile('zxing_reader.wasm', 'https://cdn.jsdelivr.net/x/')).toBe('/assets/zxing_reader-abc.wasm');
    expect(ponyfill.opcoesDetector).toEqual([{ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] }]);
  });

  it('leitor do navegador sem EAN cai no ZXing', async () => {
    instalarNativo(['qr_code']);
    const { carregarDetector } = await importarDetector();
    expect((await carregarDetector()).origem).toBe('wasm');
  });

  it('reabrir a câmera não carrega o leitor de novo', async () => {
    const { carregarDetector } = await importarDetector();
    await carregarDetector();
    await carregarDetector();
    expect(ponyfill.prepareZXingModule).toHaveBeenCalledTimes(1);
  });

  it('falha ao carregar vira "sem suporte" e a próxima tentativa carrega de novo', async () => {
    ponyfill.prepareZXingModule.mockRejectedValueOnce(new Error('CompileError: WebAssembly'));
    const { carregarDetector } = await importarDetector();

    await expect(carregarDetector()).rejects.toMatchObject({ name: 'SemSuporteError' });
    expect((await carregarDetector()).origem).toBe('wasm');
    expect(ponyfill.prepareZXingModule).toHaveBeenCalledTimes(2);
  });
});
