import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Send, RefreshCw, Check, AlertTriangle, Clock, MessageCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/permissions';
import { buildTemplateContext, renderTemplate, WHATSAPP_TIPO_LABEL } from '@/lib/cotacaoTemplates';
import type { useCotacoesStore } from '@/hooks/useCotacoesStore';
import type { Cotacao, CotacaoItem, CotacaoFornecedor, CotacaoWhatsappLog, CotacaoWhatsappTipo } from '@/types/cotacao';

const TIPOS: CotacaoWhatsappTipo[] = ['SOLICITACAO_COTACAO', 'COBRANCA_RESPOSTA', 'NEGOCIACAO', 'FECHAMENTO_PEDIDO', 'CONFIRMACAO_PRAZO'];

interface Props {
  cotacao: Cotacao;
  itens: CotacaoItem[];
  fornecedores: CotacaoFornecedor[];
  store: ReturnType<typeof useCotacoesStore>;
  onChanged: () => void;
}

function logIcon(status: string) {
  if (status === 'SENT') return <Check className="w-3 h-3 text-success" />;
  if (status === 'ERROR') return <AlertTriangle className="w-3 h-3 text-destructive" />;
  return <Clock className="w-3 h-3 text-muted-foreground" />;
}

export default function CotacaoWhatsappPanel({ cotacao, itens, fornecedores, store, onChanged }: Props) {
  const canSend = useCan('compras:cotacao:manage');
  const [fornId, setFornId] = useState<string>(fornecedores[0]?.id ?? '');
  const [tipo, setTipo] = useState<CotacaoWhatsappTipo>('SOLICITACAO_COTACAO');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [generatingIA, setGeneratingIA] = useState(false);
  const [logs, setLogs] = useState<CotacaoWhatsappLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const forn = fornecedores.find(f => f.id === fornId) ?? null;

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      setLogs(await store.fetchWhatsappLogs(cotacao.id));
    } catch (err) {
      console.error('[CotacaoWhatsappPanel.loadLogs]', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [store, cotacao.id]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Regenera mensagem e telefone ao trocar fornecedor/modelo (depois é editável).
  useEffect(() => {
    const ctx = buildTemplateContext(cotacao, forn, itens);
    setMessage(renderTemplate(tipo, ctx));
    setPhone(forn?.whatsapp_snapshot ?? '');
  }, [fornId, tipo, cotacao, itens]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!forn) { toast.error('Selecione um fornecedor'); return; }
    if (!phone.trim()) { toast.error('Informe o telefone do fornecedor'); return; }
    if (!message.trim()) { toast.error('Mensagem vazia'); return; }
    setSending(true);
    try {
      const res = await store.sendWhatsapp({
        cotacao_id: cotacao.id,
        cotacao_fornecedor_id: forn.id,
        tipo,
        phone: phone.trim(),
        message: message.trim(),
      });
      if (res?.success) {
        toast.success('Mensagem enviada!');
        onChanged();
      } else {
        toast.error(res?.message ?? 'Falha no envio');
      }
      await loadLogs();
    } catch (err: any) {
      console.error('[CotacaoWhatsappPanel.handleSend]', err);
      toast.error(err?.message?.includes('PERMISSION') ? 'Sem permissão para enviar mensagens' : 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const handleGenerateIA = async () => {
    if (!forn) { toast.error('Selecione um fornecedor'); return; }
    setGeneratingIA(true);
    try {
      const res = await store.runIA({ cotacao_id: cotacao.id, task: 'gerar_mensagem', fornecedor_id: forn.id, tipo });
      if (res?.success && res.text) {
        setMessage(res.text);
        toast.success('Mensagem gerada pela IA');
      } else {
        toast.error(res?.message ?? 'Não foi possível gerar a mensagem');
      }
    } catch (err: any) {
      console.error('[CotacaoWhatsappPanel.handleGenerateIA]', err);
      toast.error(err?.message?.includes('PERMISSION') ? 'Sem permissão para usar a IA' : 'Erro ao gerar mensagem');
    } finally {
      setGeneratingIA(false);
    }
  };

  if (fornecedores.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">Adicione fornecedores para enviar mensagens.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Composer */}
      <div className="bg-card border border-border rounded-lg p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Fornecedor</label>
            <Select value={fornId} onValueChange={setFornId} disabled={!canSend}>
              <SelectTrigger className="h-8 text-xs bg-secondary border-border"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
              <SelectContent>
                {fornecedores.map(f => <SelectItem key={f.id} value={f.id}>{f.supplier_nome_snapshot}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Modelo</label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as CotacaoWhatsappTipo)} disabled={!canSend}>
              <SelectTrigger className="h-8 text-xs bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map(t => <SelectItem key={t} value={t}>{WHATSAPP_TIPO_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Telefone (com DDD/país)</label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" disabled={!canSend}
            className="h-8 text-xs bg-secondary border-border" />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase text-muted-foreground">Mensagem</label>
            {canSend && (
              <button onClick={handleGenerateIA} disabled={generatingIA}
                className="text-[10px] text-primary hover:underline flex items-center gap-1 disabled:opacity-50">
                <Sparkles className={`w-3 h-3 ${generatingIA ? 'animate-pulse' : ''}`} /> {generatingIA ? 'Gerando…' : 'Gerar com IA'}
              </button>
            )}
          </div>
          <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={7} disabled={!canSend}
            className="text-xs bg-secondary border-border resize-y" />
        </div>

        <div className="flex justify-end">
          <Button size="sm" className="bg-primary-strong text-primary-foreground border-0 gap-1.5 h-8 text-xs"
            onClick={handleSend} disabled={!canSend || sending}>
            <Send className="w-3.5 h-3.5" /> {sending ? 'Enviando…' : 'Enviar WhatsApp'}
          </Button>
        </div>
        {!canSend && <p className="text-[10px] text-muted-foreground">Você precisa da permissão de gerenciar cotação para enviar.</p>}
      </div>

      {/* Histórico */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-foreground flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Histórico de envios</span>
          <button onClick={loadLogs} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-3">Nenhuma mensagem enviada ainda.</p>
        ) : (
          <div className="space-y-1">
            {logs.map(l => {
              const f = fornecedores.find(x => x.id === l.cotacao_fornecedor_id);
              return (
                <div key={l.id} className="bg-background-subtle rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-foreground flex items-center gap-1.5 truncate">
                      {logIcon(l.status)} {f?.supplier_nome_snapshot ?? l.phone} <span className="text-muted-foreground">· {WHATSAPP_TIPO_LABEL[l.tipo]}</span>
                    </span>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      {(l.sent_at ?? l.created_at)?.slice(8, 10)}/{(l.sent_at ?? l.created_at)?.slice(5, 7)} {(l.sent_at ?? l.created_at)?.slice(11, 16)}
                    </span>
                  </div>
                  {l.message && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">{l.message}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
