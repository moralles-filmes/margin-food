import { withRequestCors } from '../_shared/request-cors.ts';
import { companyHeaders, requestCompanyProfile } from "../_shared/company-scope.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isEstornoMovement } from "./stock-reversal.ts";
import {
  buildRequisicaoAbertaNotification,
  REQUISICAO_ABERTA_TYPE,
  REQUISICAO_APPROVER_PERMISSIONS,
  REQUISICOES_LINK_PATH,
} from "./approvers.ts";

const corsHeaders = getCorsHeaders();

interface ReqItem {
  produto_id: string;
  quantidade: number;
  unidade: string;
}

interface ReqBody {
  limit?: number;
  offset?: number;
  bucket?: string;
  action: string;
  setor: string;
  observacao?: string;
  itens: ReqItem[];
  /** Chave derivada da operação no cliente (ação `criar`). */
  client_request_id?: string;
  requisicao_id?: string;
  movement_id?: string;
  justificativa?: string;
  item_id?: string;
  motivo_recusa?: string;
  item_ids?: string[];
  quantidade_aprovada?: number;
  updates?: {
    quantidade?: number;
    custo_unitario?: number;
    custo_total?: number;
    data?: string;
    observacao?: string;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const PLACEHOLDER_TENANT = "00000000-0000-0000-0000-000000000001";

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function forbidden(code: string, msg: string) {
  return jsonRes({ error: code, message: msg }, 403);
}

function notFound(entity: string) {
  return jsonRes({ error: "NOT_FOUND", message: `${entity} não encontrado(a)` }, 404);
}

function badRequest(msg: string) {
  return jsonRes({ error: "BAD_REQUEST", message: msg }, 400);
}

function conflict(msg: string) {
  return jsonRes({ error: "CONFLICT", message: msg }, 409);
}

/**
 * Resolve tenant fail-closed: extracts userId + companyId.
 * Throws on auth failure, missing profile, or placeholder tenant.
 */
async function resolveTenantOrThrow(
  req: Request,
  supabaseUrl: string,
  anonKey: string
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

/**
 * Check permission via the DB function has_permission().
 */
async function checkPermission(adminClient: SupabaseClient, userId: string, permissionKey: string): Promise<boolean> {
  const { data, error } = await adminClient.rpc("has_permission", {
    _user_id: userId,
    _permission: permissionKey,
  });
  if (error) return false;
  return !!data;
}

async function hasAnyPermission(adminClient: SupabaseClient, userId: string, keys: string[]): Promise<boolean> {
  for (const key of keys) {
    if (await checkPermission(adminClient, userId, key)) return true;
  }
  return false;
}

function normalizeUnitLabel(unit: string | null | undefined): string | null {
  const normalized = unit?.trim();
  return normalized ? normalized : null;
}

function toSerializableJson(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

async function writeAudit(
  adminClient: SupabaseClient, companyId: string, actorId: string,
  payload: {
    p_source?: string;
    p_module: string;
    p_entity: string;
    p_entity_id: string | null;
    p_action: string;
    p_before?: unknown;
    p_after?: unknown;
    p_metadata?: unknown;
  }
) {
  const metadata = payload.p_metadata && typeof payload.p_metadata === 'object' && !Array.isArray(payload.p_metadata)
    ? { source: payload.p_source ?? 'edge', ...(payload.p_metadata as Record<string, unknown>) }
    : payload.p_metadata ?? (payload.p_source ? { source: payload.p_source } : null);

  const { error } = await adminClient.rpc('service_write_audit', {
    p_company_id: companyId, p_actor_id: actorId,
    p_module: payload.p_module,
    p_action: payload.p_action,
    p_entity: payload.p_entity,
    p_entity_id: payload.p_entity_id,
    p_before: toSerializableJson(payload.p_before),
    p_after: toSerializableJson(payload.p_after),
    p_metadata: toSerializableJson(metadata),
  });
  if (error) throw error;
}

/**
 * Avisa no sininho os membros ativos da unidade que podem atender a requisição
 * (ver approvers.ts), menos o próprio solicitante. `scopedAdmin` precisa levar o
 * `x-company-id` da requisição: sem o cabeçalho, `get_effective_permissions` com
 * service_role usa a empresa de origem do usuário consultado, não esta unidade.
 */
async function notifyRequisicaoAberta(
  scopedAdmin: SupabaseClient,
  companyId: string,
  actorId: string,
  requisicao: { id: string; setor: string; totalItens: number },
): Promise<number> {
  const { data: members, error: membersError } = await scopedAdmin
    .from("company_memberships")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("status", "active");
  if (membersError) throw membersError;

  const candidates = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))]
    .filter((candidateId) => candidateId && candidateId !== actorId);

  const approvers = await Promise.all(candidates.map(async (candidateId) => {
    const { data, error } = await scopedAdmin.rpc("has_any_permission", {
      _user_id: candidateId,
      _permissions: [...REQUISICAO_APPROVER_PERMISSIONS],
    });
    if (error) throw error;
    return data === true ? candidateId : null;
  }));
  const recipients = approvers.filter((recipientId): recipientId is string => recipientId !== null);
  if (recipients.length === 0) return 0;

  const { data: solicitante } = await scopedAdmin
    .from("profiles")
    .select("nome")
    .eq("id", actorId)
    .maybeSingle();

  const { title, message } = buildRequisicaoAbertaNotification({
    requisicaoId: requisicao.id,
    setor: requisicao.setor,
    totalItens: requisicao.totalItens,
    solicitanteNome: solicitante?.nome ?? null,
  });

  const { error: insertError } = await scopedAdmin.from("notifications").insert(
    recipients.map((recipientId) => ({
      company_id: companyId,
      recipient_user_id: recipientId,
      type: REQUISICAO_ABERTA_TYPE,
      module: "estoque",
      title,
      message,
      entity_type: "requisicao_estoque",
      entity_id: requisicao.id,
      link_path: REQUISICOES_LINK_PATH,
      created_by: actorId,
      metadata: { setor: requisicao.setor, total_itens: requisicao.totalItens },
    })),
  );
  if (insertError) throw insertError;
  return recipients.length;
}

/** Requisição encerrada ou cancelada não deixa aviso de "aberta" pendente no sininho de ninguém. */
async function clearRequisicaoAberta(adminClient: SupabaseClient, companyId: string, requisicaoId: string) {
  const { error } = await adminClient
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("entity_type", "requisicao_estoque")
    .eq("entity_id", requisicaoId)
    .eq("type", REQUISICAO_ABERTA_TYPE)
    .is("read_at", null);
  // A operação principal já foi gravada; o aviso sobra no máximo como "não lido".
  if (error) console.error("[requisicao-estoque] falha ao limpar aviso de requisição aberta:", error);
}

// ─── Main Handler ───────────────────────────────────────────────────────────

serve(withRequestCors(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;

    // ── Tenant resolution (fail-closed) ──
    let userId: string;
    let companyId: string;
    try {
      const tenant = await resolveTenantOrThrow(req, supabaseUrl, anonKey);
      userId = tenant.userId;
      companyId = tenant.companyId;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "AUTH") return jsonRes({ error: "UNAUTHORIZED", request_id: requestId }, 401);
      if (msg === "TENANT_NOT_FOUND") return forbidden("FORBIDDEN_TENANT", "Tenant não encontrado");
      if (msg === "TENANT_FORBIDDEN") return forbidden("FORBIDDEN_TENANT", "Tenant bloqueado");
      return jsonRes({ error: "UNAUTHORIZED", request_id: requestId }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceKey, { global: { headers: companyHeaders(req) } });

    // User-scoped client for RLS-bound inserts
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { ...companyHeaders(req), Authorization: req.headers.get("Authorization")! } },
    });

    let body: ReqBody;
    try {
      body = await req.json();
    } catch {
      return badRequest("Body inválido. Envie JSON com a ação.");
    }

    const { action } = body;
    if (!action || typeof action !== "string") {
      return badRequest("Ação obrigatória");
    }

    // ========================
    // ACTION: editar_movimentacao
    // ========================
    if (action === "editar_movimentacao") {
      const { movement_id, justificativa, updates } = body;
      if (!movement_id || !justificativa?.trim()) return badRequest("movement_id e justificativa são obrigatórios");
      if (!updates || Object.keys(updates).length === 0) return badRequest("Nenhuma alteração fornecida");

      const hasAccess = await hasAnyPermission(adminClient, userId, [
        "estoque:movimentacoes:edit",
        "estoque:movimentacoes:manage",
        "system:global:manage",
      ]);
      if (!hasAccess) return forbidden("FORBIDDEN_RBAC", "Sem permissão para editar movimentações");

      // Tenant-scoped select
      const { data: mov, error: movErr } = await adminClient
        .from("movimentacoes_estoque")
        .select("id, produto_id, tipo, quantidade, custo_unitario, custo_total, data, observacao, status, origem, referencia_id")
        .eq("id", movement_id)
        .eq("company_id", companyId)
        .single();

      if (movErr || !mov) return notFound("Movimentação");

      if (mov.status !== "ATIVO") return badRequest("Movimentação cancelada não pode ser editada");
      if (isEstornoMovement(mov)) return badRequest("Movimentações de estorno não podem ser editadas manualmente.");

      // Block editing if linked to closed inventory (tenant-scoped)
      if (mov.origem === "INVENTARIO" && mov.referencia_id) {
        const { data: inv } = await adminClient
          .from("inventarios")
          .select("status")
          .eq("id", mov.referencia_id)
          .eq("company_id", companyId)
          .single();
        if (inv?.status === "FINALIZADO") return badRequest("Movimentação vinculada a inventário fechado. Use ajuste.");
      }

      const beforeSnapshot = {
        quantidade: mov.quantidade,
        custo_unitario: mov.custo_unitario,
        custo_total: mov.custo_total,
        data: mov.data,
        observacao: mov.observacao,
      };

      const dbUpdate: Record<string, unknown> = {
        editado_por: userId,
        editado_em: new Date().toISOString(),
        justificativa_edicao: justificativa,
      };

      if (updates.quantidade !== undefined) {
        dbUpdate.quantidade = updates.quantidade;
        dbUpdate.custo_total = updates.quantidade * (updates.custo_unitario ?? mov.custo_unitario);
      }
      if (updates.custo_unitario !== undefined) {
        dbUpdate.custo_unitario = updates.custo_unitario;
        dbUpdate.custo_total = ((updates.quantidade ?? mov.quantidade) as number) * updates.custo_unitario;
      }
      if (updates.custo_total !== undefined) dbUpdate.custo_total = updates.custo_total;
      if (updates.data !== undefined) dbUpdate.data = updates.data;
      if (updates.observacao !== undefined) dbUpdate.observacao = updates.observacao;

      const { data: updated, error: updateErr } = await adminClient
        .from("movimentacoes_estoque")
        .update(dbUpdate)
        .eq("id", movement_id)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();

      if (updateErr) throw updateErr;
      if (!updated) return forbidden("FORBIDDEN_TENANT", "Movimentação não pertence ao tenant");

      await writeAudit(adminClient, companyId, userId, {
        p_source: "edge",
        p_module: "estoque",
        p_entity: "movimentacoes_estoque",
        p_entity_id: movement_id,
        p_action: "UPDATE_MOVEMENT",
        p_before: beforeSnapshot,
        p_after: { ...beforeSnapshot, ...updates, justificativa },
      });

      return jsonRes({ success: true, mensagem: "Movimentação editada com sucesso.", request_id: requestId });
    }

    // ========================
    // ACTION: cancelar_movimentacao
    // ========================
    if (action === "cancelar_movimentacao") {
      const { movement_id, justificativa } = body;
      if (!movement_id || !justificativa?.trim()) return badRequest("movement_id e justificativa são obrigatórios");

      const hasAccess = await hasAnyPermission(adminClient, userId, [
        "estoque:movimentacoes:cancel",
        "estoque:movimentacoes:edit",
        "estoque:movimentacoes:manage",
        "system:global:manage",
      ]);
      if (!hasAccess) return forbidden("FORBIDDEN_RBAC", "Sem permissão para cancelar movimentações");

      const { error: cancelError } = await supabaseUser.rpc("cancel_stock_movement_atomic", {
        p_movement_id: movement_id,
        p_reason: justificativa.trim(),
      });
      if (cancelError) {
        if (cancelError.code === "23505" || cancelError.message.includes("ALREADY_CANCELLED")) {
          return conflict("Movimentação já cancelada. Estorno já existe.");
        }
        if (cancelError.message.includes("NOT_FOUND")) return notFound("Movimentação");
        if (cancelError.message.includes("INVENTORY_CLOSED") || cancelError.message.includes("REVERSAL_NOT_ALLOWED")) {
          return badRequest(cancelError.message);
        }
        throw cancelError;
      }

      return jsonRes({ success: true, mensagem: "Movimentação cancelada e estorno criado.", request_id: requestId });
    }

    // ========================
    // ACTION: criar requisição
    // ========================
    if (action === "criar") {
      const hasCreateAccess = await hasAnyPermission(adminClient, userId, [
        "estoque:requisicoes:create",
        "stock:requisitions:create",
        "system:global:manage",
      ]);
      if (!hasCreateAccess) return forbidden("FORBIDDEN_RBAC", "Sem permissão para criar requisições");

      const { setor, observacao, itens } = body;
      if (!setor || !itens || itens.length === 0) return badRequest("Setor e itens são obrigatórios");
      for (const item of itens) {
        if (!(Number(item.quantidade) > 0)) {
          return badRequest(`Quantidade inválida para o produto ${item.produto_id}.`);
        }
      }

      const resultados: { produto_id: string; saldo: number; solicitado: number; tem_estoque: boolean }[] = [];
      const validatedUnits = new Map<string, string>();

      for (const item of itens) {
        const { data: prod } = await adminClient
          .from("produtos")
          .select("id, unidade_compra")
          .eq("id", item.produto_id)
          .eq("company_id", companyId)
          .maybeSingle();

        if (!prod) return forbidden("FORBIDDEN_TENANT", `Produto ${item.produto_id} não pertence ao tenant`);

        const purchaseUnit = normalizeUnitLabel(prod.unidade_compra);
        if (!purchaseUnit) {
          return badRequest(`Produto ${item.produto_id} sem unidade de compra configurada.`);
        }

        const requestUnit = normalizeUnitLabel(item.unidade);
        if (!requestUnit) {
          return badRequest(`Unidade inválida para o produto ${item.produto_id}.`);
        }

        if (requestUnit !== purchaseUnit) {
          return badRequest(`A requisição do produto ${item.produto_id} deve usar a unidade de compra atual (${purchaseUnit}).`);
        }

        validatedUnits.set(item.produto_id, purchaseUnit);

        const { data: saldoData } = await supabaseUser.rpc("get_saldo_produto", {
          p_produto_id: item.produto_id,
        });
        const saldo = Number(saldoData) || 0;
        resultados.push({
          produto_id: item.produto_id,
          saldo,
          solicitado: item.quantidade,
          tem_estoque: saldo >= item.quantidade,
        });
      }

      // Cabeçalho + itens numa transação só, com a chave de reenvio. Reenviar a
      // mesma requisição (duplo clique, resposta perdida) devolve a existente.
      const clientRequestId = typeof body.client_request_id === "string" && body.client_request_id.trim()
        ? body.client_request_id.trim()
        : null;

      const { data: criada, error: criarError } = await supabaseUser.rpc("criar_requisicao_estoque", {
        p_setor: setor,
        p_observacao: observacao || "",
        p_itens: resultados.map((r) => ({
          produto_id: r.produto_id,
          quantidade: Number(r.solicitado),
          unidade: validatedUnits.get(r.produto_id)!,
          saldo_snapshot: r.saldo,
        })),
        p_client_request_id: clientRequestId,
      });
      if (criarError) {
        if (criarError.message?.includes("REQUEST_ID_REUTILIZADO")) {
          return conflict("Este envio não confere com a requisição já registrada. Confira a lista de requisições antes de enviar de novo.");
        }
        throw criarError;
      }

      const criacao = criada as {
        requisicao_id: string;
        idempotente: boolean;
        itens: { id: string; produto_id: string; quantidade_solicitada: number; saldo_snapshot: number }[];
      };
      const requisicao_id = criacao.requisicao_id;

      if (criacao.idempotente) {
        // Reenvio: a requisição, os alertas e o aviso já saíram no envio original.
        return jsonRes({
          success: true,
          idempotente: true,
          requisicao_id,
          resultados: criacao.itens.map((i) => ({
            produto_id: i.produto_id,
            saldo: Number(i.saldo_snapshot) || 0,
            solicitado: Number(i.quantidade_solicitada),
            tem_estoque: (Number(i.saldo_snapshot) || 0) >= Number(i.quantidade_solicitada),
          })),
          request_id: requestId,
          mensagem: "Esta requisição já estava registrada — nada foi duplicado.",
        });
      }

      // Daqui para baixo a requisição já está gravada: nenhuma falha pode virar
      // erro na resposta, senão a tela convida a repetir um envio que deu certo.
      try {
        await writeAudit(adminClient, companyId, userId, {
          p_source: "edge",
          p_module: "estoque",
          p_entity: "requisicoes_estoque",
          p_entity_id: requisicao_id,
          p_action: "REQUISICAO_CRIADA",
          p_after: {
            setor,
            itens: resultados.map((r) => ({ produto_id: r.produto_id, quantidade: r.solicitado, saldo: r.saldo, tem_estoque: r.tem_estoque })),
          },
        });
      } catch (auditError) {
        console.error("[requisicao-estoque] falha ao auditar criação:", auditError);
      }

      const itensComEstoque = resultados.filter((r) => r.tem_estoque);
      const itensSemEstoque = resultados.filter((r) => !r.tem_estoque);

      // ── Generate shortage ALERTS (not purchase orders) for out-of-stock items ──
      if (itensSemEstoque.length > 0) {
        try {
          const prodIds = itensSemEstoque.map(r => r.produto_id);
          const { data: prodRows } = await adminClient
            .from("produtos")
            .select("id, nome_produto, unidade_compra")
            .in("id", prodIds)
            .eq("company_id", companyId);

          const prodMap = new Map(
            (prodRows || []).map((p: { id: string; nome_produto: string; unidade_compra: string | null }) => [p.id, p])
          );

          // Itens recém-criados vêm no retorno da RPC: vínculo alerta → item.
          const reqItemMap = new Map(criacao.itens.map((ri) => [ri.produto_id, ri.id]));

          const alertRows = itensSemEstoque.map(r => {
            const item = itens.find(i => i.produto_id === r.produto_id)!;
            const prod = prodMap.get(r.produto_id);
            return {
              company_id: companyId,
              produto_id: r.produto_id,
              produto_nome: prod?.nome_produto || r.produto_id.slice(0, 8),
              quantidade_solicitada: item.quantidade,
              unidade: validatedUnits.get(r.produto_id)!,
              saldo_no_momento: r.saldo,
              requisicao_id: requisicao_id,
              requisicao_item_id: reqItemMap.get(r.produto_id) || null,
              setor_solicitante: setor,
              origem: "REQUISICAO_ESTOQUE",
              status: "PENDENTE",
              created_by: userId,
            };
          });

          // Idempotent insert (unique constraint on requisicao_id + produto_id)
          const { error: alertError } = await adminClient
            .from("alertas_falta_estoque")
            .upsert(alertRows, { onConflict: "requisicao_id,produto_id", ignoreDuplicates: true });

          if (alertError) {
            console.error("Error creating shortage alerts:", alertError);
            // Non-blocking: don't fail the requisition because of alert creation failure
          }

          // Audit
          await writeAudit(adminClient, companyId, userId, {
            p_source: "edge",
            p_module: "compras",
            p_entity: "alertas_falta_estoque",
            p_entity_id: requisicao_id,
            p_action: "ALERTA_FALTA_CRIADO",
            p_after: {
              setor,
              requisicao_id,
              itens_sem_estoque: itensSemEstoque.length,
              produtos: itensSemEstoque.map(r => r.produto_id),
            },
          });
        } catch (alertFlowError) {
          console.error("[requisicao-estoque] falha ao registrar alertas de falta:", alertFlowError);
        }
      }

      try {
        const scopedAdmin = createClient(supabaseUrl, serviceKey, {
          global: { headers: { "x-company-id": companyId } },
        });
        await notifyRequisicaoAberta(scopedAdmin, companyId, userId, {
          id: requisicao_id,
          setor,
          totalItens: resultados.length,
        });
      } catch (notifyError) {
        // A requisição já foi gravada: devolver erro aqui faria o usuário reenviar e duplicá-la.
        console.error("[requisicao-estoque] falha ao notificar aprovadores:", notifyError);
      }

      const mensagem =
        itensSemEstoque.length === 0
          ? "Requisição criada com sucesso."
          : itensComEstoque.length === 0
          ? `Requisição criada. Todos os ${itensSemEstoque.length} item(ns) estão sem estoque — alerta enviado para Compras.`
          : `Requisição criada. ${itensComEstoque.length} item(ns) com estoque, ${itensSemEstoque.length} item(ns) sem estoque → alerta enviado para Compras.`;

      return jsonRes({
        success: true,
        requisicao_id,
        resultados,
        request_id: requestId,
        mensagem,
      });
    }

    // ========================
    // HELPER: sync aggregated parent status from item-level statuses
    // ========================
    async function syncRequisicaoStatus(reqId: string, cId: string, uId: string, userClient: SupabaseClient) {
      const { data: statusResult } = await userClient.rpc("compute_requisicao_status_agregado", {
        p_requisicao_id: reqId,
      });
      const newStatus = statusResult || "SOLICITADA";

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        updated_at: now,
      };
      if (newStatus === "ATENDIDA" || newStatus === "PARCIALMENTE_ATENDIDA") {
        updatePayload.atendido_por = uId;
        updatePayload.atendido_em = now;
      }

      await adminClient
        .from("requisicoes_estoque")
        .update(updatePayload)
        .eq("id", reqId)
        .eq("company_id", cId);
    }

    // ========================
    // HELPER: insere notificação para o solicitante quando a requisição encerra
    // ========================
    // Chamado depois que a mutação já foi gravada: falhar aqui não pode virar erro
    // na resposta, senão a tela convida a repetir uma operação que deu certo.
    async function notifyIfRequisicaoEncerrada(reqId: string, cId: string, actorId: string) {
      try {
        await writeRequisicaoEncerrada(reqId, cId, actorId);
      } catch (notifyError) {
        console.error("[requisicao-estoque] falha ao notificar encerramento:", notifyError);
      }
    }

    async function writeRequisicaoEncerrada(reqId: string, cId: string, actorId: string) {
      const { data: req, error: reqError } = await adminClient
        .from("requisicoes_estoque")
        .select("id, status, setor, solicitante_user_id, requisicao_estoque_itens(status)")
        .eq("id", reqId)
        .eq("company_id", cId)
        .single();
      if (reqError) throw reqError;

      if (!req) return;
      const FINAL = ["ATENDIDA", "PARCIALMENTE_ATENDIDA", "NEGADA"];
      if (!FINAL.includes(req.status)) return;
      // PARCIALMENTE_ATENDIDA sai no 1º item atendido, com outros ainda SOLICITADO:
      // encerrada é quem não tem mais item pendente (mesma regra de hasPendingItems).
      const itens = (req.requisicao_estoque_itens ?? []) as { status: string }[];
      if (itens.some((item) => item.status === "SOLICITADO")) return;
      await clearRequisicaoAberta(adminClient, cId, reqId);
      if (!req.solicitante_user_id) return;

      const reqShort = reqId.slice(0, 8);
      let title: string, message: string;
      if (req.status === "ATENDIDA") {
        title = "Requisição atendida";
        message = `Sua requisição #${reqShort} (${req.setor ?? "—"}) foi atendida. A mercadoria está separada e pronta para retirada no almoxarifado.`;
      } else if (req.status === "PARCIALMENTE_ATENDIDA") {
        title = "Requisição parcialmente atendida";
        message = `Sua requisição #${reqShort} (${req.setor ?? "—"}) foi parcialmente atendida. Verifique os itens — parte está pronta para retirada.`;
      } else {
        title = "Requisição negada";
        message = `Sua requisição #${reqShort} (${req.setor ?? "—"}) foi negada. Veja o motivo na lista de requisições.`;
      }

      const content = { title, message, created_by: actorId, metadata: { status: req.status, setor: req.setor } };

      // O índice é parcial: PostgREST onConflict(entity_id) não o infere.
      const { error: notificationError } = await adminClient.from("notifications").insert({
        company_id: cId,
        recipient_user_id: req.solicitante_user_id,
        type: "REQUISICAO_ENCERRADA",
        module: "estoque",
        entity_type: "requisicao_estoque",
        entity_id: reqId,
        link_path: "/?module=estoque&sub=requisicoes",
        ...content,
      });
      if (!notificationError) return;
      if (notificationError.code !== "23505") throw notificationError;

      // Um aviso por requisição (índice único). Os gravados antes da regra acima
      // saíam no 1º item atendido: se o resultado final difere do aviso, ele é
      // atualizado e volta a ficar não lido; sem diferença, é reenvio e nada muda.
      const { data: existing, error: existingError } = await adminClient.from("notifications")
        .select("id, recipient_user_id, metadata")
        .eq("company_id", cId).eq("entity_type", "requisicao_estoque").eq("entity_id", reqId)
        .eq("type", "REQUISICAO_ENCERRADA").maybeSingle();
      if (existingError) throw existingError;
      if (!existing || existing.recipient_user_id !== req.solicitante_user_id) {
        throw new Error("aviso de encerramento existente pertence a outro destinatário");
      }
      if ((existing.metadata as { status?: string } | null)?.status === req.status) return;
      const { error: updateError } = await adminClient.from("notifications")
        .update({ ...content, read_at: null })
        .eq("id", existing.id);
      if (updateError) throw updateError;
    }

    // ========================
    // HELPER: official atomic pipeline for item attendance -> movement
    // ========================
    async function attendItemAtomic(reqId: string, itemId: string, approvedQty?: number) {
      const rpcPayload: {
        p_requisicao_id: string;
        p_item_id: string;
        p_quantidade_aprovada?: number;
      } = {
        p_requisicao_id: reqId,
        p_item_id: itemId,
      };

      if (approvedQty !== undefined) {
        rpcPayload.p_quantidade_aprovada = approvedQty;
      }

      const { data, error } = await supabaseUser.rpc("attend_requisicao_item_atomic", rpcPayload);
      if (error) {
        throw new Error(error.message || "Falha ao registrar a baixa do item");
      }

      const result = data as {
        success?: boolean;
        message?: string;
        movement_id?: string;
        partial?: boolean;
        quantidade_atendida?: number;
        quantidade_movimentada_base?: number;
      } | null;

      if (!result?.success || !result.movement_id) {
        throw new Error(result?.message || "A baixa do item não foi confirmada pelo backend");
      }

      return result;
    }

    // ========================
    // ACTION: recusar_item — reject a single item
    // ========================
    if (action === "recusar_item") {
      const { requisicao_id, item_id, motivo_recusa } = body;
      if (!requisicao_id || !item_id) return badRequest("requisicao_id e item_id são obrigatórios");
      if (!motivo_recusa?.trim()) return badRequest("Motivo da recusa é obrigatório");

      const canRecusar = await hasAnyPermission(adminClient, userId, [
        "estoque:requisicoes:approve",
        "estoque:requisicoes:close",
        "system:global:manage",
      ]);
      if (!canRecusar) return forbidden("FORBIDDEN_RBAC", "Sem permissão para recusar itens");

      const { data: reqData, error: reqErr } = await adminClient
        .from("requisicoes_estoque")
        .select("id, status, setor")
        .eq("id", requisicao_id)
        .eq("company_id", companyId)
        .single();

      if (reqErr || !reqData) return notFound("Requisição");
      if (reqData.status === "CANCELADA") return badRequest("Requisição cancelada não pode ser alterada");

      const { data: itemData, error: itemErr } = await adminClient
        .from("requisicao_estoque_itens")
        .select("id, produto_id, quantidade_solicitada, status")
        .eq("id", item_id)
        .eq("requisicao_id", requisicao_id)
        .single();

      if (itemErr || !itemData) return notFound("Item da requisição");
      if (itemData.status !== "SOLICITADO") return badRequest(`Item já está com status ${itemData.status}`);

      const now = new Date().toISOString();

      const { error: updateErr } = await adminClient
        .from("requisicao_estoque_itens")
        .update({
          status: "RECUSADO",
          recusado_por: userId,
          recusado_em: now,
          motivo_recusa: motivo_recusa.trim().slice(0, 500),
        })
        .eq("id", item_id)
        .eq("requisicao_id", requisicao_id)
        .eq("company_id", companyId);

      if (updateErr) throw updateErr;

      await syncRequisicaoStatus(requisicao_id, companyId, userId, supabaseUser);

      await writeAudit(adminClient, companyId, userId, {
        p_source: "edge",
        p_module: "estoque",
        p_entity: "requisicao_estoque_itens",
        p_entity_id: item_id,
        p_action: "ITEM_RECUSADO",
        p_before: { status: "SOLICITADO", produto_id: itemData.produto_id },
        p_after: { status: "RECUSADO", motivo_recusa: motivo_recusa.trim(), recusado_por: userId },
      });

      await notifyIfRequisicaoEncerrada(requisicao_id, companyId, userId);

      return jsonRes({ success: true, mensagem: "Item recusado com sucesso.", request_id: requestId });
    }

    // ========================
    // ACTION: atender_item — source of truth is the atomic DB mutator
    // ========================
    if (action === "atender_item") {
      const { requisicao_id, item_id, quantidade_aprovada } = body;
      if (!requisicao_id || !item_id) return badRequest("requisicao_id e item_id são obrigatórios");

      const canAtender = await hasAnyPermission(adminClient, userId, [
        "estoque:requisicoes:approve",
        "estoque:requisicoes:close",
        "estoque:movimentacoes:create",
        "system:global:manage",
      ]);
      if (!canAtender) return forbidden("FORBIDDEN_RBAC", "Sem permissão para atender itens");

      const approvedQty = quantidade_aprovada !== undefined && quantidade_aprovada !== null
        ? Number(quantidade_aprovada)
        : undefined;

      if (approvedQty !== undefined && (Number.isNaN(approvedQty) || approvedQty <= 0)) {
        return badRequest("Quantidade aprovada deve ser maior que zero");
      }

      try {
        const result = await attendItemAtomic(requisicao_id, item_id, approvedQty);
        await notifyIfRequisicaoEncerrada(requisicao_id, companyId, userId);
        return jsonRes({
          success: true,
          mensagem: result.message || "Item atendido com sucesso.",
          movement_id: result.movement_id,
          partial: !!result.partial,
          quantidade_atendida: result.quantidade_atendida,
          quantidade_movimentada_base: result.quantidade_movimentada_base,
          request_id: requestId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao atender item";
        if (message.startsWith("404:")) return notFound(message.replace("404:", "").trim());
        if (message.startsWith("403RBAC:")) return forbidden("FORBIDDEN_RBAC", message.replace("403RBAC:", "").trim());
        if (message.startsWith("400:")) return badRequest(message.replace("400:", "").trim());
        if (message.startsWith("409:")) return conflict(message.replace("409:", "").trim());
        throw error;
      }
    }

    // ========================
    // ACTION: atender requisição (all pending items — item by item via atomic mutator)
    // ========================
    if (action === "atender") {
      const { requisicao_id } = body;
      if (!requisicao_id) return badRequest("requisicao_id obrigatório");

      const canAtender = await hasAnyPermission(adminClient, userId, [
        "estoque:requisicoes:approve",
        "estoque:requisicoes:close",
        "estoque:movimentacoes:create",
        "system:global:manage",
      ]);
      if (!canAtender) return forbidden("FORBIDDEN_RBAC", "Sem permissão para atender requisições");

      const { data: reqData, error: reqErr } = await adminClient
        .from("requisicoes_estoque")
        .select("id, status, setor")
        .eq("id", requisicao_id)
        .eq("company_id", companyId)
        .single();

      if (reqErr || !reqData) return notFound("Requisição");
      if (reqData.status === "CANCELADA" || reqData.status === "NEGADA") return badRequest("Requisição já processada");

      const { data: requestItems, error: requestItemsError } = await adminClient
        .from("requisicao_estoque_itens")
        .select("id, produto_id, quantidade_solicitada, status")
        .eq("requisicao_id", requisicao_id)
        .eq("company_id", companyId);
      if (requestItemsError) throw requestItemsError;

      const pendingItems = (requestItems || []).filter(
        (i: { status: string }) => i.status === "SOLICITADO"
      );

      if (pendingItems.length === 0) return badRequest("Nenhum item pendente para atender");

      let atendidos = 0;
      let semSaldo = 0;
      const semSaldoProdutos: string[] = [];
      const falhasInesperadas: string[] = [];

      for (const item of pendingItems) {
        const { data: prodData } = await adminClient
          .from("produtos")
          .select("nome_produto, unidade_compra")
          .eq("id", item.produto_id)
          .eq("company_id", companyId)
          .single();

        const productName = prodData?.nome_produto || item.produto_id.slice(0, 8);

        try {
          await attendItemAtomic(requisicao_id, item.id);
          atendidos++;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro ao atender item";
          if (message.includes("Saldo insuficiente")) {
            semSaldo++;
            semSaldoProdutos.push(productName);

            await adminClient
              .from("alertas_falta_estoque")
              .upsert({
                company_id: companyId,
                produto_id: item.produto_id,
                produto_nome: productName,
                quantidade_solicitada: item.quantidade_solicitada,
                unidade: prodData?.unidade_compra || "UN",
                saldo_no_momento: 0,
                requisicao_id,
                requisicao_item_id: item.id,
                setor_solicitante: reqData.setor || "",
                origem: "ATENDIMENTO_BULK_SEM_SALDO",
                status: "PENDENTE",
                created_by: userId,
              }, { onConflict: "requisicao_id,produto_id", ignoreDuplicates: false });

            continue;
          }

          falhasInesperadas.push(`${productName}: ${message.replace(/^\d{3}[^:]*:\s*/, "")}`);
        }
      }

      if (falhasInesperadas.length > 0) {
        return jsonRes({
          success: false,
          message: `Alguns itens foram processados, mas houve falhas inesperadas: ${falhasInesperadas.join(" | ")}`,
          atendidos,
          sem_saldo: semSaldo,
          request_id: requestId,
        });
      }

      await writeAudit(adminClient, companyId, userId, {
        p_source: "edge",
        p_module: "estoque",
        p_entity: "requisicoes_estoque",
        p_entity_id: requisicao_id,
        p_action: "REQUISICAO_ATENDIDA",
        p_before: { status: reqData.status },
        p_after: { itens_atendidos: atendidos, itens_sem_saldo: semSaldo },
      });

      let mensagem: string;
      if (semSaldo === 0) {
        mensagem = `${atendidos} item(ns) atendido(s). Saídas registradas no estoque.`;
      } else if (atendidos === 0) {
        mensagem = `Nenhum item pôde ser atendido. ${semSaldo} item(ns) sem saldo suficiente: ${semSaldoProdutos.join(", ")}.`;
      } else {
        mensagem = `${atendidos} item(ns) atendido(s). ${semSaldo} item(ns) sem saldo: ${semSaldoProdutos.join(", ")}. Alertas gerados para Compras.`;
      }

      await notifyIfRequisicaoEncerrada(requisicao_id, companyId, userId);

      return jsonRes({
        success: true,
        mensagem,
        atendidos,
        sem_saldo: semSaldo,
        request_id: requestId,
      });
    }

    // ========================
    // ACTION: negar requisição
    // ========================
    if (action === "negar") {
      const { requisicao_id, motivo_recusa } = body;
      if (!requisicao_id) return badRequest("requisicao_id obrigatório");

      const canNegar = await hasAnyPermission(adminClient, userId, [
        "estoque:requisicoes:approve",
        "estoque:requisicoes:close",
        "system:global:manage",
      ]);
      if (!canNegar) return forbidden("FORBIDDEN_RBAC", "Sem permissão para negar requisições");

      const { data: reqData, error: reqErr } = await adminClient
        .from("requisicoes_estoque")
        .select("id, status, requisicao_estoque_itens(status)")
        .eq("id", requisicao_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (reqErr) throw reqErr;
      if (!reqData) return notFound("Requisição");
      if (reqData.status === "CANCELADA") return badRequest("Requisição cancelada não pode ser alterada");
      const itensAtuais = (reqData.requisicao_estoque_itens ?? []) as { status: string }[];
      if (!itensAtuais.some((item) => item.status === "SOLICITADO")) return badRequest("Nenhum item pendente para negar");

      const now = new Date().toISOString();
      const motivoText = motivo_recusa?.trim() || "Requisição negada integralmente";

      // Mark all SOLICITADO items as RECUSADO
      const { error: rejectItemsError } = await adminClient
        .from("requisicao_estoque_itens")
        .update({
          status: "RECUSADO",
          recusado_por: userId,
          recusado_em: now,
          motivo_recusa: motivoText.slice(0, 500),
        })
        .eq("requisicao_id", requisicao_id)
        .eq("status", "SOLICITADO")
        .eq("company_id", companyId);
      if (rejectItemsError) throw rejectItemsError;

      // Negar recusa só o que falta: o que já foi entregue continua entregue e a
      // requisição fica parcialmente atendida. O status sai dos itens depois da
      // recusa, não da leitura acima — um atendimento concorrente entre as duas
      // seria apagado por um NEGADA calculado antes.
      const { data: statusAgregado, error: statusErr } = await supabaseUser.rpc("compute_requisicao_status_agregado", {
        p_requisicao_id: requisicao_id,
      });
      if (statusErr) throw statusErr;
      const statusFinal = (statusAgregado as string | null) || "NEGADA";

      // Tenant-scoped update
      const { data: negada, error: negErr } = await adminClient
        .from("requisicoes_estoque")
        .update({ status: statusFinal, updated_at: now })
        .eq("id", requisicao_id)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();

      if (negErr) throw negErr;
      if (!negada) return notFound("Requisição");

      await writeAudit(adminClient, companyId, userId, {
        p_source: "edge",
        p_module: "estoque",
        p_entity: "requisicoes_estoque",
        p_entity_id: requisicao_id,
        p_action: "REQUISICAO_NEGADA",
        p_before: { status: reqData.status },
        p_after: { status: statusFinal, motivo: motivoText },
      });

      await notifyIfRequisicaoEncerrada(requisicao_id, companyId, userId);

      return jsonRes({
        success: true,
        mensagem: statusFinal === "NEGADA" ? "Requisição negada." : "Itens pendentes recusados. A requisição ficou parcialmente atendida.",
        request_id: requestId,
      });
    }

    // ========================
    // ACTION: marcar_requisicao_visto — solicitante confirma ciência do resultado
    // ========================
    if (action === "marcar_requisicao_visto") {
      const { requisicao_id } = body;
      if (!requisicao_id) return badRequest("requisicao_id obrigatório");

      const { data: req } = await adminClient
        .from("requisicoes_estoque")
        .select("id, solicitante_user_id, confirmado_pelo_solicitante_em")
        .eq("id", requisicao_id)
        .eq("company_id", companyId)
        .single();
      if (!req) return notFound("Requisição");

      const isOwner = req.solicitante_user_id === userId;
      const isSuper = await hasAnyPermission(adminClient, userId, ["system:global:manage"]);
      if (!isOwner && !isSuper) return forbidden("FORBIDDEN", "Apenas o solicitante pode confirmar");

      const now = new Date().toISOString();

      if (!req.confirmado_pelo_solicitante_em) {
        await adminClient
          .from("requisicoes_estoque")
          .update({ confirmado_pelo_solicitante_em: now, confirmado_pelo_solicitante_por: userId })
          .eq("id", requisicao_id)
          .eq("company_id", companyId);
      }

      // Marca a notification como lida (RLS permite — owner é o próprio solicitante)
      await supabaseUser
        .from("notifications")
        .update({ read_at: now })
        .eq("entity_type", "requisicao_estoque")
        .eq("entity_id", requisicao_id)
        .eq("type", "REQUISICAO_ENCERRADA")
        .is("read_at", null);

      return jsonRes({ success: true, confirmado_em: now, request_id: requestId });
    }

    // ========================
    // ACTION: soft_delete_requisicao (P0-3)
    // ========================
    if (action === "soft_delete_requisicao") {
      const { requisicao_id } = body;
      if (!requisicao_id) return badRequest("requisicao_id obrigatório");

      // Only own pending OR with delete permission
      const { data: reqCheck } = await adminClient
        .from("requisicoes_estoque")
        .select("id, solicitante_user_id, status")
        .eq("id", requisicao_id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!reqCheck) return notFound("Requisição");

      const isOwn = reqCheck.solicitante_user_id === userId;
      const isPending = reqCheck.status === "SOLICITADA";

      if (isOwn && isPending) {
        // Owner can cancel own pending
      } else {
        const canDelete = await hasAnyPermission(adminClient, userId, [
          "estoque:requisicoes:delete",
          "estoque:requisicoes:manage",
          "system:global:manage",
        ]);
        if (!canDelete) return forbidden("FORBIDDEN_RBAC", "Sem permissão para cancelar esta requisição");
      }

      const { data: deleted, error: delErr } = await adminClient
        .from("requisicoes_estoque")
        .update({
          ativo: false,
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
          status: "CANCELADA",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requisicao_id)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();

      if (delErr) throw delErr;
      if (!deleted) return forbidden("FORBIDDEN_TENANT", "Requisição não pertence ao tenant");

      await writeAudit(adminClient, companyId, userId, {
        p_source: "edge",
        p_module: "estoque",
        p_entity: "requisicoes_estoque",
        p_entity_id: requisicao_id,
        p_action: "REQUISICAO_SOFT_DELETE",
        p_before: { status: reqCheck.status, ativo: true },
        p_after: { status: "CANCELADA", ativo: false, deleted_by: userId },
      });

      await clearRequisicaoAberta(adminClient, companyId, requisicao_id);

      return jsonRes({ success: true, mensagem: "Requisição cancelada.", request_id: requestId });
    }

    // ========================
    // ACTION: listar requisições
    // ========================
    if (action === "listar") {
      const pageSize = Number(body.limit) || 20;
      const offset = Number(body.offset) || 0;
      const bucket = body.bucket === "historico" ? "historico" : "pendentes";

      const ITEM_SELECT = "id, produto_id, quantidade_solicitada, quantidade_atendida, unidade, saldo_snapshot, status, motivo_recusa, recusado_por, recusado_em, atendido_por, atendido_em, produtos(nome_produto, unidade_medida, unidade_compra)";
      const REQ_SELECT = `id, setor, solicitante_user_id, status, observacao, created_at, atendido_por, atendido_em, ativo, confirmado_pelo_solicitante_em, requisicao_estoque_itens(${ITEM_SELECT})`;

      // Fase 1: IDs de requisições que ainda têm ao menos 1 item SOLICITADO (scoped by RLS/tenant).
      const { data: pendingRows, error: pendErr } = await supabaseUser
        .from("requisicao_estoque_itens")
        .select("requisicao_id")
        .eq("status", "SOLICITADO");
      if (pendErr) throw pendErr;

      const pendingIds = [...new Set((pendingRows ?? []).map((r: { requisicao_id: string }) => r.requisicao_id))];

      // Fase 2: filtra conforme bucket.
      if (bucket === "pendentes") {
        if (pendingIds.length === 0) {
          return jsonRes({ success: true, data: [], total: 0, request_id: requestId });
        }
        const { data, error, count } = await supabaseUser
          .from("requisicoes_estoque")
          .select(REQ_SELECT, { count: "exact" })
          .eq("ativo", true)
          .in("id", pendingIds)
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        return jsonRes({ success: true, data, total: count ?? (data?.length || 0), request_id: requestId });
      } else {
        // historico = (ativo=true AND id NOT IN pendingIds) OR (ativo=false AND status='CANCELADA')
        let query = supabaseUser
          .from("requisicoes_estoque")
          .select(REQ_SELECT, { count: "exact" })
          .order("created_at", { ascending: false });

        if (pendingIds.length > 0) {
          const idList = pendingIds.map((id: string) => `"${id}"`).join(",");
          query = query.or(`and(ativo.eq.true,id.not.in.(${idList})),and(ativo.eq.false,status.eq.CANCELADA)`);
        } else {
          query = query.or(`ativo.eq.true,and(ativo.eq.false,status.eq.CANCELADA)`);
        }

        const { data, error, count } = await query.range(offset, offset + pageSize - 1);
        if (error) throw error;
        return jsonRes({ success: true, data, total: count ?? (data?.length || 0), request_id: requestId });
      }
    }

    // ========================
    // ACTION: consultar saldo
    // ========================
    if (action === "saldo") {
      const produto_id = body.itens?.[0]?.produto_id;
      if (!produto_id) return badRequest("produto_id obrigatório");

      // Validate produto belongs to tenant
      const { data: prod } = await adminClient
        .from("produtos")
        .select("id")
        .eq("id", produto_id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!prod) return notFound("Produto");

      const { data: saldoData } = await supabaseUser.rpc("get_saldo_produto", { p_produto_id: produto_id });
      return jsonRes({ success: true, saldo: Number(saldoData) || 0, request_id: requestId });
    }

    return badRequest("Ação não reconhecida");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("requisicao-estoque error:", err);
    return jsonRes({ error: message, request_id: requestId }, 500);
  }
}));
