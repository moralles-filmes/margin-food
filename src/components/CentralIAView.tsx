import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain, Fish, Package, TrendingDown, ShoppingCart, BookOpen, Send, Loader2,
  Bot, User, RotateCcw, DollarSign, UserCheck, ShieldAlert
} from 'lucide-react';
import { useModuleAccess, useCan } from '@/permissions/hooks';
import { useToast } from '@/hooks/use-toast';

type Msg = { role: 'user' | 'assistant'; content: string };
type AgenteId = 'geral' | 'salmao' | 'estoque' | 'cmv' | 'compras' | 'ficha-tecnica' | 'financeiro' | 'rh';

/** Map UI agent id → registry subtab key */
const AGENT_TO_SUBTAB: Record<AgenteId, string> = {
  geral: 'consultor-geral',
  salmao: 'salmon-intelligence',
  estoque: 'estoque-geral',
  cmv: 'analista-cmv',
  compras: 'consultor-compras',
  'ficha-tecnica': 'ficha-tecnica',
  financeiro: 'consultor-financeiro',
  rh: 'consultor-rh',
};

interface Agente {
  id: AgenteId;
  label: string;
  icon: typeof Brain;
  description: string;
  color: string;
  questions: string[];
}

const agentes: Agente[] = [
  {
    id: 'geral', label: 'Consultor Geral', icon: Brain,
    description: 'Visão executiva integrada de todo o restaurante',
    color: 'bg-primary/10 text-primary',
    questions: [
      'Como está minha operação essa semana?',
      'Quais são os 3 maiores riscos agora?',
      'O que fazer para melhorar minha margem?',
    ],
  },
  {
    id: 'salmao', label: 'Salmão Intelligence', icon: Fish,
    description: 'Perda, custo, manipulação e porcionamento',
    color: 'bg-orange-500/10 text-orange-600',
    questions: [
      'Por que meu CMV salmão subiu essa semana?',
      'Estou manipulando salmão demais?',
      'Se o salmão subir 10%, qual impacto?',
    ],
  },
  {
    id: 'estoque', label: 'Estoque Geral', icon: Package,
    description: 'Giro, ruptura, cobertura e itens críticos',
    color: 'bg-blue-500/10 text-blue-600',
    questions: [
      'O que preciso comprar essa semana?',
      'Tenho estoque parado?',
      'Qual item está prejudicando meu giro?',
    ],
  },
  {
    id: 'cmv', label: 'Analista de CMV', icon: TrendingDown,
    description: 'Margem, meta vs realizado, ranking de impacto',
    color: 'bg-red-500/10 text-red-600',
    questions: [
      'Por que meu CMV aumentou?',
      'Quais 3 itens estão destruindo minha margem?',
      'O que fazer para bater 30% de CMV?',
    ],
  },
  {
    id: 'compras', label: 'Consultor de Compras', icon: ShoppingCart,
    description: 'Fornecedores, preços e economia',
    color: 'bg-success/10 text-success',
    questions: [
      'Qual fornecedor está mais caro?',
      'Estou comprando certo?',
      'Quanto posso economizar?',
    ],
  },
  {
    id: 'ficha-tecnica', label: 'Ficha Técnica', icon: BookOpen,
    description: 'Custo por produto, markup e margem por canal',
    color: 'bg-purple-500/10 text-purple-600',
    questions: [
      'Qual produto devo aumentar preço?',
      'Qual canal está com margem negativa?',
      'Se eu subir 2 reais, melhora quanto?',
    ],
  },
  {
    id: 'financeiro', label: 'Consultor Financeiro', icon: DollarSign,
    description: 'Fluxo de caixa, DRE, contas a pagar/receber e projeções',
    color: 'bg-success/10 text-success',
    questions: [
      'Como está meu fluxo de caixa?',
      'Tenho contas vencidas?',
      'Qual minha projeção de resultado este mês?',
    ],
  },
  {
    id: 'rh', label: 'Consultor de RH', icon: UserCheck,
    description: 'Custos de pessoal, absenteísmo, escalas e compliance',
    color: 'bg-amber-500/10 text-amber-600',
    questions: [
      'Qual o custo total de pessoal este mês?',
      'Tem funcionário com banco de horas alto?',
      'Quem está sem treinamento obrigatório?',
    ],
  },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
      <ShieldAlert className="w-10 h-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Você não tem permissão para acessar a Central de IA.</p>
    </div>
  );
}

