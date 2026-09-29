import { describe, expect, it } from 'vitest';
import { LEGACY_PERMISSION_MAP } from './registry';
import {
  buildRequisicaoAbertaNotification,
  REQUISICAO_APPROVER_PERMISSIONS,
} from '../../supabase/functions/requisicao-estoque/approvers';

describe('destinatários do aviso de requisição aberta', () => {
  it('são exatamente quem vê o botão Atender (chave granular, legadas que expandem para ela e super-admin)', () => {
    const legacy = Object.entries(LEGACY_PERMISSION_MAP)
      .filter(([, granular]) => granular.includes('estoque:requisicoes:approve'))
      .map(([key]) => key);
    const expected = ['estoque:requisicoes:approve', ...legacy, 'system:global:manage'];
    expect([...REQUISICAO_APPROVER_PERMISSIONS].sort()).toEqual([...new Set(expected)].sort());
  });
});

describe('buildRequisicaoAbertaNotification', () => {
  it('descreve quem pediu, quantos itens e para qual setor', () => {
    expect(buildRequisicaoAbertaNotification({
      requisicaoId: '1234567890abcdef',
      setor: 'Cozinha',
      totalItens: 3,
      solicitanteNome: 'Ana',
    })).toEqual({
      title: 'Nova requisição de estoque',
      message: 'Ana pediu 3 itens para Cozinha (#12345678). Aguardando atendimento.',
    });
  });

  it('não quebra sem nome nem setor', () => {
    expect(buildRequisicaoAbertaNotification({
      requisicaoId: 'abcdef0123456789',
      setor: null,
      totalItens: 1,
      solicitanteNome: null,
    }).message).toBe('Pedido de 1 item para — (#abcdef01). Aguardando atendimento.');
  });
});
