/**
 * O `.wasm` do leitor é servido do próprio domínio a partir do `zxing-wasm`
 * instalado direto; o código JS que o carrega vem do `zxing-wasm` que o
 * `barcode-detector` usa. Se as versões se separarem (atualizar um sem o
 * outro), a câmera do iPhone para de ler — este teste pega isso antes.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZXING_WASM_SHA256 } from 'barcode-detector/ponyfill';

describe('zxing-wasm servido pelo site', () => {
  it('é o mesmo binário que o barcode-detector espera', () => {
    const wasm = readFileSync(resolve(process.cwd(), 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'));
    expect(createHash('sha256').update(wasm).digest('hex')).toBe(ZXING_WASM_SHA256);
  });
});
