import { getCorsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2'

let corsHeaders = getCorsHeaders();// ─── TENANT RESOLUTION (FAIL-CLOSED) ───
async function resolveTenantOrThrow(adminClient: any, userId: string): Promise<string> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('company_id')
    .eq('id', userId)
    .single()
  if (error || !data?.company_id) {
    throw new Error('403: Tenant não encontrado para o usuário. Acesso negado.')
  }
  return data.company_id
}

// ─── REQUEST ID ───
function generateRequestId(): string {
  return crypto.randomUUID()
}

// ─── STRUCTURED LOG ───
function structuredLog(data: Record<string, any>) {
  console.log(JSON.stringify(data))
}

// ─── AUDIT HELPER (via userClient RPC) ───
async function writeAudit(
  userClient: any,
  module: string, action: string, entityType: string,
  entityId: string | null, before: any, after: any, metadata: any
) {
  try {
    await userClient.rpc('audit_log_write', {
      _module: module,
      _action: action,
      _entity_type: entityType,
      _entity_id: entityId,
      _before: before ? JSON.parse(JSON.stringify(before)) : null,
      _after: after ? JSON.parse(JSON.stringify(after)) : null,
      _metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
    })
  } catch (e: any) {
    console.error('Audit write failed (non-blocking):', e.message)
  }
}

serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = generateRequestId()
  const startTime = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    const adminClient = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized', request_id: requestId } }, 401)

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized', request_id: requestId } }, 401)

    // ─── RESOLVE TENANT (FAIL-CLOSED) ───
    const companyId = await resolveTenantOrThrow(adminClient, user.id)

    const { action, ...payload } = await req.json()

    // ─── RBAC helper ───
    const TIPO_SUBTAB: Record<string, string> = {
      'PRE_PREPARO': 'pre-preparos',
      'ITEM_PRONTO': 'itens-prontos',
      'PRODUTO_FINAL': 'produtos-finais',
    }

    async function requirePerm(perm: string) {
      const { data } = await adminClient.rpc('has_permission', { _user_id: user!.id, _permission: perm })
      if (!data) rbacForbidden(`Sem permissão (${perm})`)
    }

    async function requireAnyPerm(perms: string[]) {
      const { data } = await adminClient.rpc('has_any_permission', { _user_id: user!.id, _permissions: perms })
      if (!data) rbacForbidden('Sem permissão para esta ação')
    }

    async function getSubtabFromComponente(id: string): Promise<string> {
      const { data } = await adminClient.from('ficha_componentes')
        .select('tipo').eq('id', id).eq('company_id', companyId).single()
      return TIPO_SUBTAB[data?.tipo] || 'pre-preparos'
    }

    // Audit context helper
    const auditMeta = (extra?: Record<string, any>) => ({
      request_id: requestId,
      duration_ms: Date.now() - startTime,
      ip: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown',
      ...extra,
    })

    // ─── ROUTE ACTIONS ───

    if (action === 'listar_componentes') {
      await requireAnyPerm([
        'ficha:pre-preparos:view', 'ficha:itens-prontos:view', 'ficha:produtos-finais:view',
        'ficha:analise:view', 'ficha:markup:view', 'system:global:manage',
      ])
      const result = await listarComponentes(adminClient, companyId, payload)
      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'get_componente_detalhe') {
      const subtab = await getSubtabFromComponente(payload.id)
      await requirePerm(`ficha:${subtab}:view`)
      const result = await getComponenteDetalhe(adminClient, companyId, payload)
      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, entity_id: payload.id, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'calcular_custo_componente') {
      await requireAnyPerm([
        'ficha:pre-preparos:view', 'ficha:itens-prontos:view', 'ficha:produtos-finais:view',
        'ficha:markup:view', 'system:global:manage',
      ])
      const result = await calcularCustoComponente(adminClient, companyId, payload)
      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'calcular_custo_arvore') {
      await requireAnyPerm([
        'ficha:analise:view', 'ficha:markup:view', 'system:global:manage',
      ])
      const result = await calcularCustoArvore(adminClient, companyId, payload)
      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }

    // CRUD componentes
    if (action === 'salvar_componente') {
      const tipo = payload.tipo || (payload.id ? (await adminClient.from('ficha_componentes').select('tipo').eq('id', payload.id).eq('company_id', companyId).single()).data?.tipo : 'PRE_PREPARO')
      const subtab = TIPO_SUBTAB[tipo] || 'pre-preparos'
      await requirePerm(`ficha:${subtab}:${payload.id ? 'edit' : 'create'}`)

      // Capture before state for audit
      let beforeData: any = null
      if (payload.id) {
        const { data } = await adminClient.from('ficha_componentes').select('*').eq('id', payload.id).eq('company_id', companyId).maybeSingle()
        beforeData = data
      }

      const result = await salvarComponente(adminClient, companyId, user.id, payload)
      const resultBody = await result.clone().json()

      await writeAudit(userClient, 'ficha_tecnica', payload.id ? 'UPDATE' : 'CREATE', 'ficha_componentes',
        payload.id || resultBody?.id, beforeData, resultBody, auditMeta({ tipo }))

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, entity_id: payload.id || resultBody?.id, is_update: !!payload.id, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'salvar_componente_itens') {
      const subtab = await getSubtabFromComponente(payload.componente_pai_id)
      await requirePerm(`ficha:${subtab}:edit`)
      const result = await salvarComponenteItens(userClient, companyId, payload)

      await writeAudit(userClient, 'ficha_tecnica', 'UPDATE_ITENS', 'ficha_componente_itens',
        payload.componente_pai_id, null, { itens_count: payload.itens?.length || 0 }, auditMeta())

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, entity_id: payload.componente_pai_id, itens_count: payload.itens?.length || 0, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'deletar_componente') {
      const subtab = await getSubtabFromComponente(payload.id)
      await requirePerm(`ficha:${subtab}:delete`)

      // Capture before state
      const { data: beforeData } = await adminClient.from('ficha_componentes').select('id,nome,tipo,custo_unitario_calculado').eq('id', payload.id).eq('company_id', companyId).maybeSingle()

      const result = await deletarComponente(adminClient, companyId, user.id, payload)

      await writeAudit(userClient, 'ficha_tecnica', 'SOFT_DELETE', 'ficha_componentes',
        payload.id, beforeData, { deleted: true }, auditMeta())

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, entity_id: payload.id, duration_ms: Date.now() - startTime })
      return result
    }

    // Canais
    if (action === 'listar_canais') {
      await requirePerm('ficha:canais:view')
      const result = await listarCanais(adminClient, companyId)
      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'salvar_canal') {
      await requirePerm('ficha:canais:manage')

      let beforeData: any = null
      if (payload.id) {
        const { data } = await adminClient.from('canais_venda').select('*').eq('id', payload.id).eq('company_id', companyId).maybeSingle()
        beforeData = data
      }

      const result = await salvarCanal(adminClient, companyId, payload)
      const resultBody = await result.clone().json()

      await writeAudit(userClient, 'ficha_tecnica', payload.id ? 'UPDATE' : 'CREATE', 'canais_venda',
        payload.id || resultBody?.id, beforeData, resultBody, auditMeta())

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, entity_id: payload.id, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'deletar_canal') {
      await requirePerm('ficha:canais:manage')

      const { data: beforeData } = await adminClient.from('canais_venda').select('id,nome').eq('id', payload.id).eq('company_id', companyId).maybeSingle()

      const result = await deletarCanal(adminClient, companyId, user.id, payload)

      await writeAudit(userClient, 'ficha_tecnica', 'SOFT_DELETE', 'canais_venda',
        payload.id, beforeData, { deleted: true }, auditMeta())

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, entity_id: payload.id, duration_ms: Date.now() - startTime })
      return result
    }

    // Precificação / Markup
    if (action === 'salvar_precificacao') {
      await requirePerm('ficha:markup:manage')
      const result = await salvarPrecificacao(adminClient, companyId, payload)

      await writeAudit(userClient, 'ficha_tecnica', 'UPDATE', 'precificacao_canal',
        payload.componente_id, null, { precos_count: payload.precos?.length || 0 }, auditMeta())

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, entity_id: payload.componente_id, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'get_precificacao') {
      await requirePerm('ficha:markup:view')
      const result = await getPrecificacao(adminClient, companyId, payload)
      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'recalcular_todos_custos') {
      await requirePerm('ficha:markup:manage')
      const result = await recalcularTodosCustos(adminClient, companyId)

      await writeAudit(userClient, 'ficha_tecnica', 'RECALCULATE_ALL', 'ficha_componentes',
        null, null, null, auditMeta({ severity: 'WARN' }))

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }

    // Simulação
    if (action === 'simular_cenario') {
      await requirePerm('ficha:analise:simulate')
      const result = await simularCenario(adminClient, companyId, payload)
      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'salvar_cenario') {
      await requirePerm('ficha:analise:simulate')
      const result = await salvarCenario(adminClient, companyId, user.id, payload)
      const resultBody = await result.clone().json()

      await writeAudit(userClient, 'ficha_tecnica', 'CREATE', 'cenarios_simulacao',
        resultBody?.id, null, { nome: payload.nome, componente_id: payload.componente_id }, auditMeta())

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }

    // Salmão reference price
    if (action === 'get_preco_referencia_salmao') {
      await requirePerm('ficha:analise:view')
      const result = await getPrecoReferenciaSalmao(adminClient, companyId)
      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'set_preco_referencia_salmao') {
      await requirePerm('ficha:markup:manage')

      const { data: beforeData } = await adminClient.from('config_precificacao').select('preco_referencia_salmao_manual').eq('company_id', companyId).maybeSingle()

      const result = await setPrecoReferenciaSalmao(adminClient, companyId, user.id, payload)

      await writeAudit(userClient, 'ficha_tecnica', 'UPDATE', 'config_precificacao',
        null, { preco_manual: beforeData?.preco_referencia_salmao_manual }, { preco_manual: payload.preco_manual }, auditMeta())

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }
    if (action === 'sync_preco_salmao_auto') {
      await requirePerm('ficha:markup:manage')
      const result = await syncPrecoSalmaoAuto(adminClient, companyId, user.id, payload)

      await writeAudit(userClient, 'ficha_tecnica', 'SYNC_AUTO', 'config_precificacao',
        null, null, { preco_kg_limpo: payload.preco_kg_limpo }, auditMeta())

      structuredLog({ request_id: requestId, action, company_id: companyId, user_id: user.id, status: 200, duration_ms: Date.now() - startTime })
      return result
    }

    return json({ error: { code: 'BAD_REQUEST', message: 'Unknown action', request_id: requestId } }, 400)
  } catch (e: any) {
    const msg = e.message || 'Internal error'
    let status = 500
    let code = 'INTERNAL_ERROR'

    if (msg.startsWith('403RBAC:')) { status = 403; code = 'FORBIDDEN_RBAC' }
    else if (msg.startsWith('403:')) { status = 403; code = 'FORBIDDEN_TENANT' }
    else if (msg.startsWith('404:')) { status = 404; code = 'NOT_FOUND' }
    else if (msg.startsWith('400:')) { status = 400; code = 'BAD_REQUEST' }
    else if (msg.startsWith('409:')) { status = 409; code = 'CONFLICT' }

    structuredLog({ request_id: requestId, status, error: msg, duration_ms: Date.now() - startTime })

    const cleanMsg = msg.replace(/^(403RBAC|403|404|400|409):\s*/, '')
    return json({ error: { code, message: cleanMsg, request_id: requestId } }, status)
  }
})

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// ─── STANDARDIZED ERROR HELPERS ───
// READ endpoints: entity not found in tenant → 404
function tenantNotFound(entity: string): never {
  throw new Error(`404: ${entity} não encontrado.`)
}

