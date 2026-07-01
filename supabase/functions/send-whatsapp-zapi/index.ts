import { getCorsHeaders } from "../_shared/cors.ts";
// ════════════════════════════════════════════════════════════════════════════
// send-whatsapp-zapi — proxy de envio de mensagens WhatsApp via Z-API (Cotação)
// ════════════════════════════════════════════════════════════════════════════
// Credenciais Z-API ficam SÓ no banco (cotacao_zapi_config, por empresa) e são
// lidas aqui via service-role — nunca vão para o bundle do frontend.
// Fluxo: valida JWT → resolve tenant (fail-closed, bloqueia placeholder) →
// checa compras:cotacao:manage → lê config da empresa → POST send-text na Z-API
// → grava log em cotacao_whatsapp_logs → (se solicitação) marca fornecedor ENVIADO.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

let corsHeaders = getCorsHeaders();

const PLACEHOLDER_TENANT = "00000000-0000-0000-0000-000000000001";

const ALLOWED_TIPOS = new Set([
  "SOLICITACAO_COTACAO",
  "COBRANCA_RESPOSTA",
  "NEGOCIACAO",
  "FECHAMENTO_PEDIDO",
  "CONFIRMACAO_PRAZO",
]);

interface Body {
  cotacao_id?: string;
  cotacao_fornecedor_id?: string | null;
  tipo?: string;
  phone?: string;
  message?: string;
}

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveTenantOrThrow(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ userId: string; companyId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("AUTH");

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(token);
  if (userErr || !userData?.user) throw new Error("AUTH");
  const userId = userData.user.id;

  const { data: profile, error: profErr } = await supabaseUser
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .single();
  if (profErr || !profile?.company_id) throw new Error("TENANT_NOT_FOUND");
  if (profile.company_id === PLACEHOLDER_TENANT) throw new Error("TENANT_FORBIDDEN");

  return { userId, companyId: profile.company_id };
}

async function hasAnyPermission(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  keys: string[],
): Promise<boolean> {
  for (const key of keys) {
    const { data, error } = await adminClient.rpc("has_permission", {
      _user_id: userId,
      _permission: key,
    });
    if (!error && data) return true;
  }
  return false;
}

// Só dígitos (Z-API espera o telefone sem máscara, ex.: 5511999999999).
function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;

    // ── Tenant (fail-closed) ──
    let userId: string;
    let companyId: string;
    try {
      const t = await resolveTenantOrThrow(req, supabaseUrl, anonKey);
      userId = t.userId;
      companyId = t.companyId;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "TENANT_NOT_FOUND" || msg === "TENANT_FORBIDDEN") {
        return jsonRes({ error: "FORBIDDEN_TENANT", message: "Tenant inválido", request_id: requestId }, 403);
      }
      return jsonRes({ error: "UNAUTHORIZED", request_id: requestId }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // ── Permissão (enviar WhatsApp = manage) ──
    const allowed = await hasAnyPermission(adminClient, userId, [
      "compras:cotacao:manage",
      "system:global:manage",
    ]);
    if (!allowed) {
      return jsonRes({ error: "PERMISSION_DENIED", message: "Sem permissão para enviar mensagens", request_id: requestId }, 403);
    }

    // ── Body ──
    const body = (await req.json().catch(() => ({}))) as Body;
    const { cotacao_id, cotacao_fornecedor_id, tipo } = body;
    const phone = normalizePhone(body.phone);
    const message = (body.message ?? "").trim();

    if (!cotacao_id) return jsonRes({ error: "BAD_REQUEST", message: "cotacao_id obrigatório" }, 400);
    if (!tipo || !ALLOWED_TIPOS.has(tipo)) return jsonRes({ error: "BAD_REQUEST", message: "tipo de mensagem inválido" }, 400);
    if (!phone || phone.length < 10) return jsonRes({ error: "BAD_REQUEST", message: "Telefone inválido" }, 400);
    if (!message) return jsonRes({ error: "BAD_REQUEST", message: "Mensagem vazia" }, 400);

    // Confirma que a cotação é do tenant (defesa extra; RLS já protege o resto).
    const { data: cot } = await adminClient
      .from("cotacoes")
      .select("id")
      .eq("id", cotacao_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!cot) return jsonRes({ error: "NOT_FOUND", message: "Cotação não encontrada" }, 404);

    // ── Config Z-API da empresa ──
    const { data: cfg } = await adminClient
      .from("cotacao_zapi_config")
      .select("instance_id, token, client_token, base_url, ativo")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!cfg || !cfg.ativo || !cfg.instance_id || !cfg.token) {
      // 200 (não 4xx) p/ o supabase-js entregar a mensagem amigável em `data`
      return jsonRes({
        success: false,
        error: "ZAPI_NOT_CONFIGURED",
        message: "Z-API não configurada. Configure em Configurações → Integrações.",
      });
    }

    const baseUrl = (cfg.base_url || "https://api.z-api.io").replace(/\/+$/, "");
    const url = `${baseUrl}/instances/${cfg.instance_id}/token/${cfg.token}/send-text`;

    // ── Envio ──
    let zapiResponse: unknown = null;
    let sendOk = false;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (cfg.client_token) headers["Client-Token"] = cfg.client_token;
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, message }),
      });
      const text = await resp.text();
      try { zapiResponse = JSON.parse(text); } catch { zapiResponse = { raw: text }; }
      sendOk = resp.ok;
    } catch (e) {
      zapiResponse = { error: e instanceof Error ? e.message : String(e) };
      sendOk = false;
    }

    // ── Log (service-role: company_id e created_by explícitos) ──
    const { data: logRow } = await adminClient
      .from("cotacao_whatsapp_logs")
      .insert({
        cotacao_id,
        cotacao_fornecedor_id: cotacao_fornecedor_id ?? null,
        company_id: companyId,
        tipo,
        phone,
        message,
        zapi_response: zapiResponse,
        status: sendOk ? "SENT" : "ERROR",
        sent_at: sendOk ? new Date().toISOString() : null,
        created_by: userId,
      })
      .select("id")
      .single();

    // ── Marca fornecedor como ENVIADO (só na solicitação inicial e se ainda AGUARDANDO) ──
    if (sendOk && tipo === "SOLICITACAO_COTACAO" && cotacao_fornecedor_id) {
      await adminClient
        .from("cotacao_fornecedores")
        .update({ status: "ENVIADO", mensagem_enviada_em: new Date().toISOString() })
        .eq("id", cotacao_fornecedor_id)
        .eq("company_id", companyId)
        .eq("status", "AGUARDANDO");
    }

    if (!sendOk) {
      return jsonRes({
        success: false,
        status: "ERROR",
        log_id: logRow?.id ?? null,
        message: "A Z-API recusou o envio. Verifique as credenciais e o número.",
        zapi_response: zapiResponse,
      });
    }

    return jsonRes({ success: true, status: "SENT", log_id: logRow?.id ?? null, zapi_response: zapiResponse });
  } catch (e) {
    console.error("[send-whatsapp-zapi]", e);
    return jsonRes({ error: "INTERNAL", message: "Erro interno", request_id: requestId }, 500);
  }
});
