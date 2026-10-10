import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { BRLInput } from '@/components/ui/brl-input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { useAuth } from '@/contexts/AuthContext';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { fmtBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useScopedToast } from '@/hooks/useScopedToast';
import CategoryCombobox from '@/components/financeiro/CategoryCombobox';
import { ExtratoLinhaResumo } from '@/components/financeiro/ConciliacaoParts';
import { useRetornoFoco } from '@/components/financeiro/useRetornoFoco';
import { buildCategoryOptions } from '@/lib/categoriaOptions';
import SupplierCombobox from '@/components/financeiro/SupplierCombobox';
import { Plus, Trash2, PieChart, CheckCircle, CheckCircle2, Loader2, FileText, Calculator } from 'lucide-react';
import { traduzirErroIdempotencia } from '@/domain/financeiro/idempotencia';
import { mapPagamentoError } from '@/lib/financeiroErrorMap';
import { padronizarTexto } from '@/lib/padronizarTexto';
import CmvDecisaoToggle from '@/components/financeiro/cmv/CmvDecisaoToggle';
import { decisaoAoTrocarCategoria, type CmvAvisoDecisao, type CmvDecisao } from '@/domain/financeiro/cmv';
import type { CmvConfig } from '@/hooks/useCmvFinanceiro';
import { datasDoLancamentoCriado, decisaoDaLinhaExtrato, type LinhaExtratoCmv } from '@/lib/conciliacaoCmv';

import { useCan } from '@/permissions/hooks';
import { usePodeCadastrarFornecedor } from '@/hooks/useSuppliers';
/**
 * Linha do extrato como a conciliação a entrega: além dos dados do banco, o que o usuário já
 * ajustou nela (`competencia`, `categoriaId`, resposta do CMV), que o diálogo herda com o recurso.
 */
interface ExtratoLinha extends LinhaExtratoCmv {
  descricao: string;
  fitId?: string;
}

interface RateioItem {
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  observacao: string;
  cmv_incluir?: CmvDecisao;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linha: ExtratoLinha | null;
  /** Índice da linha entre as linhas iguais do extrato (`@/lib/conciliacaoOcorrencia`). */
  ocorrencia?: number;
  contaBancariaId: string;
  /** `ocorrencia` vem preenchido quando o lançamento foi gravado com o índice da linha. */
  onCreated: (result: { id: string; destino: string; ocorrencia?: number }) => void;
  /** CMV Financeiro da unidade; nulo ou sem `recursos.lancamentos` = o diálogo funciona como antes. */
  cmvConfig?: CmvConfig | null;
}

type Destino = 'lancamento' | 'conta_pagar' | 'conta_receber';

const DESTINOS: { value: Destino; label: string }[] = [
  { value: 'lancamento', label: 'Lançamento' },
  { value: 'conta_pagar', label: 'Conta a Pagar' },
  { value: 'conta_receber', label: 'Conta a Receber' },
];

/** Falha do vínculo depois de criar: recusa do banco não se resolve repetindo, então diz o motivo. */
function falhaDoVinculo(bindError: unknown, criado: string): Error {
  const msg = String((bindError as { message?: string })?.message ?? '');
  if (msg.includes('LANCAMENTO_JA_VINCULADO') || msg.includes('EXTERNAL_ID_CONFLICT')) {
    return new Error(`${criado}, mas a linha do extrato não foi vinculada: ${mapPagamentoError(bindError)}`);
  }
  return new Error(`${criado}, mas o vínculo com a linha do extrato falhou. Tente novamente — a repetição não duplica.`);
}

