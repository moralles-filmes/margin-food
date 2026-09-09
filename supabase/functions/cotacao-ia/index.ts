import { companyHeaders, requestCompanyProfile } from "../_shared/company-scope.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
// ════════════════════════════════════════════════════════════════════════════
// cotacao-ia — assistente de IA da Cotação (RFQ), por empresa
// ════════════════════════════════════════════════════════════════════════════
// Lê a chave de IA da empresa em cotacao_ia_config (provider/api_key/model) via
// service-role — a chave NUNCA vai ao frontend. Tarefas estruturadas (não-stream):
//   - gerar_mensagem  (por `tipo` de WhatsApp): redige a mensagem ao fornecedor
//   - analise_precos  : comenta a matriz de preços (NÃO decide a distribuição —
//                       os números vêm do otimizador determinístico)
// Mascara concorrentes por padrão nas mensagens (nunca revela nome/preço de
// outro fornecedor); só inclui contexto competitivo se allow_competitor_context.
// Valida JWT → tenant (fail-closed) → compras:cotacao:manage.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

let corsHeaders = getCorsHeaders();

const PLACEHOLDER_TENANT = "00000000-0000-0000-0000-000000000001";
const TASKS = new Set(["gerar_mensagem", "analise_precos"]);
const TIPOS = new Set(["SOLICITACAO_COTACAO", "COBRANCA_RESPOSTA", "NEGOCIACAO", "FECHAMENTO_PEDIDO", "CONFIRMACAO_PRAZO"]);

const MODEL_DEFAULTS: Record<string, string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-20241022",
};