// WRITE endpoints: entity doesn't belong to tenant → 403
function tenantForbidden(entity: string): never {
  throw new Error(`403: ${entity} não pertence ao seu tenant.`)
}

// RBAC: user lacks permission → 403 with distinct code
function rbacForbidden(msg: string): never {
  throw new Error(`403RBAC: ${msg}`)
}

function badRequest(msg: string): never {
  throw new Error(`400: ${msg}`)
}

function conflict(msg: string): never {
  throw new Error(`409: ${msg}`)
}

// ═══════════════════════════════════════════════════════════════
// CALCULAR CUSTO (recursivo, com proteção circular + batch N+1)
// ═══════════════════════════════════════════════════════════════

async function calcularCustoComponenteInterno(
  client: any,
  companyId: string,
  componenteId: string,
  visited: Set<string> = new Set(),
  compCache: Map<string, any> = new Map(),
  prodCache: Map<string, any> = new Map(),
): Promise<{ custoTotal: number; custoUnitario: number; detalhes: any[]; custoSalmao: number; salmaoPercent: number }> {
  if (visited.has(componenteId)) {
    throw new Error(`Dependência circular detectada no componente ${componenteId}`)
  }
  visited.add(componenteId)

  let comp = compCache.get(componenteId)
  if (!comp) {
    const { data } = await client.from('ficha_componentes').select('*')
      .eq('id', componenteId).eq('company_id', companyId).eq('ativo', true).is('deleted_at', null).single()
    if (!data) tenantNotFound('Componente')
    comp = data
    compCache.set(componenteId, comp)
  }

  const { data: itens } = await client.from('ficha_componente_itens').select('*')
    .eq('componente_pai_id', componenteId).eq('company_id', companyId).order('ordem')

  const produtoIds = (itens || []).filter((i: any) => i.produto_id).map((i: any) => i.produto_id)
  if (produtoIds.length > 0) {
    const uncachedIds = produtoIds.filter((id: string) => !prodCache.has(id))
    if (uncachedIds.length > 0) {
      const { data: prods } = await client.from('produtos')
        .select('id, nome_produto, custo_ultima_compra, custo_padrao, unidade_medida')
        .in('id', uncachedIds).eq('company_id', companyId)
      for (const p of (prods || [])) {
        prodCache.set(p.id, p)
      }
    }
  }

  const detalhes: any[] = []
  let custoTotal = 0
  let custoSalmao = 0

  for (const item of (itens || [])) {
    let custoItem = 0
    let nomeItem = ''
    const isSalmao = item.origem === 'MODULO_SALMAO'

    if (isSalmao) {
      const salmonPrice = await getSalmonReferencePrice(client, companyId)
      const custoKg = salmonPrice.preco > 0 ? salmonPrice.preco : Number(item.custo_snapshot)
      custoItem = Number(item.quantidade) * custoKg
      nomeItem = '🐟 Salmão (módulo exclusivo)'
      custoSalmao += custoItem
    } else if (item.produto_id) {
      const prod = prodCache.get(item.produto_id)
      if (prod) {
        const custoBase = Number(prod.custo_ultima_compra) || Number(prod.custo_padrao) || 0
        custoItem = item.quantidade * custoBase
        nomeItem = prod.nome_produto
      }
    } else if (item.componente_filho_id) {
      const sub = await calcularCustoComponenteInterno(
        client, companyId, item.componente_filho_id, new Set(visited), compCache, prodCache
      )
      custoItem = item.quantidade * (sub.custoUnitarioRaw ?? sub.custoUnitario)
      custoSalmao += sub.custoSalmao || 0
      const subComp = compCache.get(item.componente_filho_id)
      nomeItem = subComp?.nome || 'Componente'
    }

    custoTotal += custoItem
    detalhes.push({
      itemId: item.id, nome: nomeItem,
      quantidade: Number(item.quantidade), unidade: item.unidade,
      custoUnitario: custoItem / (Number(item.quantidade) || 1),
      custoTotal: Math.round(custoItem * 100) / 100,
      percentual: 0,
      produtoId: item.produto_id, componenteFilhoId: item.componente_filho_id,
      isSalmao, origem: item.origem || 'ESTOQUE_GERAL',
      unidadeOriginal: item.unidade_original || '',
      quantidadeOriginal: Number(item.quantidade_original) || 0,
    })
  }

  custoTotal += Number(comp.custo_indireto) || 0
  detalhes.forEach(d => {
    d.percentual = custoTotal > 0 ? Math.round((d.custoTotal / custoTotal) * 10000) / 100 : 0
  })

  const rendimento = Number(comp.rendimento) || 1
  const perda = Number(comp.perda_estimada_percent) || 0
  const rendimentoLiquido = rendimento * (1 - perda / 100)
  const custoUnitario = rendimentoLiquido > 0 ? custoTotal / rendimentoLiquido : custoTotal
  const salmaoPercent = custoTotal > 0 ? (custoSalmao / custoTotal) * 100 : 0

  return {
    custoTotal: Math.round(custoTotal * 100) / 100,
    custoUnitario: Math.round(custoUnitario * 100) / 100,
    custoUnitarioRaw: custoUnitario,
    custoSalmao: Math.round(custoSalmao * 100) / 100,
    salmaoPercent: Math.round(salmaoPercent * 100) / 100,
    detalhes,
  }
}

