import { withRequestCors } from '../_shared/request-cors.ts';
import { companyHeaders, requestCompanyProfile } from "../_shared/company-scope.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = getCorsHeaders();const PAGE_SIZE = 50

serve(withRequestCors(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    const adminClient = createClient(supabaseUrl, serviceKey, { global: { headers: companyHeaders(req) } })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return unauthorized()

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { ...companyHeaders(req), Authorization: authHeader } }
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return unauthorized()

    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || ''
    const { action, ...payload } = await req.json()

    // ===== RESOLVE TENANT ONCE (mandatory for all queries via adminClient) =====
    const { data: profile } = await requestCompanyProfile(userClient)
    if (!profile?.company_id) return json({ error: 'COMPANY_ACCESS_DENIED' }, 403)
    const companyId = profile.company_id

    // ===== PERMISSION HELPERS (granular, not legacy roles) =====
    async function checkPermission(perm: string): Promise<boolean> {
      const { data } = await adminClient.rpc('has_permission', { _user_id: user!.id, _permission: perm })
      return !!data
    }

    async function requirePermission(perm: string): Promise<Response | null> {
      const has = await checkPermission(perm)
      if (!has) return forbidden(`Sem permissão: ${perm}`)
      return null
    }

    async function hasAnyPermission(...perms: string[]): Promise<boolean> {
      for (const p of perms) {
        const has = await checkPermission(p)
        if (has) return true
      }
      return false
    }

    async function getUserRole(): Promise<string> {
      const { data } = await adminClient.from('user_roles').select('role').eq('user_id', user!.id).eq('company_id', companyId)
      return (data || []).map((r: any) => r.role).join(',') || 'viewer'
    }

    // Audit helper (now includes company_id for C1 fix)
    async function auditLog(inventarioId: string, acao: string, antes: any = null, depois: any = null, itemId: string | null = null) {
      const userRole = await getUserRole()
      await adminClient.from('audit_inventario_log').insert({
        company_id: companyId,
        inventario_id: inventarioId,
        item_id: itemId,
        user_id: user!.id,
        user_role: userRole,
        acao,
        antes: antes ? JSON.stringify(antes) : null,
        depois: depois ? JSON.stringify(depois) : null,
        ip_address: clientIp,
      })
    }

    // ===== ACTIONS =====

    if (action === 'list') {
      const deny = await requirePermission('inventario:lista:view')
      if (deny) return deny

      let query = adminClient.from('inventarios').select('*, turnos(nome)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      // Apply filters
      if (payload.status_filter) query = query.eq('status', payload.status_filter)
      if (payload.turno_filter) query = query.eq('turno_id', payload.turno_filter)
      if (payload.flag_filter) query = query.neq('flag_risco', '')

      // Cursor pagination — validate format to prevent injection via .or()
      if (payload.cursor_created_at && payload.cursor_id) {
        const cursorDate = String(payload.cursor_created_at)
        const cursorId = String(payload.cursor_id)
        // Validate ISO timestamp and UUID formats
        if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(cursorDate) || !/^[0-9a-f-]{36}$/i.test(cursorId)) {
          return json({ error: 'Cursor de paginação inválido' }, 400)
        }
        query = query.or(`created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`)
      }

      query = query.limit(PAGE_SIZE + 1)
      const { data, error } = await query
      if (error) throw error

      const hasMore = (data || []).length > PAGE_SIZE
      const items = hasMore ? (data || []).slice(0, PAGE_SIZE) : (data || [])
      const nextCursor = hasMore && items.length > 0
        ? { created_at: items[items.length - 1].created_at, id: items[items.length - 1].id }
        : null

      return json({ inventarios: items, hasMore, nextCursor })
    }

    if (action === 'list_turnos') {
      const canListTurnos = await hasAnyPermission(
        'inventario:detalhe:view',
        'inventario:criar:create',
        'inventario:lista:view',
      )
      if (!canListTurnos) return forbidden('Sem permissão para listar turnos')

      const { data } = await adminClient.from('turnos').select('*').eq('ativo', true).eq('company_id', companyId).order('hora_inicio')
      return json({ turnos: data || [] })
    }

    if (action === 'get') {
      const deny = await requirePermission('inventario:detalhe:view')
      if (deny) return deny

      const { id } = payload
      const [invRes, itensRes] = await Promise.all([
        adminClient.from('inventarios').select('*, turnos(nome)').eq('id', id).eq('company_id', companyId).is('deleted_at', null).single(),
        adminClient.from('inventario_itens').select('*, produtos:produto_id(nome_produto, categoria, local_estoque, unidade_medida, unidade_compra, fator_conversao_padrao)')
          .eq('inventario_id', id).eq('company_id', companyId).is('deleted_at', null).order('created_at'),
      ])
      if (invRes.error) throw invRes.error

      const { data: logs } = await adminClient.from('audit_inventario_log')
        .select('*').eq('inventario_id', id).eq('company_id', companyId).order('created_at', { ascending: false }).limit(50)

      return json({ inventario: invRes.data, itens: itensRes.data || [], auditLogs: logs || [] })
    }

    if (action === 'create') {
      const deny = await requirePermission('inventario:criar:create')
      if (deny) return deny

      const ALLOWED_TIPOS = ['completo', 'parcial', 'ciclico']
      const ALLOWED_METODOS = ['lista', 'codigo']
      const { tipo, data: invData, hora, categorias, observacao, turno_id, idempotency_key, metodo_contagem } = payload
      if (!tipo || !ALLOWED_TIPOS.includes(tipo)) return json({ error: `Tipo inválido. Permitidos: ${ALLOWED_TIPOS.join(', ')}` }, 400)
      if (!invData || !hora) return json({ error: 'Campos obrigatórios: tipo, data, hora' }, 400)
      if (!turno_id) return json({ error: 'Turno é obrigatório' }, 400)

      // Validate date format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(invData)) return json({ error: 'Data inválida (formato: YYYY-MM-DD)' }, 400)
      // Validate time format (HH:mm or HH:mm:ss)
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(hora)) return json({ error: 'Hora inválida (formato: HH:mm)' }, 400)

      // Sanitize text inputs
      const safeObservacao = (observacao || '').slice(0, 500).replace(/<[^>]*>/g, '')
      const safeCategorias = (categorias || []).slice(0, 20).map((c: string) => String(c).slice(0, 100).replace(/<[^>]*>/g, ''))
      const safeMetodo = ALLOWED_METODOS.includes(metodo_contagem) ? metodo_contagem : 'lista'

      // H2: Use atomic RPC with idempotency
      const { data: rpcResult, error: rpcErr } = await userClient.rpc('create_inventory_atomic', {
        p_tipo: tipo,
        p_data: invData,
        p_hora: hora,
        p_turno_id: turno_id,
        p_categorias: safeCategorias,
        p_observacao: safeObservacao,
        p_idempotency_key: idempotency_key || null,
        p_metodo_contagem: safeMetodo,
      })
      if (rpcErr) throw rpcErr

      // Handle both return formats: plain UUID (new RPC) or object (legacy RPC)
      const inventarioId = typeof rpcResult === 'string' ? rpcResult : rpcResult?.inventario_id || rpcResult
      if (!inventarioId) throw new Error('RPC não retornou o ID do inventário')

      // Load the created inventory for response
      const { data: inv } = await adminClient.from('inventarios')
        .select('*').eq('id', inventarioId).eq('company_id', companyId).single()

      // Count items that were created
      const { count: itensCount } = await adminClient.from('inventario_itens')
        .select('id', { count: 'exact', head: true })
        .eq('inventario_id', inventarioId).eq('company_id', companyId)

      return json({
        inventario: inv,
        itensCount: itensCount || 0,
        idempotent: typeof rpcResult === 'object' ? (rpcResult?.idempotent || false) : false,
      })
    }

    if (action === 'update_status') {
      const deny = await requirePermission('inventario:detalhe:edit')
      if (deny) return deny

      const ALLOWED_STATUSES = ['RASCUNHO', 'EM_CONTAGEM', 'EM_REVISAO', 'SOB_ANALISE', 'FINALIZADO']
      const { id, status } = payload
      if (!status || !ALLOWED_STATUSES.includes(status)) return json({ error: `Status inválido. Permitidos: ${ALLOWED_STATUSES.join(', ')}` }, 400)

      const { data: current } = await adminClient.from('inventarios').select('status').eq('id', id).eq('company_id', companyId).is('deleted_at', null).single()
      if (!current) return json({ error: 'Inventário não encontrado' }, 404)
      if (current.status === 'FINALIZADO') return json({ error: 'Inventário finalizado não pode ser alterado' }, 400)
      if (current.status === 'SOB_ANALISE' && !(await hasAnyPermission('inventario:auditoria:approve', 'system:global:manage'))) return json({ error: 'Sem permissão para alterar inventário sob análise' }, 403)

      await adminClient.from('inventarios').update({ status }).eq('id', id).eq('company_id', companyId)
      await auditLog(id, 'MUDANCA_STATUS', { status: current.status }, { status })
      return json({ success: true })
    }

    if (action === 'update_contagem') {
      const deny = await requirePermission('inventario:detalhe:edit')
      if (deny) return deny

      const { item_id, contagem_fisica } = payload
      if (contagem_fisica === null || contagem_fisica === undefined || isNaN(Number(contagem_fisica)) || Number(contagem_fisica) < 0) {
        return json({ error: 'Contagem física inválida' }, 400)
      }

      const { data: existingItem } = await adminClient.from('inventario_itens')
        .select('*, inventarios:inventario_id(status)')
        .eq('id', item_id).eq('company_id', companyId).is('deleted_at', null).single()
      if (!existingItem) return json({ error: 'Item não encontrado' }, 404)

      const invStatus = (existingItem as any).inventarios?.status
      if (invStatus === 'FINALIZADO') return json({ error: 'Inventário finalizado' }, 400)
      if (invStatus === 'RASCUNHO') return json({ error: 'Inventário ainda em rascunho' }, 400)
      if (invStatus === 'SOB_ANALISE') return json({ error: 'Inventário sob análise' }, 400)

      const fisica = Number(contagem_fisica)
      const teorico = Number(existingItem.saldo_teorico)
      const diferenca_qtd = fisica - teorico
      const diferenca_percent = teorico !== 0 ? (diferenca_qtd / teorico) * 100 : (fisica > 0 ? 100 : 0)
      const impacto_financeiro = diferenca_qtd * Number(existingItem.custo_snapshot)

      let classificacao = 'NORMAL'
      const absPct = Math.abs(diferenca_percent)
      if (absPct > 6) classificacao = 'CRITICO'
      else if (absPct > 2) classificacao = 'ALERTA'

      const update: any = {
        contagem_fisica: fisica, diferenca_qtd, diferenca_percent,
        impacto_financeiro, classificacao,
        contado_por: user.id, contagem_fim: new Date().toISOString(),
      }
      if (!existingItem.contagem_inicio) update.contagem_inicio = update.contagem_fim

      // Optimistic lock: só aplica o update se contagem_fisica ainda é o valor lido acima —
      // evita que duas contagens concorrentes do mesmo item se sobrescrevam silenciosamente.
      const previousContagem = existingItem.contagem_fisica
      let updateQuery = adminClient.from('inventario_itens').update(update).eq('id', item_id).eq('company_id', companyId)
      updateQuery = previousContagem === null
        ? updateQuery.is('contagem_fisica', null)
        : updateQuery.eq('contagem_fisica', previousContagem)

      const { data: updatedRows, error: updateErr } = await updateQuery.select('id')
      if (updateErr) throw updateErr
      if (!updatedRows || updatedRows.length === 0) {
        return json({ error: 'Este item já foi contado por outro usuário nesse meio-tempo. Recarregue e tente novamente.' }, 409)
      }

      const antes = { contagem_fisica: previousContagem }
      await auditLog(existingItem.inventario_id, 'CONTAGEM', antes, { contagem_fisica: fisica, diferenca_qtd, classificacao }, item_id)

      return json({ success: true, diferenca_qtd, diferenca_percent, impacto_financeiro, classificacao })
    }

    if (action === 'find_by_barcode') {
      const deny = await requirePermission('inventario:detalhe:edit')
      if (deny) return deny

      const { id, barcode } = payload
      if (!id || typeof barcode !== 'string' || !barcode.trim()) {
        return json({ error: 'id e barcode são obrigatórios' }, 400)
      }

      const { data: rpcResult, error: rpcErr } = await userClient.rpc('inventario_find_item_por_barcode', {
        p_inventario_id: id,
        p_barcode: barcode,
      })
      if (rpcErr) throw rpcErr

      return json(rpcResult)
    }

    if (action === 'finalizar') {
      const deny = await requirePermission('inventario:detalhe:close')
      if (deny) return deny

      const { id, justificativa } = payload

      // Pre-flight: load inventory + items for anti-fraud check (before atomic RPC)
      const { data: inv } = await adminClient.from('inventarios').select('*').eq('id', id).eq('company_id', companyId).is('deleted_at', null).single()
      if (!inv) return json({ error: 'Inventário não encontrado' }, 404)
      if (inv.status === 'FINALIZADO') return json({ success: true, already_finalized: true, acuracia: inv.acuracia_percent, driftTotal: inv.drift_total_valor, adjustments: 0, scoreRisco: inv.score_risco, flagRisco: inv.flag_risco })

      const { data: itens } = await adminClient.from('inventario_itens').select('*').eq('inventario_id', id).eq('company_id', companyId).is('deleted_at', null)
      if (!itens || itens.length === 0) return json({ error: 'Nenhum item no inventário' }, 400)

      // Allow partial finalization — uncounted items keep their current stock balance
      const countedItems = itens.filter(i => i.contagem_fisica !== null)
      const uncountedItems = itens.filter(i => i.contagem_fisica === null)

      // Anti-fraud check (runs BEFORE atomic finalization)
      const DESVIO_SUSPEITO_PCT = 10
      const DESVIO_SUSPEITO_VALOR = 500
      const suspiciousItems = countedItems.filter(i => {
        const absPct = Math.abs(Number(i.diferenca_percent))
        const absVal = Math.abs(Number(i.impacto_financeiro))
        return absPct > DESVIO_SUSPEITO_PCT || absVal > DESVIO_SUSPEITO_VALOR
      })

      if (suspiciousItems.length > 0 && inv.status !== 'SOB_ANALISE' && inv.status !== 'EM_REVISAO') {
        const motivo = `${suspiciousItems.length} itens com desvio suspeito (>${DESVIO_SUSPEITO_PCT}% ou >R$${DESVIO_SUSPEITO_VALOR})`
        await adminClient.from('inventarios').update({
          status: 'SOB_ANALISE', sob_analise_motivo: motivo,
        }).eq('id', id).eq('company_id', companyId)
        await auditLog(id, 'BLOQUEIO_ANTIFRAUDE', null, { motivo, itens_suspeitos: suspiciousItems.length })
        return json({ blocked: true, motivo, suspiciousCount: suspiciousItems.length })
      }

      // If SOB_ANALISE, require admin approval first — approve then continue to finalize
      if (inv.status === 'SOB_ANALISE') {
        if (!(await hasAnyPermission('inventario:auditoria:approve', 'system:global:manage'))) return json({ error: 'Sem permissão para aprovar inventário sob análise' }, 403)
        if (!justificativa || justificativa.trim().length < 10) {
          return json({ error: 'Justificativa obrigatória (mínimo 10 caracteres)' }, 400)
        }
        // Approve: transition to EM_REVISAO so finalize_inventory_atomic can proceed
        await adminClient.from('inventarios').update({
          status: 'EM_REVISAO',
          justificativa_analise: justificativa.trim(),
          aprovado_por: user.id,
          aprovacao_admin_em: new Date().toISOString(),
        }).eq('id', id).eq('company_id', companyId)
        await auditLog(id, 'APROVACAO_ADMIN', { status: 'SOB_ANALISE' }, { status: 'EM_REVISAO', justificativa: justificativa.trim(), aprovado_por: user.id })
      }

      // Ensure justificativa meets minimum length for the atomic RPC
      const safeJustificativa = justificativa && justificativa.trim().length >= 10
        ? justificativa.trim()
        : `Finalização do inventário ${id.slice(0, 8)}`

      // ─── ATOMIC FINALIZATION via RPC (single transaction) ───
      const { data: rpcResult, error: rpcErr } = await userClient.rpc('finalize_inventory_atomic', {
        p_id: id,
        p_justificativa: safeJustificativa,
      })
      if (rpcErr) throw rpcErr

      // Post-finalization: behavioral pattern detection for risk scoring
      let flagRisco = ''
      let scoreRisco = 0

      const { data: historicalItens } = await adminClient.from('inventario_itens')
        .select('contado_por, diferenca_percent, impacto_financeiro, inventarios:inventario_id(turno_id, data)')
        .eq('company_id', companyId)
        .not('contado_por', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500)

      if (historicalItens && historicalItens.length > 20) {
        const userDivergence: Record<string, { count: number; totalNeg: number; total: number }> = {}
        historicalItens.forEach((hi: any) => {
          const uid = hi.contado_por
          if (!userDivergence[uid]) userDivergence[uid] = { count: 0, totalNeg: 0, total: 0 }
          userDivergence[uid].total++
          if (Number(hi.diferenca_percent) < -2) {
            userDivergence[uid].count++
            userDivergence[uid].totalNeg += Math.abs(Number(hi.impacto_financeiro))
          }
        })

        const currentUserStats = userDivergence[user.id]
        if (currentUserStats && currentUserStats.total > 5) {
          const ratio = currentUserStats.count / currentUserStats.total
          scoreRisco += Math.min(25, ratio * 50)
        }

        const turnoDiv: Record<string, number> = {}
        historicalItens.forEach((hi: any) => {
          const tid = (hi as any).inventarios?.turno_id || 'unknown'
          turnoDiv[tid] = (turnoDiv[tid] || 0) + Math.abs(Number(hi.impacto_financeiro))
        })
        const turnoValues = Object.values(turnoDiv)
        if (turnoValues.length > 1) {
          const maxTurno = Math.max(...turnoValues)
          const totalTurno = turnoValues.reduce((a, b) => a + b, 0)
          const concentration = totalTurno > 0 ? maxTurno / totalTurno : 0
          if (concentration > 0.7) scoreRisco += 25
          else if (concentration > 0.5) scoreRisco += 15
        }

        const totalAbsImpact = itens.reduce((s, i) => s + Math.abs(Number(i.impacto_financeiro)), 0)
        if (totalAbsImpact > 2000) scoreRisco += 25
        else if (totalAbsImpact > 1000) scoreRisco += 15
        else if (totalAbsImpact > 500) scoreRisco += 8

        const criticalCount = itens.filter(i => i.classificacao === 'CRITICO').length
        if (criticalCount > 5) scoreRisco += 25
        else if (criticalCount > 3) scoreRisco += 15
        else if (criticalCount > 0) scoreRisco += 8

        scoreRisco = Math.min(100, Math.round(scoreRisco))
        if (scoreRisco > 60) flagRisco = 'RISCO_OPERACIONAL_ALTO'
        else if (scoreRisco > 30) flagRisco = 'ATENCAO'
      }

      // Update risk score post-finalization (non-critical, best-effort)
      if (scoreRisco > 0 || flagRisco) {
        const { error: scoreErr } = await adminClient.from('inventarios').update({
          score_risco: scoreRisco, flag_risco: flagRisco,
        }).eq('id', id).eq('company_id', companyId)
        if (scoreErr) console.error('Failed to update score_risco/flag_risco:', scoreErr)
      }

      // A finalização e o score são auditados pelos triggers do recurso.
      return json({
        success: true,
        already_finalized: rpcResult.already_finalized || false,
        acuracia: rpcResult.acuracia,
        driftTotal: rpcResult.driftTotal,
        adjustments: rpcResult.adjustments_inserted,
        scoreRisco,
        flagRisco,
      })
    }

    if (action === 'aprovar_analise') {
      if (!(await hasAnyPermission('inventario:auditoria:approve', 'system:global:manage'))) return forbidden('Sem permissão: inventario:auditoria:approve')

      const { id, justificativa } = payload
      if (!justificativa || justificativa.trim().length < 10) {
        return json({ error: 'Justificativa obrigatória (mínimo 10 caracteres)' }, 400)
      }

      const { data: inv } = await adminClient.from('inventarios').select('status').eq('id', id).eq('company_id', companyId).is('deleted_at', null).single()
      if (inv?.status !== 'SOB_ANALISE') return json({ error: 'Inventário não está sob análise' }, 400)

      await adminClient.from('inventarios').update({
        justificativa_analise: justificativa, aprovado_por: user.id,
        aprovacao_admin_em: new Date().toISOString(),
      }).eq('id', id).eq('company_id', companyId)

      await auditLog(id, 'APROVACAO_ADMIN', null, { justificativa, aprovado_por: user.id })
      return json({ success: true })
    }

    if (action === 'correcao_posterior') {
      if (!(await hasAnyPermission('inventario:auditoria:edit', 'system:global:manage'))) return forbidden('Sem permissão: inventario:auditoria:edit')

      const { inventario_id, produto_id, quantidade, motivo } = payload
      if (!motivo || motivo.trim().length < 10) return json({ error: 'Motivo obrigatório (mínimo 10 caracteres)' }, 400)
      if (!quantidade || isNaN(Number(quantidade)) || Number(quantidade) === 0) return json({ error: 'Quantidade inválida (deve ser diferente de zero)' }, 400)
      if (Math.abs(Number(quantidade)) > 999999) return json({ error: 'Quantidade excede o limite permitido' }, 400)

      const { data: inv } = await adminClient.from('inventarios').select('data').eq('id', inventario_id).eq('company_id', companyId).is('deleted_at', null).single()
      if (!inv) return json({ error: 'Inventário não encontrado' }, 404)

      const { data: produtoTenant } = await adminClient.from('produtos').select('id').eq('id', produto_id).eq('company_id', companyId).maybeSingle()
      if (!produtoTenant) return json({ error: 'Produto não pertence a esta empresa' }, 400)

      const { data: item } = await adminClient.from('inventario_itens')
        .select('custo_snapshot').eq('inventario_id', inventario_id).eq('company_id', companyId).eq('produto_id', produto_id).maybeSingle()

      const custo = item ? Number(item.custo_snapshot) : 0
      const qty = Number(quantidade)

      // F08: Correct tipo and direction for positive vs negative corrections
      const isEntry = qty > 0
      const tipo = isEntry ? 'AJUSTE_CORRECAO_POSTERIOR_ENTRADA' : 'AJUSTE_CORRECAO_POSTERIOR_SAIDA'
      const direction = isEntry ? 'IN' : 'OUT'

      await adminClient.from('movimentacoes_estoque').insert({
        company_id: companyId,
        produto_id, quantidade: Math.abs(qty),
        custo_unitario: custo, custo_total: Math.abs(qty) * custo,
        tipo, direction, origem: 'CORRECAO_INVENTARIO', referencia_id: inventario_id,
        data: inv.data, observacao: `Correção posterior: ${motivo.slice(0, 500)}`,
        created_by: user.id,
      })

      await auditLog(inventario_id, 'CORRECAO_POSTERIOR', null, {
        produto_id, quantidade: qty, motivo, tipo, ip: clientIp,
      })

      return json({ success: true })
    }

    if (action === 'dashboard') {
      const deny = await requirePermission('inventario:dashboard:view')
      if (deny) return deny

      const { data: invs } = await adminClient
        .from('inventarios')
        .select('id, data, acuracia_percent, drift_total_valor, status, tipo, turno_id, flag_risco, score_risco, turnos(nome), created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('data', { ascending: false })
        .limit(20)

      const finalizados = (invs || []).filter(i => i.status === 'FINALIZADO')
      const sobAnalise = (invs || []).filter(i => i.status === 'SOB_ANALISE')

      let topCriticos: any[] = []
      const categoriasDrift: Record<string, number> = {}
      const turnoDrift: Record<string, number> = {}
      const userDrift: Record<string, { total: number; count: number; nome: string }> = {}

      if (finalizados.length > 0) {
        const lastId = finalizados[0].id
        const { data: itens } = await adminClient
          .from('inventario_itens')
          .select('*, produtos:produto_id(nome_produto, categoria, unidade_medida, unidade_compra, fator_conversao_padrao)')
          .eq('inventario_id', lastId).eq('company_id', companyId).is('deleted_at', null)
          .order('impacto_financeiro', { ascending: true })
          .limit(10)
        topCriticos = (itens || []).filter(i => i.classificacao !== 'NORMAL')

        const { data: allItens } = await adminClient
          .from('inventario_itens')
          .select('impacto_financeiro, produtos:produto_id(categoria)')
          .eq('inventario_id', lastId).eq('company_id', companyId).is('deleted_at', null)
        ;(allItens || []).forEach((item: any) => {
          const cat = item.produtos?.categoria || 'Outros'
          categoriasDrift[cat] = (categoriasDrift[cat] || 0) + Number(item.impacto_financeiro)
        })
      }

      for (const inv of finalizados.slice(0, 10)) {
        const turnoNome = (inv as any).turnos?.nome || 'N/A'
        turnoDrift[turnoNome] = (turnoDrift[turnoNome] || 0) + Number(inv.drift_total_valor)
      }

      const recentIds = finalizados.slice(0, 5).map(i => i.id)
      if (recentIds.length > 0) {
        const { data: recentItens } = await adminClient.from('inventario_itens')
          .select('contado_por, impacto_financeiro, fisherman_divergence_percent:diferenca_percent')
          .in('inventario_id', recentIds).eq('company_id', companyId).is('deleted_at', null)
          .not('contado_por', 'is', null)

        const { data: profiles } = await userClient.from('profiles').select('id, nome')
        const profileMap: Record<string, string> = {}
        ;(profiles || []).forEach((p: any) => { profileMap[p.id] = p.nome })

        ;(recentItens || []).forEach((item: any) => {
          const uid = item.contado_por
          if (!userDrift[uid]) userDrift[uid] = { total: 0, count: 0, nome: profileMap[uid] || 'Desconhecido' }
          userDrift[uid].total += Math.abs(Number(item.impacto_financeiro))
          userDrift[uid].count++
        })
      }

      const avgScore = finalizados.length > 0
        ? finalizados.reduce((s, i) => s + Number(i.score_risco), 0) / finalizados.length : 0

      return json({
        historico: invs || [], finalizados, sobAnalise, topCriticos,
        categoriasDrift, turnoDrift, userDrift, avgScore: Math.round(avgScore),
      })
    }

    if (action === 'reopen') {
      const deny = await requirePermission('inventario:auditoria:edit')
      if (deny) return deny

      const { id, justificativa } = payload
      if (!justificativa || justificativa.trim().length < 10) {
        return json({ error: 'Justificativa obrigatória (mínimo 10 caracteres)' }, 400)
      }
      const safeJustificativa = justificativa.trim().slice(0, 500).replace(/<[^>]*>/g, '')

      const { data: rpcResult, error: rpcErr } = await userClient.rpc('reopen_inventory', {
        p_id: id, p_justificativa: safeJustificativa
      })
      if (rpcErr) {
        console.error('reopen_inventory RPC error:', JSON.stringify(rpcErr))
        const msg = rpcErr.message || 'Erro ao reabrir inventário'
        const status = msg.startsWith('403:') || msg.includes('permissão') || msg.includes('Forbidden') ? 403 : 400
        return json({ error: msg }, status)
      }
      return json({ success: true, ...(rpcResult || {}) })
    }

    if (action === 'delete_inventory') {
      const deny = await requirePermission('inventario:lista:delete')
      if (deny) return deny

      const { id, justificativa } = payload
      if (!justificativa || justificativa.trim().length < 10) {
        return json({ error: 'Justificativa obrigatória (mínimo 10 caracteres)' }, 400)
      }
      const safeDelJustificativa = justificativa.trim().slice(0, 500).replace(/<[^>]*>/g, '')

      const { data: rpcResult, error: rpcErr } = await userClient.rpc('soft_delete_inventory', {
        p_id: id, p_justificativa: safeDelJustificativa
      })
      if (rpcErr) {
        console.error('soft_delete_inventory RPC error:', JSON.stringify(rpcErr))
        const msg = rpcErr.message || 'Erro ao excluir inventário'
        const status = msg.startsWith('403:') || msg.includes('permissão') || msg.includes('Forbidden') ? 403 : 400
        return json({ error: msg }, status)
      }
      return json({ success: true, ...(rpcResult || {}) })
    }

    if (action === 'audit_logs') {
      const deny = await requirePermission('inventario:auditoria:view')
      if (deny) return deny

      const { inventario_id } = payload
      let query = adminClient.from('audit_inventario_log').select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(100)
      if (inventario_id) query = query.eq('inventario_id', inventario_id)
      const { data } = await query
      return json({ logs: data || [] })
    }

    if (action === 'list_conferentes') {
      const canView = await hasAnyPermission('inventario:conferentes:view', 'inventario:conferentes:manage')
      if (!canView) return forbidden('Sem permissão para listar conferentes')

      const { data } = await adminClient
        .from('inventario_conferentes')
        .select('id, user_id, created_at')
        .eq('company_id', companyId)
        .order('created_at')

      const userIds = (data || []).map((c: any) => c.user_id)
      const profileMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: profiles } = await adminClient.from('profiles').select('id, nome, email').in('id', userIds)
        ;(profiles || []).forEach((p: any) => { profileMap[p.id] = p.nome || p.email })
      }

      const conferentes = (data || []).map((c: any) => ({
        ...c,
        nome: profileMap[c.user_id] || 'Desconhecido',
      }))

      return json({ conferentes })
    }

    if (action === 'add_conferente') {
      const deny = await requirePermission('inventario:conferentes:manage')
      if (deny) return deny

      const { user_id } = payload
      if (!user_id) return json({ error: 'user_id obrigatório' }, 400)

      const { data: targetProfile } = await adminClient.from('company_memberships').select('company_id').eq('user_id', user_id).eq('company_id', companyId).eq('status', 'active').maybeSingle()
      if (!targetProfile || targetProfile.company_id !== companyId) return json({ error: 'Usuário não pertence a esta empresa' }, 400)

      const { error: insertErr } = await adminClient.from('inventario_conferentes').insert({
        company_id: companyId,
        user_id,
        added_by: user.id,
      })
      if (insertErr) {
        if (insertErr.code === '23505') return json({ error: 'Usuário já é conferente' }, 400)
        throw insertErr
      }

      await auditLog('', 'ADD_CONFERENTE', null, { user_id })
      return json({ success: true })
    }

    if (action === 'remove_conferente') {
      const deny = await requirePermission('inventario:conferentes:manage')
      if (deny) return deny

      const { conferente_id } = payload
      if (!conferente_id) return json({ error: 'conferente_id obrigatório' }, 400)

      const { data: conf } = await adminClient.from('inventario_conferentes')
        .select('user_id').eq('id', conferente_id).eq('company_id', companyId).single()

      await adminClient.from('inventario_conferentes').delete().eq('id', conferente_id).eq('company_id', companyId)
      await auditLog('', 'REMOVE_CONFERENTE', { user_id: conf?.user_id }, null)
      return json({ success: true })
    }

    if (action === 'assign_conferente') {
      const canAssign = await hasAnyPermission(
        'inventario:detalhe:edit',
        'inventario:conferentes:manage',
      )
      if (!canAssign) return forbidden('Sem permissão para atribuir conferente')

      const { inventario_id, conferente_user_id } = payload
      if (!inventario_id || !conferente_user_id) return json({ error: 'inventario_id e conferente_user_id obrigatórios' }, 400)

      const { data: inv } = await adminClient.from('inventarios')
        .select('status').eq('id', inventario_id).eq('company_id', companyId).is('deleted_at', null).single()
      if (!inv) return json({ error: 'Inventário não encontrado' }, 404)
      if (inv.status === 'FINALIZADO') return json({ error: 'Inventário já finalizado' }, 400)

      const { data: conf } = await adminClient.from('inventario_conferentes')
        .select('id').eq('user_id', conferente_user_id).eq('company_id', companyId).maybeSingle()
      if (!conf) return json({ error: 'Usuário não está na lista de conferentes autorizados' }, 400)

      await adminClient.from('inventarios').update({
        conferente_user_id: conferente_user_id,
        conferente_atribuido_em: new Date().toISOString(),
        conferente_atribuido_por: user.id,
        status: 'EM_REVISAO',
      }).eq('id', inventario_id).eq('company_id', companyId)

      await adminClient.from('notifications').insert({
        company_id: companyId,
        recipient_user_id: conferente_user_id,
        type: 'inventario_conferencia',
        title: '📋 Inventário atribuído para conferência',
        message: `Você foi designado(a) para conferir e finalizar um inventário.`,
        entity_type: 'inventario',
        entity_id: inventario_id,
        created_by: user.id,
        module: 'inventario',
        link_path: '/inventario',
      })

      await auditLog(inventario_id, 'ASSIGN_CONFERENTE', { status: inv.status }, {
        conferente_user_id, status: 'EM_REVISAO',
      })

      return json({ success: true })
    }

    return json({ error: 'Ação não reconhecida' }, 400)
  } catch (err) {
    console.error('Inventario error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}))

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function forbidden(msg = 'Sem permissão') {
  return json({ error: msg }, 403)
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'Não autorizado' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
