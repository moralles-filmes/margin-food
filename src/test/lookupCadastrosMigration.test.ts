import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_PERMISSION_KEYS } from '@/permissions/registry';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261007120000_lookup_cadastros_telas_consumidoras.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

// Sem comentários, para as regras abaixo olharem só o SQL executado.
const codigo = sql.replace(/--.*$/gm, '');

function statement(inicio: RegExp): string {
  const pos = codigo.search(inicio);
  expect(pos, `statement ausente: ${inicio}`).toBeGreaterThanOrEqual(0);
  return codigo.slice(pos, codigo.indexOf(';', pos) + 1);
}

function chaves(bloco: string): string[] {
  return [...bloco.matchAll(/'([a-z_-]+:[a-z_:-]+)'/g)].map(m => m[1]).sort();
}

const LEGADAS = new Set(['finance:read', 'system:global:manage']);

// Só :view — ação sem view (reconcile, create) não abre a tela consumidora.
const FIN_TELAS = [
  'financeiro:pagar:view',
  'financeiro:receber:view',
  'financeiro:lancamentos:view',
  'financeiro:conciliacao:view',
];

describe('migração: cadastros usados como lista de escolha por outras telas', () => {
  it.each([
    ['fin_contas', FIN_TELAS],
    ['fin_categorias', [...FIN_TELAS, 'financeiro:categorizacao:view', 'financeiro:fechamento:view']],
    ['fin_centros_custo', [...FIN_TELAS, 'financeiro:categorizacao:view']],
  ])('%s: lookup só de ativos da empresa atual, para as telas consumidoras', (tabela, esperadas) => {
    const bloco = statement(new RegExp(`CREATE POLICY operational_active_lookup ON public\\.${tabela}\\b`));
    // Statement inteiro com a forma exata: nada de OR extra afrouxando a condição.
    expect(bloco).toMatch(new RegExp(
      `^CREATE POLICY operational_active_lookup ON public\\.${tabela}\\s+FOR SELECT TO authenticated USING \\(\\s+`
      + 'ativo AND company_id = \\(SELECT public\\.get_current_company_id\\(\\)\\)\\s+'
      + "AND \\(SELECT public\\.has_any_permission\\(auth\\.uid\\(\\), ARRAY\\[[\\s',:a-z_-]+\\]::text\\[\\]\\)\\)\\s+\\);$",
    ));
    expect(chaves(bloco)).toEqual([...esperadas].sort());
  });

  it('rateio só é lido quando o título pai (pagar/receber) é da mesma empresa', () => {
    const bloco = statement(/CREATE POLICY titulo_rateio_read ON public\.fin_lancamento_rateios\b/);
    expect(bloco).toContain('FOR SELECT TO authenticated');
    expect(chaves(bloco)).toEqual(['financeiro:pagar:view', 'financeiro:receber:view']);
    expect(bloco).toMatch(/ARRAY\['financeiro:pagar:view'\]::text\[\]\)\)\s+AND EXISTS \(\s+SELECT 1 FROM public\.fin_contas_pagar cp\s+WHERE cp\.id = fin_lancamento_rateios\.lancamento_id\s+AND cp\.company_id = fin_lancamento_rateios\.company_id/);
    expect(bloco).toMatch(/ARRAY\['financeiro:receber:view'\]::text\[\]\)\)\s+AND EXISTS \(\s+SELECT 1 FROM public\.fin_contas_receber cr\s+WHERE cr\.id = fin_lancamento_rateios\.lancamento_id\s+AND cr\.company_id = fin_lancamento_rateios\.company_id/);
  });

  it('fornecedores: mantém as chaves anteriores e acrescenta as telas consumidoras', () => {
    const bloco = statement(/ALTER POLICY "compras:fornecedores:view suppliers" ON public\.suppliers/);
    const anterior = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261006013432_suppliers_financeiro_rls.sql'), 'utf8',
    ).replace(/--.*$/gm, '');
    const inicio = anterior.indexOf('ALTER POLICY "compras:fornecedores:view suppliers"');
    const chavesAnteriores = chaves(anterior.slice(inicio, anterior.indexOf(';', inicio)));
    expect(chavesAnteriores.length).toBeGreaterThan(0);
    for (const k of chavesAnteriores) expect(chaves(bloco)).toContain(k);
    expect(chaves(bloco)).toEqual([
      'compras:fornecedores:view', 'compras:lista:view', 'compras:pedidos:view',
      'compras:cotacao:view', 'compras:cotacao:create', 'compras:calendario:view',
      'financeiro:cadastros:view', 'financeiro:pagar:view', 'financeiro:conciliacao:view', 'finance:read',
      'salmon:entradas:view', 'salmon:manipulacao:view', 'salmon:planejamento:view',
      'planning:simulador:view', 'system:global:manage',
    ].sort());
  });

  it('parâmetros do Salmão: leitura também em Salmão → Estoque e Configurações → Salmão', () => {
    const bloco = statement(/ALTER POLICY salmon_config_select ON public\.salmon_config/);
    expect(chaves(bloco)).toEqual([
      'salmon:dashboard:view', 'salmon:manipulacao:view', 'salmon:entradas:view',
      'salmon:estoque:view', 'configuracoes:salmon:view', 'system:global:manage',
    ].sort());
  });

  it('toda chave granular existe no registry', () => {
    const usadas = new Set(chaves(codigo));
    const desconhecidas = [...usadas].filter(k => !LEGADAS.has(k) && !ALL_PERMISSION_KEYS.includes(k));
    expect(desconhecidas).toEqual([]);
  });

  it('checagens de tenant e permissão viram InitPlan (embrulhadas em SELECT)', () => {
    for (const m of codigo.matchAll(/(?:public\.)?(get_current_company_id|has_any_permission)\(/g)) {
      const antes = codigo.slice(0, m.index).trimEnd();
      expect(antes.endsWith('(SELECT'), `${m[1]} sem (SELECT ...) na posição ${m.index}`).toBe(true);
    }
  });

  it('só leitura: nada de escrita, GRANT, DROP ou data UTC', () => {
    expect(codigo).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)\b/i);
    expect(codigo).not.toMatch(/\bGRANT\b|\bDROP\b|CURRENT_DATE|now\(\)/i);
    expect(codigo).not.toMatch(/\bOR\s+true\b|USING\s*\(\s*true\s*\)/i);
    expect(codigo.match(/CREATE POLICY/g)).toHaveLength(4);
    expect(codigo.match(/ALTER POLICY/g)).toHaveLength(2);
  });
});
