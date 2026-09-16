import { StrictMode, useEffect, useMemo } from 'react';
import PresentationMode from '@/components/financeiro/PresentationMode';
import { createPresentationSociosData } from '@/test/fixtures/presentationSocios';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { GlobalCompanyBoundary } from './CompanyScopeProvider';
import { useSupabase } from './CompanyScopeContext';
import { CompanySelector } from '@/components/CompanySelector';
import { PresentationCompanyScope } from '@/components/financeiro/PresentationCompanyScope';
import { copyPresentationDecisionParams } from '@/lib/presentationDetailNavigation';
import { companyPreferenceKey } from '@/lib/companySelection';

// UI/transport unit tests. Backend authorization is exercised separately against
// real PostgreSQL in supabase/tests/database/multiunit_security.sql.
const identity = vi.hoisted(() => {
  const session = { access_token:'local-test-session', user:{ id:'user-1',email:'one@example.test' } };
  return { session, list:vi.fn(), callbacks:new Set<(event:string, session:unknown)=>void>(),
    getSession:vi.fn(async () => ({ data:{ session } })), signOut:vi.fn(async () => ({})) };
});
vi.mock('@/integrations/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const transport = createClient('http://127.0.0.1:54321', 'test-publishable-key', {
    accessToken: async () => identity.session.access_token,
  });
  return { supabase: {
  auth:{ getSession:identity.getSession, signOut:identity.signOut,
    onAuthStateChange:(callback:(event:string, session:unknown)=>void) => {
      identity.callbacks.add(callback);
      return { data:{ subscription:{ unsubscribe:() => identity.callbacks.delete(callback) } } };
    } },
  rpc:() => { const promise=Promise.resolve(identity.list());return Object.assign(promise,{ abortSignal:() => promise }); },
  from: transport.from.bind(transport),
} };
});
const exports = vi.hoisted(() => ({pdf:vi.fn(),pptx:vi.fn()}));
vi.mock('@/lib/presentationPdfExport',()=>({createPresentationPdfBlob:exports.pdf}));
vi.mock('@/lib/presentationPptxExport',()=>({createPresentationPptxBlob:exports.pptx}));
const companies=[{ id:'A',nome:'Loja Centro' },{ id:'B',nome:'Loja Shopping' },{ id:'D',nome:'Loja Norte' }];
const clients=new Map<string,ReturnType<typeof useSupabase>>();
const caches=new Map<string,ReturnType<typeof useQueryClient>>();
let allowed=companies.slice(0,2);
let delayB=false;
let releaseB: (()=>void)|undefined;
const profile = (id:string) => ({ company_id:id,company_name:companies.find(c=>c.id===id)!.nome,
  nome:'Pessoa',email:'one@example.test',roles:[id==='A'?'admin':'viewer'],permissions:id==='A'?['edit']:['view'] });