async function calcularCustoComponente(client: any, companyId: string, payload: any) {
  const { componente_id } = payload
  if (!componente_id) throw new Error('componente_id obrigatório')

  const result = await calcularCustoComponenteInterno(client, companyId, componente_id)

  await client.from('ficha_componentes').update({
    custo_total_calculado: result.custoTotal,
    custo_unitario_calculado: result.custoUnitario,
    // updated_at handled by trg_set_updated_at trigger
  }).eq('id', componente_id).eq('company_id', companyId)

  return json(result)
}

async function calcularCustoArvore(client: any, companyId: string, payload: any) {
  const { componente_id } = payload
  if (!componente_id) throw new Error('componente_id obrigatório')

  const result = await calcularCustoComponenteInterno(client, companyId, componente_id)

  const { data: comp } = await client.from('ficha_componentes').select('*')
    .eq('id', componente_id).eq('company_id', companyId).single()

  const rendimento = Number(comp?.rendimento) || 1
  const perda = Number(comp?.perda_estimada_percent) || 0
  const rendimentoLiquido = rendimento * (1 - perda / 100)

  return json({
    ...result,
    rendimento,
    perdaPercent: perda,
    rendimentoLiquido: Math.round(rendimentoLiquido * 100) / 100,
    custoIndireto: Number(comp?.custo_indireto) || 0,
  })
}

// ═══════════════════════════════════════
// CRUD COMPONENTES (tenant-scoped)
// ═══════════════════════════════════════

async function salvarComponente(client: any, companyId: string, userId: string, payload: any) {
  const { id, tipo, nome, categoria, rendimento, unidade_rendimento, perda_estimada_percent,
    custo_indireto, peso_por_unidade, tempo_preparo_min, modo_preparo, checklist, observacoes } = payload

  if (!tipo || !nome) throw new Error('tipo e nome obrigatórios')

  const record: any = {
    tipo, nome,
    categoria: categoria || 'Geral',
    rendimento: Number(rendimento) || 1,
    unidade_rendimento: unidade_rendimento || 'un',
    perda_estimada_percent: Number(perda_estimada_percent) || 0,
    custo_indireto: Number(custo_indireto) || 0,
    peso_por_unidade: peso_por_unidade ? Number(peso_por_unidade) : null,
    tempo_preparo_min: tempo_preparo_min ? Number(tempo_preparo_min) : null,
    modo_preparo: modo_preparo || '',
    checklist: checklist || [],
    observacoes: observacoes || '',
    // updated_at handled by trg_set_updated_at trigger
  }

  if (id) {
    const { data: updated, error } = await client.from('ficha_componentes').update(record)
      .eq('id', id).eq('company_id', companyId).select().maybeSingle()
    if (error) throw error
    if (!updated) tenantForbidden('Componente')
    return json(updated)
  } else {
    record.created_by = userId
    record.company_id = companyId
    const { data, error } = await client.from('ficha_componentes').insert(record).select().single()
    if (error) throw error
    return json(data)
  }
}

