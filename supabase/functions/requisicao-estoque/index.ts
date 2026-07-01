import { getCorsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ─── Inline logic from stock-reversal.ts ───
export const ESTORNO_TYPES = new Set(["ENTRADA_ESTORNO", "SAIDA_ESTORNO"]);

export interface StockMovementReversalCandidate {
  tipo?: string | null;
  origem?: string | null;
  estorno_de_id?: string | null;
}

export function isEstornoMovement(movement: StockMovementReversalCandidate): boolean {
  return Boolean(
    movement.estorno_de_id ||
      movement.origem === "ESTORNO" ||
      (movement.tipo && ESTORNO_TYPES.has(movement.tipo))
  );
}

export function isOriginalEntradaForReversal(tipo: string): boolean {
  return tipo === "ENTRADA" || tipo === "AJUSTE" || tipo.startsWith("ENTRADA");
}

export function getReversalTipo(tipo: string): "SAIDA_ESTORNO" | "ENTRADA_ESTORNO" {
  return isOriginalEntradaForReversal(tipo) ? "SAIDA_ESTORNO" : "ENTRADA_ESTORNO";
}

let corsHeaders = getCorsHeaders();

interface ReqItem {
  produto_id: string;
  quantidade: number;
  unidade: string;
}

interface ReqBody {
  action: string;
  setor: string;
  observacao?: string;
  itens: ReqItem[];
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

/**
 * Check permission via the DB function has_permission().
 */
async function checkPermission(adminClient: ReturnType<typeof createClient>, userId: string, permissionKey: string): Promise<boolean> {
  const { data, error } = await adminClient.rpc("has_permission", {
    _user_id: userId,
    _permission: permissionKey,
  });
  if (error) return false;
  return !!data;
}

async function hasAnyPermission(adminClient: ReturnType<typeof createClient>, userId: string, keys: string[]): Promise<boolean> {
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
  userClient: ReturnType<typeof createClient>,
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
  try {
    const metadata = payload.p_metadata && typeof payload.p_metadata === 'object' && !Array.isArray(payload.p_metadata)
      ? { source: payload.p_source ?? 'edge', ...(payload.p_metadata as Record<string, unknown>) }
      : payload.p_metadata ?? (payload.p_source ? { source: payload.p_source } : null);

    await userClient.rpc('audit_log_write', {
      _module: payload.p_module,
      _action: payload.p_action,
      _entity_type: payload.p_entity,
      _entity_id: payload.p_entity_id,
      _before: toSerializableJson(payload.p_before),
      _after: toSerializableJson(payload.p_after),
      _metadata: toSerializableJson(metadata),
      _severity: 'info',
    });
  } catch (error) {
    console.error('Audit write failed (non-blocking):', error);
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
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

    const adminClient = createClient(supabaseUrl, serviceKey);

    // User-scoped client for RLS-bound inserts
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
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

      await writeAudit(supabaseUser, {
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

      // Tenant-scoped select
      const { data: mov, error: movErr } = await adminClient
        .from("movimentacoes_estoque")
        .select("id, produto_id, tipo, quantidade, custo_unitario, custo_total, data, observacao, status, origem, referencia_id, setor, source_module, reference_type, reference_id, estorno_de_id")
        .eq("id", movement_id)
        .eq("company_id", companyId)
        .single();

      if (movErr || !mov) return notFound("Movimentação");
      if (mov.status !== "ATIVO") return badRequest("Movimentação já está cancelada");
      if (isEstornoMovement(mov)) return badRequest("Movimentações de estorno não podem ser canceladas novamente.");

      // Prevent double cancellation (tenant-scoped)
      const { data: existingReversal } = await adminClient
        .from("movimentacoes_estoque")
        .select("id")
        .eq("estorno_de_id", movement_id)
        .eq("company_id", companyId)
        .eq("status", "ATIVO")
        .limit(1);

      if (existingReversal && existingReversal.length > 0) return conflict("Movimentação já cancelada. Estorno já existe.");

      // Block if linked to closed inventory (tenant-scoped)
      if (mov.origem === "INVENTARIO" && mov.referencia_id) {
        const { data: inv } = await adminClient
          .from("inventarios")
          .select("status")
          .eq("id", mov.referencia_id)
          .eq("company_id", companyId)
          .single();
        if (inv?.status === "FINALIZADO") return badRequest("Movimentação vinculada a inventário fechado não pode ser cancelada.");
      }

      // 1) Create reversal movement FIRST (before marking original as CANCELADO)
      //    The trg_validate_estorno trigger checks that the original is NOT already CANCELADO,
      //    so the reversal must be inserted while the original is still ATIVO.
      const isOriginalEntrada = isOriginalEntradaForReversal(mov.tipo);
      const reversalTipo = getReversalTipo(mov.tipo);

      const { error: reversalErr } = await adminClient
        .from("movimentacoes_estoque")
        .insert({
          produto_id: mov.produto_id,
          tipo: reversalTipo,
          direction: isOriginalEntrada ? "OUT" : "IN",
          quantidade: mov.quantidade,
          custo_unitario: mov.custo_unitario,
          custo_total: mov.custo_total,
          data: mov.data,
          origem: "ESTORNO",
          referencia_id: movement_id,
          observacao: `Estorno de ${mov.tipo} #${movement_id.slice(0, 8)} — ${justificativa}`,
          created_by: userId,
          status: "ATIVO",
          estorno_de_id: movement_id,
          setor: mov.setor || null,
          company_id: companyId,
        });
      if (reversalErr) throw reversalErr;

      // 2) Mark original as CANCELADO (after reversal is safely inserted)
      const { data: cancelled, error: cancelErr } = await adminClient
        .from("movimentacoes_estoque")
        .update({
          status: "CANCELADO",
          cancelado_por: userId,
          cancelado_em: new Date().toISOString(),
          justificativa_cancelamento: justificativa,
        })
        .eq("id", movement_id)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();

      if (cancelErr) throw cancelErr;
      if (!cancelled) return forbidden("FORBIDDEN_TENANT", "Movimentação não pertence ao tenant");

      // 3) Cascade cancel to salmon module if source_module = 'salmon'
      if (mov.source_module === "salmon" && mov.reference_type && mov.reference_id) {
        const refType = mov.reference_type as string;
        const refId = mov.reference_id as string;

        if (refType === "SALMON_ENTRY" && refId && !refId.endsWith("_ESTORNO")) {
          const { error: salmonErr } = await adminClient
            .from("salmon_entries")
            .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
            .eq("id", refId)
            .eq("company_id", companyId);

          if (salmonErr) console.error("Cascade cancel salmon entry failed:", salmonErr);
        } else if (refType === "SALMON_MANIPULATION" && refId && !refId.endsWith("_ESTORNO")) {
          const { error: salmonErr } = await adminClient
            .from("salmon_manipulations")
            .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
            .eq("id", refId)
            .eq("company_id", companyId);

          if (salmonErr) console.error("Cascade cancel salmon manipulation failed:", salmonErr);
        }
      }

      // 4) Audit
      await writeAudit(supabaseUser, {
        p_source: "edge",
        p_module: "estoque",
        p_entity: "movimentacoes_estoque",
        p_entity_id: movement_id,
        p_action: "CANCEL_MOVEMENT",
        p_before: { tipo: mov.tipo, quantidade: mov.quantidade, custo_total: mov.custo_total, status: "ATIVO" },
        p_after: { status: "CANCELADO", justificativa, estorno_tipo: reversalTipo, cascade_salmon: mov.source_module === "salmon" },
      });

      return jsonRes({ success: true, mensagem: "Movimentação cancelada e estorno criado.", request_id: requestId });
    }

    // ========================
    // ACTION: criar requisição
    // ========================
    if (action === "criar") {
      const { setor, observacao, itens } = body;
      if (!setor || !itens || itens.length === 0) return badRequest("Setor e itens são obrigatórios");

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

      const itensComEstoque = resultados.filter((r) => r.tem_estoque);
      const itensSemEstoque = resultados.filter((r) => !r.tem_estoque);

      let requisicao_id: string | null = null;

      {
        const { data: reqData, error: reqError } = await supabaseUser
          .from("requisicoes_estoque")
          .insert({
            setor,
            solicitante_user_id: userId,
            status: "SOLICITADA",
            observacao: observacao || "",
            company_id: companyId,
          })
          .select("id")
          .single();

        if (reqError) throw reqError;
        requisicao_id = reqData.id;

        const reqItens = resultados.map((r) => {
          const item = itens.find((i) => i.produto_id === r.produto_id)!;
          return {
            requisicao_id: reqData.id,
            produto_id: r.produto_id,
            quantidade_solicitada: item.quantidade,
            unidade: validatedUnits.get(r.produto_id)!,
            saldo_snapshot: r.saldo,
          };
        });

        const { error: itensError } = await supabaseUser.from("requisicao_estoque_itens").insert(reqItens);
        if (itensError) throw itensError;

        await writeAudit(supabaseUser, {
          p_source: "edge",
          p_module: "estoque",
          p_entity: "requisicoes_estoque",
          p_entity_id: reqData.id,
          p_action: "REQUISICAO_CRIADA",
          p_after: {
            setor,
            itens: resultados.map((r) => ({ produto_id: r.produto_id, quantidade: r.solicitado, saldo: r.saldo, tem_estoque: r.tem_estoque })),
          },
        });
      }

      // ── Generate shortage ALERTS (not purchase orders) for out-of-stock items ──
      if (itensSemEstoque.length > 0) {
        const prodIds = itensSemEstoque.map(r => r.produto_id);
        const { data: prodRows } = await adminClient
          .from("produtos")
          .select("id, nome_produto, unidade_compra")
          .in("id", prodIds)
          .eq("company_id", companyId);

        const prodMap = new Map(
          (prodRows || []).map((p: { id: string; nome_produto: string; unidade_compra: string | null }) => [p.id, p])
        );

        // Fetch requisicao item IDs for linking
        const { data: reqItemRows } = await adminClient
          .from("requisicao_estoque_itens")
          .select("id, produto_id")
          .eq("requisicao_id", requisicao_id)
          .in("produto_id", prodIds);

        const reqItemMap = new Map(
          (reqItemRows || []).map((ri: { id: string; produto_id: string }) => [ri.produto_id, ri.id])
        );

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
        await writeAudit(supabaseUser, {
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
    async function syncRequisicaoStatus(reqId: string, cId: string, uId: string, userClient: ReturnType<typeof createClient>) {
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
    async function notifyIfRequisicaoEncerrada(reqId: string, cId: string, actorId: string) {
      const { data: req } = await adminClient
        .from("requisicoes_estoque")
        .select("id, status, setor, solicitante_user_id")
        .eq("id", reqId)
        .eq("company_id", cId)
        .single();

      if (!req || !req.solicitante_user_id) return;
      const FINAL = ["ATENDIDA", "PARCIALMENTE_ATENDIDA", "NEGADA"];
      if (!FINAL.includes(req.status)) return;

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

      // ON CONFLICT DO NOTHING via UNIQUE parcial — garante idempotência em chamadas paralelas
      await adminClient.from("notifications").upsert({
        recipient_user_id: req.solicitante_user_id,
        type: "REQUISICAO_ENCERRADA",
        module: "estoque",
        title,
        message,
        entity_type: "requisicao_estoque",
        entity_id: reqId,
        link_path: "/?module=estoque&sub=requisicoes",
        created_by: actorId,
        metadata: { status: req.status, setor: req.setor },
      }, { onConflict: "entity_id", ignoreDuplicates: true });
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
        .eq("company_id", companyId);

      if (updateErr) throw updateErr;

      await syncRequisicaoStatus(requisicao_id, companyId, userId, supabaseUser);

      await writeAudit(supabaseUser, {
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
        .select("id, status, setor, requisicao_estoque_itens(id, produto_id, quantidade_solicitada, status)")
        .eq("id", requisicao_id)
        .eq("company_id", companyId)
        .single();

      if (reqErr || !reqData) return notFound("Requisição");
      if (reqData.status === "CANCELADA" || reqData.status === "NEGADA") return badRequest("Requisição já processada");

      const pendingItems = reqData.requisicao_estoque_itens.filter(
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

      await writeAudit(supabaseUser, {
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

      const now = new Date().toISOString();
      const motivoText = motivo_recusa?.trim() || "Requisição negada integralmente";

      // Mark all SOLICITADO items as RECUSADO
      await adminClient
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

      // Tenant-scoped update
      const { data: negada, error: negErr } = await adminClient
        .from("requisicoes_estoque")
        .update({ status: "NEGADA", updated_at: now })
        .eq("id", requisicao_id)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();

      if (negErr) throw negErr;
      if (!negada) return notFound("Requisição");

      await writeAudit(supabaseUser, {
        p_source: "edge",
        p_module: "estoque",
        p_entity: "requisicoes_estoque",
        p_entity_id: requisicao_id,
        p_action: "REQUISICAO_NEGADA",
        p_before: { status: "SOLICITADA" },
        p_after: { status: "NEGADA", motivo: motivoText },
      });

      await notifyIfRequisicaoEncerrada(requisicao_id, companyId, userId);

      return jsonRes({ success: true, mensagem: "Requisição negada.", request_id: requestId });
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

      await writeAudit(supabaseUser, {
        p_source: "edge",
        p_module: "estoque",
        p_entity: "requisicoes_estoque",
        p_entity_id: requisicao_id,
        p_action: "REQUISICAO_SOFT_DELETE",
        p_before: { status: reqCheck.status, ativo: true },
        p_after: { status: "CANCELADA", ativo: false, deleted_by: userId },
      });

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
});
