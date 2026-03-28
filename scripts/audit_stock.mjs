import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wuzxpbixprrgssoeeaez.supabase.co";
const supabaseKey = "sb_publishable_lKpZIaegoPF2gK7V8AfFoQ_RxeN54bn";

const supabase = createClient(supabaseUrl, supabaseKey);

async function audit() {
  console.log('--- Auditing Stock Value Calculation ---');
  // We can't use rpc directly because of the permissions, but we can query products if allowed
  const { data: prods, error } = await supabase
    .from('produtos')
    .select('id, nome_produto, saldo_atual, avg30_cost_base_unit, last_cost_base_unit, default_cost_base_unit, ativo')
    .eq('ativo', true);

  if (error) {
    console.error('Error fetching products:', error.message);
    return;
  }

  let totalValue = 0;
  console.log('Products Audit:');
  prods.forEach(p => {
    const cost = p.avg30_cost_base_unit || p.last_cost_base_unit || p.default_cost_base_unit || 0;
    const value = (p.saldo_atual || 0) * cost;
    totalValue += value;
    if (value !== 0 || p.saldo_atual !== 0) {
      console.log(`${p.nome_produto.padEnd(30)} | Saldo: ${String(p.saldo_atual).padStart(8)} | Cost: ${String(cost).padStart(8)} | Value: ${value.toFixed(2)}`);
    }
  });

  console.log('\nTotal Calculated Value:', totalValue.toFixed(2));
  
  const { data: summary, error: summError } = await supabase.rpc('get_stock_summary');
  if (summError) {
     console.error('RPC Error:', summError.message);
  } else {
     console.log('RPC result:', JSON.stringify(summary, null, 2));
  }
}

audit();