export default function CriarLancamentoExtratoDialog({
 open, onOpenChange, linha, ocorrencia, contaBancariaId, onCreated, cmvConfig = null }: Props) {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canViewRbac = useCan('financeiro:conciliacao:reconcile');
  const podeCadastrarFornecedor = usePodeCadastrarFornecedor();
  const { user } = useAuth();
  const retornoFoco = useRetornoFoco();

  // Form state
  const [destino, setDestino] = useState<Destino>('lancamento');
  const [descricao, setDescricao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [valor, setValor] = useState(0);
  const [tipo, setTipo] = useState<'RECEITA' | 'DESPESA'>('DESPESA');
  const [dataCompetencia, setDataCompetencia] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [cliente, setCliente] = useState('');

  // Rateio
  const [useRateio, setUseRateio] = useState(false);
  const [rateioLinhas, setRateioLinhas] = useState<RateioItem[]>([]);

  // Data
  const [categorias, setCategorias] = useState<any[]>([]);
  const [centrosCusto, setCentrosCusto] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  // Trava síncrona: `saving` só desabilita o botão no próximo render.
  const salvandoRef = useRef(false);

  // O tipo gerado da RPC ainda não tem p_data_competencia.
  const callRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  // CMV Financeiro: só com o recurso no banco, no destino "Lançamento" de despesa.
  const [cmvIncluir, setCmvIncluir] = useState<CmvDecisao>(null);
  // Só "redefinido" interessa aqui: a decisão dada foi trocada pelo padrão de outra categoria.
  const [cmvAviso, setCmvAviso] = useState<CmvAvisoDecisao | undefined>(undefined);
  const cmvRecurso = cmvConfig?.recursos.lancamentos === true;
  const cmvPadroes = useMemo(
    () => (cmvRecurso && cmvConfig?.classificacaoAtiva ? new Map(cmvConfig.categorias.map(c => [c.id, c.cmvSugerir])) : null),
    [cmvConfig, cmvRecurso],
  );
  const enviaCmv = cmvRecurso && destino === 'lancamento' && tipo === 'DESPESA';
  const mostrarCmv = enviaCmv
    && (cmvConfig?.classificacaoAtiva === true || cmvIncluir !== null || rateioLinhas.some(r => (r.cmv_incluir ?? null) !== null));
  const sugerirCmv = (anterior: CmvDecisao | undefined, categoria: string): CmvDecisao =>
    cmvPadroes && tipo === 'DESPESA' ? decisaoAoTrocarCategoria(anterior, categoria, cmvPadroes).cmv_incluir : (anterior ?? null);
  // Categoria única: a decisão acompanha o padrão da nova categoria e, se havia resposta diferente, avisa.
  const trocarCategoriaUnica = (categoria: string) => {
    setCategoriaId(categoria);
    if (!cmvPadroes || tipo !== 'DESPESA') return;
    const trocada = decisaoAoTrocarCategoria(cmvIncluir, categoria, cmvPadroes);
    setCmvIncluir(trocada.cmv_incluir);
    setCmvAviso(trocada.cmv_aviso === 'redefinido' ? 'redefinido' : undefined);
  };
  // Com o recurso, a data do banco é a chave que reconhece a linha no lançamento: não se edita.
  const dataBancoFixa = cmvRecurso && destino === 'lancamento';
  // O efeito de pré-preenchimento lê o recurso por aqui: se a configuração chegar com o diálogo
  // aberto, ele não roda de novo e não apaga o que o usuário já digitou. A herança vale só quando
  // a configuração já estava carregada na abertura (a seção a carrega ao montar).
  const cmvRecursoRef = useRef(cmvRecurso);
  cmvRecursoRef.current = cmvRecurso;
  // Competência que veio da linha do extrato (igual à data do banco quando não há ajuste).
  const competenciaHerdadaRef = useRef('');

  // Load reference data
  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, parent_id, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('suppliers').select('id, name').order('name'),
    ]).then(([catRes, ccRes, supRes]) => {
      setCategorias(buildCategoryOptions(catRes.data || []));
      setCentrosCusto(ccRes.data || []);
      setSuppliers((supRes.data || []).map((s: any) => ({ id: s.id, name: s.name })));
    });
  }, [open, supabase]);

  // Pre-fill from extrato line
  useEffect(() => {
    if (!linha || !open) return;
    // Com o recurso no banco, o que o usuário ajustou na própria linha do extrato (competência,
    // categoria e resposta do CMV) vem junto: "Processar" já respeita isso e "Criar" não pode perdê-lo.
    // Sem o recurso a competência vai em p_data (a chave de idempotência), então o rascunho da
    // linha nunca entra: o diálogo abre exatamente como antes (data do banco, sem categoria, sem resposta).
    // Rateio de várias linhas não é levado para o diálogo: categoria e resposta ficam vazias, como antes.
    const herda = cmvRecursoRef.current;
    const rateioMultiplo = (linha.rateioLinhas?.length ?? 0) > 1;
    // Rateio de uma linha: a categoria é a do rateio, a mesma de onde sai a resposta e a que o
    // "Processar" envia (`salvarRateio` não atualiza `linha.categoriaId`, que pode estar velha ou vazia).
    const categoriaHerdada = linha.rateioLinhas?.length === 1
      ? linha.rateioLinhas[0].categoria_id || linha.categoriaId || ''
      : linha.categoriaId || '';
    // A competência própria só existe em despesa e só vale no destino lançamento (ver a troca de destino).
    competenciaHerdadaRef.current = herda && linha.tipo === 'DESPESA' && linha.competencia ? linha.competencia : linha.data;
    setDescricao(linha.descricao);
    setValor(linha.valor);
    setTipo(linha.tipo);
    setDataCompetencia(competenciaHerdadaRef.current);
    setDataVencimento(linha.data);
    setDataPagamento(linha.data);
    setCategoriaId(herda && !rateioMultiplo ? categoriaHerdada : '');
    setSupplierId('');
    setCliente('');
    setObservacoes('');
    setUseRateio(false);
    setRateioLinhas([]);
    setCmvIncluir(herda && !rateioMultiplo ? decisaoDaLinhaExtrato(linha) : null);
    setCmvAviso(undefined);
    setDestino('lancamento');
  }, [linha, open]);

  // Rateio helpers
  const addRateioLinha = () => {
    setRateioLinhas(prev => [...prev, { categoria_id: '', centro_custo_id: '', valor: 0, percentual: 0, observacao: '', cmv_incluir: null }]);
  };

  const removeRateioLinha = (idx: number) => {
    setRateioLinhas(prev => prev.filter((_, i) => i !== idx));
  };

  const updateRateioLinha = (idx: number, field: keyof RateioItem, value: any) => {
    setRateioLinhas(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], [field]: value };

      if (field === 'categoria_id') {
        const cat = categorias.find(c => c.id === value);
        if (cat?.centro_custo_padrao_id) item.centro_custo_id = cat.centro_custo_padrao_id;
        item.cmv_incluir = sugerirCmv(item.cmv_incluir, String(value));
      }

      if (field === 'valor' && valor > 0) {
        item.percentual = Math.round((Number(value) / valor) * 10000) / 100;
      } else if (field === 'percentual' && valor > 0) {
        item.valor = Math.round((Number(value) / 100) * valor * 100) / 100;
      }

      updated[idx] = item;
      return updated;
    });
  };

  const bindExtratoLine = async (lancamentoId?: string | null) => {
    if (!linha?.fitId || !lancamentoId) return;
    const { error } = await supabase.rpc('reconcile_bind_extrato', {
      p_conta_id: contaBancariaId,
      p_external_id: linha.fitId,
      p_tipo: linha.tipo,
      p_lancamento_id: lancamentoId,
    });
    if (error) throw error;
  };

  const ratearIgual = () => {
    const n = rateioLinhas.length;
    if (n === 0) return;
    const valorCada = Math.floor((valor / n) * 100) / 100;
    const resto = Math.round((valor - valorCada * n) * 100) / 100;
    setRateioLinhas(prev => prev.map((l, i) => ({
      ...l,
      valor: i === 0 ? valorCada + resto : valorCada,
      percentual: Math.round(((i === 0 ? valorCada + resto : valorCada) / valor) * 10000) / 100,
    })));
  };

  const rateioTotal = rateioLinhas.reduce((s, l) => s + Number(l.valor || 0), 0);
  const rateioDiff = valor - rateioTotal;
  const rateioValido = !useRateio || (rateioLinhas.length > 0 && Math.abs(rateioDiff) < 0.01 && rateioLinhas.every(l => l.categoria_id));

  const handleSave = async () => {
    if (saving || salvandoRef.current) return;
    if (!descricao.trim()) { toast.error('Informe a descrição'); return; }
    if (valor <= 0) { toast.error('Valor deve ser maior que zero'); return; }
    if (!dataCompetencia) { toast.error('Informe a data de competência'); return; }
    if (!useRateio && !categoriaId) { toast.error('Selecione uma categoria'); return; }
    // A categoria vinda da linha pode não estar (ainda) na lista: sem ela o payload sairia sem categoria.
    if (!useRateio && !categorias.some(c => c.id === categoriaId)) {
      toast.error(categorias.length === 0 ? 'Carregando categorias… tente de novo em instantes.' : 'Categoria indisponível. Selecione outra.');
      return;
    }
    if (useRateio && !rateioValido) { toast.error('Rateio inválido'); return; }

    salvandoRef.current = true;
    setSaving(true);
    try {
      const rateioPayload = useRateio && rateioLinhas.length > 0
        ? rateioLinhas.map(r => ({
            categoria_id: r.categoria_id || null,
            centro_custo_id: r.centro_custo_id || null,
            valor: r.valor,
            percentual: r.percentual || null,
            observacao: r.observacao || null,
            ...(enviaCmv ? { cmv_incluir: r.cmv_incluir ?? null } : {}),
          }))
        : null;

      // Categoria única → rateio de 1 linha, para a RPC gravar categoria_id no INSERT.
      // Evita um segundo UPDATE em lançamento REALIZADO (que dispararia o trigger de justificativa).
      const singleCat = !useRateio && categoriaId ? categorias.find(c => c.id === categoriaId) : null;
      const singleRateioPayload = singleCat
        ? [{
            categoria_id: categoriaId,
            centro_custo_id: singleCat.centro_custo_padrao_id || null,
            valor,
            percentual: 100,
            observacao: null,
            ...(enviaCmv ? { cmv_incluir: cmvIncluir } : {}),
          }]
        : null;
      const effectivePayload = rateioPayload ?? singleRateioPayload;

      // O índice da linha só vale para o conteúdo dela: data, descrição, valor ou
      // tipo editados são outro lançamento, que segue o padrão (índice 0).
      const tipoEnviado = destino === 'lancamento' ? tipo : destino === 'conta_pagar' ? 'DESPESA' : 'RECEITA';
      // Destino lançamento: a data do banco vai em p_data (chave e duplicata) e a competência à parte.
      const datasLanc = datasDoLancamentoCriado({
        dataBanco: linha?.data || dataPagamento || dataCompetencia,
        dataCompetencia,
        aceitaCompetencia: cmvRecurso,
      });
      const dataEnviada = destino === 'lancamento' ? datasLanc.p_data : dataCompetencia;
      const ocorrenciaEnviada = linha && ocorrencia != null
        && dataEnviada === linha.data && descricao === linha.descricao
        && valor === linha.valor && tipoEnviado === linha.tipo
        ? ocorrencia
        : undefined;

      if (destino === 'lancamento') {
        // Create via existing RPC (categoria já vai no payload → sem UPDATE de campo vigiado)
        const { data, error } = await callRpc('reconcile_import_lancamento', {
          p_data: datasLanc.p_data,
          p_descricao: descricao,
          p_valor: valor,
          p_tipo: tipo,
          p_conta_id: contaBancariaId,
          p_user_id: user?.id,
          p_rateio_linhas: effectivePayload,
          p_external_id: linha?.fitId || null,
          p_occurrence_index: ocorrenciaEnviada ?? 0,
          ...datasLanc.extra,
        });
        if (error) throw error;
        const importResult = data as { status?: string; lancamento_id?: string } | null;

        // Mesma conta/valor/data/descrição já conciliados com um FITID diferente —
        // provável reimportação do mesmo extrato (ver reconcile_import_lancamento).
        // Nada foi lançado: para forçar como transação legítima repetida, use
        // "Processar" na tela de conciliação, que oferece a opção por linha.
        if (importResult?.status === 'possible_duplicate') {
          toast.error('Já existe um lançamento igual (mesma conta, valor, data e descrição) — nada foi criado. Se for uma cobrança repetida legítima, use "Importar mesmo assim" na tela de conciliação.');
          return;
        }

        try {
          await bindExtratoLine(importResult?.lancamento_id);
        } catch (bindError) {
          console.error('[CriarLancamentoExtratoDialog.bind]', bindError);
          throw falhaDoVinculo(bindError, 'O lançamento foi criado');
        }

        // Update the just-created lancamento with extra fields if needed.
        // NÃO incluir categoria_id aqui: é campo vigiado pelo trigger de lançamento REALIZADO.
        // Com o banco atualizado a data do banco já foi no p_data; só o fluxo antigo
        // corrige data_pagamento aqui.
        if (importResult?.lancamento_id && (dataVencimento || (datasLanc.atualizaPagamento && dataPagamento) || observacoes)) {
          const updatePayload: any = {};
          if (dataVencimento) updatePayload.data_vencimento = dataVencimento;
          if (datasLanc.atualizaPagamento && dataPagamento) updatePayload.data_pagamento = dataPagamento;
          if (observacoes) updatePayload.observacoes = observacoes;
          if (Object.keys(updatePayload).length > 0) {
            await supabase.from('fin_lancamentos').update(updatePayload).eq('id', importResult.lancamento_id);
          }
        }

        toast.success('Lançamento criado e conciliado com sucesso!');
        emitDataEvent('financeiro:lancamentos');
        onCreated({ id: 'lancamento-created', destino: 'lancamento', ocorrencia: ocorrenciaEnviada });

      } else {
        // conta_pagar | conta_receber.
        // A RPC roda ANTES do título: se vier possible_duplicate, nada é criado —
        // evita ficar com um título já baixado sem lançamento nenhum no razão,
        // órfão e sem correção possível depois.
        const pagar = destino === 'conta_pagar';
        const { data: lancData, error: lancError } = await supabase.rpc('reconcile_import_lancamento', {
          p_data: dataCompetencia,
          p_descricao: descricao,
          p_valor: valor,
          p_tipo: pagar ? 'DESPESA' : 'RECEITA',
          p_conta_id: contaBancariaId,
          p_user_id: user?.id,
          p_rateio_linhas: effectivePayload,
          p_external_id: linha?.fitId || null,
          p_occurrence_index: ocorrenciaEnviada ?? 0,
        });
        if (lancError) throw lancError;
        const lancResult = lancData as { status?: string; lancamento_id?: string } | null;

        if (lancResult?.status === 'possible_duplicate') {
          toast.error('Já existe um lançamento igual (mesma conta, valor, data e descrição) — nada foi criado. Se for uma cobrança repetida legítima, use "Importar mesmo assim" na tela de conciliação.');
          return;
        }
        if (!lancResult?.lancamento_id) throw new Error('A conciliação não devolveu o lançamento criado.');

        // Título + vínculo de volta numa transação só, com o lançamento como chave:
        // repetir a ação devolve o mesmo título em vez de gravar um segundo já
        // baixado (o import acima já devolve o mesmo lançamento na repetição).
        const { data: tituloData, error: tituloError } = await supabase.rpc('reconcile_create_titulo_from_extrato', {
          p_lancamento_id: lancResult.lancamento_id,
          p_destino: destino,
          // O título é cadastro (padronizado); o lançamento acima mantém o texto do banco.
          p_descricao: padronizarTexto(descricao),
          p_data_vencimento: dataVencimento || dataCompetencia,
          p_data_competencia: dataCompetencia,
          p_data_baixa: dataPagamento || dataCompetencia,
          p_categoria_id: useRateio ? null : (categoriaId || null),
          p_supplier_id: supplierId || null,
          p_cliente: pagar ? null : (cliente || null),
          p_observacoes: observacoes || null,
        });
        if (tituloError) {
          console.error('[CriarLancamentoExtratoDialog.titulo]', tituloError);
          const motivo = traduzirErroIdempotencia(tituloError.message) ?? tituloError.message;
          throw new Error(`Lançamento já foi criado no razão, mas a conta a ${pagar ? 'pagar' : 'receber'} não pôde ser gravada (${motivo}). Tente novamente — a repetição não duplica.`);
        }
        const titulo = tituloData as { titulo_id?: string; idempotente?: boolean } | null;

        try {
          await bindExtratoLine(lancResult.lancamento_id);
        } catch (bindError) {
          console.error('[CriarLancamentoExtratoDialog.bind]', bindError);
          throw falhaDoVinculo(bindError, `A conta a ${pagar ? 'pagar' : 'receber'} foi criada`);
        }

        toast.success(pagar
          ? (titulo?.idempotente ? 'Esta conta a pagar já estava registrada e conciliada.' : 'Conta a pagar criada (já baixada) e conciliada!')
          : (titulo?.idempotente ? 'Esta conta a receber já estava registrada e conciliada.' : 'Conta a receber criada (já recebida) e conciliada!'));
        emitDataEvent(pagar ? 'financeiro:contas_pagar' : 'financeiro:contas_receber');
        emitDataEvent('financeiro:lancamentos');
        onCreated({ id: titulo?.titulo_id || (pagar ? 'cp-created' : 'cr-created'), destino, ocorrencia: ocorrenciaEnviada });
      }

      emitDataEvent('financeiro:conciliacao');
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao criar registro');
    } finally {
      salvandoRef.current = false;
      setSaving(false);
    }
  };

  if (!linha) return null;

  const filteredCategorias = categorias.filter(c => {
    if (tipo === 'RECEITA') return c.tipo === 'receita' || !c.tipo;
    if (tipo === 'DESPESA') return c.tipo === 'despesa' || !c.tipo;
    return true;
  });

  if (!canViewRbac) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" {...retornoFoco}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText aria-hidden="true" className="h-5 w-5 text-primary" />
            Criar Registro a partir do Extrato
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Extrato source card */}
          <ExtratoLinhaResumo descricao={linha.descricao} data={linha.data} valor={linha.valor} tipo={linha.tipo} />

          {/* Destino — mesmas ações dos três botões de antes (conta a pagar/receber fixam o tipo). */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Tipo de Registro</span>
            <SegmentedControl
              ariaLabel="Tipo de Registro"
              manualActivation
              options={DESTINOS}
              value={destino}
              onChange={v => {
                // A competência herdada da linha vale só no lançamento: no título, p_data (espelho do
                // razão) e a baixa seguem a data do banco. Data que o usuário digitou nunca é trocada.
                const herdada = competenciaHerdadaRef.current;
                if (herdada !== linha.data) {
                  if (v === 'lancamento') setDataCompetencia(atual => (atual === linha.data ? herdada : atual));
                  else setDataCompetencia(atual => (atual === herdada ? linha.data : atual));
                }
                if (v === 'conta_pagar') { setDestino('conta_pagar'); setTipo('DESPESA'); }
                else if (v === 'conta_receber') { setDestino('conta_receber'); setTipo('RECEITA'); }
                else setDestino('lancamento');
              }}
              className="flex w-full"
            />
          </div>

          {/* Tipo (only for lancamento) */}
          {destino === 'lancamento' && (
            <div className="space-y-1.5">
              <Label htmlFor="criar-extrato-tipo" className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={v => setTipo(v as 'RECEITA' | 'DESPESA')}>
                <SelectTrigger id="criar-extrato-tipo" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESPESA">Despesa</SelectItem>
                  <SelectItem value="RECEITA">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Descrição + Valor */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="criar-extrato-descricao" className="text-xs">Descrição</Label>
              <Input id="criar-extrato-descricao" value={descricao} onChange={e => setDescricao(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="criar-extrato-valor" className="text-xs">Valor (R$)</Label>
              <BRLInput id="criar-extrato-valor" numericValue={valor} onNumericChange={setValor} showPrefix className="h-9" />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="criar-extrato-competencia" className="text-xs">Data Competência</Label>
              <DateInput id="criar-extrato-competencia" value={dataCompetencia} onValueChange={setDataCompetencia} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="criar-extrato-vencimento" className="text-xs">Data Vencimento</Label>
              <DateInput id="criar-extrato-vencimento" value={dataVencimento} onValueChange={setDataVencimento} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="criar-extrato-pagamento" className="text-xs">Data {tipo === 'RECEITA' ? 'Recebimento' : 'Pagamento'}</Label>
              <DateInput
                id="criar-extrato-pagamento"
                value={dataBancoFixa ? linha.data : dataPagamento}
                onValueChange={setDataPagamento}
                disabled={dataBancoFixa}
                aria-describedby={dataBancoFixa ? 'criar-extrato-pagamento-ajuda' : undefined}
                className="h-9"
              />
              {dataBancoFixa && (
                <p id="criar-extrato-pagamento-ajuda" className="text-xs text-muted-foreground">Data do banco — não muda.</p>
              )}
            </div>
          </div>

          {/* Categoria (single or rateio) */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">Categoria</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => {
                setUseRateio(!useRateio);
                if (!useRateio && rateioLinhas.length === 0) {
                  // A 1ª linha leva a categoria, o centro de custo padrão dela e a resposta que a tela já tinha.
                  const centroPadrao = categorias.find(c => c.id === categoriaId)?.centro_custo_padrao_id || '';
                  setRateioLinhas([{ categoria_id: categoriaId || '', centro_custo_id: centroPadrao, valor, percentual: 100, observacao: '', cmv_incluir: cmvIncluir }]);
                }
              }}>
                <PieChart aria-hidden="true" className="h-3.5 w-3.5" />
                {useRateio ? 'Categoria Única' : 'Ratear'}
              </Button>
            </div>

            {!useRateio ? (
              <>
                <CategoryCombobox
                  value={categoriaId}
                  onValueChange={trocarCategoriaUnica}
                  options={filteredCategorias}
                  placeholder="Pesquisar categoria..."
                  className="h-9 text-sm"
                />
                {mostrarCmv && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-foreground">Aparecer no CMV financeiro?</span>
                    <CmvDecisaoToggle
                      size="sm" value={cmvIncluir} label="Aparecer no CMV financeiro?"
                      onChange={v => { setCmvIncluir(v); setCmvAviso(undefined); }}
                    />
                    {cmvAviso === 'redefinido' && <span className="text-xs text-warning">Categoria trocada: confira.</span>}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2 rounded-lg border bg-muted p-3">
                <ol className="space-y-2" aria-label="Linhas do rateio">
                  {rateioLinhas.map((rl, idx) => (
                    <li key={idx} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-12">
                      <div className="col-span-2 space-y-1 sm:col-span-5">
                        <span className="text-xs font-medium text-muted-foreground">Categoria</span>
                        <CategoryCombobox
                          value={rl.categoria_id}
                          onValueChange={v => updateRateioLinha(idx, 'categoria_id', v)}
                          options={filteredCategorias}
                          placeholder="Pesquisar..."
                          className="h-8 bg-card text-xs"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-3">
                        <Label htmlFor={`criar-rateio-valor-${idx}`} className="text-xs text-muted-foreground">Valor (R$)</Label>
                        <BRLInput id={`criar-rateio-valor-${idx}`} className="h-8 text-xs" numericValue={rl.valor} onNumericChange={value => updateRateioLinha(idx, 'valor', value)} showPrefix />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor={`criar-rateio-percentual-${idx}`} className="text-xs text-muted-foreground">%</Label>
                        <DecimalInput id={`criar-rateio-percentual-${idx}`} className="h-8 text-xs" value={String(rl.percentual || '')} onValueChange={(_, parsed) => updateRateioLinha(idx, 'percentual', parsed ?? 0)} maxDecimals={2} suffix="%" />
                      </div>
                      <div className="col-span-2 flex justify-end gap-1 sm:col-span-2">
                        {rateioLinhas.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeRateioLinha(idx)} aria-label={`Remover a linha ${idx + 1} do rateio`}>
                            <Trash2 aria-hidden="true" className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      {mostrarCmv && (
                        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-12">
                          <span className="text-xs text-muted-foreground">Aparecer no CMV financeiro?</span>
                          <CmvDecisaoToggle
                            size="sm" value={rl.cmv_incluir ?? null}
                            onChange={v => setRateioLinhas(prev => prev.map((l, i) => (i === idx ? { ...l, cmv_incluir: v } : l)))}
                            label={`Aparecer no CMV financeiro? — linha ${idx + 1} do rateio`}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addRateioLinha}><Plus aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Linha</Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={ratearIgual}><Calculator aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> Igual</Button>
                  </div>
                  <span role="status" className={cn('text-xs font-medium tabular-nums', Math.abs(rateioDiff) < 0.01 ? 'text-success' : 'text-destructive')}>
                    {fmtBRL(rateioTotal)} / {fmtBRL(valor)}
                    {Math.abs(rateioDiff) >= 0.01 && ` (falta ${fmtBRL(rateioDiff)})`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Fornecedor / Cliente */}
          {(destino === 'conta_pagar' || tipo === 'DESPESA') && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">Fornecedor</span>
              <SupplierCombobox
                value={supplierId}
                onValueChange={setSupplierId}
                options={suppliers}
                enableQuickAdd={podeCadastrarFornecedor}
                placeholder="Pesquisar fornecedor..."
                className="h-9"
              />
            </div>
          )}

          {destino === 'conta_receber' && (
            <div className="space-y-1.5">
              <Label htmlFor="criar-extrato-cliente" className="text-xs">Cliente</Label>
              <Input id="criar-extrato-cliente" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente" className="h-9" />
            </div>
          )}

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="criar-extrato-observacoes" className="text-xs">Observações</Label>
            <Textarea id="criar-extrato-observacoes" value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Observações adicionais..." className="min-h-[60px]" />
          </div>

          {/* Info box */}
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="mb-1 font-medium text-foreground">Ao salvar:</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {[
                ...(destino === 'lancamento' ? ['Lançamento criado no Livro Razão', 'Lançamento já nasce conciliado'] : []),
                ...(destino === 'conta_pagar' ? ['Conta a pagar criada com status PAGO', 'Lançamento correspondente no Livro Razão', 'Conciliado automaticamente com o extrato'] : []),
                ...(destino === 'conta_receber' ? ['Conta a receber criada com status RECEBIDO', 'Lançamento correspondente no Livro Razão', 'Conciliado automaticamente com o extrato'] : []),
                ...(useRateio ? ['Rateio por categoria aplicado'] : []),
              ].map(texto => (
                <li key={texto} className="flex items-start gap-1.5">
                  <CheckCircle2 aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-success" />
                  <span>{texto}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} aria-busy={saving}>
            {saving ? <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle aria-hidden="true" className="mr-1 h-4 w-4" />}
            Criar e Conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
