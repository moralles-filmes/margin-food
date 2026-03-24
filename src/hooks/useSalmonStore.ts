import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SalmonEntry, Manipulation, DailyRecord, StockConfig, StockState, Supplier, LotStock, MetaCompraMensal, AuditoriaCompra, LoteSalmaoLimpo, MetaProvisionadaSalmao, SmartSuggestion } from '@/types/salmon';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { emitDataEvent } from '@/lib/dataEvents';
import { todayBR, formatInBR } from '@/lib/datetime';

const defaultStockConfig: StockConfig = {
  minGrossKg: 50, minCleanKg: 30, staleDaysLimit: 7,
  perdaPercentAlerta: 15, perdaValorAlerta: 500,
  validadePadraoDias: 2, alertaVencimentoDias: 1,
};

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

// Map DB row → frontend SalmonEntry
function mapDbEntry(row: any): SalmonEntry {
  return {
    id: row.id,
    date: row.entry_date,
    lot: row.lot,
    sif: row.sif,
    supplier: row.supplier_name,
    totalValue: Number(row.total_value),
    pricePerKg: Number(row.unit_cost),
    boxes: row.boxes,
    units: row.units,
    grossKg: Number(row.gross_kg),
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

// Map DB row → frontend Manipulation
function mapDbManipulation(row: any): Manipulation {
  const grossKg = Number(row.gross_out_kg);
  const cleanKg = Number(row.clean_in_kg);
  const lossKg = grossKg - cleanKg;
  const lossPercent = grossKg > 0 ? (lossKg / grossKg) * 100 : 0;
  const yieldPercent = grossKg > 0 ? (cleanKg / grossKg) * 100 : 0;
  const costPerKg = Number(row.cost_per_kg_gross) || 0;
  return {
    id: row.id,
    entryId: row.entry_id,
    date: row.manipulation_date,
    lot: row.lot || '',
    sif: row.sif || '',
    supplier: row.supplier_name || '',
    fishCount: row.fish_count,
    grossKg,
    cleanKg,
    leftoverKg: Number(row.leftover_kg) || 0,
    leftoverRecorded: Number(row.leftover_kg) > 0,
    lossKg,
    lossPercent,
    yieldKg: cleanKg,
    yieldPercent,
    custoKgBrutoLote: costPerKg,
    perdaValor: lossKg * costPerKg,
    valorTotalBruto: grossKg * costPerKg,
    valorTotalLimpo: cleanKg * costPerKg,
    custoKgLimpo: cleanKg > 0 ? (grossKg * costPerKg) / cleanKg : 0,
    createdAt: row.created_at,
  };
}

export function useSalmonStore() {
  const [entries, setEntries] = useState<SalmonEntry[]>([]);
  const [manipulations, setManipulations] = useState<Manipulation[]>([]);
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [stockConfig, setStockConfigState] = useState<StockConfig>(defaultStockConfig);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [metasCompra, setMetasCompra] = useState<MetaCompraMensal[]>([]);
  const [auditorias, setAuditorias] = useState<AuditoriaCompra[]>([]);
  const [metasProvisionadas, setMetasProvisionadas] = useState<MetaProvisionadaSalmao[]>([]);
  const [inventoryAdjustmentKg, setInventoryAdjustmentKg] = useState(0);
  const [dbLoaded, setDbLoaded] = useState(false);

  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);

  // ── Load from DB on mount ──
  useEffect(() => {
    (async () => {
      try {
        // Entries
        const { data: dbEntries } = await supabase
          .from('salmon_entries')
          .select('*')
          .eq('status', 'ACTIVE')
          .order('entry_date', { ascending: false });

        if (dbEntries && dbEntries.length > 0) {
          setEntries(dbEntries.map(mapDbEntry));
        }

        // Manipulations
        const { data: dbManips } = await supabase
          .from('salmon_manipulations')
          .select('*')
          .eq('status', 'ACTIVE')
          .order('manipulation_date', { ascending: false });

        if (dbManips && dbManips.length > 0) {
          setManipulations(dbManips.map(mapDbManipulation));
        }

        // Config
        const { data: dbConfig } = await supabase
          .from('salmon_config')
          .select('*')
          .limit(1)
          .maybeSingle();

        if (dbConfig) {
          setStockConfigState({
            minGrossKg: Number(dbConfig.min_gross_kg) || 50,
            minCleanKg: Number(dbConfig.min_clean_kg) || 30,
            staleDaysLimit: Number(dbConfig.stale_days_limit) || 7,
            perdaPercentAlerta: Number(dbConfig.loss_percent_alert) || 15,
            perdaValorAlerta: Number(dbConfig.loss_value_alert) || 500,
            validadePadraoDias: Number(dbConfig.expiration_days) || 2,
            alertaVencimentoDias: Number(dbConfig.expiration_alert_days) || 1,
          });
        }

        // Daily records from salmon_daily_records
        const { data: dbDaily } = await supabase
          .from('salmon_daily_records')
          .select('*')
          .order('record_date', { ascending: false });

        if (dbDaily && dbDaily.length > 0) {
          setDailyRecords(dbDaily.map(r => ({
            id: r.id,
            date: r.record_date,
            revenue: Number(r.revenue) || 0,
            customers: r.clients_count || 0,
            createdAt: r.created_at,
          })));
        }

        // Suppliers from suppliers table
        const { data: dbSuppliers } = await supabase
          .from('suppliers')
          .select('*')
          .order('created_at', { ascending: false });

        if (dbSuppliers && dbSuppliers.length > 0) {
          setSuppliers(dbSuppliers.map((s: any) => ({
            id: s.id,
            name: s.name,
            cnpj: (s.contact_info as any)?.cnpj || '',
            contact: (s.contact_info as any)?.contact || '',
            notes: (s.contact_info as any)?.notes || '',
            active: s.is_active,
            categoriasAtendidas: (s.contact_info as any)?.categoriasAtendidas || [],
            prazoEntregaPadrao: (s.contact_info as any)?.prazoEntregaPadrao || 0,
            formaPagamentoPadrao: (s.contact_info as any)?.formaPagamentoPadrao || '',
            createdAt: s.created_at,
          })));
        }

        // Metas Compra from planning_metas_compra
        const { data: dbMetas } = await supabase
          .from('planning_metas_compra')
          .select('*')
          .eq('ativo', true)
          .order('year', { ascending: false })
          .order('month', { ascending: false });

        if (dbMetas && dbMetas.length > 0) {
          setMetasCompra(dbMetas.map((m: any) => ({
            id: m.id,
            mesAno: `${m.year}-${String(m.month).padStart(2, '0')}`,
            categoria: m.categoria,
            metaValorCompra: Number(m.target_value),
            alertaAmareloPercent: Number(m.alerta_amarelo_percent),
            alertaVermelhoPercent: Number(m.alerta_vermelho_percent),
            createdAt: m.created_at,
          })));
        }

        // Metas Provisionadas from salmon_metas_provisionadas
        const { data: dbMetasProv } = await supabase
          .from('salmon_metas_provisionadas')
          .select('*')
          .order('created_at', { ascending: false });

        if (dbMetasProv && dbMetasProv.length > 0) {
          setMetasProvisionadas(dbMetasProv.map((m: any) => ({
            id: m.id,
            mesAno: m.mes_ano,
            metaGramasPorCliente: Number(m.meta_gramas_por_cliente),
            createdAt: m.created_at,
          })));
        }

        // Auditorias from salmon_auditorias_compra
        const { data: dbAuditorias } = await supabase
          .from('salmon_auditorias_compra')
          .select('*')
          .order('created_at', { ascending: false });

        if (dbAuditorias && dbAuditorias.length > 0) {
          setAuditorias(dbAuditorias.map((a: any) => ({
            id: a.id,
            entradaId: a.entrada_id,
            dataEntrada: a.data_entrada,
            valorTotal: Number(a.valor_total),
            fornecedor: a.fornecedor,
            mesAno: a.mes_ano,
            statusMetaNoMomento: a.status_meta_no_momento,
            statusProjecaoNoMomento: a.status_projecao_no_momento,
            statusSemanaNoMomento: a.status_semana_no_momento,
            overrideAlerta: a.override_alerta,
            overrideTipo: a.override_tipo || [],
            overrideMotivo: a.override_motivo || '',
            createdBy: a.created_by || '',
            overrideUser: a.override_user || '',
            createdAt: a.created_at,
            overrideAt: a.override_at || '',
          })));
        }

        setDbLoaded(true);
      } catch (err) {
        console.error('Error loading salmon data from DB:', err);
        setDbLoaded(true);
      }
    })();
  }, []);

  // Fetch inventory adjustments for the salmon raw product
  useEffect(() => {
    (async () => {
      try {
        const { data: salmonProduct } = await supabase
          .from('produtos')
          .select('id')
          .eq('is_salmon_raw_linked', true)
          .maybeSingle();
        if (!salmonProduct) return;

        const { data: adjustments } = await supabase
          .from('movimentacoes_estoque')
          .select('tipo, quantidade')
          .eq('produto_id', salmonProduct.id)
          .eq('status', 'ATIVO')
          .in('tipo', ['AJUSTE_INVENTARIO_POSITIVO', 'AJUSTE_INVENTARIO_NEGATIVO']);

        if (adjustments && adjustments.length > 0) {
          const total = adjustments.reduce((sum, adj) => {
            if (adj.tipo === 'AJUSTE_INVENTARIO_POSITIVO') return sum + Number(adj.quantidade);
            if (adj.tipo === 'AJUSTE_INVENTARIO_NEGATIVO') return sum - Number(adj.quantidade);
            return sum;
          }, 0);
          setInventoryAdjustmentKg(total);
        }
      } catch (e) {
        console.error('Erro ao buscar ajustes de inventário para salmão:', e);
      }
    })();
  }, [entries, manipulations]);

  // Supplier CRUD — persisted to suppliers table
  const addSupplier = useCallback(async (s: Omit<Supplier, 'id' | 'createdAt'>) => {
    const contactInfo = {
      cnpj: s.cnpj || '',
      contact: s.contact || '',
      notes: s.notes || '',
      categoriasAtendidas: s.categoriasAtendidas || [],
      prazoEntregaPadrao: s.prazoEntregaPadrao || 0,
      formaPagamentoPadrao: s.formaPagamentoPadrao || '',
    };
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ name: s.name, is_active: s.active, contact_info: contactInfo as any })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao cadastrar fornecedor: ' + error.message);
      throw new Error(error.message);
    }

    const newS: Supplier = {
      id: data.id,
      name: data.name,
      cnpj: contactInfo.cnpj,
      contact: contactInfo.contact,
      notes: contactInfo.notes,
      active: data.is_active,
      categoriasAtendidas: contactInfo.categoriasAtendidas,
      prazoEntregaPadrao: contactInfo.prazoEntregaPadrao,
      formaPagamentoPadrao: contactInfo.formaPagamentoPadrao,
      createdAt: data.created_at,
    };
    setSuppliers(prev => [newS, ...prev]);
    return newS;
  }, []);

  const updateSupplier = useCallback(async (id: string, data: Partial<Supplier>) => {
    const current = suppliers.find(s => s.id === id);
    if (!current) return;

    const merged = { ...current, ...data };
    const contactInfo = {
      cnpj: merged.cnpj || '',
      contact: merged.contact || '',
      notes: merged.notes || '',
      categoriasAtendidas: merged.categoriasAtendidas || [],
      prazoEntregaPadrao: merged.prazoEntregaPadrao || 0,
      formaPagamentoPadrao: merged.formaPagamentoPadrao || '',
    };
    const updatePayload: any = { contact_info: contactInfo as any };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.active !== undefined) updatePayload.is_active = data.active;

    const { error } = await supabase.from('suppliers').update(updatePayload).eq('id', id);
    if (error) {
      toast.error('Erro ao atualizar fornecedor: ' + error.message);
      return;
    }
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  }, [suppliers]);

  const deleteSupplier = useCallback(async (id: string) => {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir fornecedor: ' + error.message);
      return;
    }
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }, []);

  const activeSuppliers = useMemo(() => suppliers.filter(s => s.active), [suppliers]);

  // Meta Compra Mensal CRUD — persisted to planning_metas_compra via direct insert/upsert
  const saveMetaCompra = useCallback(async (data: Omit<MetaCompraMensal, 'id' | 'createdAt'>) => {
    const [yearStr, monthStr] = data.mesAno.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const { data: result, error } = await supabase
      .from('planning_metas_compra')
      .upsert({
        year,
        month,
        categoria: data.categoria,
        target_value: data.metaValorCompra,
        alerta_amarelo_percent: data.alertaAmareloPercent,
        alerta_vermelho_percent: data.alertaVermelhoPercent,
        ativo: true,
      }, { onConflict: 'company_id,year,month,categoria' })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao salvar meta: ' + error.message);
      return;
    }

    const newMeta: MetaCompraMensal = {
      id: result.id,
      mesAno: data.mesAno,
      categoria: data.categoria,
      metaValorCompra: Number(result.target_value),
      alertaAmareloPercent: Number(result.alerta_amarelo_percent),
      alertaVermelhoPercent: Number(result.alerta_vermelho_percent),
      createdAt: result.created_at,
    };

    setMetasCompra(prev => {
      const existing = prev.find(m => m.mesAno === data.mesAno && m.categoria === data.categoria);
      if (existing) {
        return prev.map(m => (m.mesAno === data.mesAno && m.categoria === data.categoria) ? newMeta : m);
      }
      return [...prev, newMeta];
    });
  }, []);

  // Meta Provisionada CRUD — persisted to salmon_metas_provisionadas
  const saveMetaProvisionada = useCallback(async (data: Omit<MetaProvisionadaSalmao, 'id' | 'createdAt'>) => {
    const { data: result, error } = await supabase
      .from('salmon_metas_provisionadas')
      .upsert({
        mes_ano: data.mesAno,
        meta_gramas_por_cliente: data.metaGramasPorCliente,
      }, { onConflict: 'company_id,mes_ano' })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao salvar meta provisionada: ' + error.message);
      return;
    }

    const newMeta: MetaProvisionadaSalmao = {
      id: result.id,
      mesAno: data.mesAno,
      metaGramasPorCliente: Number(result.meta_gramas_por_cliente),
      createdAt: result.created_at,
    };

    setMetasProvisionadas(prev => {
      const existing = prev.find(m => m.mesAno === data.mesAno);
      if (existing) {
        return prev.map(m => m.mesAno === data.mesAno ? newMeta : m);
      }
      return [...prev, newMeta];
    });
  }, []);

  // ── ENTRY CRUD via atomic RPCs ──

  const addEntry = useCallback(async (entry: Omit<SalmonEntry, 'id' | 'createdAt'>) => {
    const { data, error } = await supabase.rpc('_salmon_create_entry_guarded' as any, {
      p_entry_date: entry.date,
      p_lot: entry.lot || '',
      p_sif: entry.sif || '',
      p_supplier_name: entry.supplier || '',
      p_boxes: entry.boxes || 0,
      p_units: entry.units || 0,
      p_gross_kg: entry.grossKg,
      p_total_value: entry.totalValue,
      p_notes: entry.notes || '',
    });

    if (error) {
      toast.error('Falha ao registrar entrada: ' + error.message, { duration: 8000 });
      throw new Error(error.message);
    }

    const result = data as any;
    const newEntry: SalmonEntry = {
      ...entry,
      id: result.entry_id,
      pricePerKg: Number(result.unit_cost),
      createdAt: new Date().toISOString(),
    };

    setEntries(prev => [newEntry, ...prev]);
    emitDataEvent('salmao:entradas');
    return newEntry;
  }, []);

  const updateEntry = useCallback(async (id: string, data: Partial<Omit<SalmonEntry, 'id' | 'createdAt'>>) => {
    // For updates, cancel old + create new (simplest atomic approach)
    const current = entries.find(e => e.id === id);
    if (!current) return;

    const updated = { ...current, ...data };
    if (data.totalValue !== undefined || data.grossKg !== undefined) {
      updated.pricePerKg = updated.grossKg > 0 ? updated.totalValue / updated.grossKg : 0;
    }

    // Cancel old entry
    const { error: cancelError } = await supabase.rpc('_salmon_cancel_entry_guarded' as any, {
      p_entry_id: id,
      p_reason: 'Edição de entrada',
    });

    if (cancelError) {
      toast.error('Falha ao editar entrada: ' + cancelError.message, { duration: 6000 });
      throw new Error(cancelError.message);
    }

    // Create new one
    const { data: newData, error: createError } = await supabase.rpc('_salmon_create_entry_guarded' as any, {
      p_entry_date: updated.date,
      p_lot: updated.lot || '',
      p_sif: updated.sif || '',
      p_supplier_name: updated.supplier || '',
      p_boxes: updated.boxes || 0,
      p_units: updated.units || 0,
      p_gross_kg: updated.grossKg,
      p_total_value: updated.totalValue,
      p_notes: updated.notes || '',
    });

    if (createError) {
      toast.error('Entrada cancelada mas falha ao recriar: ' + createError.message, { duration: 8000 });
      setEntries(prev => prev.filter(e => e.id !== id));
      throw new Error(createError.message);
    }

    const result = newData as any;
    setEntries(prev => prev.map(e => e.id === id ? {
      ...updated,
      id: result.entry_id,
      pricePerKg: Number(result.unit_cost),
    } : e));
    emitDataEvent('salmao:entradas');
  }, [entries]);

  const deleteEntry = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('_salmon_cancel_entry_guarded' as any, {
      p_entry_id: id,
      p_reason: 'Entrada de salmão excluída',
    });
    if (error) {
      toast.error('Falha ao excluir entrada: ' + error.message, { duration: 6000 });
      throw new Error(error.message);
    }
    setEntries(prev => prev.filter(e => e.id !== id));
    emitDataEvent('salmao:entradas');
  }, []);

  // ── MANIPULATION CRUD via atomic RPCs ──

  const addManipulation = useCallback(async (m: Omit<Manipulation, 'id' | 'createdAt' | 'lossKg' | 'lossPercent' | 'yieldKg' | 'yieldPercent' | 'perdaValor' | 'valorTotalBruto' | 'valorTotalLimpo'>) => {
    const { data, error } = await supabase.rpc('_salmon_create_manipulation_guarded' as any, {
      p_entry_id: m.entryId,
      p_manipulation_date: m.date,
      p_fish_count: m.fishCount || 0,
      p_gross_out_kg: m.grossKg,
      p_clean_in_kg: m.cleanKg,
      p_leftover_kg: m.leftoverKg || 0,
      p_notes: '',
    });

    if (error) {
      toast.error('Falha ao registrar manipulação: ' + error.message, { duration: 8000 });
      throw new Error(error.message);
    }

    const result = data as any;
    const lossKg = m.grossKg - m.cleanKg;
    const custoKg = m.custoKgBrutoLote || 0;
    const newM: Manipulation = {
      ...m,
      id: result.manipulation_id,
      lossKg,
      lossPercent: m.grossKg > 0 ? (lossKg / m.grossKg) * 100 : 0,
      yieldKg: m.cleanKg,
      yieldPercent: Number(result.yield_percent) || 0,
      perdaValor: lossKg * custoKg,
      valorTotalBruto: m.grossKg * custoKg,
      valorTotalLimpo: m.cleanKg * custoKg,
      leftoverRecorded: false,
      createdAt: new Date().toISOString(),
    };

    setManipulations(prev => [newM, ...prev]);
    emitDataEvent('salmao:manipulacoes');
    return newM;
  }, []);

  const updateManipulation = useCallback(async (id: string, m: Omit<Manipulation, 'id' | 'createdAt' | 'lossKg' | 'lossPercent' | 'yieldKg' | 'yieldPercent' | 'perdaValor' | 'valorTotalBruto' | 'valorTotalLimpo'>) => {
    // Cancel + recreate
    const { error: cancelError } = await supabase.rpc('_salmon_cancel_manipulation_guarded' as any, {
      p_manip_id: id,
      p_reason: 'Edição de manipulação',
    });

    if (cancelError) {
      toast.error('Falha ao editar manipulação: ' + cancelError.message, { duration: 6000 });
      throw new Error(cancelError.message);
    }

    const { data, error: createError } = await supabase.rpc('_salmon_create_manipulation_guarded' as any, {
      p_entry_id: m.entryId,
      p_manipulation_date: m.date,
      p_fish_count: m.fishCount || 0,
      p_gross_out_kg: m.grossKg,
      p_clean_in_kg: m.cleanKg,
      p_leftover_kg: m.leftoverKg || 0,
      p_notes: '',
    });

    if (createError) {
      toast.error('Manipulação cancelada mas falha ao recriar: ' + createError.message, { duration: 8000 });
      setManipulations(prev => prev.filter(x => x.id !== id));
      throw new Error(createError.message);
    }

    const result = data as any;
    const lossKg = m.grossKg - m.cleanKg;
    const custoKg = m.custoKgBrutoLote || 0;

    setManipulations(prev => prev.map(x => x.id === id ? {
      ...m,
      id: result.manipulation_id,
      lossKg,
      lossPercent: m.grossKg > 0 ? (lossKg / m.grossKg) * 100 : 0,
      yieldKg: m.cleanKg,
      yieldPercent: Number(result.yield_percent) || 0,
      perdaValor: lossKg * custoKg,
      valorTotalBruto: m.grossKg * custoKg,
      valorTotalLimpo: m.cleanKg * custoKg,
      leftoverRecorded: false,
      createdAt: x.createdAt,
    } : x));
  }, []);

  const deleteManipulation = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('_salmon_cancel_manipulation_guarded' as any, {
      p_manip_id: id,
      p_reason: 'Manipulação de salmão excluída',
    });
    if (error) {
      toast.error('Falha ao excluir manipulação: ' + error.message, { duration: 6000 });
      throw new Error(error.message);
    }
    setManipulations(prev => prev.filter(m => m.id !== id));
    emitDataEvent('salmao:manipulacoes');
  }, []);

  const recordLeftover = useCallback(async (id: string, leftoverKg: number) => {
    const m = manipulations.find(x => x.id === id);
    if (!m) return;

    // Persist to salmon_daily_records via atomic RPC
    const { data, error } = await supabase.rpc('upsert_salmon_leftover_atomic' as any, {
      p_record_date: m.date,
      p_leftover_kg: leftoverKg,
      p_note: `Manipulação ${id}`,
    });

    if (error) {
      toast.error('Falha ao salvar sobra do dia: ' + error.message, { duration: 6000 });
      throw new Error(error.message);
    }

    const result = data as any;
    if (result && result.success === false) {
      toast.error('Falha ao salvar sobra: ' + (result.error || 'Erro desconhecido'));
      throw new Error(result.error || 'RPC returned failure');
    }

    // Update local state
    setManipulations(prev => prev.map(x => {
      if (x.id !== id) return x;
      return { ...x, leftoverKg, leftoverRecorded: true };
    }));
  }, [manipulations]);

  const addDailyRecord = useCallback(async (r: Omit<DailyRecord, 'id' | 'createdAt'>) => {
    const { data, error } = await supabase
      .from('salmon_daily_records')
      .upsert({
        record_date: r.date,
        revenue: r.revenue,
        clients_count: r.customers,
      }, { onConflict: 'company_id,record_date' })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao salvar registro diário: ' + error.message);
      throw new Error(error.message);
    }

    const newR: DailyRecord = {
      id: data.id,
      date: data.record_date,
      revenue: Number(data.revenue) || 0,
      customers: data.clients_count || 0,
      createdAt: data.created_at,
    };
    setDailyRecords(prev => [newR, ...prev.filter(x => x.date !== r.date)]);
    return newR;
  }, []);

  const deleteDailyRecord = useCallback(async (id: string) => {
    const { error } = await supabase.from('salmon_daily_records').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir registro diário: ' + error.message);
      throw new Error(error.message);
    }
    setDailyRecords(prev => prev.filter(r => r.id !== id));
  }, []);

  const setStockConfig = useCallback(async (config: StockConfig) => {
    setStockConfigState(config);
    // Persist to DB
    try {
      const { data: existing } = await supabase.from('salmon_config').select('id').limit(1).maybeSingle();
      if (existing) {
        await supabase.from('salmon_config').update({
          min_gross_kg: config.minGrossKg,
          min_clean_kg: config.minCleanKg,
          stale_days_limit: config.staleDaysLimit,
          loss_percent_alert: config.perdaPercentAlerta,
          loss_value_alert: config.perdaValorAlerta,
          expiration_days: config.validadePadraoDias,
          expiration_alert_days: config.alertaVencimentoDias,
        }).eq('id', existing.id);
      }
    } catch (e) {
      console.error('Error saving salmon config:', e);
    }
  }, []);

  // Computed stock
  const stock: StockState = useMemo(() => {
    const totalGrossIn = entries.reduce((s, e) => s + e.grossKg, 0);
    const totalGrossOut = manipulations.reduce((s, m) => s + m.grossKg, 0);
    const totalValue = entries.reduce((s, e) => s + e.totalValue, 0);
    const grossKg = totalGrossIn - totalGrossOut + inventoryAdjustmentKg;
    const avgCostPerKg = totalGrossIn > 0 ? totalValue / totalGrossIn : 0;
    const cleanKg = manipulations.reduce((s, m) => {
      if (m.leftoverRecorded) return s + m.leftoverKg;
      return s + m.cleanKg;
    }, 0);
    return { grossKg: Math.max(0, grossKg), cleanKg: Math.max(0, cleanKg), grossValue: grossKg * avgCostPerKg, avgCostPerKg };
  }, [entries, manipulations, inventoryAdjustmentKg]);

  // Lot-level stock
  const lotStocks: LotStock[] = useMemo(() => {
    const todayStr = todayBR();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const today = new Date(ty, tm - 1, td);
    return entries.map(entry => {
      const lotManips = manipulations.filter(m => m.entryId === entry.id);
      const manipulatedKg = lotManips.reduce((s, m) => s + m.grossKg, 0);
      const balanceKg = Math.max(0, entry.grossKg - manipulatedKg);
      const avgYield = lotManips.length > 0
        ? lotManips.reduce((s, m) => s + m.yieldPercent, 0) / lotManips.length
        : undefined;
      const sup = suppliers.find(s => s.name === entry.supplier);
      const costPerKgBruto = entry.grossKg > 0 ? entry.totalValue / entry.grossKg : 0;
      const lastManipDate = lotManips.length > 0
        ? lotManips.reduce((latest, m) => m.date > latest ? m.date : latest, lotManips[0].date)
        : null;
      const lastMovementDate = lastManipDate || entry.date;
      const daysSinceMovement = Math.floor((today.getTime() - new Date(lastMovementDate).getTime()) / (1000 * 60 * 60 * 24));
      const isStale = balanceKg > 0 && daysSinceMovement >= (stockConfig.staleDaysLimit || 7);
      return {
        entryId: entry.id, lot: entry.lot, sif: entry.sif, supplier: entry.supplier,
        supplierActive: sup ? sup.active : true,
        entryDate: entry.date, entryGrossKg: entry.grossKg, entryTotalValue: entry.totalValue,
        costPerKgBruto, manipulatedKg, balanceKg, avgYield,
        lastMovementDate, daysSinceMovement, isStale,
      };
    }).sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());
  }, [entries, manipulations, suppliers, stockConfig.staleDaysLimit]);

  const availableLots = useMemo(() => lotStocks.filter(l => l.balanceKg > 0), [lotStocks]);
  const staleLots = useMemo(() => lotStocks.filter(l => l.isStale), [lotStocks]);
  const fifoLot = useMemo(() => availableLots.length > 0 ? availableLots[0] : null, [availableLots]);

  // Lotes Limpos
  const lotesLimpos: LoteSalmaoLimpo[] = useMemo(() => {
    const todayStr = todayBR();
    const [ty2, tm2, td2] = todayStr.split('-').map(Number);
    const today = new Date(ty2, tm2 - 1, td2);
    const validadeDias = stockConfig.validadePadraoDias || 2;
    const alertaDias = stockConfig.alertaVencimentoDias || 1;

    return manipulations.map(m => {
      const consumido = m.leftoverRecorded ? (m.cleanKg - m.leftoverKg) : 0;
      const restante = m.leftoverRecorded ? m.leftoverKg : m.cleanKg;
      const [y, mo, d] = m.date.split('-').map(Number);
      const dataManip = new Date(y, mo - 1, d);
      const dataValidade = new Date(y, mo - 1, d + validadeDias);

      const diffDays = Math.floor((dataValidade.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      let status: 'FRESCO' | 'VENCE_HOJE' | 'VENCIDO' = 'FRESCO';
      if (diffDays < 0) status = 'VENCIDO';
      else if (diffDays <= alertaDias) status = 'VENCE_HOJE';

      return {
        manipulacaoId: m.id,
        kgLimpoTotal: m.cleanKg,
        kgConsumido: consumido,
        kgRestante: Math.max(0, restante),
        custoKg: m.custoKgLimpo || 0,
        dataManipulacao: m.date,
        dataValidade: `${dataValidade.getFullYear()}-${String(dataValidade.getMonth() + 1).padStart(2, '0')}-${String(dataValidade.getDate()).padStart(2, '0')}`,
        lote: m.lot,
        sif: m.sif,
        fornecedor: m.supplier,
        status,
      };
    }).filter(l => l.kgRestante > 0);
  }, [manipulations, stockConfig.validadePadraoDias, stockConfig.alertaVencimentoDias]);

  // Avg daily consumption (last 30 days)
  const avgDailyConsumption = useMemo(() => {
    const tStr = todayBR();
    const [ty3, tm3, td3] = tStr.split('-').map(Number);
    const thirtyDaysAgo = new Date(ty3, tm3 - 1, td3 - 30);
    const recent = manipulations.filter(m => {
      const [y, mo, d] = m.date.split('-').map(Number);
      return new Date(y, mo - 1, d) >= thirtyDaysAgo;
    });
    const totalConsumed = recent.reduce((s, m) => s + (m.cleanKg - m.leftoverKg), 0);
    const days = Math.max(1, new Set(recent.map(m => m.date)).size);
    return totalConsumed / days;
  }, [manipulations]);

  const daysRemaining = avgDailyConsumption > 0 ? Math.floor(stock.cleanKg / avgDailyConsumption) : Infinity;

  // Smart Suggestion
  const smartSuggestion: SmartSuggestion | null = useMemo(() => {
    if (manipulations.length === 0) return null;

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const tStr = todayBR();
    const [ty4, tm4, td4] = tStr.split('-').map(Number);
    const today = new Date(ty4, tm4 - 1, td4);
    const dayOfWeek = today.getDay();
    const dayOfMonth = today.getDate();
    const weekOfMonth = dayOfMonth <= 7 ? 1 : dayOfMonth <= 14 ? 2 : dayOfMonth <= 21 ? 3 : dayOfMonth <= 28 ? 4 : 5;

    const getWeekOfMonth = (date: Date) => {
      const d = date.getDate();
      return d <= 7 ? 1 : d <= 14 ? 2 : d <= 21 ? 3 : d <= 28 ? 4 : 5;
    };

    const buildFallback = (source: Manipulation[]) => {
      const avgClean = source.reduce((s, m) => s + (m.cleanKg - m.leftoverKg), 0) / source.length;
      const avgGross = source.reduce((s, m) => s + m.grossKg, 0) / source.length;
      const avgFish = source.reduce((s, m) => s + m.fishCount, 0) / source.length;
      const avgYield = source.reduce((s, m) => s + m.yieldPercent, 0) / source.length;
      return {
        kgLimpoSugerido: Math.round(avgClean * 10) / 10,
        kgBrutoSugerido: Math.round((avgYield > 0 ? avgClean / (avgYield / 100) : avgGross) * 10) / 10,
        peixesSugeridos: Math.ceil(avgFish),
        fallback: true,
        explicacao: `Baseado na média das últimas ${source.length} manipulações`,
      };
    };

    if (manipulations.length < 3) {
      return buildFallback(manipulations.slice(0, 3));
    }

    const sameDayManips = manipulations
      .filter(m => {
        const [y, mo, d] = m.date.split('-').map(Number);
        return new Date(y, mo - 1, d).getDay() === dayOfWeek;
      })
      .slice(0, 8);

    if (sameDayManips.length === 0) {
      return buildFallback(manipulations.slice(0, 3));
    }

    const avgConsumoReal = sameDayManips.reduce((s, m) => s + (m.cleanKg - m.leftoverKg), 0) / sameDayManips.length;
    const avgSobra = sameDayManips.reduce((s, m) => s + m.leftoverKg, 0) / sameDayManips.length;
    const avgGrossDay = sameDayManips.reduce((s, m) => s + m.grossKg, 0) / sameDayManips.length;
    const avgFishDay = sameDayManips.reduce((s, m) => s + m.fishCount, 0) / sameDayManips.length;
    const avgYieldDay = sameDayManips.reduce((s, m) => s + m.yieldPercent, 0) / sameDayManips.length;

    const sameWeekManips = sameDayManips.filter(m => {
      const [y, mo, d] = m.date.split('-').map(Number);
      return getWeekOfMonth(new Date(y, mo - 1, d)) === weekOfMonth;
    });
    const avgConsumoWeek = sameWeekManips.length > 0
      ? sameWeekManips.reduce((s, m) => s + (m.cleanKg - m.leftoverKg), 0) / sameWeekManips.length
      : avgConsumoReal;
    const fatorSemanaMes = Math.max(0.85, Math.min(1.15, avgConsumoReal > 0 ? avgConsumoWeek / avgConsumoReal : 1));

    const monthStart = new Date(ty4, tm4 - 1, 1);
    const monthManips = manipulations.filter(m => {
      const [y, mo, d] = m.date.split('-').map(Number);
      return new Date(y, mo - 1, d) >= monthStart;
    });
    const consumoAteSemana = monthManips.reduce((s, m) => s + (m.cleanKg - m.leftoverKg), 0);
    const daysElapsed = Math.max(1, today.getDate());
    const uniqueDays = new Set(manipulations.map(m => m.date)).size;
    const avgDailyAll = uniqueDays > 0
      ? manipulations.reduce((s, m) => s + (m.cleanKg - m.leftoverKg), 0) / uniqueDays
      : 0;
    const esperado = avgDailyAll * daysElapsed;
    const ajustePressao = Math.max(0.85, Math.min(1.15, esperado > 0 ? consumoAteSemana / esperado : 1));

    const kgLimpoSugerido = avgConsumoReal * fatorSemanaMes * ajustePressao + avgSobra;
    const aprovMedio = avgYieldDay / 100;
    const kgBrutoSugerido = aprovMedio > 0 ? kgLimpoSugerido / aprovMedio : avgGrossDay;
    const kgMedioPorPeixe = avgFishDay > 0 ? avgGrossDay / avgFishDay : 0;
    const peixesSugeridos = kgMedioPorPeixe > 0 ? Math.ceil(kgBrutoSugerido / kgMedioPorPeixe) : Math.ceil(avgFishDay);

    return {
      kgLimpoSugerido: Math.round(kgLimpoSugerido * 10) / 10,
      kgBrutoSugerido: Math.round(kgBrutoSugerido * 10) / 10,
      peixesSugeridos,
      fallback: false,
      fatorSemanaMes,
      ajustePressao,
      historicoBase: sameDayManips.length,
      explicacao: `Baseado em ${sameDayManips.length} ${dayNames[dayOfWeek]}s, ajustado por W${weekOfMonth} (×${fatorSemanaMes.toFixed(2)}) e pressão (×${ajustePressao.toFixed(2)})`,
    };
  }, [manipulations]);

  // Supplier stats
  const supplierStats = useMemo(() => {
    const supplierNames = [...new Set(entries.map(e => e.supplier))];
    return supplierNames.map(name => {
      const sEntries = entries.filter(e => e.supplier === name);
      const sManips = manipulations.filter(m => m.supplier === name);
      const totalKg = sEntries.reduce((s, e) => s + e.grossKg, 0);
      const totalValue = sEntries.reduce((s, e) => s + e.totalValue, 0);
      const avgPrice = totalKg > 0 ? totalValue / totalKg : 0;
      const avgLoss = sManips.length > 0 ? sManips.reduce((s, m) => s + m.lossPercent, 0) / sManips.length : 0;
      const avgYield = sManips.length > 0 ? sManips.reduce((s, m) => s + m.yieldPercent, 0) / sManips.length : 0;
      const cleanKg = sManips.reduce((s, m) => s + m.cleanKg, 0);
      const costPerCleanKg = cleanKg > 0 ? totalValue / cleanKg : 0;
      const score = avgYield - avgLoss - (avgPrice / 10);
      return { name, totalKg, totalValue, avgPrice, avgLoss, avgYield, costPerCleanKg, purchases: sEntries.length, score };
    }).sort((a, b) => b.score - a.score);
  }, [entries, manipulations]);

  // Auditoria CRUD — persisted to salmon_auditorias_compra
  const addAuditoria = useCallback(async (a: Omit<AuditoriaCompra, 'id' | 'createdAt'>) => {
    const { data, error } = await supabase
      .from('salmon_auditorias_compra')
      .insert({
        entrada_id: a.entradaId,
        data_entrada: a.dataEntrada,
        valor_total: a.valorTotal,
        fornecedor: a.fornecedor,
        mes_ano: a.mesAno,
        status_meta_no_momento: a.statusMetaNoMomento,
        status_projecao_no_momento: a.statusProjecaoNoMomento,
        status_semana_no_momento: a.statusSemanaNoMomento,
        override_alerta: a.overrideAlerta,
        override_tipo: a.overrideTipo || [],
        override_motivo: a.overrideMotivo || '',
        created_by: a.createdBy || '',
        override_user: a.overrideUser || '',
        override_at: a.overrideAt || null,
      } as any)
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar auditoria:', error);
      // Fallback to local state
      const newA: AuditoriaCompra = { ...a, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      setAuditorias(prev => [newA, ...prev]);
      return newA;
    }

    const newA: AuditoriaCompra = {
      ...a,
      id: data.id,
      createdAt: data.created_at,
    };
    setAuditorias(prev => [newA, ...prev]);
    return newA;
  }, []);

  // Sync all (legacy compatibility — now mostly no-op since DB is master)
  const syncAllToStock = useCallback(async () => {
    return { synced: 0, errors: 0, total: 0 };
  }, []);

  // Reload from DB
  const reloadFromDb = useCallback(async () => {
    const { data: dbEntries } = await supabase
      .from('salmon_entries')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('entry_date', { ascending: false });
    if (dbEntries) setEntries(dbEntries.map(mapDbEntry));

    const { data: dbManips } = await supabase
      .from('salmon_manipulations')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('manipulation_date', { ascending: false });
    if (dbManips) setManipulations(dbManips.map(mapDbManipulation));
  }, []);

  return {
    entries, manipulations, dailyRecords, stockConfig, stock,
    avgDailyConsumption, daysRemaining, supplierStats,
    suppliers, activeSuppliers, lotStocks, availableLots,
    staleLots, fifoLot, metasCompra, auditorias,
    lotesLimpos, metasProvisionadas, smartSuggestion,
    addEntry, updateEntry, deleteEntry,
    addManipulation, updateManipulation, deleteManipulation, recordLeftover,
    addDailyRecord, deleteDailyRecord, setStockConfig,
    addSupplier, updateSupplier, deleteSupplier,
    saveMetaCompra, saveMetaProvisionada, addAuditoria,
    syncAllToStock, reloadFromDb, dbLoaded,
  };
}
