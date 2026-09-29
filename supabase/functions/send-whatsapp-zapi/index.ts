import { withRequestCors } from '../_shared/request-cors.ts';
import { companyHeaders, requestCompanyProfile } from "../_shared/company-scope.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
// ════════════════════════════════════════════════════════════════════════════
// send-whatsapp-zapi — proxy de envio de mensagens WhatsApp via Z-API (Cotação)
// ════════════════════════════════════════════════════════════════════════════
// Credenciais Z-API ficam SÓ no banco (cotacao_zapi_config, por empresa) e são
// lidas aqui via service-role — nunca vão para o bundle do frontend.
// Fluxo: valida JWT → resolve tenant (fail-closed, bloqueia placeholder) →
// checa compras:cotacao:manage → lê config da empresa → registra a tentativa
// (PENDING) em cotacao_whatsapp_logs → POST send-text na Z-API → grava o
// desfecho → (se solicitação) marca fornecedor ENVIADO.
//
// Idempotência: a Z-API não aceita id de deduplicação, então a linha de log é
// a única defesa contra mensagem duplicada. Ela nasce ANTES do envio, com a
// chave da operação (derivada no cliente) sob índice único; um reenvio com a
// mesma chave encontra a linha e nunca manda de novo, exceto depois de uma
// recusa explícita da Z-API (ERROR), quando nada saiu. Timeout, queda e 5xx
// viram UNKNOWN: a mensagem pode ter saído, e o cliente avisa em vez de reenviar.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = getCorsHeaders();

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
  idempotency_key?: string;
}

type EnvioStatus = "SENT" | "ERROR" | "UNKNOWN";

interface Tentativa {
  cotacao_id: string;
  cotacao_fornecedor_id: string | null;
  tipo: string;
  phone: string;
  message: string;
}

interface LogExistente extends Tentativa {
  id: string;
  status: string;
}

const MSG_INCERTO =
  "Não foi possível confirmar se a mensagem saiu. Ela pode ter sido enviada: " +
  "confira a conversa com o fornecedor no WhatsApp antes de enviar de novo.";

// Chave derivada no cliente (hash da operação). Formato restrito: ela vai para
// um índice único e não pode virar lixo arbitrário.
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_:.|-]{16,128}$/;

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
    global: { headers: { ...companyHeaders(req), Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(token);
  if (userErr || !userData?.user) throw new Error("AUTH");
  const userId = userData.user.id;

  const { data: profile, error: profErr } = await requestCompanyProfile(supabaseUser);
  if (profErr || !profile?.company_id) throw new Error("TENANT_NOT_FOUND");
  if (profile.company_id === PLACEHOLDER_TENANT) throw new Error("TENANT_FORBIDDEN");

  return { userId, companyId: profile.company_id };
}

async function hasAnyPermission(
  adminClient: SupabaseClient,
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

function mesmaTentativa(log: LogExistente, t: Tentativa): boolean {
  return log.cotacao_id === t.cotacao_id &&
    (log.cotacao_fornecedor_id ?? null) === t.cotacao_fornecedor_id &&
    log.tipo === t.tipo &&
    (log.phone ?? "") === t.phone &&
    (log.message ?? "") === t.message;
}

/**
 * Envia pela Z-API e classifica o desfecho. Só é ERROR o que a Z-API recusou
 * explicitamente (4xx): nada saiu. Timeout, queda de conexão e 5xx (que pode
 * vir de um proxy depois do envio) são UNKNOWN.
 */
async function enviarZapi(
  url: string,
  clientToken: string | null,
  phone: string,
  message: string,
): Promise<{ status: EnvioStatus; resposta: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers,
      body: JSON.stringify({ phone, message }),
    });
  } catch (e) {
    // Erros de transporte podem conter a URL com o token da instância: não
    // registrar o erro cru.
    const timeout = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    return { status: "UNKNOWN", resposta: { error: timeout ? "ZAPI_TIMEOUT" : "ZAPI_TRANSPORT_FAILED" } };
  }

  let corpo: unknown;
  try {
    const text = await resp.text();
    try { corpo = JSON.parse(text); } catch { corpo = { raw: text }; }
  } catch {
    corpo = { error: "ZAPI_BODY_UNREADABLE" };
  }

  if (resp.ok) return { status: "SENT", resposta: corpo };
  return {
    status: resp.status >= 500 ? "UNKNOWN" : "ERROR",
    resposta: { http_status: resp.status, body: corpo },
  };
}