interface Body {
  cotacao_id?: string;
  task?: string;
  fornecedor_id?: string | null;
  tipo?: string;
  allow_competitor_context?: boolean;
}

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Remove marcadores de injeção indireta vindos do banco.
function sanitize(val: unknown): string {
  return String(val ?? "").replace(/```/g, "").replace(/<\/?(system|assistant|user)>/gi, "").slice(0, 400);
}

async function resolveTenantOrThrow(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("AUTH");
  const supabaseUser = createClient(supabaseUrl, anonKey, { global: { headers: { ...companyHeaders(req), Authorization: authHeader } } });
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(token);
  if (userErr || !userData?.user) throw new Error("AUTH");
  const userId = userData.user.id;
  const { data: profile, error: profErr } = await requestCompanyProfile(supabaseUser);
  if (profErr || !profile?.company_id) throw new Error("TENANT_NOT_FOUND");
  if (profile.company_id === PLACEHOLDER_TENANT) throw new Error("TENANT_FORBIDDEN");
  return { userId, companyId: profile.company_id };
}

async function hasAnyPermission(adminClient: SupabaseClient, userId: string, keys: string[]): Promise<boolean> {
  for (const key of keys) {
    const { data, error } = await adminClient.rpc("has_permission", { _user_id: userId, _permission: key });
    if (!error && data) return true;
  }
  return false;
}

// ── Chamada ao provedor (não-streaming) ──────────────────────────────────────
async function callLLM(provider: string, apiKey: string, model: string, system: string, user: string): Promise<string> {
  if (provider === "anthropic") {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: "user", content: user }] }),
    });
    if (!resp.ok) throw new Error(`LLM_HTTP_${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const j = await resp.json();
    return (j?.content?.[0]?.text ?? "").trim();
  }
  // gemini (OpenAI-compat) e openai usam o mesmo shape
  const endpoint = provider === "openai"
    ? "https://api.openai.com/v1/chat/completions"
    : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!resp.ok) throw new Error(`LLM_HTTP_${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  return (j?.choices?.[0]?.message?.content ?? "").trim();
}

function dateLabel(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : "";
}

const BASE_SYSTEM =
  "Você é um assistente de COMPRAS de um restaurante brasileiro. Escreva em português do Brasil, " +
  "tom cordial, profissional e direto. NUNCA invente preços, prazos ou dados que não foram fornecidos. " +
  "Em mensagens de WhatsApp não use markdown (sem ** ou #). " +
  "NUNCA revele nomes ou preços de fornecedores concorrentes — fale apenas de forma genérica (ex.: 'recebemos outras propostas').";

serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;

    let userId: string, companyId: string;
    try {
      const t = await resolveTenantOrThrow(req, supabaseUrl, anonKey);
      userId = t.userId; companyId = t.companyId;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "TENANT_NOT_FOUND" || msg === "TENANT_FORBIDDEN") return jsonRes({ error: "COMPANY_ACCESS_DENIED", message: "Acesso à unidade negado", request_id: requestId }, 403);
      return jsonRes({ error: "UNAUTHORIZED", request_id: requestId }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey, { global: { headers: companyHeaders(req) } });
    if (!(await hasAnyPermission(adminClient, userId, ["compras:cotacao:manage", "system:global:manage"]))) {
      return jsonRes({ error: "PERMISSION_DENIED", message: "Sem permissão para usar a IA", request_id: requestId }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const { cotacao_id, task, fornecedor_id } = body;
    const tipo = body.tipo;
    const allowCompetitor = body.allow_competitor_context === true;

    if (!cotacao_id) return jsonRes({ error: "BAD_REQUEST", message: "cotacao_id obrigatório" }, 400);
    if (!task || !TASKS.has(task)) return jsonRes({ error: "BAD_REQUEST", message: "task inválida" }, 400);
    if (task === "gerar_mensagem" && (!tipo || !TIPOS.has(tipo))) return jsonRes({ error: "BAD_REQUEST", message: "tipo de mensagem inválido" }, 400);

    // ── Config IA da empresa ──
    const { data: cfg } = await adminClient
      .from("cotacao_ia_config")
      .select("provider, api_key, model, ativo")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!cfg || !cfg.ativo || !cfg.api_key) {
      return jsonRes({ success: false, error: "IA_NOT_CONFIGURED", message: "IA não configurada. Cadastre a chave em Configurações → Integrações." });
    }
    const provider = (cfg.provider || "gemini") as string;
    const model = (cfg.model && cfg.model.trim()) || MODEL_DEFAULTS[provider] || MODEL_DEFAULTS.gemini;

    // ── Contexto (do tenant) ──
    const { data: cot } = await adminClient
      .from("cotacoes").select("codigo, titulo, data_validade")
      .eq("id", cotacao_id).eq("company_id", companyId).maybeSingle();
    if (!cot) return jsonRes({ error: "NOT_FOUND", message: "Cotação não encontrada" }, 404);

    const [{ data: itensRaw }, { data: fornsRaw }] = await Promise.all([
      adminClient.from("cotacao_itens").select("id, produto_nome_snapshot, quantidade, unidade_snapshot, purchase_unit_snapshot").eq("cotacao_id", cotacao_id).eq("company_id", companyId),
      adminClient.from("cotacao_fornecedores").select("id, supplier_nome_snapshot").eq("cotacao_id", cotacao_id).eq("company_id", companyId),
    ]);
    const itens = itensRaw ?? [];
    const forns = fornsRaw ?? [];
    const fornIds = forns.map((f: any) => f.id);
    let respostas: any[] = [];
    if (fornIds.length) {
      const { data: r } = await adminClient.from("cotacao_respostas")
        .select("cotacao_fornecedor_id, cotacao_item_id, preco_unitario, disponivel, selecionado")
        .eq("company_id", companyId).in("cotacao_fornecedor_id", fornIds);
      respostas = r ?? [];
    }

    const itemName = (id: string) => sanitize(itens.find((i: any) => i.id === id)?.produto_nome_snapshot);
    const unidade = (it: any) => it.purchase_unit_snapshot || it.unidade_snapshot || "UN";

    let system = BASE_SYSTEM;
    let userPrompt = "";

    if (task === "gerar_mensagem") {
      const forn = forns.find((f: any) => f.id === fornecedor_id) ?? null;
      const fornNome = sanitize(forn?.supplier_nome_snapshot ?? "fornecedor");
      const itensTxt = itens.map((it: any) => `- ${sanitize(it.produto_nome_snapshot)} (${Number(it.quantidade) || 0} ${unidade(it)})`).join("\n");

      // Para negociação: por item, indica (sem nomes/valores) se há oferta melhor de outro fornecedor.
      let negociacaoHint = "";
      if (tipo === "NEGOCIACAO" && forn) {
        const linhas = itens.map((it: any) => {
          const minha = respostas.find((r) => r.cotacao_fornecedor_id === forn.id && r.cotacao_item_id === it.id && r.disponivel && r.preco_unitario != null)?.preco_unitario;
          const outras = respostas.filter((r) => r.cotacao_fornecedor_id !== forn.id && r.cotacao_item_id === it.id && r.disponivel && r.preco_unitario != null).map((r) => Number(r.preco_unitario));
          const melhorOutro = outras.length ? Math.min(...outras) : null;
          const temMelhor = minha != null && melhorOutro != null && melhorOutro < Number(minha);
          return `- ${sanitize(it.produto_nome_snapshot)}: ${temMelhor ? "há proposta melhor no mercado" : "competitivo"}`;
        }).join("\n");
        negociacaoHint = `\n\nReferência interna (NÃO cite números nem nomes de concorrentes na mensagem):\n${linhas}`;
      }

      const instr: Record<string, string> = {
        SOLICITACAO_COTACAO: `Escreva uma mensagem de WhatsApp solicitando cotação ao fornecedor "${fornNome}". Liste os itens abaixo e peça preço unitário, prazo de entrega e condição de pagamento.${cot.data_validade ? ` Mencione que precisamos da resposta até ${dateLabel(cot.data_validade)}.` : ""}`,
        COBRANCA_RESPOSTA: `Escreva uma mensagem cordial e breve cobrando a resposta da cotação ainda pendente do fornecedor "${fornNome}".`,
        NEGOCIACAO: `Escreva uma mensagem de negociação ao fornecedor "${fornNome}" pedindo uma condição melhor (preço/prazo/pagamento). Pode mencionar que recebemos outras propostas, sem revelar nomes ou valores. Seja respeitoso e mostre interesse em fechar.`,
        FECHAMENTO_PEDIDO: `Escreva uma mensagem confirmando o fechamento do pedido com o fornecedor "${fornNome}", listando os itens, e peça a confirmação do pedido e do prazo de entrega.`,
        CONFIRMACAO_PRAZO: `Escreva uma mensagem curta pedindo ao fornecedor "${fornNome}" a confirmação do prazo de entrega do pedido.`,
      };

      system = BASE_SYSTEM + " Responda APENAS com o texto final da mensagem, pronto para enviar (sem comentários, sem aspas).";
      userPrompt =
        `Cotação ${sanitize(cot.codigo)} — ${sanitize(cot.titulo)}.\n` +
        `${instr[tipo!]}\n\nItens:\n${itensTxt || "(sem itens)"}${negociacaoHint}`;
    } else {
      // analise_precos — interno (pode citar fornecedores)
      const matriz = itens.map((it: any) => {
        const linhas = forns.map((f: any) => {
          const r = respostas.find((x) => x.cotacao_fornecedor_id === f.id && x.cotacao_item_id === it.id);
          const nome = allowCompetitor ? sanitize(f.supplier_nome_snapshot) : `Fornecedor ${forns.indexOf(f) + 1}`;
          if (!r || !r.disponivel || r.preco_unitario == null) return `    ${nome}: indisponível`;
          return `    ${nome}: R$ ${Number(r.preco_unitario).toFixed(2)}`;
        }).join("\n");
        return `- ${sanitize(it.produto_nome_snapshot)} (${Number(it.quantidade) || 0} ${unidade(it)}):\n${linhas}`;
      }).join("\n");

      system = BASE_SYSTEM +
        " Você está fazendo uma ANÁLISE INTERNA (não é mensagem a fornecedor). " +
        "NÃO decida a distribuição final de compra — isso é feito por um otimizador determinístico; você apenas comenta. " +
        "Responda em tópicos curtos (markdown simples permitido).";
      userPrompt =
        `Analise a matriz de preços da cotação ${sanitize(cot.codigo)} — ${sanitize(cot.titulo)}.\n\n` +
        `Para cada item: aponte a faixa de preço (menor/maior) e a variação percentual quando fizer sentido. ` +
        `Destaque itens com maior dispersão e onde há mais economia. Termine com 2-3 recomendações práticas de negociação.\n\n` +
        `Matriz (R$ por unidade de compra):\n${matriz || "(sem respostas)"}`;
    }

    let text = "";
    try {
      text = await callLLM(provider, cfg.api_key, model, system, userPrompt);
    } catch (e) {
      console.error("[cotacao-ia] LLM error", e);
      return jsonRes({ success: false, error: "LLM_ERROR", message: "Falha ao chamar a IA. Verifique a chave/modelo em Configurações → Integrações." });
    }
    if (!text) return jsonRes({ success: false, error: "EMPTY", message: "A IA não retornou conteúdo." });

    return jsonRes({ success: true, task, text, provider, model });
  } catch (e) {
    console.error("[cotacao-ia]", e);
    return jsonRes({ error: "INTERNAL", message: "Erro interno", request_id: requestId }, 500);
  }
});
