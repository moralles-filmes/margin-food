import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const PLACEHOLDER_COMPANY = '00000000-0000-0000-0000-000000000001'

// ═══ SINGLE SOURCE OF TRUTH: CMV outflow & inflow types ═══
const CMV_OUTFLOW_TYPES = ['SAIDA', 'BAIXA_PERDA', 'SAIDA_CONSUMO', 'SAIDA_REQUISICAO', 'SAIDA_PERDA', 'AJUSTE_INVENTARIO_NEGATIVO'] as const
const CMV_INFLOW_TYPES = ['ENTRADA', 'AJUSTE_INVENTARIO_POSITIVO'] as const

/**
 * BR-safe date formatter: returns YYYY-MM-DD for "today minus N days"
 * anchored at noon UTC to prevent day-flip near midnight BRT (UTC-3).
 */
function localDateStr(daysAgo = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  const anchored = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0))
  return anchored.toISOString().split('T')[0]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    const adminClient = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    // ═══ TENANT RESOLUTION (once per request) ═══
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.company_id) {
      return json({ error: 'Tenant não resolvido' }, 400)
    }
    if (profile.company_id === PLACEHOLDER_COMPANY) {
      return json({ error: 'Tenant placeholder não permitido' }, 400)
    }
    const companyId = profile.company_id

    const { action, ...payload } = await req.json()

    // ═══ PERMISSION HELPERS ═══
    async function requirePermission(perm: string): Promise<Response | null> {
      const { data } = await adminClient.rpc('has_permission', { _user_id: user!.id, _permission: perm })
      if (!data) return json({ error: `Sem permissão (${perm})` }, 403)
      return null
    }

    // ═══ ACTIONS ═══
    if (action === 'calcular_cmv') {
      const deny = await requirePermission('cmv:categoria:view')
      if (deny) return deny
      return await calcularCmv(adminClient, companyId, payload)
    }
    if (action === 'get_faturamento') {
      const deny = await requirePermission('cmv:categoria:view')
      if (deny) return deny
      return await getFaturamento(adminClient, companyId, payload)
    }
    if (action === 'save_faturamento') {
      const deny = await requirePermission('financeiro:fechamento:create')
      if (deny) return deny
      return await saveFaturamento(adminClient, companyId, user.id, payload)
    }
    if (action === 'get_metas') {
      const deny = await requirePermission('cmv:semanal:view')
      if (deny) return deny
      return await getMetas(adminClient, companyId, payload)
    }
    if (action === 'save_meta') {
      const deny = await requirePermission('cmv:semanal:edit')
      if (deny) return deny
      return await saveMeta(adminClient, companyId, user.id, payload)
    }
    if (action === 'get_ranking_itens') {
      const deny = await requirePermission('cmv:top-itens:view')
      if (deny) return deny
      return await getRankingItens(adminClient, companyId, payload)
    }
    if (action === 'recalcular_precos_produto') {
      const deny = await requirePermission('estoque:cadastros:manage')
      if (deny) return deny
      return await recalcularPrecosProduto(adminClient, companyId, payload)
    }
    if (action === 'recalcular_todos_precos') {
      const deny = await requirePermission('estoque:cadastros:manage')
      if (deny) return deny
      return await recalcularTodosPrecos(adminClient, companyId)
    }
    if (action === 'get_historico_precos') {
      const deny = await requirePermission('cmv:top-itens:view')
      if (deny) return deny
      return await getHistoricoPrecos(adminClient, companyId, payload)
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: e.message || 'Internal error' }, 500)
  }
})

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ═══ HELPER: Resolve salmon product IDs for this tenant ═══
async function getSalmonProductIds(client: any, companyId: string): Promise<Set<string>> {
  const { data } = await client
    .from('produtos')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_salmon_raw_linked', true)
    .eq('ativo', true)

  return new Set((data || []).map((p: any) => p.id))
}

