import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chaveOperacao,
  chaveOperacaoUuid,
  chavesPendentesDaAba,
  criarChavesPendentes,
  jsonCanonico,
  limparRegistroDaAba,
  MAX_SEMENTES_PENDENTES,
  novaSemente,
  VALIDADE_SEMENTE_PENDENTE_MS,
  type ArmazenamentoSementes,
} from '@/lib/chaveOperacao';

describe('jsonCanonico', () => {
  it('não depende da ordem em que o objeto foi montado', () => {
    expect(jsonCanonico({ b: 1, a: { d: 2, c: 3 } })).toBe(jsonCanonico({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('mantém a ordem dos arrays — ela faz parte do conteúdo', () => {
    expect(jsonCanonico([1, 2])).not.toBe(jsonCanonico([2, 1]));
  });

  it('ignora undefined como o JSON.stringify, mas distingue null', () => {
    expect(jsonCanonico({ a: 1, b: undefined })).toBe(jsonCanonico({ a: 1 }));
    expect(jsonCanonico({ a: 1, b: null })).not.toBe(jsonCanonico({ a: 1 }));
  });
});

describe('chaveOperacao (chave derivada)', () => {
  const conteudo = { cotacao_id: 'c1', tipo: 'NEGOCIACAO', phone: '5511999999999', message: 'Olá' };

  it('repetir a mesma operação reaproveita a chave (retry não duplica)', async () => {
    expect(await chaveOperacao('s1', conteudo)).toBe(await chaveOperacao('s1', { ...conteudo }));
  });

  it('a ordem das chaves do objeto não muda a chave', async () => {
    const invertido = { message: 'Olá', phone: '5511999999999', tipo: 'NEGOCIACAO', cotacao_id: 'c1' };
    expect(await chaveOperacao('s1', invertido)).toBe(await chaveOperacao('s1', conteudo));
  });

  it('qualquer campo alterado gera chave nova sozinho', async () => {
    const base = await chaveOperacao('s1', conteudo);
    expect(await chaveOperacao('s1', { ...conteudo, message: 'Olá!' })).not.toBe(base);
    expect(await chaveOperacao('s1', { ...conteudo, phone: '5511888888888' })).not.toBe(base);
  });

  it('semente nova = operação nova, mesmo com o mesmo conteúdo', async () => {
    expect(await chaveOperacao('s2', conteudo)).not.toBe(await chaveOperacao('s1', conteudo));
  });

  it('cabe no índice: 64 caracteres hexadecimais', async () => {
    expect(await chaveOperacao('s1', conteudo)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('chaveOperacaoUuid', () => {
  it('é determinística e tem formato UUID (v8, variante RFC)', async () => {
    const a = await chaveOperacaoUuid('s1', { x: 1 });
    expect(a).toBe(await chaveOperacaoUuid('s1', { x: 1 }));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await chaveOperacaoUuid('s1', { x: 2 })).not.toBe(a);
  });
});

describe('novaSemente', () => {
  it('cada operação nova recebe uma semente diferente', () => {
    expect(novaSemente()).not.toBe(novaSemente());
  });
});

describe('criarChavesPendentes — semente por conteúdo pendente', () => {
  const a = { produto: 'p1', quantidade: 2 };
  const b = { produto: 'p2', quantidade: 5 };

  function sequencial() {
    let n = 0;
    return () => `semente-${++n}`;
  }

  function memoria(): ArmazenamentoSementes & { dados: unknown } {
    const armazenamento = {
      dados: null as unknown,
      ler: () => armazenamento.dados,
      gravar: (p: unknown) => { armazenamento.dados = JSON.parse(JSON.stringify(p)); },
    };
    return armazenamento;
  }

  it('A sem resposta → B confirmado → reenvio de A: a chave de A não muda', async () => {
    const chaves = criarChavesPendentes('teste', { gerarSemente: sequencial() });
    const primeiraDeA = await chaves.chave(a);
    await chaves.chave(b);
    chaves.confirmar(b);
    expect(await chaves.chave(a)).toBe(primeiraDeA);
  });

  it('fechar e reabrir o formulário (instância nova) reaproveita a semente guardada', async () => {
    const armazenamento = memoria();
    const antes = criarChavesPendentes('teste', { gerarSemente: sequencial(), armazenamento });
    const chaveDeA = await antes.chave(a);

    const depois = criarChavesPendentes('teste', { gerarSemente: () => 'nunca-usada', armazenamento });
    expect(await depois.chave(a)).toBe(chaveDeA);
  });

  it('o armazenamento guarda só o hash do conteúdo, nunca o payload', async () => {
    const armazenamento = memoria();
    const chaves = criarChavesPendentes('teste', { gerarSemente: sequencial(), armazenamento });
    await chaves.chave({ observacao: 'NF 4321 do fornecedor', valor: 1234.56 });
    const texto = JSON.stringify(armazenamento.dados);
    expect(texto).not.toContain('NF 4321');
    expect(texto).not.toContain('1234.56');
  });

  it('depois de confirmado, o mesmo conteúdo é uma operação nova — também para a instância reaberta', async () => {
    const armazenamento = memoria();
    const chaves = criarChavesPendentes('teste', { gerarSemente: sequencial(), armazenamento });
    const primeira = await chaves.chave(a);
    chaves.confirmar(a);
    const reaberta = criarChavesPendentes('teste', { gerarSemente: () => 'nova', armazenamento });
    expect(await reaberta.chave(a)).not.toBe(primeira);
  });

  it('semente() devolve a mesma semente pendente que chave() usa', async () => {
    const chaves = criarChavesPendentes('teste', { gerarSemente: sequencial() });
    const semente = chaves.semente(a);
    expect(chaves.semente({ ...a })).toBe(semente);
    expect(await chaves.chave(a)).toBe(await chaveOperacao(semente, { escopo: 'teste', identidade: a }));
  });

  it('renovar troca só a semente daquele conteúdo, que continua pendente', async () => {
    const chaves = criarChavesPendentes('teste', { gerarSemente: sequencial() });
    const chaveDeA = await chaves.chave(a);
    const chaveDeB = await chaves.chave(b);
    chaves.renovar(a);
    const novaDeA = await chaves.chave(a);
    expect(novaDeA).not.toBe(chaveDeA);
    expect(await chaves.chave(a)).toBe(novaDeA);
    expect(await chaves.chave(b)).toBe(chaveDeB);
  });

  it('semente parada além da validade vira operação nova; o uso renova a validade', async () => {
    let agora = 1_000_000;
    const chaves = criarChavesPendentes('teste', { gerarSemente: sequencial(), agora: () => agora });
    const primeira = await chaves.chave(a);

    agora += VALIDADE_SEMENTE_PENDENTE_MS - 1;
    expect(await chaves.chave(a)).toBe(primeira); // retry dentro da validade (e renova)
    agora += VALIDADE_SEMENTE_PENDENTE_MS - 1;
    expect(await chaves.chave(a)).toBe(primeira);

    agora += VALIDADE_SEMENTE_PENDENTE_MS + 1;
    expect(await chaves.chave(a)).not.toBe(primeira);
  });

  it(`guarda no máximo ${MAX_SEMENTES_PENDENTES} conteúdos; o parado há mais tempo sai primeiro`, async () => {
    const chaves = criarChavesPendentes('teste', { gerarSemente: sequencial() });
    const primeira = await chaves.chave({ n: 0 });
    for (let n = 1; n <= MAX_SEMENTES_PENDENTES; n++) await chaves.chave({ n });
    expect(await chaves.chave({ n: 0 })).not.toBe(primeira);
  });

  it('armazenamento corrompido ou indisponível não impede o envio', async () => {
    const quebrado: ArmazenamentoSementes = {
      ler: () => { throw new Error('SecurityError'); },
      gravar: () => { throw new Error('QuotaExceededError'); },
    };
    const chaves = criarChavesPendentes('teste', { gerarSemente: sequencial(), armazenamento: quebrado });
    expect(await chaves.chave(a)).toBe(await chaves.chave(a));

    const lixo: ArmazenamentoSementes = { ler: () => ({ x: { s: 1 }, y: 'z' }), gravar: () => {} };
    const outra = criarChavesPendentes('teste', { gerarSemente: sequencial(), armazenamento: lixo });
    expect(await outra.chave(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('formato uuid gera UUID determinístico para colunas uuid', async () => {
    const chaves = criarChavesPendentes('teste', { formato: 'uuid', gerarSemente: sequencial() });
    const chave = await chaves.chave(a);
    expect(chave).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await chaves.chave(a)).toBe(chave);
  });
});

describe('chavesPendentesDaAba', () => {
  beforeEach(() => { limparRegistroDaAba(); sessionStorage.clear(); });
  afterEach(() => { limparRegistroDaAba(); sessionStorage.clear(); });

  const a = { produto: 'p1', quantidade: 2 };

  it('duas montagens da mesma tela compartilham as sementes', async () => {
    const primeira = chavesPendentesDaAba('tela', 'empresa-1');
    const chave = await primeira.chave(a);
    expect(await chavesPendentesDaAba('tela', 'empresa-1').chave(a)).toBe(chave);
  });

  it('sobrevive a recarregar a página (sessionStorage)', async () => {
    const chave = await chavesPendentesDaAba('tela', 'empresa-1').chave(a);
    limparRegistroDaAba(); // o módulo recarregado começa vazio
    expect(await chavesPendentesDaAba('tela', 'empresa-1').chave(a)).toBe(chave);
  });

  it('empresas diferentes não compartilham sementes: confirmar lá não libera a pendente daqui', async () => {
    const aqui = chavesPendentesDaAba('tela', 'empresa-1');
    const chaveAqui = await aqui.chave(a);
    const la = chavesPendentesDaAba('tela', 'empresa-2');
    await la.chave(a);
    la.confirmar(a);
    expect(await aqui.chave(a)).toBe(chaveAqui);
  });
});
