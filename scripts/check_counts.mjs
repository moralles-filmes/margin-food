import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wuzxpbixprrgssoeeaez.supabase.co";
const supabaseKey = "sb_publishable_lKpZIaegoPF2gK7V8AfFoQ_RxeN54bn";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking produtos table...');
  const { count, error } = await supabase
    .from('produtos')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error getting count:', error.message);
  } else {
    console.log('Total produtos:', count);
  }

  console.log('Checking movimentacoes_estoque table...');
  const { count: movCount, error: movError } = await supabase
    .from('movimentacoes_estoque')
    .select('*', { count: 'exact', head: true });

  if (movError) {
    console.error('Error getting movCount:', movError.message);
  } else {
    console.log('Total movimentacoes:', movCount);
  }
}

check();
