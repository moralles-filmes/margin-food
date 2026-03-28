import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wuzxpbixprrgssoeeaez.supabase.co";
const supabaseKey = "sb_publishable_lKpZIaegoPF2gK7V8AfFoQ_RxeN54bn";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('--- Checking Movement Consistency ---');
  const { data: movs, error } = await supabase
    .from('movimentacoes_estoque')
    .select('id, produto_id, tipo, direction, quantidade, custo_unitario, custo_total, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching movements:', error.message);
    return;
  }

  console.log('Recent Movements:');
  movs.forEach(m => {
    console.log(`[${m.status}] ${m.tipo} | Dir: ${m.direction} | Qty: ${m.quantidade} | Unit: ${m.custo_unitario} | Total: ${m.custo_total} | Created: ${m.created_at}`);
  });

  console.log('\n--- Checking Summary RPC ---');
  const { data: prods, error: prodsError } = await supabase.rpc('get_stock_summary');
  if (prodsError) {
    console.error('Error getting summary:', prodsError.message);
  } else {
    console.log('get_stock_summary result:', JSON.stringify(prods, null, 2));
  }
}

check();
