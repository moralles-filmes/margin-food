import { describe, expect, it } from 'vitest';
import { chaveMensagemIa, interpretarRespostaJsonIa, type MensagemChat } from './chatIdempotencia';

const mensagens: MensagemChat[] = [
  { role: 'user', content: 'Como está o CMV?' },
];

describe('chaveMensagemIa', () => {
  it('Enter + clique na mesma pergunta geram a mesma chave (uma chamada paga só)', async () => {
    expect(await chaveMensagemIa('s1', { agente: 'cmv', mensagens }))
      .toBe(await chaveMensagemIa('s1', { agente: 'cmv', mensagens: mensagens.map(m => ({ ...m })) }));
  });

  it('outra pergunta, outra conversa ou outro agente geram chave nova', async () => {
    const base = await chaveMensagemIa('s1', { agente: 'cmv', mensagens });
    expect(await chaveMensagemIa('s1', { agente: 'geral', mensagens })).not.toBe(base);
    expect(await chaveMensagemIa('s1', { agente: 'cmv', mensagens: [...mensagens, { role: 'user', content: 'E o estoque?' }] })).not.toBe(base);
  });

  it('semente nova (depois de uma resposta) = envio novo, mesmo repetindo a pergunta', async () => {
    expect(await chaveMensagemIa('s2', { agente: 'cmv', mensagens }))
      .not.toBe(await chaveMensagemIa('s1', { agente: 'cmv', mensagens }));
  });
});

describe('interpretarRespostaJsonIa', () => {
  it('reenvio devolve a resposta já gravada', () => {
    expect(interpretarRespostaJsonIa({ idempotent: true, resposta_ia: 'CMV em 31%.' }, 200))
      .toEqual({ tipo: 'resposta', texto: 'CMV em 31%.', repetida: true });
  });

  it('sem dados vira resposta do assistente', () => {
    expect(interpretarRespostaJsonIa({ no_data: true, message: 'Sem dados.' }, 200))
      .toEqual({ tipo: 'resposta', texto: 'Sem dados.', repetida: false });
  });

  it('pergunta ainda em andamento não vira erro na conversa', () => {
    expect(interpretarRespostaJsonIa({ error: { code: 'IN_PROGRESS', message: 'Aguarde.' } }, 409))
      .toEqual({ tipo: 'em_andamento', mensagem: 'Aguarde.' });
  });

  it('erro em objeto ou texto mostra a mensagem, não [object Object]', () => {
    expect(interpretarRespostaJsonIa({ error: { code: 'FORBIDDEN_RBAC', message: 'Sem permissão' } }, 403))
      .toEqual({ tipo: 'erro', mensagem: 'Sem permissão' });
    expect(interpretarRespostaJsonIa({ error: 'Agente inválido' }, 400))
      .toEqual({ tipo: 'erro', mensagem: 'Agente inválido' });
    expect(interpretarRespostaJsonIa(null, 500)).toEqual({ tipo: 'erro', mensagem: 'Erro 500' });
  });
});
