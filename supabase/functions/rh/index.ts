import { withRequestCors } from '../_shared/request-cors.ts';
import { companyHeaders, requestCompanyProfile } from "../_shared/company-scope.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = getCorsHeaders();

serve(withRequestCors(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { ...companyHeaders(req), Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResp({ error: "Unauthorized" }, 401);
    }
    const callerId = user.id;

    const adminClient = createClient(supabaseUrl, serviceKey, { global: { headers: companyHeaders(req) } });

    // ── Tenant resolution (fail-closed) ──
    const { data: profile, error: profileError } = await requestCompanyProfile(userClient);

    if (profileError || !profile?.company_id) {
      return jsonResp({ error: "COMPANY_ACCESS_DENIED" }, 403);
    }

    const PLACEHOLDER = "00000000-0000-0000-0000-000000000001";
    if (profile.company_id === PLACEHOLDER) {
      return jsonResp({ error: "Empresa não vinculada à conta." }, 403);
    }

    const companyId = profile.company_id;

    async function requirePerm(perm: string) {
      const { data } = await adminClient.rpc('has_permission', { _user_id: callerId, _permission: perm });
      if (!data) throw new Error(`403: Sem permissão (${perm})`);
    }

    const { action, ...params } = await req.json();

    // ===== CALCULAR BANCO DE HORAS =====
    if (action === "calcular_banco_horas") {
      await requirePerm('rh:banco-horas:reconcile');

      const { periodo } = params; // 'yyyy-MM'
      if (!periodo) {
        return jsonResp({ error: "Período obrigatório" }, 400);
      }

      // Get all active colaboradores — FILTERED BY TENANT
      const { data: colabs, error: colabsError } = await adminClient
        .from("rh_colaboradores")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "ativo");
      if (colabsError) throw colabsError;
      if (!colabs || colabs.length === 0) {
        return jsonResp({ message: "Nenhum colaborador ativo" });
      }

      const [year, month] = periodo.split("-").map(Number);
      const startDate = `${periodo}-01`;
      // Calculate last day of month without timezone issues
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${periodo}-${String(lastDay).padStart(2, '0')}`;

      const results = [];
      const rowsToPersist = [];

      for (const colab of colabs) {
        const { data: pontos, error: pontosError } = await adminClient
          .from("rh_ponto_registros")
          .select("*")
          .eq("company_id", companyId)
          .eq("colaborador_id", colab.id)
          .gte("data", startDate)
          .lte("data", endDate)
          .order("hora", { ascending: true });
        if (pontosError) throw pontosError;

        const registros = pontos || [];
        
        const byDate: Record<string, any[]> = {};
        for (const p of registros) {
          if (!byDate[p.data]) byDate[p.data] = [];
          byDate[p.data].push(p);
        }

        let totalMinTrabalhados = 0;
        let diasTrabalhados = 0;
        const atrasosTotalMin = 0;

        for (const [date, dayPontos] of Object.entries(byDate)) {
          const entradas = dayPontos.filter((p: any) => p.tipo === "ENTRADA");
          const saidas = dayPontos.filter((p: any) => p.tipo === "SAIDA");
          const inicioIntervalos = dayPontos.filter((p: any) => p.tipo === "INICIO_INTERVALO");
          const fimIntervalos = dayPontos.filter((p: any) => p.tipo === "FIM_INTERVALO");

          if (entradas.length > 0 && saidas.length > 0) {
            diasTrabalhados++;
            const entrada = new Date(entradas[0].hora);
            const saida = new Date(saidas[saidas.length - 1].hora);
            let minTrabalhados = (saida.getTime() - entrada.getTime()) / 60000;

            for (let i = 0; i < Math.min(inicioIntervalos.length, fimIntervalos.length); i++) {
              const iniInt = new Date(inicioIntervalos[i].hora);
              const fimInt = new Date(fimIntervalos[i].hora);
              minTrabalhados -= (fimInt.getTime() - iniInt.getTime()) / 60000;
            }

            totalMinTrabalhados += Math.max(0, minTrabalhados);
          }
        }

        const diasUteisMes = 22;
        const horasDiarias = colab.carga_horaria_semanal / 6;
        const horasEscaladas = diasUteisMes * horasDiarias;
        const horasTrabalhadas = totalMinTrabalhados / 60;
        const horasExtras = Math.max(0, horasTrabalhadas - horasEscaladas);
        const bancoSaldo = horasTrabalhadas - horasEscaladas;
        const faltas = Math.max(0, diasUteisMes - diasTrabalhados);

        rowsToPersist.push({
          colaborador_id: colab.id,
          horas_trabalhadas: Math.round(horasTrabalhadas * 10) / 10,
          horas_escaladas: Math.round(horasEscaladas * 10) / 10,
          horas_extras: Math.round(horasExtras * 10) / 10,
          banco_horas_saldo: Math.round(bancoSaldo * 10) / 10,
          atrasos_min: atrasosTotalMin,
          faltas,
          dias_trabalhados: diasTrabalhados,
        });

        results.push({
          colaborador: colab.nome,
          horas_trabalhadas: Math.round(horasTrabalhadas * 10) / 10,
          horas_extras: Math.round(horasExtras * 10) / 10,
          saldo: Math.round(bancoSaldo * 10) / 10,
          faltas,
        });
      }

      // Persistência e auditoria compartilham a mesma transação no banco.
      const { error: persistError } = await userClient.rpc("replace_rh_banco_horas_period_atomic", {
        p_periodo: periodo,
        p_rows: rowsToPersist,
      });
      if (persistError) throw persistError;

      return jsonResp({ success: true, results });
    }

    return jsonResp({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    const status = msg.startsWith("403:") ? 403 : 500;
    console.error("rh error:", e);
    return jsonResp({ error: msg.replace("403: ", "") }, status);
  }
}));

function jsonResp(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
