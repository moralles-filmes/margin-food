import { describe, expect, it } from 'vitest';
import {
  classificarErroCamera, criarFiltroRepeticao, dentroDaMira, JANELA_REPETICAO_CAMERA_MS, SemSuporteError,
} from '@/domain/estoque/leituraCamera';

describe('dentroDaMira', () => {
  // Vídeo 1280x720 mostrado numa caixa 4:3 de 400x300 com object-cover: a
  // imagem é ampliada para 533x300 e perde 66 px de cada lado. A mira fica
  // no meio, com 300x100.
  const video = { largura: 1280, altura: 720 };
  const tela = { largura: 400, altura: 300 };
  const caixaEm = (cx: number, cy: number) => ({ x: cx - 50, y: cy - 15, width: 100, height: 30 });

  it('aceita o código no meio da mira', () => {
    expect(dentroDaMira(caixaEm(640, 360), video, tela)).toBe(true);
  });

  it('recusa código na faixa cortada da imagem, que não aparece na tela', () => {
    expect(dentroDaMira(caixaEm(60, 360), video, tela)).toBe(false);
  });

  it('recusa código que aparece na tela, mas fora da mira', () => {
    expect(dentroDaMira(caixaEm(640, 120), video, tela)).toBe(false);
  });

  it('aceita até a borda da mira', () => {
    // mira: 150 px para cada lado do centro na tela = 360 px no vídeo
    expect(dentroDaMira(caixaEm(640 + 355, 360), video, tela)).toBe(true);
    expect(dentroDaMira(caixaEm(640 + 365, 360), video, tela)).toBe(false);
  });

  it('celular em pé: vídeo vertical numa caixa deitada corta em cima e embaixo', () => {
    const vertical = { largura: 720, altura: 1280 };
    const celular = { largura: 360, altura: 270 };
    expect(dentroDaMira(caixaEm(360, 640), vertical, celular)).toBe(true);
    expect(dentroDaMira(caixaEm(360, 200), vertical, celular)).toBe(false);
  });

  it('sem medidas para comparar, aceita (não trava a leitura)', () => {
    expect(dentroDaMira(undefined, video, tela)).toBe(true);
    expect(dentroDaMira({ x: 0, y: 0, width: 0, height: 0 }, video, tela)).toBe(true);
    expect(dentroDaMira(caixaEm(60, 360), { largura: 0, altura: 0 }, tela)).toBe(true);
    expect(dentroDaMira(caixaEm(60, 360), video, { largura: 0, altura: 0 })).toBe(true);
  });
});

describe('criarFiltroRepeticao', () => {
  it('aceita a primeira leitura', () => {
    const filtro = criarFiltroRepeticao();
    expect(filtro.aceitar('7891234567895', 0)).toBe(true);
  });

  it('ignora o mesmo código lido de novo logo em seguida', () => {
    const filtro = criarFiltroRepeticao();
    filtro.aceitar('7891234567895', 0);
    expect(filtro.aceitar('7891234567895', 1000)).toBe(false);
  });

  it('produto parado na frente da câmera não reabre, por mais tempo que fique', () => {
    const filtro = criarFiltroRepeticao();
    filtro.aceitar('7891234567895', 0);
    for (let t = 500; t <= 5000; t += 500) {
      expect(filtro.aceitar('7891234567895', t)).toBe(false);
    }
  });

  it('volta a valer depois de ficar a janela inteira fora da câmera', () => {
    const filtro = criarFiltroRepeticao();
    filtro.aceitar('7891234567895', 0);
    expect(filtro.aceitar('7891234567895', JANELA_REPETICAO_CAMERA_MS)).toBe(true);
  });

  it('código diferente vale na hora', () => {
    const filtro = criarFiltroRepeticao();
    filtro.aceitar('7891234567895', 0);
    expect(filtro.aceitar('78912342', 100)).toBe(true);
  });

  it('dois códigos na frente ao mesmo tempo não ficam se alternando', () => {
    const filtro = criarFiltroRepeticao();
    expect(filtro.aceitar('7891234567895', 0)).toBe(true);
    expect(filtro.aceitar('78912342', 0)).toBe(true);
    for (let t = 125; t <= 3000; t += 125) {
      expect(filtro.aceitar('7891234567895', t)).toBe(false);
      expect(filtro.aceitar('78912342', t)).toBe(false);
    }
  });

  it('reiniciar ao retomar a leitura recomeça a janela dos códigos vistos', () => {
    const filtro = criarFiltroRepeticao();
    filtro.aceitar('7891234567895', 0);
    // a pessoa ficou 10 s no cartão de quantidade; o produto continua na frente
    filtro.reiniciar(10_000);
    expect(filtro.aceitar('7891234567895', 10_500)).toBe(false);
    expect(filtro.aceitar('7891234567895', 10_500 + JANELA_REPETICAO_CAMERA_MS)).toBe(true);
  });

  it('reiniciar sem leitura anterior não bloqueia nada', () => {
    const filtro = criarFiltroRepeticao();
    filtro.reiniciar(0);
    expect(filtro.aceitar('7891234567895', 10)).toBe(true);
  });

  it('compara o código normalizado e ignora leitura vazia', () => {
    const filtro = criarFiltroRepeticao();
    expect(filtro.aceitar('  ', 0)).toBe(false);
    filtro.aceitar('7891234567895', 0);
    expect(filtro.aceitar(' 7891234567895\n', 100)).toBe(false);
  });
});

describe('classificarErroCamera', () => {
  it.each([
    ['NotAllowedError', 'negado'],
    ['SecurityError', 'negado'],
    ['NotFoundError', 'sem_camera'],
    ['OverconstrainedError', 'sem_camera'],
    ['NotReadableError', 'em_uso'],
    ['AbortError', 'em_uso'],
    ['QualquerOutro', 'desconhecido'],
  ])('%s → %s', (nome, esperado) => {
    expect(classificarErroCamera(new DOMException('x', nome))).toBe(esperado);
  });

  it('leitor que não carregou e navegador sem API são "sem suporte"', () => {
    expect(classificarErroCamera(new SemSuporteError())).toBe('sem_suporte');
    expect(classificarErroCamera(new TypeError('getUserMedia is not a function'))).toBe('sem_suporte');
  });

  it('valor que não é erro vira "desconhecido"', () => {
    expect(classificarErroCamera('falhou')).toBe('desconhecido');
    expect(classificarErroCamera(null)).toBe('desconhecido');
  });
});