// ═══ HELPER: Apply escopo filter to a set of movements ═══
function filterByEscopo(
  movs: any[],
  escopo: string | undefined,
  salmonIds: Set<string>,
  cmvProdIds: Set<string>,
): any[] {
  let filtered = movs.filter((m: any) => cmvProdIds.has(m.produto_id))

  if (escopo === 'geral') {
    filtered = filtered.filter((m: any) => !salmonIds.has(m.produto_id))
  } else if (escopo === 'salmao') {
    filtered = filtered.filter((m: any) => salmonIds.has(m.produto_id))
  }

  return filtered
}

// ═══ CALCULAR CMV ═══
async function calcularCmv(client: any, companyId: string, payload: any) {
  const { data_inicio, data_fim, metodo, escopo, categoria, inventario_inicial_id, inventario_final_id, setor } = payload

  // Resolve salmon product IDs once
  const salmonIds = await getSalmonProductIds(client, companyId)

  // Q1: Load CMV-eligible products (tenant-filtered)
  const { data: produtos } = await client
    .from('produtos')
    .select('id, nome_produto, categoria, conta_no_cmv')
    .eq('company_id', companyId)
    .eq('conta_no_cmv', true)

  const prodMap: Record<string, any> = {}
  const cmvProdIds = new Set<string>()
  ;(produtos || []).forEach((p: any) => { prodMap[p.id] = p; cmvProdIds.add(p.id) })

  // Q2: Faturamento do período (tenant-filtered)
  const { data: fatRows } = await client
    .from('financeiro_fechamento_caixa')
    .select('faturamento_bruto')
    .eq('company_id', companyId)
    .gte('data', data_inicio)
    .lte('data', data_fim)
  const faturamento = (fatRows || []).reduce((s: number, r: any) => s + Number(r.faturamento_bruto), 0)

  // Q3: Movimentações do estoque geral no período (tenant-filtered)
  const { data: movs } = await client
    .from('movimentacoes_estoque')
    .select('tipo, quantidade, custo_unitario, custo_total, produto_id, setor')
    .eq('company_id', companyId)
    .gte('data', data_inicio)
    .lte('data', data_fim)
    .eq('status', 'ATIVO')

  // Filter to CMV-eligible products + apply escopo
  const movsArr = filterByEscopo(movs || [], escopo, salmonIds, cmvProdIds)

  // Apply setor filter if provided
  const filteredMovs = setor ? movsArr.filter((m: any) => m.setor === setor) : movsArr

  // Saídas (escopo-aware)
  const saidasGeral = filteredMovs.filter((m: any) =>
    (CMV_OUTFLOW_TYPES as readonly string[]).includes(m.tipo)
  )
  const custoConsumidoGeral = saidasGeral.reduce((s: number, m: any) => s + Math.abs(Number(m.custo_total)), 0)

  // Entradas (for inventário method)
  const entradasGeral = filteredMovs.filter((m: any) =>
    (CMV_INFLOW_TYPES as readonly string[]).includes(m.tipo)
  )
  const totalEntradasGeral = entradasGeral.reduce((s: number, m: any) => s + Math.abs(Number(m.custo_total)), 0)

  // ═══ CMV SALMÃO REAL ═══
  const allCmvMovs = (movs || []).filter((m: any) => cmvProdIds.has(m.produto_id))
  const salmonSaidas = allCmvMovs.filter((m: any) =>
    salmonIds.has(m.produto_id) &&
    (CMV_OUTFLOW_TYPES as readonly string[]).includes(m.tipo)
  )
  const custoConsumidoSalmao = salmonSaidas.reduce((s: number, m: any) => s + Math.abs(Number(m.custo_total)), 0)

  let cmvGeralPct = 0
  let cmvSalmaoPct = 0
  let cmvTotalPct = 0
  let custoTotal = 0
  let metodoUsado = metodo || 'ledger'
  let eiValor = 0, efValor = 0

  if (metodoUsado === 'inventario' && inventario_inicial_id && inventario_final_id) {
    const { data: eiItens } = await client
      .from('inventario_itens')
      .select('contagem_fisica, custo_snapshot, produto_id')
      .eq('company_id', companyId)
      .eq('inventario_id', inventario_inicial_id)

    const { data: efItens } = await client
      .from('inventario_itens')
      .select('contagem_fisica, custo_snapshot, produto_id')
      .eq('company_id', companyId)
      .eq('inventario_id', inventario_final_id)

    const filterInvByEscopo = (items: any[]) => {
      let filtered = items.filter((i: any) => cmvProdIds.has(i.produto_id))
      if (escopo === 'geral') filtered = filtered.filter((i: any) => !salmonIds.has(i.produto_id))
      else if (escopo === 'salmao') filtered = filtered.filter((i: any) => salmonIds.has(i.produto_id))
      return filtered
    }

    eiValor = filterInvByEscopo(eiItens || []).reduce((s: number, i: any) =>
      s + (Number(i.contagem_fisica) || 0) * Number(i.custo_snapshot), 0)
    efValor = filterInvByEscopo(efItens || []).reduce((s: number, i: any) =>
      s + (Number(i.contagem_fisica) || 0) * Number(i.custo_snapshot), 0)

    custoTotal = eiValor + totalEntradasGeral - efValor
    cmvTotalPct = faturamento > 0 ? (custoTotal / faturamento) * 100 : 0
    cmvGeralPct = cmvTotalPct
    cmvSalmaoPct = faturamento > 0 ? (custoConsumidoSalmao / faturamento) * 100 : 0
  } else {
    custoTotal = custoConsumidoGeral
    cmvGeralPct = faturamento > 0 ? (custoConsumidoGeral / faturamento) * 100 : 0
    cmvSalmaoPct = faturamento > 0 ? (custoConsumidoSalmao / faturamento) * 100 : 0
    cmvTotalPct = cmvGeralPct
  }

  const margemBruta = 100 - cmvTotalPct
  const impactoSalmao = custoConsumidoGeral > 0 ? (custoConsumidoSalmao / (custoConsumidoGeral + (escopo === 'geral' ? custoConsumidoSalmao : 0))) * 100 : 0

  // CMV por categoria
  const categoriaCustos: Record<string, { custo: number; qtd: number }> = {}
  saidasGeral.forEach((m: any) => {
    const prod = prodMap[m.produto_id]
    if (!prod) return
    const cat = prod.categoria || 'Outros'
    if (!categoriaCustos[cat]) categoriaCustos[cat] = { custo: 0, qtd: 0 }
    categoriaCustos[cat].custo += Math.abs(Number(m.custo_total))
    categoriaCustos[cat].qtd += Math.abs(Number(m.quantidade))
  })

  const cmvPorCategoria = Object.entries(categoriaCustos)
    .map(([categoria, v]) => ({
      categoria,
      custo: Math.round(v.custo * 100) / 100,
      quantidade: Math.round(v.qtd * 100) / 100,
      percentCmv: custoTotal > 0 ? Math.round((v.custo / custoTotal) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.custo - a.custo)

  // CMV por setor
  const setorCustos: Record<string, { custo: number; qtd: number }> = {}
  const allSaidas = movsArr.filter((m: any) =>
    (CMV_OUTFLOW_TYPES as readonly string[]).includes(m.tipo)
  )
  allSaidas.forEach((m: any) => {
    const s = m.setor || 'Sem setor'
    if (!setorCustos[s]) setorCustos[s] = { custo: 0, qtd: 0 }
    setorCustos[s].custo += Math.abs(Number(m.custo_total))
    setorCustos[s].qtd += Math.abs(Number(m.quantidade))
  })
  const allSaidasTotal = allSaidas.reduce((s: number, m: any) => s + Math.abs(Number(m.custo_total)), 0)
  const cmvPorSetor = Object.entries(setorCustos)
    .map(([setorNome, v]) => ({
      setor: setorNome,
      custo: Math.round(v.custo * 100) / 100,
      quantidade: Math.round(v.qtd * 100) / 100,
      percentCmv: allSaidasTotal > 0 ? Math.round((v.custo / allSaidasTotal) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.custo - a.custo)

  // CMV semanal (W1-W5)
  const cmvSemanal = []
  for (let w = 1; w <= 5; w++) {
    const wMovs = filteredMovs.filter((m: any) => {
      const d = new Date(m.data || data_inicio)
      const day = d.getDate ? d.getDate() : 1
      const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : day <= 28 ? 4 : 5
      return week === w
    })
    const wSaidas = wMovs.filter((m: any) =>
      (CMV_OUTFLOW_TYPES as readonly string[]).includes(m.tipo)
    )
    const wCusto = wSaidas.reduce((s: number, m: any) => s + Math.abs(Number(m.custo_total)), 0)
    cmvSemanal.push({ semana: `W${w}`, custo: Math.round(wCusto * 100) / 100 })
  }

  const result = {
    faturamento: Math.round(faturamento * 100) / 100,
    custoConsumidoGeral: Math.round(custoConsumidoGeral * 100) / 100,
    custoConsumidoSalmao: Math.round(custoConsumidoSalmao * 100) / 100,
    custoTotal: Math.round(custoTotal * 100) / 100,
    cmvGeralPct: Math.round(cmvGeralPct * 100) / 100,
    cmvSalmaoPct: Math.round(cmvSalmaoPct * 100) / 100,
    cmvTotalPct: Math.round(cmvTotalPct * 100) / 100,
    margemBruta: Math.round(margemBruta * 100) / 100,
    impactoSalmao: Math.round(impactoSalmao * 100) / 100,
    metodoUsado,
    eiValor: Math.round(eiValor * 100) / 100,
    efValor: Math.round(efValor * 100) / 100,
    totalEntradas: Math.round(totalEntradasGeral * 100) / 100,
    cmvPorCategoria,
    cmvPorSetor,
    cmvSemanal,
    escopo: escopo || 'tudo',
  }

  return json(result)
}

// ═══ FATURAMENTO ═══
async function getFaturamento(client: any, companyId: string, payload: any) {
  const { data_inicio, data_fim } = payload
  const { data, error } = await client
    .from('financeiro_fechamento_caixa')
    .select('*')
    .eq('company_id', companyId)
    .gte('data', data_inicio)
    .lte('data', data_fim)
    .order('data', { ascending: true })
  if (error) throw error
  return json({ faturamento: data || [] })
}

// ═══ SAVE FATURAMENTO (UPSERT) ═══
async function saveFaturamento(client: any, companyId: string, userId: string, payload: any) {
  const { data: dateStr, valor, observacao } = payload
  if (!dateStr || valor === undefined) throw new Error('data e valor obrigatórios')
  if (Number(valor) < 0) throw new Error('Faturamento não pode ser negativo')

  const { error } = await client
    .from('financeiro_fechamento_caixa')
    .upsert(
      {
        company_id: companyId,
        data: dateStr,
        faturamento_bruto: Number(valor),
        observacao: observacao || '',
        created_by: userId,
      },
      { onConflict: 'company_id,data' }
    )
  if (error) throw error

  return json({ ok: true })
}

// ═══ METAS ═══
async function getMetas(client: any, companyId: string, payload: any) {
  const { mes_ano } = payload
  let query = client.from('metas_cmv').select('*').eq('company_id', companyId)
  if (mes_ano) query = query.eq('mes_ano', mes_ano)
  const { data, error } = await query.order('mes_ano', { ascending: false }).limit(12)
  if (error) throw error
  return json({ metas: data || [] })
}

// ═══ SAVE META (UPSERT) ═══
async function saveMeta(client: any, companyId: string, userId: string, payload: any) {
  const { mes_ano, meta_cmv_geral, meta_cmv_salmao, meta_cmv_total, alerta_amarelo_percent, alerta_vermelho_percent } = payload
  if (!mes_ano) throw new Error('mes_ano obrigatório')

  const { error } = await client
    .from('metas_cmv')
    .upsert(
      {
        company_id: companyId,
        mes_ano,
        meta_cmv_geral: Number(meta_cmv_geral) || 35,
        meta_cmv_salmao: Number(meta_cmv_salmao) || 15,
        meta_cmv_total: Number(meta_cmv_total) || 35,
        alerta_amarelo_percent: Number(alerta_amarelo_percent) || 3,
        alerta_vermelho_percent: Number(alerta_vermelho_percent) || 6,
        created_by: userId,
      },
      { onConflict: 'company_id,mes_ano' }
    )
  if (error) throw error

  return json({ ok: true })
}

// ═══ RANKING ITENS (with pagination) ═══
async function getRankingItens(client: any, companyId: string, payload: any) {
  const { data_inicio, data_fim, limit: lim, offset: off, escopo } = payload
  const maxItems = Math.min(lim || 20, 50)
  const offset = off || 0

  // Resolve salmon IDs for escopo filtering
  const salmonIds = escopo && escopo !== 'tudo' ? await getSalmonProductIds(client, companyId) : new Set<string>()

  const { data: movs } = await client
    .from('movimentacoes_estoque')
    .select('produto_id, tipo, quantidade, custo_unitario, custo_total')
    .eq('company_id', companyId)
    .gte('data', data_inicio)
    .lte('data', data_fim)
    .eq('status', 'ATIVO')
    .in('tipo', [...CMV_OUTFLOW_TYPES])

  const { data: produtos } = await client
    .from('produtos')
    .select('id, nome_produto, categoria, custo_padrao, conta_no_cmv')
    .eq('company_id', companyId)
    .eq('conta_no_cmv', true)

  const prodMap: Record<string, any> = {}
  ;(produtos || []).forEach((p: any) => { prodMap[p.id] = p })

  const cmvProdIds = new Set((produtos || []).map((p: any) => p.id))

  // Apply escopo filter
  let filteredMovs = (movs || []).filter((m: any) => cmvProdIds.has(m.produto_id))
  if (escopo === 'geral') {
    filteredMovs = filteredMovs.filter((m: any) => !salmonIds.has(m.produto_id))
  } else if (escopo === 'salmao') {
    filteredMovs = filteredMovs.filter((m: any) => salmonIds.has(m.produto_id))
  }

  const itemCustos: Record<string, { custo: number; qtd: number; custoMedio: number; count: number }> = {}
  filteredMovs.forEach((m: any) => {
    if (!itemCustos[m.produto_id]) itemCustos[m.produto_id] = { custo: 0, qtd: 0, custoMedio: 0, count: 0 }
    itemCustos[m.produto_id].custo += Math.abs(Number(m.custo_total))
    itemCustos[m.produto_id].qtd += Math.abs(Number(m.quantidade))
    itemCustos[m.produto_id].custoMedio += Number(m.custo_unitario)
    itemCustos[m.produto_id].count += 1
  })

  const totalCusto = Object.values(itemCustos).reduce((s, v) => s + v.custo, 0)

  const allRanking = Object.entries(itemCustos)
    .map(([prodId, v]) => {
      const prod = prodMap[prodId]
      return {
        produtoId: prodId,
        nome: prod?.nome_produto || 'Desconhecido',
        categoria: prod?.categoria || 'Outros',
        custoConsumido: Math.round(v.custo * 100) / 100,
        percentCmv: totalCusto > 0 ? Math.round((v.custo / totalCusto) * 10000) / 100 : 0,
        quantidade: Math.round(v.qtd * 100) / 100,
        custoMedioSnapshot: v.count > 0 ? Math.round((v.custoMedio / v.count) * 100) / 100 : 0,
      }
    })
    .sort((a, b) => b.custoConsumido - a.custoConsumido)

  const totalCount = allRanking.length
  const ranking = allRanking.slice(offset, offset + maxItems)
  const nextOffset = (offset + maxItems) < totalCount ? offset + maxItems : null

  return json({ ranking, next_offset: nextOffset, total_count: totalCount })
}

// ═══ RECALCULAR PREÇOS PRODUTO ═══
async function recalcularPrecosProduto(client: any, companyId: string, payload: any) {
  const { produto_id } = payload
  if (!produto_id) throw new Error('produto_id obrigatório')

  const { data: prod } = await client
    .from('produtos')
    .select('fator_conversao_padrao, unidade_compra, unidade_medida')
    .eq('id', produto_id)
    .eq('company_id', companyId)
    .single()

  if (!prod) throw new Error('Produto não encontrado ou não pertence ao tenant')
  const fator = Number(prod.fator_conversao_padrao) || 1

  const since = localDateStr(30)

  const { data: entradas30d } = await client
    .from('movimentacoes_estoque')
    .select('quantidade, custo_unitario, custo_total, data, observacao')
    .eq('company_id', companyId)
    .eq('produto_id', produto_id)
    .in('tipo', ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_INICIAL'])
    .eq('status', 'ATIVO')
    .gte('data', since)
    .order('data', { ascending: false })

  const entradasArr = entradas30d || []

  const totalQtd = entradasArr.reduce((s: number, e: any) => s + Math.abs(Number(e.quantidade)), 0)
  const totalCusto = entradasArr.reduce((s: number, e: any) => s + Math.abs(Number(e.custo_total)), 0)
  const custoMedio30d = totalQtd > 0 ? totalCusto / totalQtd : 0

  const custoUltimaCompra = entradasArr.length > 0 ? Number(entradasArr[0].custo_unitario) : 0
  const lastDate = entradasArr.length > 0 ? entradasArr[0].data : null
  const lastObs = entradasArr.length > 0 ? (entradasArr[0].observacao || '') : ''
  const supplierMatch = lastObs.match(/[Ff]ornecedor:\s*(.+)/)
  const lastSupplier = supplierMatch ? supplierMatch[1].trim() : null

  const lastCostBase = custoUltimaCompra
  const lastCostPurchase = lastCostBase * fator
  const avg30Base = custoMedio30d
  const avg30Purchase = avg30Base * fator
  const avg30Variation = lastCostBase > 0 && avg30Base > 0
    ? ((avg30Base - lastCostBase) / lastCostBase) * 100
    : 0

  const { error } = await client
    .from('produtos')
    .update({
      custo_medio_30d: Math.round(avg30Base * 10000) / 10000,
      custo_ultima_compra: Math.round(lastCostBase * 10000) / 10000,
      last_cost_base_unit: Math.round(lastCostBase * 10000) / 10000,
      last_cost_purchase_unit: Math.round(lastCostPurchase * 10000) / 10000,
      last_purchase_date: lastDate,
      last_supplier: lastSupplier,
      avg30_cost_base_unit: Math.round(avg30Base * 10000) / 10000,
      avg30_cost_purchase_unit: Math.round(avg30Purchase * 10000) / 10000,
      avg30_variation_percent: Math.round(avg30Variation * 100) / 100,
    })
    .eq('id', produto_id)
    .eq('company_id', companyId)

  if (error) throw error

  return json({
    produto_id,
    custo_medio_30d: Math.round(avg30Base * 100) / 100,
    custo_ultima_compra: Math.round(lastCostBase * 100) / 100,
    last_cost_base_unit: Math.round(lastCostBase * 100) / 100,
    last_cost_purchase_unit: Math.round(lastCostPurchase * 100) / 100,
    avg30_cost_base_unit: Math.round(avg30Base * 100) / 100,
    avg30_variation_percent: Math.round(avg30Variation * 100) / 100,
    entradas_consideradas: entradasArr.length,
  })
}

// ═══ RECALCULAR TODOS OS PREÇOS (tenant-scoped) ═══
async function recalcularTodosPrecos(client: any, companyId: string) {
  const { data: produtos } = await client
    .from('produtos')
    .select('id')
    .eq('company_id', companyId)
    .eq('ativo', true)

  const results: any[] = []

  for (const p of (produtos || [])) {
    try {
      const res = await recalcularPrecosProduto(client, companyId, { produto_id: p.id })
      const body = await res.json()
      results.push(body)
    } catch (e: any) {
      results.push({ produto_id: p.id, error: e.message })
    }
  }

  return json({ ok: true, total: results.length, results })
}

// ═══ HISTÓRICO DE PREÇOS ═══
async function getHistoricoPrecos(client: any, companyId: string, payload: any) {
  const { produto_id, limit: lim } = payload
  if (!produto_id) throw new Error('produto_id obrigatório')

  const { data: entradas } = await client
    .from('movimentacoes_estoque')
    .select('data, quantidade, custo_unitario, custo_total, origem')
    .eq('company_id', companyId)
    .eq('produto_id', produto_id)
    .in('tipo', ['ENTRADA', 'ENTRADA_COMPRA', 'ENTRADA_INICIAL'])
    .eq('status', 'ATIVO')
    .order('data', { ascending: false })
    .limit(lim || 20)

  return json({ historico: entradas || [] })
}

// ═══ SIMULADOR DE COMPRA GERAL (optimized with RPC) ═══
async function simularCompraGeral(client: any, companyId: string, payload: any) {
  const {
    semanas_meta = 2,
    metodo_preco = 'custo_medio_30d',
    categoria,
    apenas_ruptura = false,
    semanas_consumo = 4,
  } = payload

  // Q1: Load eligible products (tenant-filtered)
  let prodQuery = client.from('produtos').select('*').eq('company_id', companyId).eq('ativo', true).eq('conta_no_cmv', true)
  if (categoria) prodQuery = prodQuery.eq('categoria', categoria)
  const { data: produtos } = await prodQuery
  const prodArr = produtos || []
  const prodIds = prodArr.map((p: any) => p.id)

  if (prodIds.length === 0) {
    return json({ items: [], resumo: { totalEstimado: 0, itensRuptura: 0, itensSaemRuptura: 0, coberturaMediaAtual: 0, coberturaMediaProj: 0, totalItens: 0, itensParados: 0, top10Impacto: [] } })
  }

  // Compute window for consumption (BR-safe)
  const sinceStr = localDateStr(semanas_consumo * 7)

  // ═══ P3-B: Use RPC for aggregated consumption ═══
  const tiposSaida = [...CMV_OUTFLOW_TYPES]
  const { data: consumoAgg } = await client.rpc('get_consumo_por_produto', {
    p_company_id: companyId,
    p_since: sinceStr,
    p_tipos: tiposSaida,
    p_produtos: prodIds,
  })

  const consumoMap: Record<string, { totalQtd: number; mediaDiaria: number; ultimaMov: string | null }> = {}
  ;(consumoAgg || []).forEach((r: any) => {
    consumoMap[r.produto_id] = {
      totalQtd: Number(r.consumo_total),
      mediaDiaria: Number(r.media_diaria),
      ultimaMov: r.ultima_mov,
    }
  })

  // Q2: Stock balance — use RPC-like approach: only fetch for relevant products
  // We still need the full ledger for balance, but scoped to prodIds
  const { data: allMovs } = await client
    .from('movimentacoes_estoque')
    .select('produto_id, tipo, quantidade')
    .eq('company_id', companyId)
    .eq('status', 'ATIVO')
    .in('produto_id', prodIds)

  const saldoMap: Record<string, number> = {}
  ;(allMovs || []).forEach((m: any) => {
    const t = m.tipo as string
    if (t === 'ENTRADA_ESTORNO' || t === 'SAIDA_ESTORNO') return
    if (!saldoMap[m.produto_id]) saldoMap[m.produto_id] = 0
    if (t.startsWith('ENTRADA') || t === 'AJUSTE' || t.includes('DEVOLUCAO')) {
      saldoMap[m.produto_id] += Math.abs(Number(m.quantidade))
    } else {
      saldoMap[m.produto_id] -= Math.abs(Number(m.quantidade))
    }
  })

  // Build simulation items
  const now = new Date()
  const items = prodArr.map((p: any) => {
    const consumo = consumoMap[p.id] || { totalQtd: 0, mediaDiaria: 0, ultimaMov: null }
    const consumoMedioSemanal = semanas_consumo > 0 ? consumo.totalQtd / semanas_consumo : 0
    const estoqueAtual = Math.max(0, saldoMap[p.id] || 0)
    const coberturaSemanas = consumoMedioSemanal > 0 ? estoqueAtual / consumoMedioSemanal : estoqueAtual > 0 ? 99 : 0

    let status = 'ok'
    if (estoqueAtual <= 0 || estoqueAtual < Number(p.estoque_minimo)) status = 'ruptura'
    else if (estoqueAtual < Number(p.estoque_ideal)) status = 'atencao'

    const qtdIdeal = consumoMedioSemanal * semanas_meta
    const qtdSugerida = Math.max(0, qtdIdeal - estoqueAtual)

    let precoUnit = 0
    if (metodo_preco === 'custo_ultima_compra') precoUnit = Number(p.custo_ultima_compra) || Number(p.custo_padrao) || 0
    else precoUnit = Number(p.custo_medio_30d) || Number(p.custo_padrao) || 0

    const subtotal = qtdSugerida * precoUnit
    const novaCoberturaProj = consumoMedioSemanal > 0 ? (estoqueAtual + qtdSugerida) / consumoMedioSemanal : 99

    const lastMov = consumo.ultimaMov
    const diasSemMov = lastMov ? Math.floor((now.getTime() - new Date(lastMov).getTime()) / 86400000) : 999
    const itemParado = diasSemMov > 30

    return {
      produtoId: p.id,
      nome: p.nome_produto,
      categoria: p.categoria,
      unidadeBase: p.unidade_medida,
      estoqueAtual: Math.round(estoqueAtual * 100) / 100,
      estoqueMinimo: Number(p.estoque_minimo),
      estoqueIdeal: Number(p.estoque_ideal),
      consumoMedioSemanal: Math.round(consumoMedioSemanal * 100) / 100,
      coberturaSemanas: Math.round(coberturaSemanas * 10) / 10,
      status,
      qtdSugerida: Math.round(qtdSugerida * 100) / 100,
      precoUnitario: Math.round(precoUnit * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      novaCoberturaProj: Math.round(novaCoberturaProj * 10) / 10,
      itemParado,
      diasSemMov,
    }
  })

  const filtered = apenas_ruptura ? items.filter((i: any) => i.status === 'ruptura') : items

  const totalEstimado = filtered.reduce((s: number, i: any) => s + i.subtotal, 0)
  const itensRuptura = filtered.filter((i: any) => i.status === 'ruptura').length
  const itensSaemRuptura = filtered.filter((i: any) => i.status === 'ruptura' && i.qtdSugerida > 0).length
  const coberturaMediaAtual = filtered.length > 0 ? filtered.reduce((s: number, i: any) => s + i.coberturaSemanas, 0) / filtered.length : 0
  const coberturaMediaProj = filtered.length > 0 ? filtered.reduce((s: number, i: any) => s + i.novaCoberturaProj, 0) / filtered.length : 0
  const top10Impacto = [...filtered].sort((a: any, b: any) => b.subtotal - a.subtotal).slice(0, 10)
  const itensParados = filtered.filter((i: any) => i.itemParado).length

  return json({
    items: filtered.sort((a: any, b: any) => {
      const order = { ruptura: 0, atencao: 1, ok: 2 }
      return (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2)
    }),
    resumo: {
      totalEstimado: Math.round(totalEstimado * 100) / 100,
      itensRuptura,
      itensSaemRuptura,
      coberturaMediaAtual: Math.round(coberturaMediaAtual * 10) / 10,
      coberturaMediaProj: Math.round(coberturaMediaProj * 10) / 10,
      totalItens: filtered.length,
      itensParados,
      top10Impacto,
    },
  })
}
