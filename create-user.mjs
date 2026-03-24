import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wuzxpbixprrgssoeeaez.supabase.co';
const supabaseKey = 'sb_publishable_lKpZIaegoPF2gK7V8AfFoQ_RxeN54bn';
const supabase = createClient(supabaseUrl, supabaseKey);

async function signUp() {
  const { data, error } = await supabase.auth.signUp({
    email: 'morallesfilms@gmail.com',
    password: '#MarginPro8831',
  });
  
  if (error) {
    console.error('Erro ao criar usuário:', error.message);
    process.exit(1);
  } else {
    console.log('Usuário criado com sucesso:', data.user?.email);
    console.log('Identificador:', data.user?.id);
  }
}

signUp();
