import { useState, useEffect, useRef } from 'react';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/brl-input';
import { fmtBRL } from '@/lib/money';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDateBR } from '@/lib/datetime';
import { Upload, CheckCircle, Save, RefreshCw, ArrowRight, Receipt, Eye, Plus, Trash2, PieChart, ArrowRightLeft, Search, CreditCard, FileText } from 'lucide-react';
import CriarLancamentoExtratoDialog from '@/components/financeiro/CriarLancamentoExtratoDialog';
import type { ContaBancariaRef, CategoriaFinRef, CentroCustoRef, LancamentoConciliacao, LancamentoCandidate, ContaPagarCandidate, ContaReceberCandidate } from '@/types/financeiro';

/* ───────── Types ───────── */

interface MatchSuggestion {
  id: string;
  origin: 'lancamento' | 'conta_pagar' | 'conta_receber';
  descricao: string;
  valor: number;
  data: string;
  extra?: string;
  score: number;
  raw: LancamentoCandidate | ContaPagarCandidate | ContaReceberCandidate;
}

interface LinhaExtrato {
  data: string;
  descricao: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA';
  selecionada: boolean;
  matchId?: string;
  matchOrigin?: MatchSuggestion['origin'];
  matchDescricao?: string;
  matchRaw?: MatchSuggestion['raw'];
  suggestions?: MatchSuggestion[];
  rateioLinhas?: RateioLinha[];
}

interface RateioLinha {
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  observacao: string;
}

/* ───────── Scoring helper ───────── */
function computeScore(extratoValor: number, extratoData: string, extratoDesc: string, candidateValor: number, candidateData: string, candidateDesc: string): number {
  let score = 0;
  // Value match (0-50 points)
  const diff = Math.abs(candidateValor - extratoValor);
  const tolerance = Math.max(extratoValor * 0.01, 0.01);
  if (diff < 0.01) score += 50;
  else if (diff <= tolerance) score += 40;
  else if (diff <= extratoValor * 0.05) score += 20;
  else return 0; // too different

  // Date proximity (0-30 points)
  const d1 = new Date(extratoData);
  const d2 = new Date(candidateData);
  const daysDiff = Math.abs((d1.getTime() - d2.getTime()) / 86400000);
  if (daysDiff === 0) score += 30;
  else if (daysDiff <= 1) score += 25;
  else if (daysDiff <= 3) score += 15;
  else if (daysDiff <= 7) score += 5;
  else return 0; // too far

  // Description similarity (0-20 points)
  if (extratoDesc && candidateDesc) {
    const a = extratoDesc.toLowerCase().trim();
    const b = candidateDesc.toLowerCase().trim();
    if (a === b) score += 20;
    else if (a.includes(b) || b.includes(a)) score += 15;
    else {
      const wordsA = a.split(/\s+/);
      const wordsB = new Set(b.split(/\s+/));
      const common = wordsA.filter(w => w.length > 2 && wordsB.has(w)).length;
      score += Math.min(common * 3, 10);
    }
  }

  return score;
}

