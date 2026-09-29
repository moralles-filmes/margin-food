import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260929183000_idempotencia_compras_cotacao_inventario.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex, `marcador inicial ausente: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `marcador final ausente: ${end}`).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

const pedido = section('CREATE OR REPLACE FUNCTION public.create_purchase_order_atomic', 'END $function$;');
const cotacao = section('CREATE FUNCTION public.create_cotacao_atomic', 'END;\n$function$;');
const inventario = section('CREATE FUNCTION public.create_inventory_atomic', 'END;\n$function$;');

describe('migração: idempotência de Compras, Cotação e Inventário', () => {
  it('toda função reescrita fixa o search_path com pg_temp no fim', () => {
    for (const corpo of [pedido, cotacao, inventario]) {
      expect(corpo).toContain('SECURITY DEFINER');
      expect(corpo).toContain('SET search_path = public, pg_temp');
    }
  });

  it('pedido: não mexe no índice que a conversão de cotação usa como arbitro do ON CONFLICT', () => {
    expect(migration).not.toMatch(/(DROP|CREATE)\s+(UNIQUE\s+)?INDEX[^;]*uq_po_company_idempotency/i);
  });

  it('pedido: replay compara a impressão digital e trata unique_violation como reenvio', () => {
    expect(pedido).toContain('WHERE company_id=v_company AND idempotency_key=p_idempotency_key');
    expect(pedido).toContain("RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO");
    expect(pedido).toContain('EXCEPTION WHEN unique_violation');
    expect(pedido).toContain("v_constraint IS DISTINCT FROM 'uq_po_company_idempotency'");
    // Preço fica fora da identidade (o calendário relê o preço do catálogo a cada clique).
    expect(pedido).not.toMatch(/'estimated_unit_value'\s*,\s*t\.e/);
  });

  it('pedido: a notificação mantém o formato que o front lê (link_path, entity_type, entity_id)', () => {
    expect(pedido).toContain("'purchase_order',v_order_id,");
    expect(pedido).toContain("'/compras?subtab=pedidos-compras&order='||v_order_id::text");
  });

  it('cotação: DROP da assinatura antiga antes de criar a nova (sem overload)', () => {
    const drop = migration.indexOf('DROP FUNCTION IF EXISTS public.create_cotacao_atomic(text, text, date, text, uuid, jsonb, jsonb);');
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(migration.indexOf('CREATE FUNCTION public.create_cotacao_atomic'));
  });

  it('cotação: chave nova com DEFAULT — o front em produção chama com 7 parâmetros', () => {
    expect(cotacao).toContain('p_idempotency_key text DEFAULT NULL::text');
    expect(cotacao).toContain('WHERE company_id = v_company AND idempotency_key = v_key');
    expect(cotacao).toContain("v_constraint = 'uq_cotacoes_company_idempotency'");
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_cotacoes_company_idempotency\s+ON public\.cotacoes \(company_id, idempotency_key\)\s+WHERE idempotency_key IS NOT NULL/);
  });

  it('inventário: replay filtra company_id, trata 23505 e devolve se foi reenvio', () => {
    expect(inventario).toContain('RETURNS jsonb');
    expect(inventario).toContain('WHERE company_id = v_tenant AND idempotency_key = v_key');
    expect(inventario).not.toMatch(/WHERE idempotency_key = p_idempotency_key/);
    expect(inventario).toContain("v_constraint IS DISTINCT FROM 'uq_inventarios_company_idempotency'");
    expect(inventario).toContain("jsonb_build_object('inventario_id', v_existing.id, 'idempotent', true)");
    expect(inventario).toContain("jsonb_build_object('inventario_id', v_inv_id, 'idempotent', false)");
  });

  it('WhatsApp: uma tentativa por chave e status UNKNOWN para envio sem confirmação', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_cotacao_wa_logs_company_idempotency\s+ON public\.cotacao_whatsapp_logs \(company_id, idempotency_key\)/);
    expect(migration).toContain("'UNKNOWN'::text");
  });

  it('funções recriadas não ficam executáveis por anon/PUBLIC', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.create_cotacao_atomic(text, text, date, text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.create_inventory_atomic(text, date, text, uuid, text[], text, text, text) FROM PUBLIC, anon;');
  });
});
