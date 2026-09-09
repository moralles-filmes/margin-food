import { companyHeaders, requireRequestCompany } from "../_shared/company-scope.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

let corsHeaders = getCorsHeaders();

// ─── Permission mapping per action ───
const ACTION_PERMISSIONS: Record<string, string> = {
  listar: "compras:lista:view",
  detalhe: "compras:lista:view",
  criar: "compras:lista:create",
  editar: "compras:lista:edit",
  ignorar_item: "compras:lista:edit",
  converter: "compras:checklist:approve",
};

// Legacy keys that also grant access
const LEGACY_PERM_MAP: Record<string, string[]> = {
  "purchases:read": ["compras:lista:view"],
  "purchases:create": ["compras:lista:create"],
  "purchases:edit": ["compras:lista:edit"],
  "purchases:approve": ["compras:checklist:approve"],
};

const PLACEHOLDER_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

async function checkPermission(
  supabaseAdmin: any,
  userId: string,
  requiredPerm: string
): Promise<boolean> {
  const { data: hasPerm } = await supabaseAdmin.rpc("has_permission", {
    _user_id: userId,
    _permission: requiredPerm,
  });
  if (hasPerm) return true;

  for (const [legacyKey, granularKeys] of Object.entries(LEGACY_PERM_MAP)) {
    if (granularKeys.includes(requiredPerm)) {
      const { data: hasLegacy } = await supabaseAdmin.rpc("has_permission", {
        _user_id: userId,
        _permission: legacyKey,
      });
      if (hasLegacy) return true;
    }
  }

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const userRoles = (roles || []).map((r: any) => r.role);
  if (userRoles.includes("admin")) return true;

  return false;
}

/** Resolve company_id from user profile — fail-closed */


serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { ...companyHeaders(req), Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { global: { headers: companyHeaders(req) } });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Tenant resolution (fail-closed) ───
    const companyId = await requireRequestCompany(supabaseUser);

    let body: any = {};
    try { body = await req.json(); } catch { /* no body is ok for some actions */ }
    const { action } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "Ação obrigatória" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Permission check ───
    const requiredPerm = ACTION_PERMISSIONS[action];
    if (!requiredPerm) {
      return new Response(JSON.stringify({ error: "Ação não reconhecida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasAccess = await checkPermission(supabaseUser, user.id, requiredPerm);
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: `Sem permissão (${requiredPerm})` }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== LISTAR ==========
    if (action === "listar") {
      const { data, error } = await supabaseUser
        .from("purchase_requisitions")
        .select("*, purchase_requisition_items(*)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Fetch profiles only within current tenant
      const userIds = [...new Set((data || []).map((d: any) => d.created_by).filter(Boolean))];
      let profiles: any[] = [];
      if (userIds.length > 0) {
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("id, nome, email")
          .in("id", userIds);
        profiles = p || [];
      }

      const enriched = (data || []).map((r: any) => ({
        ...r,
        responsavel: profiles.find((p: any) => p.id === r.created_by)?.nome || "—",
        total_estimado: r.purchase_requisition_items
          ?.filter((i: any) => !i.is_ignored)
          .reduce((s: number, i: any) => s + (i.subtotal || 0), 0) || 0,
      }));

      return new Response(JSON.stringify({ success: true, data: enriched }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== DETALHE ==========
    if (action === "detalhe") {
      const { id } = body;
      if (!id) return new Response(JSON.stringify({ error: "id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const { data: req_data, error } = await supabaseUser
        .from("purchase_requisitions")
        .select("*, purchase_requisition_items(*, produtos(nome_produto, unidade_medida, custo_ultima_compra, categoria))")
        .eq("id", id)
        .single();

      if (error) throw error;

      const { data: audit } = await supabaseUser
        .from("purchase_requisition_audit")
        .select("*")
        .eq("requisition_id", id)
        .order("created_at", { ascending: false })
        .limit(50);

      let responsavel = "—";
      if (req_data.created_by) {
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("nome")
          .eq("id", req_data.created_by)
          .eq("company_id", companyId)
          .single();
        if (p) responsavel = p.nome;
      }

      const auditUserIds = [...new Set((audit || []).map((a: any) => a.user_id).filter(Boolean))];
      let auditProfiles: any[] = [];
      if (auditUserIds.length > 0) {
        const { data: ap } = await supabaseAdmin
          .from("profiles")
          .select("id, nome")
          .eq("company_id", companyId)
          .in("id", auditUserIds);
        auditProfiles = ap || [];
      }

      return new Response(JSON.stringify({
        success: true,
        data: { ...req_data, responsavel },
        audit: (audit || []).map((a: any) => ({
          ...a,
          user_nome: auditProfiles.find((p: any) => p.id === a.user_id)?.nome || "—",
        })),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ========== CRIAR ==========
    if (action === "criar") {
      const { tipo, observacao, itens } = body;
      if (!itens || itens.length === 0) {
        return new Response(JSON.stringify({ error: "Itens obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const totalEstimado = itens.reduce((s: number, i: any) => s + ((i.quantidade_escolhida || i.quantidade_sugerida || 0) * (i.preco_referencia || 0)), 0);

      const { data: reqData, error: reqError } = await supabaseUser
        .from("purchase_requisitions")
        .insert({
          tipo: tipo || "manual",
          observacao: observacao || "",
          total_estimado: totalEstimado,
          created_by: user.id,
        })
        .select("id, codigo")
        .single();

      if (reqError) throw reqError;

      const reqItems = itens.map((i: any) => ({
        requisition_id: reqData.id,
        produto_id: i.produto_id || null,
        produto_nome: i.produto_nome || "",
        quantidade_sugerida: i.quantidade_sugerida || 0,
        quantidade_escolhida: i.quantidade_escolhida || i.quantidade_sugerida || 0,
        unidade: i.unidade || "UN",
        preco_referencia: i.preco_referencia || 0,
        subtotal: (i.quantidade_escolhida || i.quantidade_sugerida || 0) * (i.preco_referencia || 0),
        prioridade: i.prioridade || "media",
        motivo: i.motivo || "",
      }));

      const { error: itemsError } = await supabaseUser
        .from("purchase_requisition_items")
        .insert(reqItems);

      if (itemsError) throw itemsError;

      // Audit with explicit company_id
      await supabaseAdmin.from("purchase_requisition_audit").insert({
        requisition_id: reqData.id,
        acao: "CRIADA",
        valor_novo: JSON.stringify({ tipo, itens: itens.length }),
        user_id: user.id,
        company_id: companyId,
      });

      return new Response(JSON.stringify({ success: true, id: reqData.id, codigo: reqData.codigo }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== EDITAR ==========
    if (action === "editar") {
      const { id, observacao, status: newStatus, itens } = body;
      if (!id) return new Response(JSON.stringify({ error: "id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const { data: current } = await supabaseUser
        .from("purchase_requisitions").select("status").eq("id", id).single();

      if (!current) {
        return new Response(JSON.stringify({ error: "Requisição não encontrada" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (current.status === "CONVERTIDA") {
        return new Response(JSON.stringify({ error: "Requisição já convertida. Não pode ser editada." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updates: any = { updated_by: user.id };
      if (observacao !== undefined) updates.observacao = observacao;
      if (newStatus) updates.status = newStatus;

      const { error: updateError } = await supabaseUser
        .from("purchase_requisitions").update(updates).eq("id", id);
      if (updateError) throw updateError;

      if (itens && Array.isArray(itens)) {
        for (const item of itens) {
          if (item.id) {
            const itemUpdates: any = {};
            if (item.quantidade_escolhida !== undefined) itemUpdates.quantidade_escolhida = item.quantidade_escolhida;
            if (item.preco_referencia !== undefined) itemUpdates.preco_referencia = item.preco_referencia;
            if (item.quantidade_escolhida !== undefined && item.preco_referencia !== undefined) {
              itemUpdates.subtotal = item.quantidade_escolhida * item.preco_referencia;
            }
            await supabaseUser.from("purchase_requisition_items").update(itemUpdates).eq("id", item.id);
          }
        }

        const { data: allItems } = await supabaseUser
          .from("purchase_requisition_items")
          .select("subtotal, is_ignored")
          .eq("requisition_id", id);

        const total = (allItems || []).filter((i: any) => !i.is_ignored).reduce((s: number, i: any) => s + (i.subtotal || 0), 0);
        await supabaseUser.from("purchase_requisitions").update({ total_estimado: total }).eq("id", id);
      }

      // Audit with explicit company_id
      await supabaseAdmin.from("purchase_requisition_audit").insert({
        requisition_id: id,
        acao: "EDITADA",
        campo: newStatus ? "status" : "itens",
        valor_anterior: current.status,
        valor_novo: newStatus || "itens atualizados",
        user_id: user.id,
        company_id: companyId,
      });

      return new Response(JSON.stringify({ success: true, mensagem: "Requisição atualizada." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== IGNORAR ITEM ==========
    if (action === "ignorar_item") {
      const { item_id, ignored, reason } = body;
      if (!item_id) return new Response(JSON.stringify({ error: "item_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const updateData: any = {
        is_ignored: !!ignored,
        ignored_by: ignored ? user.id : null,
        ignored_at: ignored ? new Date().toISOString() : null,
        ignored_reason: ignored ? (reason || null) : null,
      };

      const { error } = await supabaseUser
        .from("purchase_requisition_items").update(updateData).eq("id", item_id);
      if (error) throw error;

      const { data: item } = await supabaseUser
        .from("purchase_requisition_items").select("requisition_id").eq("id", item_id).single();

      if (item) {
        const { data: allItems } = await supabaseUser
          .from("purchase_requisition_items")
          .select("subtotal, is_ignored")
          .eq("requisition_id", item.requisition_id);

        const total = (allItems || []).filter((i: any) => !i.is_ignored).reduce((s: number, i: any) => s + (i.subtotal || 0), 0);
        await supabaseUser.from("purchase_requisitions").update({ total_estimado: total }).eq("id", item.requisition_id);

        // Audit with explicit company_id
        await supabaseAdmin.from("purchase_requisition_audit").insert({
          requisition_id: item.requisition_id,
          acao: ignored ? "ITEM_IGNORADO" : "ITEM_RESTAURADO",
          campo: "item",
          valor_novo: JSON.stringify({ item_id, reason }),
          user_id: user.id,
          company_id: companyId,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== CONVERTER EM PEDIDO ==========
    if (action === "converter") {
      const { id } = body;
      if (!id) return new Response(JSON.stringify({ error: "id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      await supabaseUser.from("purchase_requisitions")
        .update({ status: "CONVERTIDA", updated_by: user.id }).eq("id", id);

      // Audit with explicit company_id
      await supabaseAdmin.from("purchase_requisition_audit").insert({
        requisition_id: id,
        acao: "CONVERTIDA_EM_PEDIDO",
        user_id: user.id,
        company_id: companyId,
      });

      return new Response(JSON.stringify({ success: true, mensagem: "Requisição convertida em pedido." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação não reconhecida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("purchase-requisitions error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