export default function CentralIAView() {
  const { toast } = useToast();
  const { visibleSubtabs, canView } = useModuleAccess('ia');

  // Filter agents by visible subtabs
  const allowedAgents = agentes.filter(a => visibleSubtabs.includes(AGENT_TO_SUBTAB[a.id]));

  const [activeAgent, setActiveAgent] = useState<AgenteId>(() => {
    if (allowedAgents.length > 0) return allowedAgents[0].id;
    return 'geral';
  });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check create permission for active agent
  const activeSubtab = AGENT_TO_SUBTAB[activeAgent];
  const canCreate = useCan(`ia:${activeSubtab}:create`);

  const agent = agentes.find(a => a.id === activeAgent) || agentes[0];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAgentChange = (id: string) => {
    setActiveAgent(id as AgenteId);
    setMessages([]);
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || !canCreate) return;

    const userMsg: Msg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: newMessages, agente: activeAgent }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await resp.json();
        if (json.no_data) {
          setMessages(prev => [...prev, { role: 'assistant', content: json.message }]);
          return;
        }
        if (json.error) throw new Error(json.error);
        if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      } else if (!resp.ok) {
        throw new Error(`Erro ${resp.status}`);
      }

      if (!resp.body) throw new Error('Sem resposta do servidor');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      console.error('AI chat error:', e);
      toast({ variant: 'destructive', title: 'Erro na IA', description: e.message });
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Erro: ${e.message}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, activeAgent, toast, canCreate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  if (!canView) return <NoAccess />;
  if (allowedAgents.length === 0) return <NoAccess />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Brain className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Central de IA</h1>
          <p className="text-xs text-muted-foreground">Inteligência baseada nos seus dados reais</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Agent selector - sidebar (only allowed agents) */}
        <div className="lg:col-span-1 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1 mb-2">Agentes</p>
          {allowedAgents.map(a => {
            const Icon = a.icon;
            const isActive = activeAgent === a.id;
            return (
              <button
                key={a.id}
                onClick={() => handleAgentChange(a.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                  isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/30 hover:bg-accent/50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${a.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{a.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{a.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Chat area */}
        <div className="lg:col-span-3">
          <Card className="h-[600px] flex flex-col">
            <CardHeader className="pb-3 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${agent.color}`}>
                    <agent.icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">{agent.label}</CardTitle>
                    <p className="text-[10px] text-muted-foreground">{agent.description}</p>
                  </div>
                </div>
                {messages.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setMessages([])} className="h-7 text-xs gap-1">
                    <RotateCcw className="w-3 h-3" /> Limpar
                  </Button>
                )}
              </div>
            </CardHeader>

            <div className="flex-1 overflow-hidden flex flex-col">
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${agent.color}`}>
                      <agent.icon className="w-7 h-7" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-1">{agent.label}</h3>
                    <p className="text-xs text-muted-foreground mb-6 max-w-sm">{agent.description}</p>

                    <div className="space-y-2 w-full max-w-md">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Perguntas sugeridas</p>
                      {agent.questions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => canCreate && sendMessage(q)}
                          disabled={!canCreate}
                          className="w-full text-left p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-accent/50 transition-all text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="text-primary mr-1.5">→</span> {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                          <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${agent.color}`}>
                            <Bot className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted/50 text-foreground rounded-bl-md'
                        }`}>
                          <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center bg-primary/10">
                            <User className="w-3.5 h-3.5 text-primary" />
                          </div>
                        )}
                      </div>
                    ))}
                    {isLoading && messages[messages.length - 1]?.role === 'user' && (
                      <div className="flex gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${agent.color}`}>
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                        <div className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="p-4 border-t border-border flex-shrink-0">
                {canCreate ? (
                  <div className="flex gap-2">
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Pergunte ao ${agent.label}...`}
                      className="min-h-[44px] max-h-[120px] resize-none text-sm"
                      rows={1}
                    />
                    <Button
                      onClick={() => sendMessage(input)}
                      disabled={!input.trim() || isLoading}
                      size="icon"
                      className="h-[44px] w-[44px] flex-shrink-0"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Você tem permissão apenas para visualizar este agente.
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                  Respostas baseadas exclusivamente nos dados do MarginPro
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