function Data({ label }: { label:string }) {
  const { profile }=useAuth();const supabase=useSupabase();const cache=useQueryClient();
  const companyId=profile!.company_id;
  useEffect(() => { clients.set(`${label}:${companyId}`,supabase);caches.set(`${label}:${companyId}`,cache);
    supabase.channel(`orders:${label}:${companyId}`);
  },[companyId,supabase,cache,label]);
  const query=useQuery({ queryKey:['accounts',companyId],queryFn:async () => {
    const { data,error }=await supabase.from('fin_contas').select('nome');if(error)throw error;return data;
  } });
  return <output aria-label={label}>{query.isPending?'Carregando':`${profile!.company_name}: ${query.data?.[0]?.nome}`}</output>;
}
function ExportPresentation() {
  const {profile}=useAuth();
  const data=useMemo(()=>({...createPresentationSociosData(),company:{id:profile!.company_id,name:profile!.company_name}}),[profile]);
  return <PresentationMode data={data} canExport displayMode="embedded" onClose={()=>{}} />;
}
function Presentation({ companySelector,localUnitOverride }: { companySelector:React.ReactNode;localUnitOverride:boolean }) {
  const location=useLocation();const navigate=useNavigate();const { profile }=useAuth();
  if(location.pathname==='/presentation/export')return <ExportPresentation/>;
  return <section>{companySelector}{localUnitOverride&&<p>Somente nesta apresentação</p>}<Data label="apresentação" />
    <span>Permissões locais: {profile!.roles.join(',')}</span>
    <button onClick={() => { const params=copyPresentationDecisionParams(new URLSearchParams(location.search),new URLSearchParams());navigate(`/presentation/detail?${params}`); }}>Detalhar</button>
  </section>;
}
function Workspace() {
  const auth=useAuth();const location=useLocation();const navigate=useNavigate();
  if (!auth.user || !auth.profile) return null;
  return <><CompanySelector companies={auth.accessibleCompanies} value={auth.activeCompanyId!} onChange={id=>void auth.setActiveCompany(id)} label="Unidade global" />
    <Data label="global" /><span>Permissões globais: {auth.roles.join(',')}</span><output aria-label="URL">{location.pathname+location.search}</output>
    <button onClick={() => navigate('/stock')}>Estoque</button><button onClick={() => navigate('/presentation')}>Apresentação</button>
    <button onClick={()=>void auth.refreshCompanies()}>Revalidar</button>
    {location.pathname.startsWith('/presentation')&&<PresentationCompanyScope>{scope=><Presentation {...scope}/>}</PresentationCompanyScope>}
  </>;
}
function mount(path='/stock',strict=false) {
  const tree=<AuthProvider><MemoryRouter initialEntries={[path]}><GlobalCompanyBoundary><Workspace/></GlobalCompanyBoundary></MemoryRouter></AuthProvider>;
  return render(strict?<StrictMode>{tree}</StrictMode>:tree);
}
async function select(label:string,name:string) {
  fireEvent.keyDown(await screen.findByRole('button',{name:new RegExp(label)}),{ key:'Enter' });
  fireEvent.click(await screen.findByRole('menuitem',{name}));
}
beforeEach(() => {
  clients.clear();caches.clear();localStorage.clear();allowed=companies.slice(0,2);delayB=false;releaseB=undefined;
  identity.list.mockImplementation(() => ({ data:allowed,error:null }));identity.signOut.mockClear();
  vi.stubGlobal('fetch',vi.fn(async (input:RequestInfo|URL,init?:RequestInit) => {
    const headers=new Headers(init?.headers);const id=headers.get('x-company-id')!;const url=String(input);
    if(!allowed.some(c=>c.id===id))return new Response(JSON.stringify({message:'COMPANY_ACCESS_DENIED'}),{status:403});
    if(url.includes('get_my_company_context'))return new Response(JSON.stringify(profile(id)),{status:200});
    if(delayB&&id==='B')await new Promise<void>((resolve,reject)=>{releaseB=resolve;init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')));});
    return new Response(JSON.stringify([{nome:`Conta ${id}`}]),{status:200});
  }));
});
afterEach(() => { cleanup();vi.unstubAllGlobals();expect(identity.callbacks.size).toBe(0); });
describe('escopo de unidade com um login',() => {
  it('falha fechada e retry criam cliente novo para a apresentação', async () => {
    localStorage.setItem(companyPreferenceKey('user-1'), 'A');
    const transport = vi.mocked(fetch).getMockImplementation()!;
    let fail = true;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (fail && String(input).includes('get_my_company_context') && new Headers(init?.headers).get('x-company-id') === 'B') {
        return new Response(JSON.stringify({ message: 'fixture unavailable' }), { status: 500 });
      }
      return transport(input, init);
    });
    mount('/presentation?presentationUnit=B');
    expect(await screen.findByText('Não foi possível validar o acesso a esta unidade.')).toBeInTheDocument();
    expect(screen.queryByLabelText('apresentação')).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta B'));
    expect(screen.getByLabelText('global')).toHaveTextContent('Conta A');
  });
  it('não troca uma seleção explícita em voo por refresh de foco', async () => {
    localStorage.setItem(companyPreferenceKey('user-1'), 'A');
    mount();
    await waitFor(() => expect(screen.getByLabelText('global')).toHaveTextContent('Conta A'));
    const transport = vi.mocked(fetch).getMockImplementation()!;
    let release!: () => void;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes('get_my_company_context') && new Headers(init?.headers).get('x-company-id') === 'B') {
        await new Promise<void>(resolve => { release = resolve; });
      }
      return transport(input, init);
    });
    await select('Unidade global', 'Loja Shopping');
    await waitFor(() => expect(release).toBeDefined());
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    // Liberar só o primeiro carregamento; os seguintes usam o transporte normal.
    vi.mocked(fetch).mockImplementation(transport);
    await act(async () => release());
    await waitFor(() => expect(screen.getByLabelText('global')).toHaveTextContent('Conta B'));
    expect(localStorage.getItem(companyPreferenceKey('user-1'))).toBe('B');
  });
  it('descarta exportador que conclui depois de encerrar a apresentação', async () => {
    let complete!: (blob: Blob) => void;
    exports.pdf.mockImplementation(() => new Promise<Blob>(resolve => { complete = resolve; }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    localStorage.setItem(companyPreferenceKey('user-1'), 'A');
    mount('/presentation/export?presentationUnit=B');
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar apresentação em PDF' }));
    await waitFor(() => expect(complete).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Estoque' }));
    await act(async () => complete(new Blob(['late'])));
    expect(download).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('entra no banco anterior à migração, inclusive na apresentação e nas Edge Functions',async()=>{
    identity.list.mockReturnValue({data:null,error:{code:'PGRST202',message:'Could not find the function public.list_my_companies without parameters in the schema cache'}});
    localStorage.setItem(companyPreferenceKey('user-1'),'B');
    vi.mocked(fetch).mockImplementation(async(input,init)=>{
      const url=new URL(String(input));
      // O CORS das Edge Functions antigas ainda não aceita x-company-id.
      expect(new Headers(init?.headers).has('x-company-id')).toBe(false);
      const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
      if(url.pathname.endsWith('/user_roles'))return url.searchParams.get('select')==='company_id'
        ?json({code:'42703',message:'column user_roles.company_id does not exist'},400):json([{role:'admin'}]);
      if(url.pathname.endsWith('/profiles'))return json({...profile('A'),id:'user-1',companies:{id:'A',nome:'Loja Centro',ativo:true}});
      if(url.pathname.endsWith('/assert_tenant'))return json('A');
      if(url.pathname.endsWith('/get_effective_permissions'))return json(profile('A').permissions);
      return json([{nome:'Conta A'}]);
    });
    mount('/presentation');
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta A'));
    expect(screen.getByLabelText('global')).toHaveTextContent('Conta A');
    expect(screen.queryByRole('button',{name:/Unidade global/})).toBeNull();
    expect(localStorage.getItem(companyPreferenceKey('user-1'))).toBe('A');
    expect((await clients.get('global:A')!.functions.invoke('cmv',{body:{action:'test'}})).error).toBeNull();
    const oldClient=clients.get('global:A')!;
    const oldCache=caches.get('global:A')!;
    identity.list.mockImplementation(()=>({data:allowed,error:null}));
    vi.mocked(fetch).mockImplementation(async(input,init)=>{
      const id=new Headers(init?.headers).get('x-company-id');
      expect(id).toBe('A');
      return new Response(JSON.stringify(String(input).includes('get_my_company_context')?profile('A'):[{nome:'Conta A'}]),{status:200});
    });
    fireEvent.click(screen.getByRole('button',{name:'Revalidar'}));
    await waitFor(()=>expect(clients.get('global:A')).not.toBe(oldClient));
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta A'));
    expect(oldCache.getQueryCache().getAll()).toHaveLength(0);
    expect(oldClient.getChannels()).toHaveLength(0);
    expect(screen.getByRole('button',{name:/Unidade global/})).toBeInTheDocument();
    expect(identity.signOut).not.toHaveBeenCalled();
  });
  it('entra automaticamente com uma loja e não mostra dropdown',async()=>{
    allowed=[companies[0]];mount();await waitFor(()=>expect(screen.getByLabelText('global')).toHaveTextContent('Conta A'));
    expect(screen.queryByRole('button',{name:/Unidade global/})).toBeNull();expect(identity.signOut).not.toHaveBeenCalled();
  });
  it('pede seleção no primeiro login com várias lojas',async()=>{
    mount();expect(await screen.findByText('Selecione uma unidade')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Loja Shopping'}));
    await waitFor(()=>expect(screen.getByLabelText('global')).toHaveTextContent('Conta B'));
    expect(localStorage.getItem(companyPreferenceKey('user-1'))).toBe('B');
  });
  it('restaura a loja válida, troca sem relogin e descarta cache e canais antigos',async()=>{
    localStorage.setItem(companyPreferenceKey('user-1'),'A');mount();
    await waitFor(()=>expect(screen.getByLabelText('global')).toHaveTextContent('Conta A'));
    const old=clients.get('global:A')!;const cache=caches.get('global:A')!;
    expect(old.getChannels()).toHaveLength(1);delayB=true;
    await select('Unidade global','Loja Shopping');
    await screen.findByText('Permissões globais: viewer');
    expect(screen.queryByText(/Conta A/)).toBeNull();expect(cache.getQueryCache().getAll()).toHaveLength(0);
    await waitFor(()=>expect(old.getChannels()).toHaveLength(0));
    await act(async()=>releaseB?.());await waitFor(()=>expect(screen.getByLabelText('global')).toHaveTextContent('Conta B'));
    expect(identity.signOut).not.toHaveBeenCalled();
    const before=vi.mocked(fetch).mock.calls.length;
    const late=await old.from('fin_contas').insert({nome:'tardio',tipo:'CAIXA',company_id:'A'});
    expect(late.error).toBeTruthy();expect(vi.mocked(fetch).mock.calls.length).toBe(before);
  });
  it('encaminha unidade e sessão também nas Edge Functions e preserva streaming',async()=>{
    localStorage.setItem(companyPreferenceKey('user-1'),'B');mount();
    await waitFor(()=>expect(screen.getByLabelText('global')).toHaveTextContent('Conta B'));
    vi.mocked(fetch).mockImplementationOnce(async(_input,init)=>{
      const headers=new Headers(init?.headers);
      expect(headers.get('x-company-id')).toBe('B');
      expect(headers.get('authorization')).toBe('Bearer local-test-session');
      return new Response('data: exemplo\n\n',{headers:{'Content-Type':'text/event-stream'}});
    });
    const result=await clients.get('global:B')!.functions.invoke('ai-chat',{body:{messages:[]}});
    expect(result.error).toBeNull();
    expect(await (result.data as Response).text()).toBe('data: exemplo\n\n');
  });
  it('mantém B na apresentação, A no global, detalhes em B e outro módulo em A',async()=>{
    localStorage.setItem(companyPreferenceKey('user-1'),'A');mount('/presentation?month=2026-09&period=month');
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta A'));
    await select('Unidade da apresentação','Loja Shopping');
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta B'));
    expect(screen.getByLabelText('global')).toHaveTextContent('Conta A');
    expect(screen.getByText('Somente nesta apresentação')).toBeInTheDocument();
    expect(screen.getByText('Permissões locais: viewer')).toBeInTheDocument();
    expect(screen.getByLabelText('URL')).toHaveTextContent('month=2026-09');
    fireEvent.click(screen.getByRole('button',{name:'Detalhar'}));
    expect(screen.getByLabelText('URL')).toHaveTextContent('/presentation/detail?presentationUnit=B');
    expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta B');
    fireEvent.click(screen.getByRole('button',{name:'Estoque'}));
    expect(screen.getByLabelText('global')).toHaveTextContent('Conta A');
    expect(screen.queryByLabelText('apresentação')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Apresentação'}));
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta A'));
  });
  it('acompanha troca global sem override e preserva override explícito depois',async()=>{
    allowed=companies;localStorage.setItem(companyPreferenceKey('user-1'),'A');mount('/presentation');
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta A'));
    await select('Unidade global','Loja Shopping');
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta B'));
    await select('Unidade da apresentação','Loja Centro');
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta A'));
    await select('Unidade global','Loja Norte');
    await waitFor(()=>expect(screen.getByLabelText('global')).toHaveTextContent('Conta D'));
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta A'));
  });
  it('recupera override autorizado no reload e rejeita URL não autorizada',async()=>{
    localStorage.setItem(companyPreferenceKey('user-1'),'A');const first=mount('/presentation?presentationUnit=B');
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta B'));first.unmount();
    mount('/presentation?presentationUnit=C');
    expect(await screen.findByText('Você não tem acesso à unidade desta apresentação.')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([,init])=>new Headers(init?.headers).get('x-company-id')==='C')).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'Voltar à unidade atual'}));
    await waitFor(()=>expect(screen.getByLabelText('apresentação')).toHaveTextContent('Conta A'));
  });
  it('revalida remoção de acesso, vai para a única unidade restante e trata ausência de acesso',async()=>{
    localStorage.setItem(companyPreferenceKey('user-1'),'B');mount();
    await waitFor(()=>expect(screen.getByLabelText('global')).toHaveTextContent('Conta B'));
    allowed=[companies[0]];
    await act(async()=>{ await clients.get('global:B')!.from('fin_contas').select(); });
    await waitFor(()=>expect(screen.getByLabelText('global')).toHaveTextContent('Conta A'));
    allowed=[];fireEvent.click(screen.getByRole('button',{name:'Revalidar'}));
    expect(await screen.findByText('Nenhuma unidade disponível')).toBeInTheDocument();expect(screen.queryByLabelText('global')).toBeNull();
  });
  it('envia o escopo B aos dois exportadores e à impressão mantendo o global A',async()=>{
    exports.pdf.mockResolvedValue(new Blob(['pdf']));exports.pptx.mockResolvedValue(new Blob(['pptx']));
    vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:multiunit');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
    vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
    const print=vi.spyOn(window,'print').mockImplementation(()=>{
      const text=document.querySelector('.presentation-print-root')!.textContent;
      expect(text).toContain('Loja Shopping');expect(text).not.toContain('Loja Centro');
    });
    localStorage.setItem(companyPreferenceKey('user-1'),'A');mount('/presentation/export?presentationUnit=B');
    const pdf=await screen.findByRole('button',{name:'Exportar apresentação em PDF'});
    fireEvent.click(pdf);await waitFor(()=>expect(exports.pdf).toHaveBeenCalledOnce());
    expect(exports.pdf.mock.calls[0][0].company).toEqual({id:'B',name:'Loja Shopping'});
    await waitFor(()=>expect(pdf).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Exportar apresentação em PowerPoint'}));
    await waitFor(()=>expect(exports.pptx).toHaveBeenCalledOnce());
    expect(exports.pptx.mock.calls[0][0].company).toEqual({id:'B',name:'Loja Shopping'});
    await waitFor(()=>expect(pdf).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Imprimir apresentação'}));
    await waitFor(()=>expect(print).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('global')).toHaveTextContent('Conta A');
    vi.restoreAllMocks();
  });
  it('suporta a montagem dupla do StrictMode sem usar cliente cancelado',async()=>{
    allowed=[companies[0]];mount('/stock',true);
    await waitFor(()=>expect(screen.getByLabelText('global')).toHaveTextContent('Conta A'));
  });
});