// salvar_componente_itens → delegates to ATOMIC RPC
async function salvarComponenteItens(userClient: any, companyId: string, payload: any) {
  const { componente_pai_id, itens } = payload
  if (!componente_pai_id || !itens) throw new Error('componente_pai_id e itens obrigatórios')

  const { data, error } = await userClient.rpc('ficha_salvar_componente_itens_atomic', {
    _componente_pai_id: componente_pai_id,
    _itens: itens,
  })

  if (error) {
    const msg = error.message || 'Erro ao salvar itens'
    if (msg.includes('não permitido') || msg.includes('não pode usar') || msg.includes('circular'))
      badRequest(msg)
    if (msg.includes('não encontrado') || msg.includes('não pertence'))
      tenantForbidden('Componente/Item')
    throw new Error(msg)
  }
  return json(data || { ok: true })
}

// SOFT DELETE componente
async function deletarComponente(client: any, companyId: string, userId: string, payload: any) {
  const { id } = payload
  if (!id) throw new Error('id obrigatório')

  const { data: refs } = await client.from('ficha_componente_itens')
    .select('componente_pai_id')
    .eq('componente_filho_id', id)
    .eq('company_id', companyId)
  if (refs && refs.length > 0) {
    conflict('Componente é usado em outras fichas. Remova as referências primeiro.')
  }

  const { data: deleted, error } = await client.from('ficha_componentes').update({
    deleted_at: new Date().toISOString(), // server-side Deno UTC — correct for timestamptz
    deleted_by: userId,
    ativo: false,
    // updated_at handled by trg_set_updated_at trigger
  }).eq('id', id).eq('company_id', companyId).select('id').maybeSingle()
  if (error) throw error
  if (!deleted) tenantForbidden('Componente')
  return json({ ok: true })
}

// ═══════════════════════════════════════
// LISTAR COMPONENTES (with server-side pagination)
// ═══════════════════════════════════════

async function listarComponentes(client: any, companyId: string, payload: any) {
  const { tipo, categoria, search, ativo, limit: rawLimit, cursor } = payload || {}
  const limit = Math.min(Number(rawLimit) || 200, 500)

  let query = client.from('ficha_componentes').select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
  if (tipo) query = query.eq('tipo', tipo)
  if (categoria) query = query.eq('categoria', categoria)
  if (ativo !== undefined) query = query.eq('ativo', ativo)
  if (search) {
    // Busca accent-insensitive: usa coluna gerada nome_unaccent + termo normalizado.
    // ILIKE no Postgres é case-insensitive mas NÃO remove acentos. Coluna gerada
    // criada em migration 20260501200001_add_unaccent_ficha_componentes.sql.
    const safeTerm = String(search)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[%_\\]/g, '\\$&')
    // eslint-disable-next-line no-restricted-syntax -- coluna nome_unaccent já normalizada
    query = query.ilike('nome_unaccent', `%${safeTerm}%`)
  }

  // Cursor-based pagination (cursor = last component name + id)
  if (cursor?.nome && cursor?.id) {
    query = query.or(`nome.gt.${cursor.nome},and(nome.eq.${cursor.nome},id.gt.${cursor.id})`)
  }

  const { data, error, count } = await query.order('nome').order('id').limit(limit)
  if (error) throw error

  const hasMore = (data || []).length >= limit
  const nextCursor = hasMore && data && data.length > 0
    ? { nome: data[data.length - 1].nome, id: data[data.length - 1].id }
    : null

  return json({ componentes: data || [], total_count: count, has_more: hasMore, next_cursor: nextCursor })
}

