import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_PERMISSION_KEYS, LEGACY_PERMISSION_MAP } from '@/permissions/registry';
import { mensagemErroEdicaoColaborador } from '@/domain/rh/prontuario';

const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), 'utf8').replace(/\r\n/g, '\n');

const sql = ler('supabase/migrations/20261007200000_rh_prontuario_edicao.sql');
// Sem comentários, para as regras abaixo olharem só o SQL executado.
const codigo = sql.replace(/--.*$/gm, '');
// Tela e assinatura atuais da RPC: rhEscalasResiduaisMigration.test.ts (20261007220000).
const rhView = ler('src/components/RhView.tsx');

function trecho(texto: string, inicio: RegExp, fim: string): string {
  const pos = texto.search(inicio);
  expect(pos, `trecho ausente: ${inicio}`).toBeGreaterThanOrEqual(0);
  return texto.slice(pos, texto.indexOf(fim, pos) + fim.length);
}

function chaves(bloco: string): string[] {
  return [...bloco.matchAll(/'([a-z_-]+:[a-z_:-]+)'/g)].map(m => m[1]).sort();
}

function entre(texto: string, inicio: string, fim: string): string {
  const pos = texto.indexOf(inicio);
  expect(pos, `trecho ausente: ${inicio}`).toBeGreaterThanOrEqual(0);
  return texto.slice(pos, texto.indexOf(fim, pos));
}

/** Chave granular + toda legada do LEGACY_PERMISSION_MAP que a expande no front. */
function familia(granular: string): string[] {
  return [granular, ...Object.entries(LEGACY_PERMISSION_MAP)
    .filter(([, expande]) => expande.includes(granular)).map(([legada]) => legada)];
}

const LEGADAS = new Set([...Object.keys(LEGACY_PERMISSION_MAP), 'system:global:manage']);
const MANAGE = [...familia('rh:prontuario:manage'), 'system:global:manage'].sort();

const funcaoEdicao = () => trecho(codigo, /CREATE OR REPLACE FUNCTION public\.rh_atualizar_colaborador\(/, '$function$;');

describe('migração: edição do Prontuário', () => {
  it('RPC de edição: tenant, linha travada e erro em vez de 0 linhas', () => {
    const corpo = funcaoEdicao();
    expect(corpo).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(corpo).toContain('v_company uuid := public.assert_tenant();');
    expect(corpo).toMatch(/WHERE c\.id = p_id AND c\.company_id = v_company\s+FOR UPDATE;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION 'NOT_FOUND'/);
    expect(corpo).toContain('WHERE id = p_id AND company_id = v_company\n  RETURNING * INTO v_depois;');
  });

  it('edita quem tem :edit E vê o Prontuário (o formulário reenvia CPF e remuneração)', () => {
    const gate = entre(funcaoEdicao(), 'IF NOT public.has_any_permission', "RAISE EXCEPTION 'PERMISSION_DENIED: rh:prontuario:edit'");
    const [edicao, leitura] = gate.split(/\bOR NOT public\.has_any_permission/);
    expect(chaves(edicao)).toEqual(
      [...new Set([...familia('rh:prontuario:edit'), ...familia('rh:prontuario:manage'), 'system:global:manage'])].sort(),
    );
    // Mesma lista que dá CPF/remuneração em rh_listar_colaboradores (v_pessoais do 20261007150000).
    const anterior = ler('supabase/migrations/20261007150000_lookup_produtos_rh_salmao.sql').replace(/--.*$/gm, '');
    const pessoais = entre(anterior, 'v_pessoais :=', ']);');
    expect(chaves(leitura)).toEqual(chaves(pessoais));
  });

  it('remuneração e usuário vinculado só mudam com :manage', () => {
    const corpo = funcaoEdicao();
    const bloco = entre(corpo, 'v_manage := public.has_any_permission', "RAISE EXCEPTION 'PERMISSION_DENIED: rh:prontuario:manage'");
    expect(chaves(bloco)).toEqual(MANAGE);
    for (const campo of ['user_id', 'salario', 'valor_hora']) {
      expect(bloco).toContain(`p_${campo} IS DISTINCT FROM v_antes.${campo}`);
    }
    // O vínculo abre ao usuário as telas "minhas" do RH: precisa ser membro da unidade e único.
    expect(corpo).toMatch(/IF NOT public\.is_company_member\(p_user_id, v_company\) THEN\s+RAISE EXCEPTION 'USUARIO_FORA_DA_UNIDADE'/);
    expect(corpo).toMatch(/o\.company_id = v_company AND o\.user_id = p_user_id AND o\.id <> p_id\s+\) THEN\s+RAISE EXCEPTION 'USUARIO_JA_VINCULADO'/);
    // O EXISTS é só a mensagem: sob concorrência quem garante é o índice.
    expect(codigo).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_rh_colaboradores_company_user\s+ON public\.rh_colaboradores \(company_id, user_id\) WHERE user_id IS NOT NULL;/,
    );
  });

  it('RPC de edição nunca altera status nem empresa (desativar continua só com :manage)', () => {
    const set = entre(funcaoEdicao(), 'UPDATE public.rh_colaboradores SET', 'WHERE id = p_id');
    const colunas = [...set.matchAll(/^\s+(\w+) = /gm)].map(m => m[1]);
    expect(colunas).toEqual([
      'nome', 'email', 'telefone', 'cpf', 'cargo', 'funcao', 'setor', 'tipo_contrato',
      'carga_horaria_semanal', 'salario', 'valor_hora', 'data_admissao', 'user_id',
    ]);
    expect(codigo).toMatch(/DO \$confere\$[\s\S]*'rh_audit_log', 'depois'[\s\S]*RAISE EXCEPTION 'rh_atualizar_colaborador: colunas ausentes/);
  });

  it('grava trilha dos campos alterados, com entidade_id uuid nativo', () => {
    const corpo = funcaoEdicao();
    expect(corpo).toContain("WHERE a.key <> 'updated_at' AND a.value IS DISTINCT FROM d.value;");
    expect(corpo).toContain(
      "VALUES ('editar_colaborador', 'rh_colaboradores', p_id, v_company, v_uid, v_mudou_antes, v_mudou_depois);",
    );
    expect(corpo).not.toMatch(/p_id::text/);
  });

  it('rh_listar_colaboradores não muda (lista completa continua só para quem vê o Prontuário)', () => {
    expect(codigo).not.toMatch(/FUNCTION public\.rh_listar_colaboradores/);
  });

  it('policies da tabela levam a chave legada da mesma tela', () => {
    const esperado: Record<string, string[]> = {
      rh_colaboradores_select: [...familia('rh:prontuario:view'), ...familia('rh:prontuario:manage'), 'system:global:manage'],
      rh_colaboradores_update: MANAGE,
      rh_colaboradores_insert_hr: [...familia('rh:prontuario:create'), ...familia('rh:prontuario:manage'), 'system:global:manage'],
    };
    for (const [nome, lista] of Object.entries(esperado)) {
      const bloco = trecho(codigo, new RegExp(`ALTER POLICY ${nome} ON public\\.rh_colaboradores`), ';');
      expect(chaves(bloco), nome).toEqual([...new Set(lista)].sort());
      expect(bloco).toContain('company_id = (SELECT public.get_current_company_id())');
    }
    // :edit nunca entra no UPDATE da tabela: ali só passa o status, que é de :manage.
    expect(chaves(trecho(codigo, /ALTER POLICY rh_colaboradores_update/, ';'))).not.toContain('rh:prontuario:edit');
  });

  it('RPC nova fecha EXECUTE a PUBLIC/anon e abre a authenticated', () => {
    const esc = 'public.rh_atualizar_colaborador(uuid, text, text, text, text, text, text, text, text, numeric, numeric, numeric, date, uuid)'
      .replace(/[().]/g, m => `\\${m}`);
    expect(codigo).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${esc} FROM PUBLIC, anon;`));
    expect(codigo).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${esc} TO authenticated, service_role;`));
  });

  it('toda chave granular existe no registry', () => {
    const desconhecidas = [...new Set(chaves(codigo))].filter(k => !LEGADAS.has(k) && !ALL_PERMISSION_KEYS.includes(k));
    expect(desconhecidas).toEqual([]);
  });

  it('policies embrulham tenant e permissão em SELECT (InitPlan)', () => {
    const policies = [...codigo.matchAll(/ALTER POLICY[\s\S]*?;/g)].map(m => m[0]).join('\n');
    for (const m of policies.matchAll(/(?:public\.)?(get_current_company_id|has_any_permission)\(/g)) {
      expect(policies.slice(0, m.index).trimEnd().endsWith('(SELECT'), `${m[1]} sem (SELECT ...) na posição ${m.index}`).toBe(true);
    }
  });

  it('sem DROP, data UTC nem policy aberta', () => {
    expect(codigo).not.toMatch(/\bDROP\b|CURRENT_DATE|now\(\)/i);
    expect(codigo).not.toMatch(/\bOR\s+true\b|USING\s*\(\s*true\s*\)/i);
  });
});

