import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930041550_presentation_socios_idempotencia_notificacoes.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

function funcao(nome: string): string {
  const inicio = migration.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nome}\\(`));
  expect(inicio, `função ausente: ${nome}`).toBeGreaterThanOrEqual(0);
  return migration.slice(inicio, migration.indexOf('$function$;', inicio));
}

const PRODUTORES = [
  '_guarded_create_presentation_session',
  '_guarded_save_presentation_session',
  '_guarded_submit_presentation_minutes',
  '_guarded_transition_presentation_session',
  '_guarded_create_presentation_decision_action',
  '_guarded_update_presentation_decision_action',
];

describe('migração: Apresentação Sócios — criação idempotente', () => {
  it('índice único parcial por empresa sobre a chave, com preflight de duplicatas', () => {
    for (const tabela of ['sessions', 'decisions']) {
      expect(migration).toMatch(new RegExp(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_presentation_${tabela}_idempotency\\s+`
        + `ON public\\.fin_presentation_${tabela} \\(company_id, idempotency_key\\)\\s+WHERE idempotency_key IS NOT NULL;`,
      ));
    }
    expect(migration).toContain('PRESENTATION_SESSION_IDEMPOTENCY_DUPLICADA');
    expect(migration).toContain('PRESENTATION_DECISION_IDEMPOTENCY_DUPLICADA');
    // Chave e fingerprint andam juntos (NULL AND ... passaria num CHECK com OR).
    expect(migration.match(/\(idempotency_key IS NULL\) = \(idempotency_fingerprint IS NULL\)/g)?.length).toBe(2);
  });

  it('é reaplicável: DROP só da assinatura antiga e CREATE OR REPLACE da nova', () => {
    expect(migration).not.toMatch(/^CREATE FUNCTION/m);
  });

  it('troca a assinatura com DROP antes e parâmetro novo com DEFAULT (front em produção continua funcionando)', () => {
    expect(migration).toContain('DROP FUNCTION IF EXISTS public._guarded_create_presentation_session(text, text, date, date, text, date, uuid, uuid[], uuid, jsonb);');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public._guarded_create_presentation_decision(text, text, date, date, text, text, jsonb, uuid);');
    expect(funcao('_guarded_create_presentation_session')).toContain('p_idempotency_key text DEFAULT NULL');
    expect(funcao('_guarded_create_presentation_decision')).toContain('p_idempotency_key text DEFAULT NULL');
    expect(migration).toContain('PRESENTATION_OVERLOAD_ANTIGO');
  });

  it.each([
    ['_guarded_create_presentation_session', 'uq_fin_presentation_sessions_idempotency'],
    ['_guarded_create_presentation_decision', 'uq_fin_presentation_decisions_idempotency'],
  ])('%s: só a violação da própria chave vira reenvio; conteúdo ou autor divergente → REQUEST_ID_REUTILIZADO', (nome, indice) => {
    const corpo = funcao(nome);
    expect(corpo).toContain('SECURITY DEFINER');
    expect(corpo).toContain("SET search_path = ''");
    expect(corpo).toContain('public.assert_tenant()');
    expect(corpo).toMatch(/'financeiro:relatorio-socios:manage',\s*'system:global:manage'/);
    expect(corpo).toContain('EXCEPTION WHEN unique_violation THEN');
    expect(corpo).toContain('GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;');
    expect(corpo).toContain(`IF v_constraint IS DISTINCT FROM '${indice}' THEN RAISE; END IF;`);
    expect(corpo).toContain('idempotency_fingerprint IS DISTINCT FROM v_fingerprint');
    expect(corpo).toContain('created_by IS DISTINCT FROM v_user');
    expect(corpo).toContain("RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO'");
    expect(corpo).toContain("'idempotent', true");
  });

  it('decisão: snapshot fora da comparação (capturedAt/métricas), escolhas do usuário dentro', () => {
    const corpo = funcao('_guarded_create_presentation_decision');
    const fingerprint = corpo.slice(corpo.indexOf('v_fingerprint := md5('), corpo.indexOf(')::text);', corpo.indexOf('v_fingerprint := md5(')));
    expect(fingerprint).toContain("'sourceMode', p_snapshot->'sourceMode'");
    expect(fingerprint).toContain("'scenarioDraft', p_snapshot->'scenarioDraft'");
    expect(fingerprint).toContain("'executiveResponsibleUserId', p_executive_responsible_user_id");
    expect(fingerprint).not.toMatch(/capturedAt|metrics|'snapshot', p_snapshot\b/);
  });

  it('reenvio não repete auditoria nem notificação: o retorno idempotente vem antes delas', () => {
    const corpo = funcao('_guarded_create_presentation_session');
    const retorno = corpo.indexOf("'idempotent', true");
    expect(retorno).toBeLessThan(corpo.indexOf('INSERT INTO public.fin_audit_logs'));
    expect(retorno).toBeLessThan(corpo.indexOf('INSERT INTO public.notifications'));
  });
});

