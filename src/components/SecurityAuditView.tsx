import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCan } from '@/permissions/hooks';
import { ShieldAlert, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { formatDateBR } from '@/lib/formatters';
import { exportTableToExcel } from '@/lib/exportHelpers';
import { includesNormalized } from '@/lib/utils';

interface AuditEntry {
  id: string;
  user_id: string | null;
  acao: string;
  tabela: string;
  registro_id: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  created_at: string;
  scope_reason: string;
}

/** Evento de acesso da unidade (admin_actions_log): concessão, alteração e remoção de acesso, senha. */
interface AccessEvent {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  details: Record<string, unknown> | null;
}

type Visao = 'acessos' | 'registros';

const PAGE_LIMIT = 500;

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'user.created': { label: 'Usuário criado', color: 'bg-success-soft text-success' },
  'user.disabled': { label: 'Usuário desativado', color: 'bg-destructive-soft text-destructive' },
  'role.changed': { label: 'Role alterado', color: 'bg-warning-soft text-warning' },
  'compras.approval': { label: 'Compra aprovada', color: 'bg-primary-soft text-primary-soft-foreground' },
  'compras.rejected': { label: 'Compra reprovada', color: 'bg-destructive-soft text-destructive' },
};

const ACCESS_LABELS: Record<string, { label: string; color: string }> = {
  MEMBERSHIP_CREATED: { label: 'Acesso concedido', color: 'bg-success-soft text-success' },
  MEMBERSHIP_UPDATED: { label: 'Acesso alterado', color: 'bg-info-soft text-info' },
  MEMBERSHIP_REVOKED: { label: 'Acesso removido', color: 'bg-destructive-soft text-destructive' },
  IDENTITY_PASSWORD_RESET: { label: 'Senha redefinida', color: 'bg-warning-soft text-warning' },
  COMPANY_CREATED: { label: 'Empresa criada', color: 'bg-primary-soft text-primary-soft-foreground' },
  JOB_ROLE_CREATED: { label: 'Cargo criado', color: 'bg-muted text-muted-foreground' },
  JOB_ROLE_UPDATED: { label: 'Cargo alterado', color: 'bg-muted text-muted-foreground' },
};

const VISOES = [
  { value: 'acessos', label: 'Acessos' },
  { value: 'registros', label: 'Outros registros' },
];

function accessLabel(action: string) {
  return ACCESS_LABELS[action] || { label: action, color: 'bg-muted text-muted-foreground' };
}

/** Resumo legível de details: perfil, situação, quantidade de permissões e origem. */
function resumoDetalhes(details: AccessEvent['details']): string {
  if (!details) return '';
  const partes: string[] = [];
  if (typeof details.role === 'string') partes.push(`Perfil: ${details.role}`);
  if (details.status === 'inactive') partes.push('Desativado');
  if (details.status === 'revoked') partes.push('Removido');
  if (typeof details.permissions_count === 'number') partes.push(`${details.permissions_count} permissões marcadas`);
  if (details.cross_company === true) partes.push('1º admin da unidade');
  if (Array.isArray(details.empresas)) {
    const acoes = details.empresas.map(k => String(k).split(':').pop()).join(', ');
    partes.push(`Empresas: ${acoes || 'nenhuma'}`);
  }
  if (typeof details.motivo === 'string' && details.motivo) partes.push(`Motivo: ${details.motivo}`);
  if (typeof details.company_name === 'string') partes.push(details.company_name);
  return partes.join(' · ');
}

