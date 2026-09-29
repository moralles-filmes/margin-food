import { describe, expect, it } from 'vitest';
import {
  interpretarEnvioWhatsapp, interpretarFalhaEnvioWhatsapp, MENSAGEM_ENVIO_INCERTO,
} from '@/domain/compras/cotacaoWhatsappEnvio';

describe('interpretarEnvioWhatsapp', () => {
  it('enviado agora', () => {
    expect(interpretarEnvioWhatsapp({ success: true, status: 'SENT' }))
      .toEqual({ tipo: 'enviado', repetido: false, aviso: null });
  });

  it('reenvio de mensagem já enviada não conta como envio novo', () => {
    expect(interpretarEnvioWhatsapp({ success: true, status: 'SENT', idempotent: true, aviso: 'x' }))
      .toEqual({ tipo: 'enviado', repetido: true, aviso: 'x' });
  });

  it('timeout/queda na Z-API é incerto — não é falha que convide a reenviar', () => {
    expect(interpretarEnvioWhatsapp({ success: false, status: 'UNKNOWN' }))
      .toEqual({ tipo: 'incerto', mensagem: MENSAGEM_ENVIO_INCERTO });
    expect(interpretarEnvioWhatsapp({ success: false, status: 'PENDING', message: 'em andamento' }))
      .toEqual({ tipo: 'incerto', mensagem: 'em andamento' });
  });

  it('recusa explícita da Z-API (nada saiu)', () => {
    expect(interpretarEnvioWhatsapp({ success: false, status: 'ERROR', message: 'A Z-API recusou' }))
      .toEqual({ tipo: 'recusado', mensagem: 'A Z-API recusou' });
    expect(interpretarEnvioWhatsapp({ success: false, error: 'ZAPI_NOT_CONFIGURED', message: 'Configure' }))
      .toEqual({ tipo: 'recusado', mensagem: 'Configure' });
  });

  it('chave de outro envio', () => {
    expect(interpretarEnvioWhatsapp({ success: false, error: 'REQUEST_ID_REUTILIZADO' })).toEqual({ tipo: 'reutilizado' });
  });

  it('sem corpo é resposta perdida', () => {
    expect(interpretarEnvioWhatsapp(null)).toEqual({ tipo: 'sem_resposta' });
  });
});

describe('interpretarFalhaEnvioWhatsapp', () => {
  it('4xx da função é recusa deliberada (nada saiu)', () => {
    expect(interpretarFalhaEnvioWhatsapp({ message: 'x', context: { status: 403 } }))
      .toEqual({ tipo: 'recusado', mensagem: 'Sem permissão para enviar mensagens' });
    expect(interpretarFalhaEnvioWhatsapp({ message: 'x', context: { status: 404 } }).tipo).toBe('recusado');
  });

  it('rede ou 5xx: não dá para saber, mas repetir com a mesma chave é seguro', () => {
    expect(interpretarFalhaEnvioWhatsapp(new TypeError('Failed to fetch'))).toEqual({ tipo: 'sem_resposta' });
    expect(interpretarFalhaEnvioWhatsapp({ message: 'x', context: { status: 502 } })).toEqual({ tipo: 'sem_resposta' });
  });
});