describe('Prontuário na tela', () => {
  it('edição grava pela RPC, nunca por UPDATE direto na tabela', () => {
    expect(rhView).not.toMatch(/from\('rh_colaboradores'\)\.update\(payload\)/);
    expect(rhView).toContain("('rh_atualizar_colaborador', {");
  });

  it('UPDATE que a RLS pode descartar confere a linha devolvida', () => {
    const updates = [...rhView.matchAll(/from\('rh_colaboradores'\)\.update\(\{ status: '(\w+)' \}\)[^;]*;/g)];
    expect(updates.map(m => m[1]).sort()).toEqual(['ativo', 'inativo']);
    for (const m of updates) expect(m[0]).toContain(".select('id')");
  });

  it('mensagens de erro da RPC', () => {
    expect(mensagemErroEdicaoColaborador('PERMISSION_DENIED: rh:prontuario:edit')).toBe('Você não tem permissão para editar colaboradores.');
    expect(mensagemErroEdicaoColaborador('PERMISSION_DENIED: rh:prontuario:manage'))
      .toBe('Salário, valor/hora e usuário vinculado só podem ser alterados por quem gerencia o Prontuário.');
    expect(mensagemErroEdicaoColaborador('NOT_FOUND')).toBe('Colaborador não encontrado nesta unidade.');
    expect(mensagemErroEdicaoColaborador('NOME_OBRIGATORIO')).toBe('Nome é obrigatório.');
    expect(mensagemErroEdicaoColaborador('USUARIO_FORA_DA_UNIDADE')).toBe('O usuário escolhido não tem acesso a esta unidade.');
    expect(mensagemErroEdicaoColaborador('USUARIO_JA_VINCULADO')).toBe('O usuário escolhido já está vinculado a outro colaborador.');
    expect(mensagemErroEdicaoColaborador('duplicate key value violates unique constraint "uq_rh_colaboradores_company_user"'))
      .toBe('O usuário escolhido já está vinculado a outro colaborador.');
    expect(mensagemErroEdicaoColaborador('400: salario não pode ser negativo')).toBe('Erro ao salvar: 400: salario não pode ser negativo');
    expect(mensagemErroEdicaoColaborador(undefined)).toBe('Erro ao salvar: falha desconhecida');
  });
});
