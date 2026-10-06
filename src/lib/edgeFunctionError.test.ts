import { describe, expect, it } from 'vitest';
import { mensagemErroEdge } from './edgeFunctionError';

const erroHttp = (status: number, body: unknown) => ({ context: new Response(JSON.stringify(body), { status }) });

describe('mensagemErroEdge', () => {
  it('usa `message` de um 4xx', async () => {
    expect(await mensagemErroEdge(erroHttp(409, { message: 'Já registrado.' }), 'fallback')).toBe('Já registrado.');
  });

  it('usa `error` de um 4xx (funções de administração)', async () => {
    expect(await mensagemErroEdge(erroHttp(403, { error: 'Esta unidade já tem administrador.' }), 'fallback'))
      .toBe('Esta unidade já tem administrador.');
  });

  it('`error` que é só um código não vira texto de tela', async () => {
    expect(await mensagemErroEdge(erroHttp(401, { error: 'UNAUTHORIZED' }), 'Sessão expirada.')).toBe('Sessão expirada.');
  });

  it('5xx, corpo não JSON e falha de rede caem no fallback', async () => {
    expect(await mensagemErroEdge(erroHttp(500, { error: 'stack técnico' }), 'fallback')).toBe('fallback');
    expect(await mensagemErroEdge({ context: new Response('<html>', { status: 400 }) }, 'fallback')).toBe('fallback');
    expect(await mensagemErroEdge(new Error('Failed to fetch'), 'fallback')).toBe('fallback');
  });
});
