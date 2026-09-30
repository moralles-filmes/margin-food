import { describe, expect, it } from 'vitest';
import { traduzirErroIdempotencia } from '@/domain/financeiro/idempotencia';
import { chaveComEscopo, criarChavesPendentes, novaSemente } from '@/lib/chaveOperacao';

// Chave das criações do Financeiro: `useChavesPendentes(escopo)` deriva
// `chaveComEscopo(escopo, semente pendente, payload da RPC)`.
const chaveIdempotencia = (escopo: string, semente: string, identidade: unknown) =>
  chaveComEscopo(escopo, semente, identidade);

// Payload no formato que o Livro Razão envia a _guarded_upsert_lancamento.
const lancamento = {
  p_id: null,
  p_tipo: 'DESPESA',
  p_status: 'PREVISTO',
  p_valor: 123.45,
  p_conta_id: 'conta-1',
  p_categoria_id: 'cat-1',
  p_data_competencia: '2026-09-29',
  p_descricao: 'Energia',
  p_rateios: [{ categoria_id: 'cat-1', valor: 123.45 }],
};

describe('chaveIdempotencia', () => {
  it('repete a chave para a mesma operação (duplo clique e retry são deduplicados)', async () => {
    expect(await chaveIdempotencia('lancamento', 's1', lancamento))
      .toBe(await chaveIdempotencia('lancamento', 's1', { ...lancamento }));
  });

  it('não depende da ordem em que o payload foi montado', async () => {
    const invertido = Object.fromEntries(Object.entries(lancamento).reverse());
    expect(await chaveIdempotencia('lancamento', 's1', invertido))
      .toBe(await chaveIdempotencia('lancamento', 's1', lancamento));
  });

  it('ignora campo undefined, que o JSON da requisição também descarta', async () => {
    expect(await chaveIdempotencia('conta_pagar', 's1', { ...lancamento, p_expected_updated_at: undefined }))
      .toBe(await chaveIdempotencia('conta_pagar', 's1', lancamento));
  });

  it('muda quando qualquer campo da operação muda — envio diferente nunca vira reenvio', async () => {
    const base = await chaveIdempotencia('lancamento', 's1', lancamento);
    const variantes = [
      { ...lancamento, p_valor: 123.46 },
      { ...lancamento, p_descricao: 'Energia ' },
      { ...lancamento, p_conta_id: 'conta-2' },
      { ...lancamento, p_data_competencia: '2026-09-30' },
      { ...lancamento, p_rateios: [{ categoria_id: 'cat-2', valor: 123.45 }] },
    ];
    for (const variante of variantes) {
      expect(await chaveIdempotencia('lancamento', 's1', variante)).not.toBe(base);
    }
  });

  it('muda com a semente: um lançamento novo após sucesso nunca reencontra o anterior', async () => {
    expect(await chaveIdempotencia('lancamento', 's2', lancamento))
      .not.toBe(await chaveIdempotencia('lancamento', 's1', lancamento));
  });

  it('muda com o escopo: telas diferentes nunca compartilham chave', async () => {
    expect(await chaveIdempotencia('conta_pagar', 's1', lancamento))
      .not.toBe(await chaveIdempotencia('conta_receber', 's1', lancamento));
  });

  it('cabe no limite de 200 caracteres do servidor mesmo com descrição longa', async () => {
    const chave = await chaveIdempotencia('transferencia', novaSemente(), {
      ...lancamento,
      p_descricao: 'x'.repeat(5000),
    });
    expect(chave).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('criarChavesPendentes', () => {
  const outro = { ...lancamento, p_descricao: 'Água', p_valor: 100 };

  function sequencial() {
    let n = 0;
    return () => `semente-${++n}`;
  }

  it('reenvio do mesmo conteúdo ainda não confirmado repete a chave', async () => {
    const chaves = criarChavesPendentes('lancamento', { gerarSemente: sequencial() });
    expect(await chaves.chave(lancamento)).toBe(await chaves.chave({ ...lancamento }));
  });

  it('duplo clique simultâneo (antes da 1ª chave resolver) usa a mesma semente', async () => {
    const chaves = criarChavesPendentes('lancamento', { gerarSemente: sequencial() });
    const [a, b] = await Promise.all([chaves.chave(lancamento), chaves.chave({ ...lancamento })]);
    expect(a).toBe(b);
  });

  it('A sem resposta → B confirmado → reenvio de A: a chave de A não muda (não duplica)', async () => {
    const chaves = criarChavesPendentes('lancamento', { gerarSemente: sequencial() });
    const primeiraDeA = await chaves.chave(lancamento); // servidor gravou, resposta perdida
    await chaves.chave(outro);
    chaves.confirmar(outro); // B deu certo no meio
    expect(await chaves.chave(lancamento)).toBe(primeiraDeA);
  });

  it('depois de confirmado, o mesmo conteúdo é um lançamento novo (dois iguais seguidos são legítimos)', async () => {
    const chaves = criarChavesPendentes('lancamento', { gerarSemente: sequencial() });
    const primeiro = await chaves.chave(lancamento);
    chaves.confirmar(lancamento);
    expect(await chaves.chave(lancamento)).not.toBe(primeiro);
  });

  it('mudar qualquer campo gera chave nova mesmo com a mesma instância', async () => {
    const chaves = criarChavesPendentes('lancamento', { gerarSemente: sequencial() });
    expect(await chaves.chave({ ...lancamento, p_valor: 1 })).not.toBe(await chaves.chave(lancamento));
  });

  it('instâncias de fluxos diferentes (lançamento × transferência) não compartilham semente', async () => {
    const sementes = sequencial();
    const lancamentos = criarChavesPendentes('lancamento', { gerarSemente: sementes });
    const transferencias = criarChavesPendentes('transferencia', { gerarSemente: sementes });
    const chaveA = await lancamentos.chave(lancamento);
    await transferencias.chave(outro);
    transferencias.confirmar(outro);
    expect(await lancamentos.chave(lancamento)).toBe(chaveA);
  });
});

describe('traduzirErroIdempotencia', () => {
  it('traduz os erros de idempotência das RPCs', () => {
    expect(traduzirErroIdempotencia('REQUEST_ID_REUTILIZADO')).toContain('não confere');
    expect(traduzirErroIdempotencia('PARCELA_FORA_DE_ORDEM: esperada 3, próxima 2')).toContain('desatualizada');
    expect(traduzirErroIdempotencia('LANCAMENTO_JA_VINCULADO')).toContain('já está vinculado');
  });

  it('devolve null para os demais erros, que a tela trata como antes', () => {
    expect(traduzirErroIdempotencia('Permission denied: financeiro:lancamentos:create')).toBeNull();
    expect(traduzirErroIdempotencia(undefined)).toBeNull();
  });
});
