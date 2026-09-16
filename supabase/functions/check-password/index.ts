import { withRequestCors } from '../_shared/request-cors.ts';
import { companyHeaders } from "../_shared/company-scope.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = getCorsHeaders();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const current = rateLimit.get(key);
  if (!current || current.resetAt <= now) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

const COMMON_PASSWORDS = [
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', 'master',
  'dragon', 'login', 'princess', 'football', 'shadow', 'sunshine', 'trustno1',
  'iloveyou', 'batman', 'access', 'hello', 'charlie', 'donald', 'password1',
  'qwerty123', 'letmein', 'welcome', '1234567890', 'admin', 'passw0rd',
  'senha123', 'mudar123', '123mudar', 'abc12345',
];

function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 12) errors.push('Mínimo 12 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('Pelo menos 1 letra maiúscula');
  if (!/[a-z]/.test(password)) errors.push('Pelo menos 1 letra minúscula');
  if (!/[0-9]/.test(password)) errors.push('Pelo menos 1 número');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Pelo menos 1 símbolo especial');
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) errors.push('Senha muito comum');
  return { valid: errors.length === 0, errors };
}

async function checkPwnedPassword(password: string): Promise<{ breached: boolean; count: number }> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  
  const prefix = hashHex.substring(0, 5);
  const suffix = hashHex.substring(5);
  
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' }
    });
    if (!response.ok) {
      await response.text();
      return { breached: false, count: 0 };
    }
    const text = await response.text();
    for (const line of text.split('\n')) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix) {
        return { breached: parseInt(countStr, 10) > 0, count: parseInt(countStr, 10) };
      }
    }
    return { breached: false, count: 0 };
  } catch {
    return { breached: false, count: 0 };
  }
}

serve(withRequestCors(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: 'Configuração do servidor inválida' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { ...companyHeaders(req), Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!checkRateLimit(userData.user.id)) {
      return new Response(JSON.stringify({ error: 'Muitas tentativas. Tente novamente em instantes.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { password } = await req.json();
    if (!password || typeof password !== 'string') {
      return new Response(JSON.stringify({ error: 'Senha é obrigatória' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const strength = validatePasswordStrength(password);
    const pwned = await checkPwnedPassword(password);
    
    const allErrors = [...strength.errors];
    if (pwned.breached) {
      allErrors.push(`Essa senha aparece em ${pwned.count.toLocaleString('pt-BR')} vazamentos. Escolha outra senha.`);
    }

    return new Response(JSON.stringify({
      valid: allErrors.length === 0,
      errors: allErrors,
      breached: pwned.breached,
      breachCount: pwned.count,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}));
