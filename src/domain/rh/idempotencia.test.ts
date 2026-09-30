import { describe, expect, it } from 'vitest';
import { chavePonto, idDocumentoRh, sementeDaBatida, type DocumentoRhChave } from './idempotencia';

describe('sementeDaBatida', () => {
  it('repetir a mesma batida sem confirmação reaproveita a semente (retry não duplica)', () => {
    const primeira = sementeDaBatida(null, 'ENTRADA', () => 's1');
    expect(sementeDaBatida(primeira, 'ENTRADA', () => 's2')).toBe(primeira);
  });

  it('mudar de batida troca a semente', () => {
    const entrada = sementeDaBatida(null, 'ENTRADA', () => 's1');
    const saida = sementeDaBatida(entrada, 'SAIDA', () => 's2');
    expect(saida).toEqual({ tipo: 'SAIDA', semente: 's2' });
  });

  it('ENTRADA → SAÍDA → ENTRADA sem confirmações não reaproveita a chave da 1ª ENTRADA', async () => {
    let n = 0;
    const gerar = () => `s${++n}`;
    const dados = { colaboradorId: 'c1', data: '2026-09-30' };
    const e1 = sementeDaBatida(null, 'ENTRADA', gerar);
    const s1 = sementeDaBatida(e1, 'SAIDA', gerar);
    const e2 = sementeDaBatida(s1, 'ENTRADA', gerar);
    expect(await chavePonto(e2.semente, { ...dados, tipo: 'ENTRADA' }))
      .not.toBe(await chavePonto(e1.semente, { ...dados, tipo: 'ENTRADA' }));
  });
});

describe('chavePonto', () => {
  const batida = { colaboradorId: 'c1', tipo: 'ENTRADA', data: '2026-09-30' };

  it('a mesma batida com a mesma semente gera a mesma chave', async () => {
    expect(await chavePonto('s1', batida)).toBe(await chavePonto('s1', { ...batida }));
  });

  it('o dia entra na chave: a batida de ontem sem resposta não engole a de hoje', async () => {
    expect(await chavePonto('s1', { ...batida, data: '2026-10-01' })).not.toBe(await chavePonto('s1', batida));
  });

  it('tipo e colaborador mudam a chave', async () => {
    const base = await chavePonto('s1', batida);
    expect(await chavePonto('s1', { ...batida, tipo: 'SAIDA' })).not.toBe(base);
    expect(await chavePonto('s1', { ...batida, colaboradorId: 'c2' })).not.toBe(base);
  });

  it('cabe na coluna (≤ 200 caracteres)', async () => {
    expect((await chavePonto('s1', batida)).length).toBeLessThanOrEqual(200);
  });
});

describe('idDocumentoRh', () => {
  const doc: DocumentoRhChave = {
    colaboradorId: 'c1', tipo: 'aso', nome: 'ASO', descricao: '',
    dataEmissao: '2026-09-01', dataVencimento: null,
    obrigatorio: true, alertarVencimento: true, diasAlertaAntes: 30,
    arquivo: { nome: 'aso.pdf', tamanho: 1234, tipo: 'application/pdf', modificadoEm: 1 },
  };

  it('é um UUID estável: o retry do mesmo envio reaproveita o id (a PK barra a duplicata)', async () => {
    const id = await idDocumentoRh('s1', doc);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await idDocumentoRh('s1', { ...doc })).toBe(id);
  });

  it('trocar o arquivo ou um campo gera outro id (e outro caminho no Storage)', async () => {
    const id = await idDocumentoRh('s1', doc);
    expect(await idDocumentoRh('s1', { ...doc, arquivo: { ...doc.arquivo!, tamanho: 999 } })).not.toBe(id);
    expect(await idDocumentoRh('s1', { ...doc, arquivo: null })).not.toBe(id);
    expect(await idDocumentoRh('s1', { ...doc, dataVencimento: '2027-09-01' })).not.toBe(id);
  });

  it('semente nova = documento novo, mesmo com o mesmo conteúdo', async () => {
    expect(await idDocumentoRh('s2', doc)).not.toBe(await idDocumentoRh('s1', doc));
  });
});