describe('migração: Apresentação Sócios — notificações', () => {
  it.each(PRODUTORES)('%s grava company_id explícito e não engole falha', nome => {
    const corpo = funcao(nome);
    const inserts = corpo.split('INSERT INTO public.notifications (').slice(1);
    expect(inserts.length).toBe(1);
    expect(inserts[0]).toMatch(/^\s*company_id, recipient_user_id,/);
    expect(inserts[0]).toMatch(/VALUES \(\s*v_company,/);
    expect(corpo).not.toContain('WHEN OTHERS THEN NULL');
  });

  it('mantém link_path, entity_type e metadata que o deep-link do front consome', () => {
    expect(migration.match(/'\/financeiro\/relatorio-socios\?session=' \|\| /g)?.length).toBe(4);
    expect(migration.match(/'\/financeiro\/relatorio-socios\?decision=' \|\| /g)?.length).toBe(2);
    expect(migration).toContain("|| '&revision=' || v_revision.id::text");
    expect(migration).toContain("ELSE '&revision=' || v_after.current_revision_id::text END");
    expect(migration.match(/'presentation_session', /g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/'presentation_decision', p_decision_id,/g)?.length).toBeGreaterThanOrEqual(1);
    expect(migration).toContain("jsonb_build_object('sessionId', v_session.id)");
    expect(migration).toContain("jsonb_build_object('actionId', v_action.id)");
  });

  it('destinatário precisa de membership ativa e do mesmo gate de leitura da tela', () => {
    const helper = funcao('_fin_presentation_can_view');
    expect(helper).toContain('public.is_company_member(p_user_id, p_company_id)');
    expect(helper).toContain('public.get_company_permissions(p_user_id, p_company_id)');
    expect(helper).toContain("ARRAY['financeiro:relatorio-socios:view', 'system:global:manage']");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public._fin_presentation_can_view(uuid, uuid) FROM PUBLIC, anon, authenticated;');

    for (const nome of ['_guarded_create_presentation_session', '_guarded_save_presentation_session', '_guarded_create_presentation_decision_action', '_guarded_update_presentation_decision_action']) {
      const corpo = funcao(nome);
      expect(corpo, nome).toContain('RESPONSIBLE_WITHOUT_ACCESS');
      expect(corpo.indexOf('RESPONSIBLE_WITHOUT_ACCESS'), nome).toBeLessThan(corpo.indexOf('INSERT INTO public.notifications'));
    }
    // Salvar/editar só exige acesso quando troca o responsável: quem perdeu o
    // acesso depois da atribuição não trava a edição.
    expect(funcao('_guarded_save_presentation_session')).toContain(
      'IF v_before.minutes_responsible_user_id IS DISTINCT FROM p_minutes_responsible_user_id\n     AND NOT public._fin_presentation_can_view(',
    );
    expect(funcao('_guarded_update_presentation_decision_action')).toContain(
      'IF v_before.responsible_user_id IS DISTINCT FROM p_responsible_user_id\n     AND NOT public._fin_presentation_can_view(',
    );
    // Responsável gravado antes: se perdeu o acesso, a ata segue sem aviso.
    expect(funcao('_guarded_submit_presentation_minutes')).toContain('IF public._fin_presentation_can_view(v_before.minutes_responsible_user_id, v_company) THEN');
    expect(funcao('_guarded_transition_presentation_session')).toContain('AND public._fin_presentation_can_view(v_before.minutes_responsible_user_id, v_company) THEN');
  });

  it('funções nunca executáveis por anon', () => {
    for (const assinatura of [
      '_guarded_create_presentation_session(text, text, date, date, text, date, uuid, uuid[], uuid, jsonb, text)',
      '_guarded_create_presentation_decision(text, text, date, date, text, text, jsonb, uuid, text)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${assinatura} FROM PUBLIC, anon;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated, service_role;`);
    }
  });
});