/** Só na solicitação inicial e se ainda AGUARDANDO — repetir é inofensivo. */
async function marcarFornecedorEnviado(
  adminClient: SupabaseClient,
  companyId: string,
  t: Tentativa,
): Promise<string | null> {
  if (t.tipo !== "SOLICITACAO_COTACAO" || !t.cotacao_fornecedor_id) return null;
  const { error } = await adminClient
    .from("cotacao_fornecedores")
    .update({ status: "ENVIADO", mensagem_enviada_em: new Date().toISOString() })
    .eq("id", t.cotacao_fornecedor_id)
    .eq("cotacao_id", t.cotacao_id)
    .eq("company_id", companyId)
    .eq("status", "AGUARDANDO");
  if (error) {
    console.error("[send-whatsapp-zapi] status do fornecedor não atualizado", error.message);
    return "Mensagem enviada, mas o status do fornecedor não foi atualizado. Atualize a tela para conferir.";
  }
  return null;
}

serve(withRequestCors(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonRes({ error: 'METHOD_NOT_ALLOWED' }, 405);

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
        return jsonRes({ error: "COMPANY_ACCESS_DENIED", message: "Acesso à unidade negado", request_id: requestId }, 403);
      }
      return jsonRes({ error: "UNAUTHORIZED", request_id: requestId }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey, { global: { headers: companyHeaders(req) } });

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
    // Sem chave (front anterior): a tentativa ainda é registrada antes do envio,
    // só não é reconhecida num reenvio.
    const rawKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
    if (rawKey && !IDEMPOTENCY_KEY_RE.test(rawKey)) {
      return jsonRes({ error: "BAD_REQUEST", message: "Chave de envio inválida" }, 400);
    }
    const idempotencyKey = rawKey || crypto.randomUUID();

    // Confirma que a cotação é do tenant (defesa extra; RLS já protege o resto).
    const { data: cot } = await adminClient
      .from("cotacoes")
      .select("id")
      .eq("id", cotacao_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!cot) return jsonRes({ error: "NOT_FOUND", message: "Cotação não encontrada" }, 404);

    // O vínculo vem do banco: UUID de outra cotação/unidade não autoriza envio.
    if (cotacao_fornecedor_id) {
      const { data: supplier, error } = await adminClient.from('cotacao_fornecedores')
        .select('id').eq('id', cotacao_fornecedor_id)
        .eq('cotacao_id', cotacao_id).eq('company_id', companyId).maybeSingle();
      if (error) throw new Error('SUPPLIER_LOOKUP_FAILED');
      if (!supplier) return jsonRes({ error: 'NOT_FOUND', message: 'Fornecedor não encontrado na cotação' }, 404);
    }

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

    const tentativa: Tentativa = {
      cotacao_id,
      cotacao_fornecedor_id: cotacao_fornecedor_id ?? null,
      tipo,
      phone,
      message,
    };

    // ── 1. Registra a tentativa ANTES de enviar (service-role: company_id e
    //       created_by explícitos). Falha aqui é segura: nada foi enviado. ──
    let logId: string;
    const { data: novo, error: insertError } = await adminClient
      .from("cotacao_whatsapp_logs")
      .insert({
        ...tentativa,
        company_id: companyId,
        status: "PENDING",
        idempotency_key: idempotencyKey,
        created_by: userId,
      })
      .select("id")
      .single();

    if (novo) {
      logId = novo.id;
    } else if (insertError?.code === "23505") {
      // Mesma chave: é reenvio da mesma operação. Nunca manda de novo, salvo
      // depois de recusa explícita da Z-API.
      const { data: existente, error: lookupError } = await adminClient
        .from("cotacao_whatsapp_logs")
        .select("id, cotacao_id, cotacao_fornecedor_id, tipo, phone, message, status")
        .eq("company_id", companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (lookupError || !existente) throw new Error("LOG_LOOKUP_FAILED");
      const log = existente as LogExistente;

      if (!mesmaTentativa(log, tentativa)) {
        return jsonRes({
          success: false,
          error: "REQUEST_ID_REUTILIZADO",
          message: "Este envio não confere com o registrado antes.",
          request_id: requestId,
        });
      }
      if (log.status === "SENT") {
        const aviso = await marcarFornecedorEnviado(adminClient, companyId, tentativa);
        return jsonRes({ success: true, status: "SENT", idempotent: true, log_id: log.id, aviso });
      }
      if (log.status !== "ERROR") {
        // PENDING (em andamento ou sem desfecho gravado) ou UNKNOWN.
        return jsonRes({ success: false, status: log.status === "PENDING" ? "PENDING" : "UNKNOWN", log_id: log.id, message: MSG_INCERTO });
      }
      // ERROR: nada saiu. O UPDATE condicional garante que só um reenvio
      // concorrente reivindica a nova tentativa.
      const { data: reivindicado, error: claimError } = await adminClient
        .from("cotacao_whatsapp_logs")
        .update({ status: "PENDING", zapi_response: null })
        .eq("id", log.id)
        .eq("company_id", companyId)
        .eq("status", "ERROR")
        .select("id")
        .maybeSingle();
      if (claimError) throw new Error("LOG_CLAIM_FAILED");
      if (!reivindicado) {
        return jsonRes({ success: false, status: "PENDING", log_id: log.id, message: MSG_INCERTO });
      }
      logId = reivindicado.id;
    } else {
      throw new Error("LOG_INSERT_FAILED");
    }

    // ── 2. Envio ──
    const envio = await enviarZapi(url, cfg.client_token ?? null, phone, message);

    // ── 3. Desfecho. Daqui em diante a mensagem pode ter saído: nenhuma falha
    //       vira erro que convide a reenviar. ──
    const { error: resultError } = await adminClient
      .from("cotacao_whatsapp_logs")
      .update({
        status: envio.status,
        zapi_response: envio.resposta,
        sent_at: envio.status === "SENT" ? new Date().toISOString() : null,
      })
      .eq("id", logId)
      .eq("company_id", companyId);
    if (resultError) {
      // A linha fica PENDING: um reenvio com a mesma chave é tratado como incerto.
      console.error("[send-whatsapp-zapi] desfecho não registrado", { request_id: requestId, log_id: logId, status: envio.status });
    }

    if (envio.status === "SENT") {
      const avisoFornecedor = await marcarFornecedorEnviado(adminClient, companyId, tentativa);
      const aviso = resultError
        ? "Mensagem enviada, mas o histórico não foi atualizado."
        : avisoFornecedor;
      return jsonRes({ success: true, status: "SENT", log_id: logId, aviso, zapi_response: envio.resposta });
    }

    if (envio.status === "UNKNOWN") {
      return jsonRes({ success: false, status: "UNKNOWN", log_id: logId, message: MSG_INCERTO, request_id: requestId });
    }

    return jsonRes({
      success: false,
      status: "ERROR",
      log_id: logId,
      message: "A Z-API recusou o envio. Verifique as credenciais e o número.",
      zapi_response: envio.resposta,
    });
  } catch (e) {
    console.error("[send-whatsapp-zapi]", e);
    return jsonRes({ error: "INTERNAL", message: "Erro interno", request_id: requestId }, 500);
  }
}));