export default function SecurityAuditView() {
  const supabase = useSupabase();
  const canView = useCan('configuracoes:auditoria-seguranca:view');
  const [visao, setVisao] = useState<Visao>('acessos');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  useEffect(() => {
    let active = true;
    const loadAudit = async () => {
      if (!canView) { setEntries([]); setEvents([]); setLoading(false); return; }
      setEntries([]);
      setEvents([]);
      setNames({});
      setLoading(true);
      // Os dois logs vêm só da unidade ativa: a RLS filtra pelo x-company-id.
      const [registros, acessos, perfis] = await Promise.all([
        supabase
          .from('audit_log')
          .select('id, user_id, acao, tabela, registro_id, campo, valor_anterior, valor_novo, created_at, scope_reason')
          .eq('log_scope', 'TENANT')
          .order('created_at', { ascending: false })
          .limit(PAGE_LIMIT),
        supabase
          .from('admin_actions_log')
          .select('id, created_at, actor_user_id, action, target_user_id, target_email, details')
          .order('created_at', { ascending: false })
          .limit(PAGE_LIMIT),
        supabase.rpc('list_profiles_minimal', { p_search: '', p_limit: 200 }),
      ]);
      if (!active) return;
      if (registros.error) console.error('Falha ao ler auditoria de segurança:', registros.error);
      if (acessos.error) console.error('Falha ao ler eventos de acesso:', acessos.error);
      if (perfis.error) console.error('Falha ao ler nomes dos usuários:', perfis.error);
      setEntries(registros.data || []);
      setEvents((acessos.data || []) as AccessEvent[]);
      const mapa: Record<string, string> = {};
      for (const p of (perfis.data || []) as Array<{ id: string; nome?: string | null; email?: string | null }>) {
        mapa[p.id] = p.nome || p.email || '';
      }
      setNames(mapa);
      setLoading(false);
    };
    loadAudit();
    return () => { active = false; };
  }, [supabase, canView]);

  const pessoa = useCallback((id: string | null, email?: string | null) =>
    (id && names[id]) || email || (id ? `${id.slice(0, 8)}…` : 'Sistema'), [names]);

  const filtered = useMemo(() => {
    let list = entries;
    if (filterAction) list = list.filter(e => includesNormalized(e.acao, filterAction));
    if (filterSearch) {
      list = list.filter(e =>
        includesNormalized(e.acao, filterSearch) ||
        includesNormalized(e.tabela, filterSearch) ||
        includesNormalized(e.valor_novo || '', filterSearch) ||
        includesNormalized(e.valor_anterior || '', filterSearch)
      );
    }
    return list;
  }, [entries, filterAction, filterSearch]);

  const filteredEvents = useMemo(() => {
    if (!filterSearch) return events;
    return events.filter(e =>
      includesNormalized(accessLabel(e.action).label, filterSearch) ||
      includesNormalized(pessoa(e.actor_user_id), filterSearch) ||
      includesNormalized(pessoa(e.target_user_id, e.target_email), filterSearch) ||
      includesNormalized(resumoDetalhes(e.details), filterSearch)
    );
  }, [events, filterSearch, pessoa]);

  if (!canView) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <ShieldAlert className="w-12 h-12 mx-auto text-destructive/30 mb-3" />
        <p className="text-sm font-medium text-foreground">Acesso Negado</p>
        <p className="text-xs text-muted-foreground">É necessária permissão para consultar a auditoria desta unidade.</p>
      </div>
    );
  }

  const handleExport = () => {
    if (visao === 'acessos') {
      exportTableToExcel({
        module: 'auditoria',
        section: 'seguranca-acessos',
        title: 'Auditoria de Segurança — Acessos',
        columns: [
          { header: 'Data', key: 'created_at', format: (v) => formatDateBR(new Date(String(v))) },
          { header: 'Evento', key: 'evento' },
          { header: 'Feito por', key: 'ator' },
          { header: 'Usuário afetado', key: 'alvo' },
          { header: 'Detalhes', key: 'resumo' },
        ],
        rows: filteredEvents.map(e => ({
          created_at: e.created_at,
          evento: accessLabel(e.action).label,
          ator: pessoa(e.actor_user_id),
          alvo: e.target_user_id || e.target_email ? pessoa(e.target_user_id, e.target_email) : '',
          resumo: resumoDetalhes(e.details),
        })),
      });
      return;
    }
    exportTableToExcel({
      module: 'auditoria',
      section: 'seguranca',
      title: 'Log de Auditoria de Segurança',
      columns: [
        { header: 'Data', key: 'created_at', format: (v) => formatDateBR(new Date(String(v))) },
        { header: 'Ação', key: 'acao' },
        { header: 'Tabela', key: 'tabela' },
        { header: 'Registro', key: 'registro_id' },
        { header: 'Anterior', key: 'valor_anterior' },
        { header: 'Novo', key: 'valor_novo' },
        { header: 'Procedência', key: 'scope_reason', format: (v) => v === 'legacy_resource_correlated' ? 'Histórico: autoria não verificada' : String(v) },
      ],
      rows: filtered as unknown as Record<string, unknown>[],
    });
  };

  const total = visao === 'acessos' ? filteredEvents.length : filtered.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" /> Log de Auditoria de Segurança
          </p>
          <p className="text-xs text-muted-foreground">{total} eventos desta unidade</p>
        </div>
        <Button onClick={handleExport} size="sm" variant="outline" className="gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
      </div>

      <SegmentedControl
        options={VISOES}
        value={visao}
        onChange={v => setVisao(v as Visao)}
        ariaLabel="Tipo de evento"
      />

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder={visao === 'acessos' ? 'Buscar por evento, pessoa, perfil...' : 'Buscar em ação, tabela, valor...'}
            className="h-8 text-xs"
          />
        </div>
        {visao === 'registros' && (
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="h-8 rounded-md border border-border bg-secondary px-2 text-xs text-foreground">
            <option value="">Todas ações</option>
            <option value="user.">Usuários</option>
            <option value="role.">Roles</option>
            <option value="compras.">Compras</option>
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : visao === 'acessos' ? (
        <div className="space-y-1.5">
          {filteredEvents.map(event => {
            const info = accessLabel(event.action);
            const resumo = resumoDetalhes(event.details);
            const temAlvo = !!(event.target_user_id || event.target_email);
            return (
              <div key={event.id} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${info.color}`}>
                      {info.label}
                    </span>
                    {temAlvo && (
                      <span className="text-xs text-foreground truncate">{pessoa(event.target_user_id, event.target_email)}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                    {formatDateBR(new Date(event.created_at))}
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Por {pessoa(event.actor_user_id)}{resumo ? ` · ${resumo}` : ''}
                </p>
              </div>
            );
          })}
          {filteredEvents.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum evento de acesso registrado</p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(entry => {
            const actionInfo = ACTION_LABELS[entry.acao] || { label: entry.acao, color: 'bg-muted text-muted-foreground' };
            return (
              <div key={entry.id} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${actionInfo.color}`}>
                      {actionInfo.label}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{entry.tabela}</span>
                    {entry.scope_reason === 'legacy_resource_correlated' && <span className="text-[10px] text-muted-foreground">Histórico não verificado</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                    {formatDateBR(new Date(entry.created_at))}
                  </span>
                </div>
                {(entry.valor_anterior || entry.valor_novo) && (
                  <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                    {entry.valor_anterior && (
                      <span className="text-muted-foreground line-through">{entry.valor_anterior.substring(0, 50)}</span>
                    )}
                    {entry.valor_novo && (
                      <span className="text-foreground font-medium">{entry.valor_novo.substring(0, 80)}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum evento registrado</p>
          )}
        </div>
      )}
    </div>
  );
}
