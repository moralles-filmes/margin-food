import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wuzxpbixprrgssoeeaez.supabase.co";
const supabaseKey = "sb_publishable_lKpZIaegoPF2gK7V8AfFoQ_RxeN54bn";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMovements() {
  console.log('--- Checking Last Movements ---');
  const { data, error } = await supabase
    .from('movimentacoes_estoque')
    .select('id, produto_id, quantidade, tipo, direction, status, created_at, referencia_id, origem')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.table(data);
}

checkMovements();
