import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * reconcile_import_lancamento — linha sem FITID (CSV). Ensaio em produção
 * (begin/rollback) antes da correção: a 2ª venda idêntica do dia, com índice 1
 * e até forçada, voltava 'duplicate' apontando para a 1ª.
 */
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930130000_conciliacao_chave_ocorrencia.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const corpo = (() => {
  const inicio = migration.indexOf('CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(');
  const fim = migration.indexOf('$function$;', inicio);
  expect(inicio).toBeGreaterThanOrEqual(0);
  expect(fim).toBeGreaterThan(inicio);
  return migration.slice(inicio, fim);
})();

const posicao = (trecho: string) => {
  const i = corpo.indexOf(trecho);
  expect(i, `trecho ausente: ${trecho}`).toBeGreaterThanOrEqual(0);
  return i;
};

describe('migração: chave por ocorrência na conciliação sem FITID', () => {
  it('mantém a assinatura (o front publicado continua chamando igual)', () => {
    expect(migration).not.toContain('DROP FUNCTION');
    expect(corpo).toContain('p_force_duplicate boolean DEFAULT false, p_occurrence_index integer DEFAULT 0)');
  });

  it('a 1ª ocorrência mantém a chave legada; a n-ésima tem chave própria', () => {
    // Lançamentos já gravados com a chave legada continuam reconhecidos.
    expect(corpo).toContain(
      'v_legacy_idem_key := md5(v_company::text || p_data::text || p_descricao || p_valor::text || p_tipo || p_conta_id::text);',
    );
    expect(corpo.replace(/\s+/g, ' ')).toContain(
      "WHEN v_legacy_idem_key IS NULL OR v_occurrence_index = 0 THEN v_legacy_idem_key "
      + "ELSE md5(concat_ws('|', v_legacy_idem_key, 'ocorrencia', v_occurrence_index::text))",
    );
    expect(corpo.replace(/\s+/g, ' ')).toContain('ELSE v_conteudo_idem_key END;');
  });

  it('linha com FITID não muda: chave do FITID e promoção legada com a guarda de "roubo"', () => {
    expect(corpo).toContain("md5(concat_ws('|', v_company::text, p_conta_id::text, 'external', v_external_id))");
    // A promoção procura a chave LEGADA (ocorrência 0), não a da ocorrência.
    expect(corpo.replace(/\s+/g, ' ')).toContain(
      'WHERE idempotency_key = v_legacy_idem_key AND company_id = v_company;',
    );
    expect(corpo).toContain('AND v.external_id <> v_external_id');
  });

  it('o caminho rápido vem antes da 2ª camada, que continua sensível à contagem e ao "forçar"', () => {
    const caminhoRapido = posicao("RETURN jsonb_build_object('status', 'duplicate'");
    const segundaCamada = posicao('IF NOT p_force_duplicate THEN');
    expect(caminhoRapido).toBeLessThan(segundaCamada);
    expect(corpo).toContain('IF v_occurrence_index < v_existing_count THEN');
    expect(corpo).toContain("'possible_duplicate'");
    expect(corpo).toContain("regexp_replace(lower(public.immutable_unaccent(btrim(p_descricao))), '\\s+', ' ', 'g')");
  });

  it('unique_violation só vira reenvio quando vem do índice da chave', () => {
    expect(corpo).toContain('GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;');
    expect(corpo).toContain("IF v_constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN");
    expect(corpo).toMatch(/THEN\s+RAISE;/);
  });

  it('confere a conta contra a empresa antes de montar a chave', () => {
    const conta = posicao("RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';");
    expect(conta).toBeLessThan(posicao('v_legacy_idem_key := md5('));
    expect(corpo).toContain('SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company');
  });

  it('mantém o padrão _guarded_: tenant, permissão granular + legado + global, auditoria', () => {
    expect(corpo).toContain('v_company := public.assert_tenant();');
    expect(corpo.replace(/\s+/g, ' ')).toContain(
      "'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage'",
    );
    expect(corpo).toContain('INSERT INTO public.fin_audit_logs');
    expect(corpo).toContain('SECURITY DEFINER');
    expect(corpo).toContain("SET search_path TO ''");
  });

  it('EXECUTE só para authenticated e service_role, e recarrega o schema', () => {
    const sig = 'public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer)';
    expect(migration).toContain(`revoke execute on function ${sig} from public, anon;`);
    expect(migration).toContain(`grant execute on function ${sig} to authenticated, service_role;`);
    expect(migration).toContain("notify pgrst, 'reload schema';");
  });
});