async function getComponenteDetalhe(client: any, companyId: string, payload: any) {
  const { id } = payload
  if (!id) throw new Error('id obrigatório')

  const { data: comp } = await client.from('ficha_componentes').select('*')
    .eq('id', id).eq('company_id', companyId).is('deleted_at', null).single()
  if (!comp) tenantNotFound('Componente')

  const { data: itens } = await client.from('ficha_componente_itens').select('*')
    .eq('componente_pai_id', id).eq('company_id', companyId).order('ordem')

  const produtoIds = (itens || []).filter((i: any) => i.produto_id).map((i: any) => i.produto_id)
  const prodMap = new Map<string, any>()
  if (produtoIds.length > 0) {
    const { data: prods } = await client.from('produtos')
      .select('id, nome_produto, custo_ultima_compra, custo_padrao, unidade_medida')
      .in('id', produtoIds).eq('company_id', companyId)
    for (const p of (prods || [])) prodMap.set(p.id, p)
  }

  const compIds = (itens || []).filter((i: any) => i.componente_filho_id).map((i: any) => i.componente_filho_id)
  const subCompMap = new Map<string, any>()
  if (compIds.length > 0) {
    const { data: subs } = await client.from('ficha_componentes')
      .select('id, nome, custo_unitario_calculado')
      .in('id', compIds).eq('company_id', companyId)
    for (const s of (subs || [])) subCompMap.set(s.id, s)
  }

  const enriched = (itens || []).map((item: any) => {
    let nome = ''
    let custoBase = 0
    const isSalmao = item.origem === 'MODULO_SALMAO'

    if (isSalmao) {
      nome = '🐟 Salmão (módulo exclusivo)'
      custoBase = Number(item.custo_snapshot) || 0
    } else if (item.produto_id) {
      const prod = prodMap.get(item.produto_id)
      nome = prod?.nome_produto || ''
      custoBase = Number(prod?.custo_ultima_compra) || Number(prod?.custo_padrao) || 0
    } else if (item.componente_filho_id) {
      const subComp = subCompMap.get(item.componente_filho_id)
      nome = subComp?.nome || ''
      custoBase = Number(subComp?.custo_unitario_calculado) || 0
    }
    return { ...item, nome, custoBase, isSalmao }
  })

  const custoCalc = await calcularCustoComponenteInterno(client, companyId, id)
  return json({ componente: comp, itens: enriched, custo: custoCalc })
}

// ═══════════════════════════════
// CANAIS (tenant-scoped + soft delete)
// ═══════════════════════════════

async function salvarCanal(client: any, companyId: string, payload: any) {
  const { id, nome, taxa_percentual, taxa_fixa, imposto_percent, custo_embalagem_adicional, ativo } = payload
  if (!nome) throw new Error('nome obrigatório')

  const record: any = {
    nome,
    taxa_percentual: Number(taxa_percentual) || 0,
    taxa_fixa: Number(taxa_fixa) || 0,
    imposto_percent: Number(imposto_percent) || 0,
    custo_embalagem_adicional: Number(custo_embalagem_adicional) || 0,
    ativo: ativo !== false,
  }

  if (id) {
    const { data: updated, error } = await client.from('canais_venda').update(record)
      .eq('id', id).eq('company_id', companyId).select('id').maybeSingle()
    if (error) throw error
    if (!updated) tenantForbidden('Canal')
    return json({ id, ...record })
  } else {
    record.company_id = companyId
    const { data, error } = await client.from('canais_venda').insert(record).select().single()
    if (error) throw error
    return json(data)
  }
}

async function listarCanais(client: any, companyId: string) {
  const { data, error } = await client.from('canais_venda').select('*')
    .eq('company_id', companyId).is('deleted_at', null).order('nome')
  if (error) throw error
  return json({ canais: data || [] })
}

async function deletarCanal(client: any, companyId: string, userId: string, payload: any) {
  const { id } = payload
  if (!id) throw new Error('id obrigatório')

  const { data: deleted, error } = await client.from('canais_venda').update({
    deleted_at: new Date().toISOString(), // server-side Deno UTC — correct for timestamptz
    deleted_by: userId,
    ativo: false,
    // updated_at handled by trg_set_updated_at trigger
  }).eq('id', id).eq('company_id', companyId).select('id').maybeSingle()
  if (error) throw error
  if (!deleted) tenantForbidden('Canal')
  return json({ ok: true })
}

// ═══════════════════════════════════════
// PRECIFICAÇÃO POR CANAL (tenant-scoped + upsert)
// ═══════════════════════════════════════

async function salvarPrecificacao(client: any, companyId: string, payload: any) {
  const { componente_id, precos } = payload
  if (!componente_id || !precos) throw new Error('componente_id e precos obrigatórios')

  const { data: comp } = await client.from('ficha_componentes').select('id')
    .eq('id', componente_id).eq('company_id', companyId).maybeSingle()
  if (!comp) tenantForbidden('Componente')

  for (const p of precos) {
    const { data: canal } = await client.from('canais_venda').select('id')
      .eq('id', p.canal_id).eq('company_id', companyId).maybeSingle()
    if (!canal) tenantForbidden(`Canal ${p.canal_id}`)

    const { error } = await client.from('precificacao_canal').upsert({
      company_id: companyId,
      componente_id,
      canal_id: p.canal_id,
      preco_venda: Number(p.preco_venda) || 0,
      // updated_at handled by trg_set_updated_at trigger
    }, { onConflict: 'company_id,componente_id,canal_id' })
    if (error) throw error
  }

  return json({ ok: true })
}