export default function ConciliacaoBancariaSection() {
  const { user } = useAuth();
  const [contas, setContas] = useState<ContaBancariaRef[]>([]);
  const [contaSel, setContaSel] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [linhas, setLinhas] = useState<LinhaExtrato[]>([]);
  const [importando, setImportando] = useState(false);

  const [lancamentos, setLancamentos] = useState<LancamentoConciliacao[]>([]);
  const [filtro, setFiltro] = useState<'pendentes' | 'conciliados' | 'todos'>('pendentes');
  const [view, setView] = useState<'importar' | 'conciliar'>('conciliar');

  // Confirmation dialogs
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; linhaIndex: number; match: MatchSuggestion | null }>({ open: false, linhaIndex: -1, match: null });
  const [processando, setProcessando] = useState(false);

  // Suggestions dialog
  const [suggestionsDialog, setSuggestionsDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });

  // Rateio dialog state
  const [rateioDialog, setRateioDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });
  const [rateioLinhas, setRateioLinhas] = useState<RateioLinha[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinRef[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<CentroCustoRef[]>([]);

  // Transfer dialog state
  const [transferDialog, setTransferDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });
  const [transferContaDestino, setTransferContaDestino] = useState('');

  // Create lancamento from extrato dialog
  const [criarDialog, setCriarDialog] = useState<{ open: boolean; linhaIndex: number }>({ open: false, linhaIndex: -1 });

  useEffect(() => {
    supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => {
        setContas(data || []);
        if (data && data.length > 0 && !contaSel) setContaSel(data[0].id);
      });
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
    ]).then(([catRes, ccRes]) => {
      setCategorias(catRes.data || []);
      setCentrosCusto(ccRes.data || []);
    });
  }, []);

  useEffect(() => { if (contaSel && view === 'conciliar') loadLancamentos(); }, [contaSel, filtro, view]);

  const loadLancamentos = async () => {
    setLoading(true);
    // Fetch both pending and reconciled to have accurate counts in the UI
    const { data, error } = await supabase
      .from('fin_lancamentos')
      .select('id, data_competencia, valor, tipo, descricao, conta_id, categoria_id, centro_custo_id, status, conciliado, conciliado_em, conciliado_por, created_at')
      .eq('conta_id', contaSel)
      .eq('status', 'REALIZADO')
      .order('data_competencia', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Error loading lancamentos:', error);
      toast.error('Erro ao carregar lançamentos');
    }
    
    setLancamentos(data || []);
    setLoading(false);
  };

  const conciliar = async (id: string, value: boolean) => {
    if (value) {
      const { error } = await supabase.rpc('reconcile_batch_lancamentos', { p_lancamento_ids: [id] });
      if (error) { toast.error(error.message); return; }
    } else {
      await (supabase.from('fin_lancamentos').update({ conciliado: false, conciliado_em: null, conciliado_por: null } as Record<string, unknown>) as unknown as { eq: (col: string, val: string) => Promise<unknown> }).eq('id', id);
    }
    setLancamentos(prev => prev.map(l => l.id === id ? { ...l, conciliado: value } : l));
    toast.success(value ? 'Lançamento conciliado' : 'Conciliação removida');
    emitDataEvent('financeiro:conciliacao');
  };

  const conciliarTodos = async () => {
    const pendentes = lancamentos.filter(l => !l.conciliado);
    if (pendentes.length === 0) return;
    const ids = pendentes.map(l => l.id);
    const { data, error } = await supabase.rpc('reconcile_batch_lancamentos', { p_lancamento_ids: ids });
    if (error) { toast.error(error.message); return; }
    const count = (data as unknown as { reconciled_count?: number } | null)?.reconciled_count || ids.length;
    setLancamentos(prev => prev.map(l => ids.includes(l.id) ? { ...l, conciliado: true } : l));
    toast.success(`${count} lançamentos conciliados`);
    emitDataEvent('financeiro:conciliacao');
  };

  // ========== File Parsing ==========
  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    const parsed: LinhaExtrato[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sep = line.includes(';') ? ';' : ',';
      const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 3) continue;
      let data = '', descricao = '', valor = 0;
      const dateCandidate = parts[0];
      if (/\d{2}[\/\-]\d{2}[\/\-]\d{2,4}/.test(dateCandidate)) {
        const dateParts = dateCandidate.split(/[\/\-]/);
        if (dateParts.length === 3) {
          const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
          data = `${year}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        }
      } else if (/\d{4}-\d{2}-\d{2}/.test(dateCandidate)) {
        data = dateCandidate;
      }
      if (!data) continue;
      descricao = parts[1] || '';
      for (let j = parts.length - 1; j >= 2; j--) {
        const numStr = parts[j].replace(/\./g, '').replace(',', '.').replace(/[^\d\-\.]/g, '');
        const num = parseFloat(numStr);
        if (!isNaN(num) && num !== 0) { valor = num; break; }
      }
      if (!descricao || valor === 0) continue;
      parsed.push({ data, descricao, valor: Math.abs(valor), tipo: valor > 0 ? 'RECEITA' : 'DESPESA', selecionada: true });
    }
    return parsed;
  };

  const parseOFX = (text: string) => {
    const parsed: LinhaExtrato[] = [];
    const transactions = text.split('<STMTTRN>').slice(1);
    for (const tx of transactions) {
      const getTag = (tag: string) => { const m = tx.match(new RegExp(`<${tag}>([^<\\n]+)`)); return m ? m[1].trim() : ''; };
      const dtposted = getTag('DTPOSTED');
      const trnamt = getTag('TRNAMT');
      const memo = getTag('MEMO') || getTag('NAME') || getTag('FITID');
      if (!dtposted || !trnamt) continue;
      const valor = parseFloat(trnamt.replace(',', '.'));
      const data = dtposted.length >= 8 ? `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}` : '';
      if (!data || isNaN(valor)) continue;
      parsed.push({ data, descricao: memo || 'Sem descrição', valor: Math.abs(valor), tipo: valor >= 0 ? 'RECEITA' : 'DESPESA', selecionada: true });
    }
    return parsed;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const ext = file.name.toLowerCase().split('.').pop();
      let parsed: LinhaExtrato[] = ext === 'ofx' || ext === 'qfx' ? parseOFX(text) : parseCSV(text);

      if (parsed.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo.');
        setLoading(false);
        return;
      }

      // ──── Fetch all candidate data in parallel ────
      const [lancRes, lancAllRes, cpRes, crRes, conciliadosRes] = await Promise.all([
        // Lancamentos from same account
        contaSel ? supabase.from('fin_lancamentos').select('id, data_competencia, valor, tipo, descricao, conciliado, conta_id')
          .eq('conta_id', contaSel).eq('status', 'REALIZADO').or('conciliado.is.null,conciliado.eq.false') : Promise.resolve({ data: [] }),
        // Lancamentos from ANY account (for broader matching)
        supabase.from('fin_lancamentos').select('id, data_competencia, valor, tipo, descricao, conciliado, conta_id')
          .eq('status', 'REALIZADO').or('conciliado.is.null,conciliado.eq.false').limit(500),
        // Contas a pagar (pendentes)
        supabase.from('fin_contas_pagar').select('id, descricao, valor, data_vencimento, status, fornecedor, recorrente, recorrencia_config')
          .in('status', ['AGUARDANDO_APROVACAO', 'APROVADO']).order('data_vencimento'),
        // Contas a receber (pendentes)
        supabase.from('fin_contas_receber').select('id, descricao, valor, data_vencimento, status, cliente, recorrente, recorrencia_config')
          .eq('status', 'A_RECEBER').order('data_vencimento'),
        // Already reconciled lancamentos for this account (to skip re-processing)
        contaSel ? supabase.from('fin_lancamentos').select('data_competencia, valor, tipo')
          .eq('conta_id', contaSel).eq('conciliado', true).eq('status', 'REALIZADO') : Promise.resolve({ data: [] }),
      ]);

      const lancSameConta = ((lancRes as { data: LancamentoCandidate[] | null }).data || []) as LancamentoCandidate[];
      const lancAll = (lancAllRes.data || []) as LancamentoCandidate[];
      const contasPagar = (cpRes.data || []) as ContaPagarCandidate[];
      const contasReceber = (crRes.data || []) as ContaReceberCandidate[];

      // Filter out lines already reconciled in this account
      const conciliadosSet = new Set(
        ((conciliadosRes.data || []) as { data_competencia: string; valor: number; tipo: string }[])
          .map(l => `${l.data_competencia}|${Number(l.valor)}|${l.tipo}`)
      );
      parsed = parsed.filter(linha => !conciliadosSet.has(`${linha.data}|${linha.valor}|${linha.tipo}`));

      // Build unique set of all lancamentos (same account first for priority)
      const lancMap = new Map<string, LancamentoCandidate>();
      for (const l of lancSameConta) lancMap.set(l.id, { ...l, _sameAccount: true });
      for (const l of lancAll) { if (!lancMap.has(l.id)) lancMap.set(l.id, { ...l, _sameAccount: false }); }
      const allLancamentos = Array.from(lancMap.values());

      const usedIds = new Set<string>();

      parsed = parsed.map(linha => {
        const suggestions: MatchSuggestion[] = [];

        // 1) Match with lancamentos (same account gets score boost)
        for (const ex of allLancamentos) {
          if (usedIds.has(`lanc-${ex.id}`)) continue;
          if (ex.tipo !== linha.tipo) continue;
          let score = computeScore(linha.valor, linha.data, linha.descricao, Number(ex.valor), ex.data_competencia, ex.descricao || '');
          if (score === 0) continue;
          if (ex._sameAccount) score += 10; // bonus for same account
          suggestions.push({
            id: ex.id, origin: 'lancamento', descricao: ex.descricao || '(sem desc.)',
            valor: Number(ex.valor), data: ex.data_competencia,
            extra: ex._sameAccount ? 'Mesma conta' : `Conta: ${getContaNome(ex.conta_id)}`,
            score, raw: ex,
          });
        }

        // 2) Match DESPESA with contas a pagar
        if (linha.tipo === 'DESPESA') {
          for (const cp of contasPagar) {
            if (usedIds.has(`cp-${cp.id}`)) continue;
            const score = computeScore(linha.valor, linha.data, linha.descricao, Number(cp.valor), cp.data_vencimento, cp.descricao || '');
            if (score === 0) continue;
            suggestions.push({
              id: cp.id, origin: 'conta_pagar', descricao: cp.descricao || '(sem desc.)',
              valor: Number(cp.valor), data: cp.data_vencimento,
              extra: cp.fornecedor || undefined, score, raw: cp,
            });
          }
        }

        // 3) Match RECEITA with contas a receber
        if (linha.tipo === 'RECEITA') {
          for (const cr of contasReceber) {
            if (usedIds.has(`cr-${cr.id}`)) continue;
            const score = computeScore(linha.valor, linha.data, linha.descricao, Number(cr.valor), cr.data_vencimento, cr.descricao || '');
            if (score === 0) continue;
            suggestions.push({
              id: cr.id, origin: 'conta_receber', descricao: cr.descricao || '(sem desc.)',
              valor: Number(cr.valor), data: cr.data_vencimento,
              extra: cr.cliente || undefined, score, raw: cr,
            });
          }
        }

        // Sort by score descending
        suggestions.sort((a, b) => b.score - a.score);

        // Auto-select best match if score is high enough
        const best = suggestions[0];
        if (best && best.score >= 60) {
          usedIds.add(`${best.origin === 'lancamento' ? 'lanc' : best.origin === 'conta_pagar' ? 'cp' : 'cr'}-${best.id}`);
          return {
            ...linha,
            matchId: best.id,
            matchOrigin: best.origin,
            matchDescricao: best.descricao,
            matchRaw: best.raw,
            suggestions,
            selecionada: false,
          };
        }

        return { ...linha, suggestions: suggestions.length > 0 ? suggestions : undefined };
      });

      const matchedLanc = parsed.filter(l => l.matchOrigin === 'lancamento').length;
      const matchedCP = parsed.filter(l => l.matchOrigin === 'conta_pagar').length;
      const matchedCR = parsed.filter(l => l.matchOrigin === 'conta_receber').length;
      const withSuggestions = parsed.filter(l => !l.matchId && l.suggestions && l.suggestions.length > 0).length;
      const unmatched = parsed.length - matchedLanc - matchedCP - matchedCR;
      
      let msg = `${parsed.length} transações: `;
      const parts: string[] = [];
      if (matchedLanc > 0) parts.push(`${matchedLanc} match lançamento`);
      if (matchedCP > 0) parts.push(`${matchedCP} match contas a pagar`);
      if (matchedCR > 0) parts.push(`${matchedCR} match contas a receber`);
      if (withSuggestions > 0) parts.push(`${withSuggestions} com sugestões`);
      parts.push(`${unmatched - withSuggestions} novas`);
      toast.success(msg + parts.join(', '));
      
      setLinhas(parsed);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao processar arquivo');
    }
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  // ========== Rateio Functions ==========
  const openRateio = (linhaIndex: number) => {
    const linha = linhas[linhaIndex];
    const existing = linha.rateioLinhas;
    if (existing && existing.length > 0) {
      setRateioLinhas([...existing]);
    } else {
      setRateioLinhas([{ categoria_id: '', centro_custo_id: '', valor: linha.valor, percentual: 100, observacao: '' }]);
    }
    setRateioDialog({ open: true, linhaIndex });
  };

  const addRateioLinha = () => {
    setRateioLinhas(prev => [...prev, { categoria_id: '', centro_custo_id: '', valor: 0, percentual: 0, observacao: '' }]);
  };

  const removeRateioLinha = (idx: number) => {
    setRateioLinhas(prev => prev.filter((_, i) => i !== idx));
  };

  const updateRateioLinha = (idx: number, field: keyof RateioLinha, value: string | number) => {
    setRateioLinhas(prev => {
      const updated = [...prev];
      const linha = { ...updated[idx], [field]: value };
      const valorTotal = linhas[rateioDialog.linhaIndex]?.valor || 0;

      if (field === 'categoria_id') {
        const cat = categorias.find(c => c.id === value);
        if (cat?.centro_custo_padrao_id) linha.centro_custo_id = cat.centro_custo_padrao_id;
      }

      if (field === 'valor' && valorTotal > 0) {
        linha.percentual = Math.round((Number(value) / valorTotal) * 10000) / 100;
      } else if (field === 'percentual' && valorTotal > 0) {
        linha.valor = Math.round((Number(value) / 100) * valorTotal * 100) / 100;
      }

      updated[idx] = linha;
      return updated;
    });
  };

  const ratearIgual = () => {
    const valorTotal = linhas[rateioDialog.linhaIndex]?.valor || 0;
    const n = rateioLinhas.length;
    if (n === 0) return;
    const valorCada = Math.floor((valorTotal / n) * 100) / 100;
    const resto = Math.round((valorTotal - valorCada * n) * 100) / 100;
    setRateioLinhas(prev => prev.map((l, i) => ({
      ...l,
      valor: i === 0 ? valorCada + resto : valorCada,
      percentual: Math.round(((i === 0 ? valorCada + resto : valorCada) / valorTotal) * 10000) / 100,
    })));
  };

  const salvarRateio = () => {
    const valorTotal = linhas[rateioDialog.linhaIndex]?.valor || 0;
    const totalRateio = rateioLinhas.reduce((s, l) => s + Number(l.valor || 0), 0);
    if (Math.abs(totalRateio - valorTotal) > 0.01) {
      toast.error(`Rateio incompleto. Diferença: ${fmt(valorTotal - totalRateio)}`);
      return;
    }
    if (rateioLinhas.some(l => !l.categoria_id)) {
      toast.error('Todas as linhas do rateio precisam ter uma categoria.');
      return;
    }
    setLinhas(prev => prev.map((l, i) => i === rateioDialog.linhaIndex ? { ...l, rateioLinhas: [...rateioLinhas] } : l));
    setRateioDialog({ open: false, linhaIndex: -1 });
    toast.success('Rateio configurado com sucesso!');
  };

  // ========== Select a suggestion ========== 
  const selectSuggestion = (linhaIndex: number, suggestion: MatchSuggestion) => {
    setLinhas(prev => prev.map((l, i) => i === linhaIndex ? {
      ...l,
      matchId: suggestion.id,
      matchOrigin: suggestion.origin,
      matchDescricao: suggestion.descricao,
      matchRaw: suggestion.raw,
      selecionada: false,
    } : l));
    setSuggestionsDialog({ open: false, linhaIndex: -1 });
  };

  const clearMatch = (linhaIndex: number) => {
    setLinhas(prev => prev.map((l, i) => i === linhaIndex ? {
      ...l,
      matchId: undefined,
      matchOrigin: undefined,
      matchDescricao: undefined,
      matchRaw: undefined,
      selecionada: true,
    } : l));
  };

  // ========== Confirm baixa ========== 
  const confirmarBaixa = async () => {
    const match = confirmDialog.match;
    if (!match) return;
    setProcessando(true);
    try {
      const linhaData = linhas[confirmDialog.linhaIndex]?.data || formatDateBR();

      if (match.origin === 'conta_pagar') {
        const { data, error } = await supabase.rpc('reconcile_pay_conta_pagar', {
          p_conta_pagar_id: match.id,
          p_conta_bancaria_id: contaSel,
          p_data_pagamento: linhaData,
          p_user_id: user?.id,
        });
        if (error) throw error;
        const result = data as { status?: string; recorrente?: boolean; next_cp_id?: string } | null;
        if (result?.status === 'noop') {
          toast.info('Conta já estava paga');
        } else {
          let msg = `Conta a pagar "${match.descricao}" baixada!`;
          if (result?.recorrente && result?.next_cp_id) msg += ' Próxima parcela gerada.';
          toast.success(msg);
        }
      } else if (match.origin === 'conta_receber') {
        const { data, error } = await supabase.rpc('reconcile_receive_conta_receber', {
          p_conta_receber_id: match.id,
          p_conta_bancaria_id: contaSel,
          p_data_recebimento: linhaData,
          p_user_id: user?.id,
        });
        if (error) throw error;
        const result = data as { status?: string; recorrente?: boolean; next_cr_id?: string } | null;
        if (result?.status === 'noop') {
          toast.info('Conta já estava recebida');
        } else {
          let msg = `Conta a receber "${match.descricao}" baixada!`;
          if (result?.recorrente && result?.next_cr_id) msg += ' Próxima parcela gerada.';
          toast.success(msg);
        }
      }

      // Mark line as done
      const originLabel = match.origin === 'conta_pagar' ? 'CP' : 'CR';
      const statusLabel = match.origin === 'conta_pagar' ? 'PAGO' : 'RECEBIDO';
      // Remove line as it is now done
      setLinhas(prev => prev.filter((_, i) => i !== confirmDialog.linhaIndex));

      emitDataEvent('financeiro:lancamentos');
      emitDataEvent('financeiro:contas_pagar');
      emitDataEvent('financeiro:contas_receber');
      loadLancamentos(); // Update local list immediately
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao dar baixa');
    }
    setProcessando(false);
    setConfirmDialog({ open: false, linhaIndex: -1, match: null });
  };

  const importarEConciliar = async () => {
    if (!contaSel) { toast.error('Selecione uma conta bancária'); return; }

    const toImport = linhas.filter(l => l.selecionada && !l.matchId);
    const toReconcileLanc = linhas.filter(l => l.matchId && l.matchOrigin === 'lancamento');
    // CP/CR matches that haven't been processed yet need baixa first
    const pendingCP = linhas.filter(l => l.matchId && l.matchOrigin === 'conta_pagar');
    const pendingCR = linhas.filter(l => l.matchId && l.matchOrigin === 'conta_receber');

    if (toImport.length === 0 && toReconcileLanc.length === 0 && pendingCP.length === 0 && pendingCR.length === 0) {
      toast.error('Nenhuma ação a realizar');
      return;
    }

    setImportando(true);
    try {
      // 1) Import new lines
      if (toImport.length > 0) {
        for (const l of toImport) {
          const rateioPayload = l.rateioLinhas && l.rateioLinhas.length > 0
            ? l.rateioLinhas.map(r => ({
                categoria_id: r.categoria_id || null,
                centro_custo_id: r.centro_custo_id || null,
                valor: r.valor,
                percentual: r.percentual || null,
                observacao: r.observacao || null,
              }))
            : null;

          const { error } = await supabase.rpc('reconcile_import_lancamento', {
            p_data: l.data, p_descricao: l.descricao, p_valor: l.valor, p_tipo: l.tipo,
            p_conta_id: contaSel, p_user_id: user?.id,
            p_rateio_linhas: rateioPayload ? JSON.stringify(rateioPayload) : null,
          });
          if (error) throw error;
        }
      }

      // 2) Reconcile matched lancamentos
      if (toReconcileLanc.length > 0) {
        const matchIds = toReconcileLanc.map(l => l.matchId!);
        const { error } = await supabase.rpc('reconcile_batch_lancamentos', { p_lancamento_ids: matchIds });
        if (error) throw error;
      }

      // 3) Baixa contas a pagar
      for (const l of pendingCP) {
        const { error } = await supabase.rpc('reconcile_pay_conta_pagar', {
          p_conta_pagar_id: l.matchId!, p_conta_bancaria_id: contaSel,
          p_data_pagamento: l.data, p_user_id: user?.id,
        });
        if (error) throw error;
      }

      // 4) Baixa contas a receber
      for (const l of pendingCR) {
        const { error } = await supabase.rpc('reconcile_receive_conta_receber', {
          p_conta_receber_id: l.matchId!, p_conta_bancaria_id: contaSel,
          p_data_recebimento: l.data, p_user_id: user?.id,
        });
        if (error) throw error;
      }

      const total = toImport.length + toReconcileLanc.length + pendingCP.length + pendingCR.length;
      toast.success(`${total} operação(ões) processada(s) com sucesso`);
      setLinhas([]);
      loadLancamentos(); // Ensure any change is loaded into the 'conciliar' view immediately
      emitDataEvent('financeiro:lancamentos');
      emitDataEvent('financeiro:conciliacao');
      emitDataEvent('financeiro:contas_pagar');
      emitDataEvent('financeiro:contas_receber');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao processar');
    }
    setImportando(false);
  };

  const toggleAll = (checked: boolean) => {
    setLinhas(prev => prev.map(l => l.matchId ? l : { ...l, selecionada: checked }));
  };

  const fmt = fmtBRL;
  const pendentes = lancamentos.filter(l => !l.conciliado).length;
  const conciliados = lancamentos.filter(l => l.conciliado).length;
  const selecionadas = linhas.filter(l => l.selecionada && !l.matchId);
  const matchedTotal = linhas.filter(l => l.matchId).length;
  const withSuggestions = linhas.filter(l => !l.matchId && l.suggestions && l.suggestions.length > 0).length;

  const rateioValorTotal = linhas[rateioDialog.linhaIndex]?.valor || 0;
  const rateioTotalAtual = rateioLinhas.reduce((s, l) => s + Number(l.valor || 0), 0);
  const rateioDiff = rateioValorTotal - rateioTotalAtual;
  const rateioValido = Math.abs(rateioDiff) < 0.01;

  const getNomeCategoria = (id: string) => categorias.find(c => c.id === id)?.nome || '';
  const getNomeCentro = (id: string) => centrosCusto.find(c => c.id === id)?.nome || '';
  const getContaNome = (id: string) => contas.find(c => c.id === id)?.nome || '—';

  const getOriginBadge = (origin?: MatchSuggestion['origin']) => {
    if (origin === 'lancamento') return <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Lançamento</Badge>;
    if (origin === 'conta_pagar') return <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Conta a Pagar</Badge>;
    if (origin === 'conta_receber') return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">Conta a Receber</Badge>;
    return null;
  };

  // === Transfer creation from OFX line ===
  const criarTransferenciaFromOFX = async () => {
    const linha = linhas[transferDialog.linhaIndex];
    if (!linha || !transferContaDestino || !contaSel) { toast.error('Selecione conta destino'); return; }
    if (transferContaDestino === contaSel) { toast.error('Contas devem ser diferentes'); return; }

    setProcessando(true);
    try {
      const nomeOrigem = getContaNome(contaSel);
      const nomeDestino = getContaNome(transferContaDestino);
      const isOutgoing = linha.tipo === 'DESPESA';
      const contaOrigemId = isOutgoing ? contaSel : transferContaDestino;
      const contaDestinoId = isOutgoing ? transferContaDestino : contaSel;
      const nOrigem = isOutgoing ? nomeOrigem : nomeDestino;
      const nDestino = isOutgoing ? nomeDestino : nomeOrigem;

      const { data, error } = await supabase.rpc('reconcile_create_transfer', {
        p_data: linha.data, p_valor: linha.valor, p_descricao: linha.descricao,
        p_conta_origem_id: contaOrigemId, p_conta_destino_id: contaDestinoId, p_user_id: user?.id,
      });
      if (error) throw error;
      const result = data as { saida_id?: string; entrada_id?: string } | null;

      setLinhas(prev => prev.filter((_, i) => i !== transferDialog.linhaIndex));

      toast.success(`Transferência ${nOrigem} → ${nDestino} criada e conciliada!`);
      emitDataEvent('financeiro:lancamentos');
      loadLancamentos(); // Update local list immediately
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao criar transferência');
    }
    setProcessando(false);
    setTransferDialog({ open: false, linhaIndex: -1 });
    setTransferContaDestino('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Conciliação Bancária</h2>
          <p className="text-sm text-muted-foreground">Importe extratos e concilie com lançamentos, contas a pagar e a receber</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={contaSel} onValueChange={setContaSel}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Conta" /></SelectTrigger>
            <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex items-center rounded-lg border border-border overflow-hidden h-9">
            <button onClick={() => setView('importar')}
              className={`px-3 h-full text-xs font-medium transition-colors ${view === 'importar' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
            >Importar Extrato</button>
            <button onClick={() => setView('conciliar')}
              className={`px-3 h-full text-xs font-medium transition-colors ${view === 'conciliar' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
            >Lançamentos</button>
          </div>
        </div>
      </div>

      {/* ========== IMPORT VIEW ========== */}
      {view === 'importar' && (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <Label>Arquivo (CSV / OFX / QFX)</Label>
                  <Input ref={fileRef} type="file" accept=".csv,.ofx,.qfx,.txt" onChange={handleFile} disabled={loading} className="max-w-[280px]" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                O sistema cruza automaticamente com lançamentos, <strong>contas a pagar</strong> e <strong>contas a receber</strong> pendentes. Clique em <Search className="w-3 h-3 inline" /> para ver sugestões alternativas.
              </p>
            </CardContent>
          </Card>

          {linhas.length > 0 && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm text-muted-foreground flex flex-wrap gap-1">
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">{matchedTotal} match</Badge>
                  {withSuggestions > 0 && <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">{withSuggestions} com sugestões</Badge>}
                  <Badge variant="outline">{selecionadas.length} nova(s)</Badge>
                  <Badge variant="outline">{linhas.length} total</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>Selecionar Novas</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>Desmarcar</Button>
                  <Button size="sm" onClick={importarEConciliar} disabled={importando}>
                    <Save className={`w-4 h-4 mr-1 ${importando ? 'animate-spin' : ''}`} />
                    Processar
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">✓</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição (Extrato)</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Ações</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((linha, i) => {
                    const isDone = linha.matchId?.endsWith('-done');
                    const hasMatch = !!linha.matchId && !isDone;
                    const hasSuggestions = !linha.matchId && linha.suggestions && linha.suggestions.length > 0;

                    return (
                      <TableRow key={i} className={isDone ? 'bg-success/5 opacity-70' : hasMatch ? 'bg-success/5' : hasSuggestions ? 'bg-amber-500/5' : !linha.selecionada ? 'opacity-70' : ''}>
                        <TableCell>
                          {isDone ? (
                            <CheckCircle className="w-4 h-4 text-success" />
                          ) : hasMatch ? (
                            <CheckCircle className="w-4 h-4 text-success" />
                          ) : (
                            <Checkbox
                              checked={linha.selecionada}
                              onCheckedChange={(v) => setLinhas(prev => prev.map((l, j) => j === i ? { ...l, selecionada: !!v } : l))}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{linha.data}</TableCell>
                        <TableCell className="max-w-[220px]">
                          <span className="font-medium truncate block">{linha.descricao}</span>
                          {hasMatch && (
                            <span className="text-[10px] text-success flex items-center gap-1 mt-0.5">
                              <ArrowRight className="w-3 h-3" /> {linha.matchDescricao}
                              {linha.matchOrigin && <span className="ml-1">{getOriginBadge(linha.matchOrigin)}</span>}
                            </span>
                          )}
                          {isDone && (
                            <span className="text-[10px] text-success flex items-center gap-1 mt-0.5">
                              <CheckCircle className="w-3 h-3" /> {linha.matchDescricao}
                            </span>
                          )}
                          {hasSuggestions && (
                            <span className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                              <Search className="w-3 h-3" /> {linha.suggestions!.length} sugestão(ões) disponível(is)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={linha.tipo === 'RECEITA' ? 'default' : 'destructive'}>{linha.tipo}</Badge>
                        </TableCell>
                        <TableCell className={`text-right font-bold ${linha.tipo === 'RECEITA' ? 'text-success' : 'text-destructive'}`}>
                          {linha.tipo === 'RECEITA' ? '+' : '-'} {fmt(linha.valor)}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {/* View/change suggestions */}
                            {!isDone && linha.suggestions && linha.suggestions.length > 0 && (
                              <Button size="sm" variant={hasMatch ? 'default' : 'outline'} className="h-7 text-xs"
                                onClick={() => setSuggestionsDialog({ open: true, linhaIndex: i })}>
                                <Search className="w-3 h-3 mr-1" />
                                {hasMatch ? 'Alterar' : `${linha.suggestions.length} sugestão`}
                              </Button>
                            )}
                            {/* Clear match */}
                            {hasMatch && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => clearMatch(i)}>✕</Button>
                            )}
                            {/* Confirm baixa for CP/CR */}
                            {hasMatch && (linha.matchOrigin === 'conta_pagar' || linha.matchOrigin === 'conta_receber') && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                                const suggestion = linha.suggestions?.find(s => s.id === linha.matchId) || {
                                  id: linha.matchId!, origin: linha.matchOrigin!, descricao: linha.matchDescricao || '',
                                  valor: linha.valor, data: linha.data, score: 0, raw: linha.matchRaw,
                                };
                                setConfirmDialog({ open: true, linhaIndex: i, match: suggestion });
                              }}>
                                <CreditCard className="w-3 h-3 mr-1" /> Baixar
                              </Button>
                            )}
                            {/* Rateio and transfer for unmatched */}
                            {!hasMatch && !isDone && (
                              <>
                                <Button size="sm" variant={linha.rateioLinhas && linha.rateioLinhas.length > 1 ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => openRateio(i)}>
                                  <PieChart className="w-3 h-3 mr-1" />
                                  {linha.rateioLinhas && linha.rateioLinhas.length > 1 ? `${linha.rateioLinhas.length} cat.` : 'Ratear'}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setTransferDialog({ open: true, linhaIndex: i }); setTransferContaDestino(''); }}>
                                  <ArrowRightLeft className="w-3 h-3 mr-1" /> Transf.
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCriarDialog({ open: true, linhaIndex: i })}>
                                  <FileText className="w-3 h-3 mr-1" /> Criar
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isDone ? (
                            <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Concluído</Badge>
                          ) : hasMatch ? (
                            <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Match</Badge>
                          ) : hasSuggestions ? (
                            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">Sugestões</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Nova</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}

          {linhas.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Upload className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Selecione um arquivo CSV ou OFX para importar</p>
              <p className="text-xs mt-2">
                <strong>CSV:</strong> data;descrição;valor (separado por ; ou ,)<br />
                <strong>OFX/QFX:</strong> formato padrão bancário
              </p>
            </CardContent></Card>
          )}
        </>
      )}

      {/* ========== CONCILIATION VIEW ========== */}
      {view === 'conciliar' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              {pendentes} pendente(s) • {conciliados} conciliado(s)
            </p>
            <div className="flex items-center gap-2">
              <Select value={filtro} onValueChange={v => setFiltro(v as 'pendentes' | 'conciliados' | 'todos')}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendentes">Pendentes</SelectItem>
                  <SelectItem value="conciliados">Conciliados</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadLancamentos}>
                <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
              </Button>
              {filtro === 'pendentes' && pendentes > 0 && (
                <Button size="sm" onClick={conciliarTodos}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Conciliar Todos
                </Button>
              )}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">✓</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : lancamentos.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {contaSel ? 'Nenhum lançamento encontrado' : 'Selecione uma conta bancária'}
                </TableCell></TableRow>
              ) : lancamentos
                  .filter(l => {
                    if (filtro === 'pendentes') return !l.conciliado;
                    if (filtro === 'conciliados') return !!l.conciliado;
                    return true;
                  })
                  .map(item => (
                <TableRow key={item.id} className={item.conciliado ? 'opacity-80' : ''}>
                  <TableCell>
                    <Checkbox checked={!!item.conciliado} onCheckedChange={(v) => conciliar(item.id, !!v)} />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{item.data_competencia}</TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">{item.descricao}</TableCell>
                  <TableCell>
                    <Badge variant={item.tipo === 'RECEITA' ? 'default' : 'destructive'}>{item.tipo}</Badge>
                  </TableCell>
                  <TableCell className={`text-right font-bold ${item.tipo === 'RECEITA' ? 'text-success' : 'text-destructive'}`}>
                    {item.tipo === 'RECEITA' ? '+' : '-'} {fmt(item.valor)}
                  </TableCell>
                  <TableCell>
                    {item.conciliado ? (
                      <span className="text-xs text-success flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Conciliado</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pendente</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {/* ========== SUGGESTIONS DIALOG ========== */}
      <Dialog open={suggestionsDialog.open} onOpenChange={(open) => !open && setSuggestionsDialog({ open: false, linhaIndex: -1 })}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" /> Sugestões de Conciliação
            </DialogTitle>
          </DialogHeader>

          {suggestionsDialog.linhaIndex >= 0 && linhas[suggestionsDialog.linhaIndex] && (() => {
            const linha = linhas[suggestionsDialog.linhaIndex];
            const suggestions = linha.suggestions || [];
            return (
              <div className="space-y-4">
                {/* Extrato line info */}
                <Card className="border-primary/20">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">Linha do Extrato</p>
                        <p className="text-sm font-medium">{linha.descricao}</p>
                        <p className="text-xs text-muted-foreground">{linha.data}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{fmt(linha.valor)}</p>
                        <Badge variant={linha.tipo === 'RECEITA' ? 'default' : 'destructive'}>{linha.tipo}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Suggestions list */}
                <div className="space-y-2">
                  {suggestions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">Nenhuma sugestão encontrada</p>
                  ) : suggestions.map((s, idx) => (
                    <Card key={`${s.origin}-${s.id}`} className={`cursor-pointer transition-colors hover:border-primary/40 ${linha.matchId === s.id ? 'border-primary bg-primary/5' : ''}`}
                      onClick={() => selectSuggestion(suggestionsDialog.linhaIndex, s)}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              {getOriginBadge(s.origin)}
                              <Badge variant="outline" className="text-[10px]">Score: {s.score}</Badge>
                              {idx === 0 && <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Melhor match</Badge>}
                            </div>
                            <p className="text-sm font-medium truncate">{s.descricao}</p>
                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                              <span>Data: {s.data}</span>
                              {s.extra && <span>• {s.extra}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-bold ${linha.tipo === 'RECEITA' ? 'text-success' : 'text-destructive'}`}>{fmt(s.valor)}</p>
                            {linha.matchId === s.id && <CheckCircle className="w-4 h-4 text-success ml-auto mt-1" />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setSuggestionsDialog({ open: false, linhaIndex: -1 })}>Fechar</Button>
                  {linha.matchId && (
                    <Button variant="ghost" className="text-destructive" onClick={() => { clearMatch(suggestionsDialog.linhaIndex); setSuggestionsDialog({ open: false, linhaIndex: -1 }); }}>
                      Remover Match
                    </Button>
                  )}
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ========== RATEIO DIALOG ========== */}
      <Dialog open={rateioDialog.open} onOpenChange={(open) => !open && setRateioDialog({ open: false, linhaIndex: -1 })}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-primary" /> Rateio por Categoria
            </DialogTitle>
          </DialogHeader>

          {rateioDialog.linhaIndex >= 0 && linhas[rateioDialog.linhaIndex] && (
            <div className="space-y-4">
              <Card className="border-primary/20">
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">{linhas[rateioDialog.linhaIndex].descricao}</p>
                      <p className="text-xs text-muted-foreground">{linhas[rateioDialog.linhaIndex].data}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{fmt(rateioValorTotal)}</p>
                      <Badge variant={linhas[rateioDialog.linhaIndex].tipo === 'RECEITA' ? 'default' : 'destructive'}>
                        {linhas[rateioDialog.linhaIndex].tipo}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {rateioLinhas.map((rl, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end border border-border rounded-lg p-2">
                    <div className="col-span-4">
                      <Label className="text-[10px] text-muted-foreground">Categoria</Label>
                      <Select value={rl.categoria_id} onValueChange={v => updateRateioLinha(idx, 'categoria_id', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Label className="text-[10px] text-muted-foreground">Centro de Custo</Label>
                      <Select value={rl.centro_custo_id} onValueChange={v => updateRateioLinha(idx, 'centro_custo_id', v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
                        <SelectContent>{centrosCusto.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                      <CurrencyInput className="h-8 text-xs" value={String(rl.valor || '')} onValueChange={(raw, parsed) => { updateRateioLinha(idx, 'valor', parsed ?? 0); }} showPrefix maxDecimals={2} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-[10px] text-muted-foreground">%</Label>
                      <Input className="h-8 text-xs" type="text" inputMode="decimal" value={rl.percentual || ''} onChange={e => { const v = e.target.value.replace(',', '.'); updateRateioLinha(idx, 'percentual', v === '' ? 0 : Number(v) || 0); }} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {rateioLinhas.length > 1 && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeRateioLinha(idx)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={addRateioLinha}><Plus className="w-3.5 h-3.5 mr-1" /> Linha</Button>
                  <Button size="sm" variant="outline" onClick={ratearIgual}>🧮 Ratear Igual</Button>
                </div>
                <div className="text-right text-sm">
                  <span className="text-muted-foreground">Rateado: </span>
                  <span className={`font-bold ${rateioValido ? 'text-success' : 'text-destructive'}`}>{fmt(rateioTotalAtual)}</span>
                  {!rateioValido && <span className="text-destructive text-xs ml-2">(Diferença: {fmt(rateioDiff)})</span>}
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setRateioDialog({ open: false, linhaIndex: -1 })}>Cancelar</Button>
                <Button onClick={salvarRateio} disabled={!rateioValido}><CheckCircle className="w-4 h-4 mr-1" /> Salvar Rateio</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== CONFIRMATION DIALOG (Baixa CP/CR) ========== */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, linhaIndex: -1, match: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog.match?.origin === 'conta_receber'
                ? <><CreditCard className="w-5 h-5 text-primary" /> Confirmar Recebimento — Conta a Receber</>
                : <><Receipt className="w-5 h-5 text-primary" /> Confirmar Baixa — Conta a Pagar</>
              }
            </DialogTitle>
          </DialogHeader>
          {confirmDialog.match && (() => {
            const match = confirmDialog.match!;
            const linha = linhas[confirmDialog.linhaIndex];
            const isCP = match.origin === 'conta_pagar';
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Card className="border-primary/20">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase">
                        {isCP ? 'Conta a Pagar' : 'Conta a Receber'}
                      </p>
                      <p className="font-semibold">{match.descricao}</p>
                      {match.extra && <p className="text-muted-foreground text-xs">{match.extra}</p>}
                      <p className={`text-lg font-bold mt-1 ${isCP ? 'text-destructive' : 'text-success'}`}>{fmt(match.valor)}</p>
                      <p className="text-xs text-muted-foreground">Vencimento: {match.data}</p>
                      {'recorrente' in match.raw && match.raw.recorrente && (
                        <Badge variant="outline" className="mt-2 text-[10px]">🔄 Recorrente</Badge>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="border-border/50">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase">Extrato Bancário</p>
                      <p className="font-semibold">{linha?.descricao}</p>
                      <p className={`text-lg font-bold mt-1 ${isCP ? 'text-destructive' : 'text-success'}`}>{linha ? fmt(linha.valor) : '—'}</p>
                      <p className="text-xs text-muted-foreground">Data: {linha?.data}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium text-foreground mb-1">Ao confirmar:</p>
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    <li>✅ {isCP ? 'Conta a pagar marcada como PAGO' : 'Conta a receber marcada como RECEBIDO'}</li>
                    <li>✅ Lançamento realizado criado e conciliado</li>
                    {'recorrente' in match.raw && match.raw.recorrente && <li>✅ Próxima parcela recorrente gerada automaticamente</li>}
                  </ul>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setConfirmDialog({ open: false, linhaIndex: -1, match: null })}>Cancelar</Button>
                  <Button onClick={confirmarBaixa} disabled={processando}>
                    {processando ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                    Confirmar {isCP ? 'Baixa' : 'Recebimento'}
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ========== TRANSFER DIALOG ========== */}
      <Dialog open={transferDialog.open} onOpenChange={(open) => { if (!open) { setTransferDialog({ open: false, linhaIndex: -1 }); setTransferContaDestino(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-primary" /> Marcar como Transferência
            </DialogTitle>
          </DialogHeader>
          {transferDialog.linhaIndex >= 0 && linhas[transferDialog.linhaIndex] && (() => {
            const linha = linhas[transferDialog.linhaIndex];
            const isOutgoing = linha.tipo === 'DESPESA';
            return (
              <div className="space-y-4">
                <Card className="border-primary/20">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium">{linha.descricao}</p>
                        <p className="text-xs text-muted-foreground">{linha.data}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{fmt(linha.valor)}</p>
                        <Badge variant={isOutgoing ? 'destructive' : 'default'}>{isOutgoing ? 'Saída' : 'Entrada'}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">{isOutgoing ? 'Conta Origem (esta)' : 'Conta Destino (esta)'}</Label>
                    <Input value={getContaNome(contaSel)} disabled className="h-9" />
                  </div>
                  <div>
                    <Label className="text-xs">{isOutgoing ? 'Conta Destino' : 'Conta Origem'}</Label>
                    <Select value={transferContaDestino} onValueChange={setTransferContaDestino}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                      <SelectContent>
                        {contas.filter(c => c.id !== contaSel).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium text-foreground mb-1">Ao confirmar:</p>
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    <li>✅ Dois lançamentos vinculados serão criados (saída + entrada)</li>
                    <li>✅ Tipo = TRANSFERÊNCIA (não afeta receitas/despesas)</li>
                    <li>✅ Linha do extrato será conciliada automaticamente</li>
                  </ul>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => { setTransferDialog({ open: false, linhaIndex: -1 }); setTransferContaDestino(''); }}>Cancelar</Button>
                  <Button onClick={criarTransferenciaFromOFX} disabled={processando || !transferContaDestino}>
                    {processando ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-1" />}
                    Criar Transferência
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* ========== CREATE LANCAMENTO FROM EXTRATO ========== */}
      <CriarLancamentoExtratoDialog
        open={criarDialog.open}
        onOpenChange={(open) => { if (!open) setCriarDialog({ open: false, linhaIndex: -1 }); }}
        linha={criarDialog.linhaIndex >= 0 ? linhas[criarDialog.linhaIndex] || null : null}
        contaBancariaId={contaSel}
        onCreated={(result) => {
          const idx = criarDialog.linhaIndex;
          setLinhas(prev => prev.filter((_, i) => i !== idx));
          setCriarDialog({ open: false, linhaIndex: -1 });
          loadLancamentos(); // Update local list immediately
        }}
      />
    </div>
  );
}
