import { describe, expect, it } from 'vitest';
import { runOptionalAutoBind } from './conciliacaoAutoBind';

describe('runOptionalAutoBind', () => {
  it('confirma sucesso quando a RPC responde sem erro', async () => {
    const result = await runOptionalAutoBind(async () => ({ error: null }));

    expect(result).toEqual({ ok: true });
  });

  it('não lança quando a RPC está ausente do schema cache', async () => {
    const error = {
      code: 'PGRST202',
      message: 'Could not find the function in the schema cache',
      details: null,
      hint: null,
    };

    const result = await runOptionalAutoBind(async () => ({ error }));

    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);
    expect(result.diagnostic).toContain('PGRST202');
  });

  it('não lança quando a chamada rejeita por falha de rede', async () => {
    const result = await runOptionalAutoBind(async () => {
      throw new Error('Network request failed');
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostic).toBe('Network request failed');
  });
});
