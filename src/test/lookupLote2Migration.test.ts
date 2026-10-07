import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_PERMISSION_KEYS, LEGACY_PERMISSION_MAP } from '@/permissions/registry';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261007150000_lookup_produtos_rh_salmao.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

// Sem comentários, para as regras abaixo olharem só o SQL executado.
const codigo = sql.replace(/--.*$/gm, '');

function trecho(inicio: RegExp, fim: string): string {
  const pos = codigo.search(inicio);
  expect(pos, `trecho ausente: ${inicio}`).toBeGreaterThanOrEqual(0);
  return codigo.slice(pos, codigo.indexOf(fim, pos) + fim.length);
}

function chaves(bloco: string): string[] {
  return [...bloco.matchAll(/'([a-z_-]+:[a-z_:-]+)'/g)].map(m => m[1]).sort();
}

// O banco não expande o LEGACY_PERMISSION_MAP: gate leva a legada que abre a mesma tela.
const LEGADAS = new Set([...Object.keys(LEGACY_PERMISSION_MAP), 'system:global:manage']);

const funcaoRh = () => trecho(/CREATE OR REPLACE FUNCTION public\.rh_listar_colaboradores\(/, '$function$;');
const funcaoSalmao = () => trecho(/CREATE OR REPLACE FUNCTION public\.salmon_salvar_config\(/, '$function$;');

describe('migração: lote 2 das lacunas de cadastro (produtos, RH, Salmão)', () => {
  it('produtos: lookup só de ativos da empresa atual para Compras, Ficha e Inventário Rápido', () => {
    const bloco = trecho(/CREATE POLICY operational_active_lookup ON public\.produtos\b/, ';');
    expect(bloco).toMatch(new RegExp(
      '^CREATE POLICY operational_active_lookup ON public\\.produtos\\s+FOR SELECT TO authenticated USING \\(\\s+'
      + 'ativo AND company_id = \\(SELECT public\\.get_current_company_id\\(\\)\\)\\s+'
      + "AND \\(SELECT public\\.has_any_permission\\(auth\\.uid\\(\\), ARRAY\\[[\\s',:a-z_-]+\\]::text\\[\\]\\)\\)\\s+\\);$",
    ));
    expect(chaves(bloco)).toEqual([
      'compras:pedidos:view', 'compras:cotacao:view', 'compras:calendario:view', 'compras:ranking:view',
      'ficha:pre-preparos:view', 'ficha:itens-prontos:view', 'ficha:produtos-finais:view',
      'inventario:rapido:view',
      'purchases:read', 'purchases:market:read', 'compras:read', 'recipes:read', 'ficha:read', 'inventory:read',
    ].sort());
  });

  it('produtos nunca recebe chave do módulo operacional (vazaria custo ao operador)', () => {
    expect(codigo).not.toMatch(/'operacional:/);
  });

  it('RH: RPC com tenant, colunas pessoais e de remuneração mascaradas por chave', () => {
    const corpo = funcaoRh();
    expect(corpo).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(corpo).toContain('v_company uuid := public.assert_tenant();');
    expect(corpo).toContain('WHERE c.company_id = v_company');
    expect(corpo).toContain('AND (v_lista OR c.user_id = v_uid)');
    for (const col of ['cpf', 'telefone', 'email']) {
      expect(corpo).toContain(`CASE WHEN v_pessoais OR c.user_id = v_uid THEN c.${col} END`);
    }
    for (const col of ['salario', 'valor_hora', 'adicional_noturno_percent']) {
      expect(corpo).toContain(`CASE WHEN v_remuneracao OR c.user_id = v_uid THEN c.${col} END`);
    }
    const pessoais = corpo.slice(corpo.indexOf('v_pessoais :='), corpo.indexOf(']);', corpo.indexOf('v_pessoais :=')));
    expect(chaves(pessoais)).toEqual(['rh:manage', 'rh:prontuario:manage', 'rh:prontuario:view', 'rh:read', 'system:global:manage']);
    const remuneracao = corpo.slice(corpo.indexOf('v_remuneracao :='), corpo.indexOf(']);', corpo.indexOf('v_remuneracao :=')));
    expect(chaves(remuneracao)).toEqual(['rh:custos:view', 'rh:dashboard:view', 'rh:folha:manage', 'rh:folha:view']);
    expect(corpo).toContain('(v_remuneracao OR c.user_id = v_uid)\n  FROM public.rh_colaboradores c');
    // Toda sub-aba do RH com ação "view" lista colaboradores, menos o Mural (não usa a lista).
    const lista = corpo.slice(corpo.indexOf('v_lista :='), corpo.indexOf(']);', corpo.indexOf('v_lista :=')));
    const viewsRh = ALL_PERMISSION_KEYS.filter(k => k.startsWith('rh:') && k.endsWith(':view') && k !== 'rh:mural:view');
    for (const k of viewsRh) expect(chaves(lista)).toContain(k);
    expect(chaves(lista)).not.toContain('rh:mural:view');
  });

  it('RH: a RPC devolve só as colunas previstas (nada de foto, observações ou funções)', () => {
    const corpo = funcaoRh();
    const assinatura = corpo.slice(corpo.indexOf('RETURNS TABLE ('), corpo.indexOf(')\nLANGUAGE'));
    const colunas = [...assinatura.matchAll(/^\s+(\w+) [a-z ]+,?$/gm)].map(m => m[1]);
    expect(colunas).toEqual([
      'id', 'user_id', 'nome', 'cpf', 'telefone', 'email', 'cargo', 'funcao', 'setor', 'data_admissao',
      'tipo_contrato', 'status', 'carga_horaria_semanal', 'salario', 'valor_hora', 'created_at',
      'adicional_noturno_percent', 'remuneracao_visivel',
    ]);
    expect(corpo).not.toMatch(/c\.(foto_url|observacoes|funcoes_habilitadas)\b/);
    // Tipos conferidos no deploy (PL/pgSQL só valida o RETURN QUERY na 1ª chamada).
    expect(codigo).toMatch(/DO \$confere\$[\s\S]*'public\.rh_colaboradores'::regclass[\s\S]*RAISE EXCEPTION 'rh_listar_colaboradores: coluna divergente/);
  });

  it('Salmão: RPC grava por unidade, com gate separado para limites e para alertas', () => {
    const corpo = funcaoSalmao();
    expect(corpo).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(corpo).toContain('v_company uuid := public.assert_tenant();');
    expect(corpo).toContain('ON CONFLICT (company_id) DO NOTHING');
    expect(corpo).toContain('WHERE company_id = v_company');
    const gateEstoque = corpo.slice(corpo.indexOf('IF v_estoque AND NOT'), corpo.indexOf('END IF;', corpo.indexOf('IF v_estoque AND NOT')));
    expect(chaves(gateEstoque)).toEqual([
      'configuracoes:geral:manage', 'configuracoes:salmon:manage', 'salmon:estoque:view', 'salmon:read',
      'settings:manage', 'system:global:manage',
    ]);
    const gateAlertas = corpo.slice(corpo.indexOf('IF v_alertas AND NOT'), corpo.indexOf('END IF;', corpo.indexOf('IF v_alertas AND NOT')));
    expect(chaves(gateAlertas)).toEqual([
      'configuracoes:geral:manage', 'configuracoes:salmon:manage', 'settings:manage', 'system:global:manage',
    ]);
    expect(codigo).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_salmon_config_company ON public\.salmon_config \(company_id\);/);
  });

  it('escrita direta em salmon_config deixa de exigir chave fora do registry', () => {
    expect(codigo).not.toContain('salmon:dashboard:edit');
    for (const nome of ['salmon_config_insert', 'salmon_config_update']) {
      const bloco = trecho(new RegExp(`ALTER POLICY ${nome} ON public\\.salmon_config`), ';');
      expect(chaves(bloco)).toEqual(['configuracoes:geral:manage', 'configuracoes:salmon:manage', 'settings:manage', 'system:global:manage']);
    }
  });

  it('leituras do 20261007120000 ganham a legada sem perder nenhuma chave de lá', () => {
    const lote1 = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261007120000_lookup_cadastros_telas_consumidoras.sql'), 'utf8',
    ).replace(/--.*$/gm, '');
    for (const [inicio, novas] of [
      ['ALTER POLICY "compras:fornecedores:view suppliers" ON public.suppliers',
        ['purchases:read', 'purchases:market:read', 'compras:read', 'salmon:read', 'planning:read']],
      ['ALTER POLICY salmon_config_select ON public.salmon_config', ['salmon:read', 'settings:manage']],
    ] as const) {
      const antes = lote1.slice(lote1.indexOf(inicio), lote1.indexOf(';', lote1.indexOf(inicio)));
      const agora = trecho(new RegExp(inicio.replace(/[".]/g, m => `\\${m}`)), ';');
      expect(chaves(agora)).toEqual([...chaves(antes), ...novas].sort());
    }
  });

  it('as duas RPCs fecham EXECUTE a PUBLIC/anon e abrem a authenticated', () => {
    for (const assinatura of [
      'public.rh_listar_colaboradores(boolean)',
      'public.salmon_salvar_config(numeric, numeric, integer, numeric, numeric, integer, integer)',
    ]) {
      const esc = assinatura.replace(/[().]/g, m => `\\${m}`);
      expect(codigo).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${esc} FROM PUBLIC, anon;`));
      expect(codigo).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${esc} TO authenticated, service_role;`));
    }
  });

  it('toda chave granular existe no registry', () => {
    const usadas = new Set(chaves(codigo));
    const desconhecidas = [...usadas].filter(k => !LEGADAS.has(k) && !ALL_PERMISSION_KEYS.includes(k));
    expect(desconhecidas).toEqual([]);
  });

  it('policies embrulham tenant e permissão em SELECT (InitPlan)', () => {
    const policies = [...codigo.matchAll(/(CREATE|ALTER) POLICY[\s\S]*?;/g)].map(m => m[0]).join('\n');
    for (const m of policies.matchAll(/(?:public\.)?(get_current_company_id|has_any_permission)\(/g)) {
      const antes = policies.slice(0, m.index).trimEnd();
      expect(antes.endsWith('(SELECT'), `${m[1]} sem (SELECT ...) na posição ${m.index}`).toBe(true);
    }
  });

  it('sem DROP, data UTC nem policy aberta', () => {
    expect(codigo).not.toMatch(/\bDROP\b|CURRENT_DATE|now\(\)/i);
    expect(codigo).not.toMatch(/\bOR\s+true\b|USING\s*\(\s*true\s*\)/i);
  });
});
