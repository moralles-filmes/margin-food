import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { MessageCircle, Bot, Save, ExternalLink, ShieldCheck, Info } from 'lucide-react';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useCanAny } from '@/permissions';
import { useIntegracoesConfig } from '@/hooks/useIntegracoesConfig';

const MANAGE_KEYS = ['configuracoes:integracoes:manage', 'compras:cotacao:manage'] as const;

export default function IntegracoesView() {
  const toast = useScopedToast();
  const canManage = useCanAny(...MANAGE_KEYS);
  const { zapi, ia, loading, saveZapi, saveIa } = useIntegracoesConfig();

  // ── Form Z-API ──
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [clientToken, setClientToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.z-api.io');
  const [defaultPhone, setDefaultPhone] = useState('');
  const [zapiAtivo, setZapiAtivo] = useState(true);
  const [savingZapi, setSavingZapi] = useState(false);

  // ── Form IA ──
  const [provider, setProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [iaAtivo, setIaAtivo] = useState(true);
  const [savingIa, setSavingIa] = useState(false);

  useEffect(() => {
    if (zapi) {
      setInstanceId(zapi.instance_id ?? '');
      setBaseUrl(zapi.base_url || 'https://api.z-api.io');
      setDefaultPhone(zapi.default_phone ?? '');
      setZapiAtivo(zapi.ativo ?? true);
    }
  }, [zapi]);

  useEffect(() => {
    if (ia) {
      setProvider(ia.provider || 'gemini');
      setModel(ia.model ?? '');
      setIaAtivo(ia.ativo ?? true);
    }
  }, [ia]);

  const handleSaveZapi = async () => {
    setSavingZapi(true);
    try {
      await saveZapi({
        instance_id: instanceId,
        token,            // vazio = preserva o salvo
        client_token: clientToken,
        base_url: baseUrl,
        default_phone: defaultPhone,
        ativo: zapiAtivo,
      });
      setToken(''); setClientToken('');
      toast.success('Z-API salva com sucesso!');
    } catch (err: any) {
      console.error('[IntegracoesView.handleSaveZapi]', err);
      toast.error(err?.message?.includes('PERMISSION_DENIED') ? 'Sem permissão para gerenciar integrações' : 'Erro ao salvar Z-API');
    } finally {
      setSavingZapi(false);
    }
  };

  const handleSaveIa = async () => {
    setSavingIa(true);
    try {
      await saveIa({ provider, api_key: apiKey, model, ativo: iaAtivo });
      setApiKey('');
      toast.success('Configuração de IA salva!');
    } catch (err: any) {
      console.error('[IntegracoesView.handleSaveIa]', err);
      toast.error(err?.message?.includes('PERMISSION_DENIED') ? 'Sem permissão para gerenciar integrações' : 'Erro ao salvar IA');
    } finally {
      setSavingIa(false);
    }
  };

  if (loading) {
    return <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-48 bg-secondary/40 rounded-xl animate-pulse" />)}</div>;
  }

  const zapiConnected = !!zapi?.configured && !!zapi?.has_token && !!zapi?.ativo;

  return (
    <div className="space-y-4">
      {/* ───────────────── WhatsApp (Z-API) ───────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-success" /> WhatsApp (Z-API)
          </p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${zapiConnected ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>
            <ShieldCheck className="w-3 h-3" /> {zapiConnected ? 'Conectada' : 'Não configurada'}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Envio de mensagens de cotação por WhatsApp. As credenciais ficam guardadas no servidor (nunca no app) e são usadas só pela função de envio.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">ID da Instância</label>
            <Input value={instanceId} onChange={e => setInstanceId(e.target.value)} placeholder="ex.: 3D1F2A..." disabled={!canManage}
              className="bg-secondary border-border text-foreground h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Token da Instância</label>
            <Input type="password" value={token} onChange={e => setToken(e.target.value)} disabled={!canManage}
              placeholder={zapi?.has_token ? `•••• ${zapi.token_last4 ?? ''} (salvo)` : 'Cole o token'}
              className="bg-secondary border-border text-foreground h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Client-Token (segurança da conta)</label>
            <Input type="password" value={clientToken} onChange={e => setClientToken(e.target.value)} disabled={!canManage}
              placeholder={zapi?.has_client_token ? `•••• ${zapi.client_token_last4 ?? ''} (salvo)` : 'Cole o Client-Token'}
              className="bg-secondary border-border text-foreground h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Telefone padrão (opcional)</label>
            <Input value={defaultPhone} onChange={e => setDefaultPhone(e.target.value)} placeholder="5511999999999" disabled={!canManage}
              className="bg-secondary border-border text-foreground h-8 text-sm" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-[11px] text-muted-foreground font-medium">Base URL</label>
            <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.z-api.io" disabled={!canManage}
              className="bg-secondary border-border text-foreground h-8 text-sm" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
            <Switch checked={zapiAtivo} onCheckedChange={setZapiAtivo} disabled={!canManage} /> Integração ativa
          </label>
          {canManage && (
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleSaveZapi} disabled={savingZapi}>
              <Save className="w-3.5 h-3.5" /> {savingZapi ? 'Salvando…' : 'Salvar Z-API'}
            </Button>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ExternalLink className="w-3 h-3" /> Credenciais no painel da Z-API: Instância → Token → Segurança (Client-Token). Deixe o token em branco para manter o salvo.
        </p>
      </div>

      {/* ───────────────── Inteligência Artificial ───────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" /> Inteligência Artificial
          </p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${ia?.has_api_key && ia?.ativo ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>
            <ShieldCheck className="w-3 h-3" /> {ia?.has_api_key ? 'Chave salva' : 'Sem chave'}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Chave de IA da sua empresa, usada pelo assistente da Cotação (geração de mensagens, análise de preços e negociação). O assistente entra em ação na próxima fase.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Provedor</label>
            <Select value={provider} onValueChange={setProvider} disabled={!canManage}>
              <SelectTrigger className="bg-secondary border-border text-foreground h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Modelo (opcional)</label>
            <Input value={model} onChange={e => setModel(e.target.value)} disabled={!canManage}
              placeholder={provider === 'gemini' ? 'gemini-2.0-flash' : provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku'}
              className="bg-secondary border-border text-foreground h-8 text-sm" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-[11px] text-muted-foreground font-medium">Chave de API</label>
            <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} disabled={!canManage}
              placeholder={ia?.has_api_key ? `•••• ${ia.api_key_last4 ?? ''} (salva)` : 'Cole a chave de API'}
              className="bg-secondary border-border text-foreground h-8 text-sm" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
            <Switch checked={iaAtivo} onCheckedChange={setIaAtivo} disabled={!canManage} /> IA ativa
          </label>
          {canManage && (
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleSaveIa} disabled={savingIa}>
              <Save className="w-3.5 h-3.5" /> {savingIa ? 'Salvando…' : 'Salvar IA'}
            </Button>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3" /> A chave nunca aparece no app depois de salva — exibimos só os últimos dígitos. Deixe em branco para manter a salva.
        </p>
      </div>

      {!canManage && (
        <p className="text-[11px] text-muted-foreground text-center">
          Você pode visualizar, mas precisa da permissão <code className="text-[10px] bg-muted px-1 rounded">configuracoes:integracoes:manage</code> para editar.
        </p>
      )}
    </div>
  );
}