async function getPrecificacao(client: any, companyId: string, payload: any) {
  const { componente_id } = payload
  if (!componente_id) throw new Error('componente_id obrigatório')

  const { data: precos } = await client.from('precificacao_canal')
    .select('*, canais_venda(*)')
    .eq('componente_id', componente_id)
    .eq('company_id', companyId)

  const { data: comp } = await client.from('ficha_componentes')
    .select('custo_unitario_calculado, custo_total_calculado')
    .eq('id', componente_id).eq('company_id', companyId).single()

  const custo = Number(comp?.custo_unitario_calculado) || 0

  const analise = (precos || []).map((p: any) => {
    const canal = p.canais_venda || {}
    const preco = Number(p.preco_venda) || 0
    const taxaPct = Number(canal.taxa_percentual) || 0
    const taxaFixa = Number(canal.taxa_fixa) || 0
    const imposto = Number(canal.imposto_percent) || 0
    const embalagem = Number(canal.custo_embalagem_adicional) || 0

    const receitaLiquida = preco - (preco * taxaPct / 100) - taxaFixa - (preco * imposto / 100)
    const lucroBruto = receitaLiquida - custo - embalagem
    const margemLiquida = preco > 0 ? (lucroBruto / preco) * 100 : 0
    const cmvPercent = preco > 0 ? (custo / preco) * 100 : 0
    const markup = custo > 0 ? preco / custo : 0

    return {
      canalId: canal.id, canalNome: canal.nome,
      precoVenda: preco,
      taxas: Math.round((preco * taxaPct / 100 + taxaFixa + preco * imposto / 100) * 100) / 100,
      receitaLiquida: Math.round(receitaLiquida * 100) / 100,
      custo: Math.round(custo * 100) / 100,
      embalagem,
      lucroBruto: Math.round(lucroBruto * 100) / 100,
      margemLiquida: Math.round(margemLiquida * 100) / 100,
      cmvPercent: Math.round(cmvPercent * 100) / 100,
      markup: Math.round(markup * 100) / 100,
    }
  })

  return json({ precos: precos || [], analise })
}

// ═══════════════════════════════════════
// SIMULADOR DE CENÁRIOS (tenant-scoped)
// ═══════════════════════════════════════

async function simularCenario(client: any, companyId: string, payload: any) {
  const { componente_id, ajuste_custo_percent, ajuste_taxa_percent, ajuste_perda_percent,
    ajuste_porcionamento_g, ajuste_preco_final, volume_vendas_mensal } = payload

  if (!componente_id) throw new Error('componente_id obrigatório')

  const custoBase = await calcularCustoComponenteInterno(client, companyId, componente_id)
  const { data: comp } = await client.from('ficha_componentes').select('*')
    .eq('id', componente_id).eq('company_id', companyId).single()

  let novoCusto = custoBase.custoUnitario

  if (ajuste_custo_percent) {
    novoCusto *= (1 + Number(ajuste_custo_percent) / 100)
  }
  if (ajuste_perda_percent !== undefined) {
    const rendimento = Number(comp?.rendimento) || 1
    const rendLiq = rendimento * (1 - Number(ajuste_perda_percent) / 100)
    novoCusto = rendLiq > 0 ? custoBase.custoTotal / rendLiq : custoBase.custoTotal
  }
  if (ajuste_porcionamento_g) {
    const basePeso = Number(comp?.peso_por_unidade) || 100
    novoCusto *= (basePeso + Number(ajuste_porcionamento_g)) / basePeso
  }

  const { data: precos } = await client.from('precificacao_canal')
    .select('*, canais_venda(*)')
    .eq('componente_id', componente_id)
    .eq('company_id', companyId)

  const resultadoCanais = (precos || []).map((p: any) => {
    const canal = p.canais_venda || {}
    let preco = Number(p.preco_venda) || 0
    if (ajuste_preco_final !== undefined) preco = Number(ajuste_preco_final)
    let taxaPct = Number(canal.taxa_percentual) || 0
    if (ajuste_taxa_percent !== undefined) taxaPct = Number(ajuste_taxa_percent)
    const taxaFixa = Number(canal.taxa_fixa) || 0
    const imposto = Number(canal.imposto_percent) || 0
    const embalagem = Number(canal.custo_embalagem_adicional) || 0
    const receitaLiquida = preco - (preco * taxaPct / 100) - taxaFixa - (preco * imposto / 100)
    const lucroBruto = receitaLiquida - novoCusto - embalagem
    const margemLiquida = preco > 0 ? (lucroBruto / preco) * 100 : 0
    const cmvPercent = preco > 0 ? (novoCusto / preco) * 100 : 0
    const vol = Number(volume_vendas_mensal) || 0
    return {
      canal: canal.nome, preco,
      novoCusto: Math.round(novoCusto * 100) / 100,
      cmv: Math.round(cmvPercent * 100) / 100,
      margem: Math.round(margemLiquida * 100) / 100,
      lucroPorVenda: Math.round(lucroBruto * 100) / 100,
      lucroMensal: Math.round(lucroBruto * vol * 100) / 100,
    }
  })

  return json({
    custoOriginal: custoBase.custoUnitario,
    novoCusto: Math.round(novoCusto * 100) / 100,
    economia: Math.round((custoBase.custoUnitario - novoCusto) * 100) / 100,
    resultadoCanais,
  })
}

async function salvarCenario(client: any, companyId: string, userId: string, payload: any) {
  const { componente_id, nome, params, resultado } = payload
  if (!componente_id || !nome) throw new Error('componente_id e nome obrigatórios')

  const { data: comp } = await client.from('ficha_componentes').select('id')
    .eq('id', componente_id).eq('company_id', companyId).maybeSingle()
  if (!comp) tenantForbidden('Componente')

  const { data, error } = await client.from('cenarios_simulacao').insert({
    componente_id, nome,
    params: params || {},
    resultado: resultado || {},
    created_by: userId,
    company_id: companyId,
  }).select().single()

  if (error) throw error
  return json(data)
}

// ═══════════════════════════════════════
// RECALCULAR TODOS OS CUSTOS (tenant-scoped)
// ═══════════════════════════════════════

async function recalcularTodosCustos(client: any, companyId: string) {
  const { data: comps } = await client.from('ficha_componentes')
    .select('id, tipo').eq('ativo', true).is('deleted_at', null)
    .eq('company_id', companyId).order('tipo')

  const order = ['PRE_PREPARO', 'ITEM_PRONTO', 'PRODUTO_FINAL']
  const sorted = (comps || []).sort((a: any, b: any) =>
    order.indexOf(a.tipo) - order.indexOf(b.tipo)
  )

  const compCache = new Map<string, any>()
  const prodCache = new Map<string, any>()

  const results: any[] = []
  for (const c of sorted) {
    try {
      const result = await calcularCustoComponenteInterno(client, companyId, c.id, new Set(), compCache, prodCache)
      await client.from('ficha_componentes').update({
        custo_total_calculado: result.custoTotal,
        custo_unitario_calculado: result.custoUnitario,
        // updated_at handled by trg_set_updated_at trigger
      }).eq('id', c.id).eq('company_id', companyId)
      const cached = compCache.get(c.id)
      if (cached) {
        cached.custo_total_calculado = result.custoTotal
        cached.custo_unitario_calculado = result.custoUnitario
      }
      results.push({ id: c.id, custoUnitario: result.custoUnitario })
    } catch (e: any) {
      results.push({ id: c.id, error: e.message })
    }
  }

  return json({ ok: true, total: results.length, results })
}

// ═══════════════════════════════════════
// SALMON REFERENCE PRICE (tenant-scoped)
// ═══════════════════════════════════════

async function getSalmonReferencePrice(client: any, companyId: string): Promise<{ preco: number; origem: string; info: string }> {
  const { data: config } = await client.from('config_precificacao').select('*')
    .eq('company_id', companyId).maybeSingle()

  const autoPrice = Number(config?.preco_referencia_salmao_auto) || 0
  const manualPrice = Number(config?.preco_referencia_salmao_manual) || 0

  if (autoPrice > 0) {
    return { preco: autoPrice, origem: 'lote_recente', info: config?.ultimo_lote_info || '' }
  }
  if (manualPrice > 0) {
    return { preco: manualPrice, origem: 'manual', info: 'Preço manual definido pelo admin' }
  }
  return { preco: 0, origem: 'nenhum', info: 'Sem preço de referência configurado' }
}

async function getPrecoReferenciaSalmao(client: any, companyId: string) {
  const ref = await getSalmonReferencePrice(client, companyId)
  const { data: config } = await client.from('config_precificacao').select('*')
    .eq('company_id', companyId).maybeSingle()

  return json({
    preco: ref.preco,
    origem: ref.origem,
    info: ref.info,
    preco_manual: Number(config?.preco_referencia_salmao_manual) || 0,
    preco_auto: Number(config?.preco_referencia_salmao_auto) || 0,
    ultimo_lote_info: config?.ultimo_lote_info || '',
  })
}

async function setPrecoReferenciaSalmao(client: any, companyId: string, userId: string, payload: any) {
  const { preco_manual } = payload
  if (preco_manual === undefined) throw new Error('preco_manual obrigatório')

  const { error } = await client.from('config_precificacao').upsert({
    company_id: companyId,
    preco_referencia_salmao_manual: Number(preco_manual) || 0,
    updated_by: userId,
    // updated_at handled by trg_set_updated_at trigger
  }, { onConflict: 'company_id' })
  if (error) throw error
  return json({ ok: true })
}

async function syncPrecoSalmaoAuto(client: any, companyId: string, userId: string, payload: any) {
  const { preco_kg_limpo, lote_info } = payload
  if (!preco_kg_limpo) throw new Error('preco_kg_limpo obrigatório')

  const { error } = await client.from('config_precificacao').upsert({
    company_id: companyId,
    preco_referencia_salmao_auto: Number(preco_kg_limpo),
    origem_preco_salmao: 'lote_recente',
    ultimo_lote_info: lote_info || '',
    updated_by: userId,
    // updated_at handled by trg_set_updated_at trigger
  }, { onConflict: 'company_id' })
  if (error) throw error
  return json({ ok: true })
}
