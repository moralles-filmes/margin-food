import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_PERMISSION_KEYS, LEGACY_PERMISSION_MAP } from '@/permissions/registry';
import { mensagemErroCriacaoColaborador, mensagemErroEdicaoColaborador } from '@/domain/rh/prontuario';

const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), 'utf8').replace(/\r\n/g, '\n');
const semComentario = (texto: string) => texto.replace(/--.*$/gm, '');

const codigo = semComentario(ler('supabase/migrations/20261007220000_rh_escalas_rpc_e_prontuario_lock.sql'));
const anterior = semComentario(ler('supabase/migrations/20261007200000_rh_prontuario_edicao.sql'));
const rhView = ler('src/components/RhView.tsx');
const escalas = ler('src/components/rh/EscalasSection.tsx');

function entre(texto: string, inicio: string, fim: string): string {
  const pos = texto.indexOf(inicio);
  expect(pos, `trecho ausente: ${inicio}`).toBeGreaterThanOrEqual(0);
  return texto.slice(pos, texto.indexOf(fim, pos));
}

function chaves(bloco: string): string[] {
  return [...new Set([...bloco.matchAll(/'([a-z_-]+:[a-z_:-]+)'/g)].map(m => m[1]))].sort();
}

/** Chave granular + toda legada do LEGACY_PERMISSION_MAP que a expande no front + super admin. */
function familia(granular: string): string[] {
  return [granular, 'system:global:manage', ...Object.entries(LEGACY_PERMISSION_MAP)
    .filter(([, expande]) => expande.includes(granular)).map(([legada]) => legada)].sort();
}

const funcao = (texto: string, nome: string) =>
  entre(texto, `FUNCTION public.${nome}(`, '$function$;');

const RPCS_EDICAO = ['rh_escala_adicionar_turno', 'rh_escala_remover_turno', 'rh_escala_publicar', 'rh_escala_decidir_troca'];

describe('migração: Escalas por RPC', () => {
  it('cada RPC resolve o tenant e roda com search_path vazio', () => {
    for (const nome of ['rh_escala_criar', ...RPCS_EDICAO, 'rh_atualizar_colaborador']) {
      const corpo = funcao(codigo, nome);
      expect(corpo, nome).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
      expect(corpo, nome).toContain('v_company uuid := public.assert_tenant();');
    }
  });

  it('gates com a chave do registry que a tela usa, a legada que a expande e o super admin — sempre com :view', () => {
    const gate = (nome: string) =>
      entre(funcao(codigo, nome), 'IF NOT public.has_any_permission', 'RAISE EXCEPTION').split(/\bOR NOT public\.has_any_permission/);
    const [criar, verCriar] = gate('rh_escala_criar');
    expect(chaves(criar)).toEqual(familia('rh:escalas:create'));
    expect(chaves(verCriar)).toEqual(familia('rh:escalas:view'));
    for (const nome of RPCS_EDICAO) {
      const [editar, ver] = gate(nome);
      expect(chaves(editar), nome).toEqual(familia('rh:escalas:edit'));
      expect(chaves(ver), nome).toEqual(familia('rh:escalas:view'));
    }
    // rh:escalas:manage nunca esteve no registry: Admin → Permissões grava DENY nela.
    expect(codigo).not.toContain('rh:escalas:manage');
  });

  it('toda leitura e escrita dentro das RPCs fica na empresa do tenant', () => {
    for (const nome of ['rh_escala_criar', ...RPCS_EDICAO]) {
      const corpo = funcao(codigo, nome);
      for (const m of corpo.matchAll(/\b(?:FROM|UPDATE|DELETE FROM) public\.rh_\w+[\s\S]*?;/g)) {
        expect(m[0], `${nome}: ${m[0].slice(0, 60)}`).toMatch(/company_id = v_company/);
      }
    }
  });

  it('turno só muda em rascunho, conferido com a escala travada', () => {
    const adicionar = funcao(codigo, 'rh_escala_adicionar_turno');
    expect(adicionar).toMatch(/FOR UPDATE;\s+IF NOT FOUND THEN\s+RAISE EXCEPTION 'NOT_FOUND'[\s\S]*IF v_escala\.status <> 'RASCUNHO' THEN\s+RAISE EXCEPTION 'ESCALA_PUBLICADA'/);
    expect(adicionar).toContain("p_dia < v_escala.semana_inicio OR p_dia > v_escala.semana_inicio + 6");
    expect(adicionar).toMatch(/c\.id = p_colaborador_id AND c\.company_id = v_company AND c\.status = 'ativo'/);
    expect(adicionar).toMatch(/IF p_tipo = 'TRABALHO' AND p_hora_inicio = p_hora_fim THEN\s+RAISE EXCEPTION 'HORARIO_INVALIDO'/);
    // Reenvio do mesmo turno devolve o gravado; outro turno no mesmo início é recusado.
    expect(adicionar).toMatch(/IS NOT DISTINCT FROM \(p_hora_fim, p_tipo, v_funcao, coalesce\(p_observacao, ''\)\) THEN\s+RETURN v_existente\.id;\s+END IF;\s+RAISE EXCEPTION 'TURNO_DUPLICADO'/);
    const remover = funcao(codigo, 'rh_escala_remover_turno');
    expect(remover).toMatch(/FOR UPDATE;\s+IF v_status IS DISTINCT FROM 'RASCUNHO' THEN\s+RAISE EXCEPTION 'ESCALA_PUBLICADA'/);
  });

  it('publicar calcula o custo no servidor, com inativos, e não o devolve', () => {
    const publicar = funcao(codigo, 'rh_escala_publicar');
    expect(publicar).toMatch(/rh_escala_publicar\(p_escala_id uuid, p_turnos_vistos uuid\[\]\)\nRETURNS void/);
    expect(publicar).toContain('custo_projetado = v_custo');
    // Sem valor-hora, salário/220 — a mesma regra da tela, da Folha e de Custos.
    expect(publicar).toContain('* coalesce(nullif(c.valor_hora, 0), coalesce(c.salario, 0) / 220.0)');
    expect(ler('src/domain/rh/custoEscala.ts')).toContain('c.valor_hora || (c.salario ?? 0) / 220');
    // Sem filtro de status no colaborador: o turno de quem foi desativado continua custando.
    const juncao = entre(publicar, 'JOIN public.rh_colaboradores c', 'WHERE');
    expect(juncao).not.toContain('status');
    expect(publicar).toContain("s.tipo = 'TRABALHO'");
    expect(publicar).toContain('CASE WHEN s.hora_fim < s.hora_inicio THEN 24 ELSE 0 END');
    expect(publicar).toContain("'publicar_escala', 'rh_escalas', p_escala_id, v_company, v_uid");
  });

  it('publicar confere os turnos que a tela mostrava e recusa escala vazia', () => {
    const publicar = funcao(codigo, 'rh_escala_publicar');
    const ordem = ["IF v_escala.status = 'PUBLICADA' THEN\n    RETURN;", "RAISE EXCEPTION 'ESCALA_VAZIA'", "RAISE EXCEPTION 'ESCALA_ALTERADA'", 'UPDATE public.rh_escalas SET'];
    const posicoes = ordem.map(t => publicar.indexOf(t));
    expect(posicoes.every(p => p >= 0), String(posicoes)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    expect(publicar).toContain('FROM unnest(p_turnos_vistos) AS t');
  });

  it('leitura com rh:escalas:view nas três tabelas, embrulhada em SELECT', () => {
    for (const [policy, tabela] of [
      ['rh_escalas_select', 'rh_escalas'], ['rh_escala_slots_select', 'rh_escala_slots'], ['rh_trocas_select', 'rh_trocas_turno'],
    ]) {
      const bloco = entre(codigo, `ALTER POLICY ${policy} ON public.${tabela}`, ';');
      expect(chaves(bloco), policy).toEqual(familia('rh:escalas:view'));
      expect(bloco).toContain('TO authenticated');
      expect(bloco).toContain('company_id = (SELECT public.get_current_company_id())');
      expect(bloco).toContain('(SELECT public.has_any_permission(auth.uid()');
    }
  });

  it('escrita direta fechada: policies removidas, privilégio revogado e conferido', () => {
    for (const policy of [
      'rh_escalas_insert ON public.rh_escalas', 'rh_escalas_update ON public.rh_escalas', 'rh_escalas_delete ON public.rh_escalas',
      'rh_escala_slots_insert ON public.rh_escala_slots', 'rh_escala_slots_update ON public.rh_escala_slots',
      'rh_escala_slots_delete ON public.rh_escala_slots', '"Colaborador can insert own trocas" ON public.rh_trocas_turno',
      'rh_trocas_insert ON public.rh_trocas_turno', 'rh_trocas_update ON public.rh_trocas_turno',
      'rh_trocas_delete ON public.rh_trocas_turno', 'rh_trocas_turno_delete ON public.rh_trocas_turno',
    ]) {
      expect(codigo).toContain(`DROP POLICY IF EXISTS ${policy};`);
    }
    expect(codigo).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.rh_escalas, public.rh_escala_slots, public.rh_trocas_turno FROM authenticated, anon;',
    );
    expect(codigo).toMatch(/DO \$privilegios\$[\s\S]*'custo_projetado', 'SELECT'[\s\S]*sobrou policy de escrita[\s\S]*uma única policy de SELECT por tabela/);
  });

  it('custo_projetado fica fora do SELECT, e a tela só lê colunas liberadas', () => {
    expect(codigo).toMatch(/REVOKE SELECT ON public\.rh_escalas FROM authenticated, anon;\s+GRANT SELECT \(/);
    const liberadas = entre(codigo, 'GRANT SELECT (', ') ON public.rh_escalas TO authenticated;')
      .replace('GRANT SELECT (', '').split(',').map(c => c.trim());
    expect(liberadas).not.toContain('custo_projetado');
    const lidas = entre(escalas, ".from('rh_escalas')", '.eq(').match(/\.select\('([^']+)'\)/)![1].split(',').map(c => c.trim());
    expect(lidas.filter(c => !liberadas.includes(c))).toEqual([]);
  });

  it('RPCs fecham EXECUTE a PUBLIC/anon e abrem a authenticated', () => {
    for (const assinatura of [
      'rh_escala_criar(date, text)', 'rh_escala_adicionar_turno(uuid, uuid, date, time, time, text, text, text)',
      'rh_escala_remover_turno(uuid)', 'rh_escala_publicar(uuid, uuid[])', 'rh_escala_decidir_troca(uuid, boolean)',
      'rh_atualizar_colaborador(uuid, text, text, text, text, text, text, text, text, numeric, numeric, numeric, date, uuid, timestamptz)',
    ]) {
      expect(codigo).toContain(`REVOKE ALL ON FUNCTION public.${assinatura} FROM PUBLIC, anon;`);
      expect(codigo).toContain(`GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated, service_role;`);
    }
  });

  it('toda chave granular existe no registry', () => {
    const legadas = new Set([...Object.keys(LEGACY_PERMISSION_MAP), 'system:global:manage']);
    expect(chaves(codigo).filter(k => !legadas.has(k) && !ALL_PERMISSION_KEYS.includes(k))).toEqual([]);
  });

  it('sem dia de negócio em UTC; now() só em timestamptz', () => {
    expect(codigo).not.toMatch(/CURRENT_DATE|now\(\)\s*::\s*date/i);
    const usos = [...codigo.matchAll(/(\w+) = now\(\)/g)].map(m => m[1]).sort();
    expect(usos).toEqual(['aprovado_em', 'publicada_em']);
    expect(codigo.match(/now\(\)/g)).toHaveLength(2);
  });
});

describe('migração: Prontuário', () => {
  it('a edição troca de assinatura com DROP da antiga e só ganha a trava', () => {
    expect(codigo).toContain(
      'DROP FUNCTION IF EXISTS public.rh_atualizar_colaborador(uuid, text, text, text, text, text, text, text, text, numeric, numeric, numeric, date, uuid);',
    );
    const nova = funcao(codigo, 'rh_atualizar_colaborador');
    expect(nova).toContain('p_user_id uuid,\n  p_expected_updated_at timestamptz DEFAULT NULL\n)');
    const inicio = nova.indexOf('  IF p_expected_updated_at IS NOT NULL AND v_antes.updated_at IS DISTINCT FROM p_expected_updated_at THEN');
    const fimTrava = "    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';\n  END IF;\n";
    expect(inicio).toBeGreaterThanOrEqual(0);
    const trava = nova.slice(inicio, nova.indexOf(fimTrava, inicio) + fimTrava.length);
    // A trava vem depois da linha travada (FOR UPDATE) e antes de qualquer escrita.
    expect(nova.indexOf('FOR UPDATE;')).toBeLessThan(inicio);
    expect(inicio).toBeLessThan(nova.indexOf('UPDATE public.rh_colaboradores SET'));
    // Reenvio (a linha já está como o pedido a deixaria) compara as mesmas colunas que o UPDATE grava.
    const set = entre(nova, 'UPDATE public.rh_colaboradores SET', 'WHERE id = p_id');
    const gravadas = [...set.matchAll(/^\s+(\w+) = /gm)].map(m => m[1]);
    const comparadas = [...entre(trava, '(v_antes.', 'IS NOT DISTINCT FROM').matchAll(/v_antes\.(\w+)/g)].map(m => m[1]);
    expect(comparadas).toEqual(gravadas);
    // Ninguém vincula o próprio usuário: checado antes de membership e unicidade.
    const proprio = "    IF p_user_id = v_uid THEN\n      RAISE EXCEPTION 'VINCULO_PROPRIO' USING ERRCODE = '42501';\n    END IF;\n";
    expect(nova).toContain("  IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_antes.user_id THEN\n" + proprio);
    // Fora a trava e o vínculo próprio, o corpo é o mesmo da versão em produção (20261007200000).
    const corpo = (texto: string) => entre(texto, 'DECLARE', '$function$;');
    expect(corpo(nova).replace(trava, '').replace(proprio, '')).toBe(corpo(funcao(anterior, 'rh_atualizar_colaborador')));
  });

  it('criar com remuneração ou usuário vinculado exige :manage; vinculado precisa ser membro', () => {
    const bloco = entre(codigo, 'ALTER POLICY rh_colaboradores_insert_hr ON public.rh_colaboradores', ';');
    const [criar, resto] = bloco.split('(coalesce(salario, 0) = 0 AND coalesce(valor_hora, 0) = 0 AND user_id IS NULL)');
    expect(resto, 'sem :manage, cadastro sem remuneração nem vínculo').toBeDefined();
    expect(chaves(criar)).toEqual([...new Set([...familia('rh:prontuario:create'), ...familia('rh:prontuario:manage')])].sort());
    expect(chaves(resto)).toEqual(familia('rh:prontuario:manage'));
    // Vinculado: membro da unidade e nunca quem está criando (outro gestor faz).
    expect(resto).toMatch(/user_id IS NULL\s+OR \(user_id <> \(SELECT auth\.uid\(\)\) AND public\.is_company_member\(user_id, company_id\)\)/);
  });

  it('UPDATE direto da tabela fica só com o status; vínculo e salário só pela RPC', () => {
    expect(codigo).toContain(
      'REVOKE UPDATE ON public.rh_colaboradores FROM authenticated, anon;\nGRANT UPDATE (status) ON public.rh_colaboradores TO authenticated;',
    );
    expect(codigo).toContain("has_column_privilege('authenticated', 'public.rh_colaboradores', 'user_id', 'UPDATE')");
    const updates = [...rhView.matchAll(/from\('rh_colaboradores'\)\.update\((\{[^}]*\})/g)].map(m => m[1]);
    expect(updates.length).toBeGreaterThan(0);
    for (const corpo of updates) expect(corpo).toMatch(/^\{ status: '\w+' \}$/);
  });
});

describe('Escalas e Prontuário na tela', () => {
  /** Parâmetros da RPC no SQL × chaves enviadas pela tela. */
  function confereChamada(tela: string, nome: string) {
    const assinatura = entre(funcao(codigo, nome), `${nome}(`, ')\nRETURNS');
    const params = [...assinatura.matchAll(/(p_\w+) [a-z]+/g)].map(m => m[1]).sort();
    const chamada = entre(tela, `('${nome}', {`, '});');
    expect([...chamada.matchAll(/\b(p_\w+):/g)].map(m => m[1]).sort(), nome).toEqual(params);
  }

  it('Escalas grava só pelas RPCs, com os parâmetros certos', () => {
    expect(escalas).not.toMatch(/from\('rh_(escalas|escala_slots|trocas_turno)'\)\s*\.(insert|update|delete|upsert)\(/);
    for (const nome of ['rh_escala_criar', ...RPCS_EDICAO]) confereChamada(escalas, nome);
  });

  it('Escalas usa as próprias chaves, não o gate do Prontuário', () => {
    expect(escalas).toContain("useCan('rh:escalas:create')");
    expect(escalas).toContain("useCan('rh:escalas:edit')");
    expect(escalas).not.toMatch(/canManage\b/);
    expect(rhView).toContain('<EscalasSection colaboradores={colaboradores} />');
  });

  it('a edição abre com a linha atual e devolve o updated_at como trava', () => {
    confereChamada(rhView, 'rh_atualizar_colaborador');
    const abrir = entre(rhView, 'const handleOpenEdit = async', 'setShowEditColab(true);');
    expect(abrir).toMatch(/from\('rh_colaboradores'\)\s*\.select\('[^']*\bupdated_at\b[^']*'\)/);
    expect(abrir).toContain('salario: numeroParaCampoMoeda(atual.salario), valor_hora: numeroParaCampoMoeda(atual.valor_hora)');
    const salvar = entre(rhView, 'const handleUpdateColab = async', '});');
    expect(salvar).toMatch(/if \(!editingColab\.updated_at\) \{[^}]*return; \}/);
    expect(salvar).toContain('p_expected_updated_at: editingColab.updated_at,');
    // Campo não alterado devolve o valor gravado, mesmo com mais de 2 casas.
    expect(salvar).toContain('campoMoedaParaNumero(editForm.salario, editingColab.salario)');
    expect(salvar).toContain('campoMoedaParaNumero(editForm.valor_hora, editingColab.valor_hora)');
  });

  it('sem :manage, remuneração e vínculo voltam do banco na edição e vão vazios na criação', () => {
    const chamada = entre(rhView, "('rh_atualizar_colaborador', {", '});');
    for (const campo of ['salario', 'valor_hora', 'user_id']) {
      expect(chamada).toMatch(new RegExp(`p_${campo}: canManageProntuario \\? .+ : \\(?editingColab\\.${campo}`));
    }
    // Os três campos travados nos dois formulários (o mesmo renderColabForm).
    expect(rhView.match(/disabled=\{!canManageProntuario\}/g)).toHaveLength(3);
    const criar = entre(rhView, 'const handleCreateColab = () => executarCriacaoColab(', '});');
    expect(criar).toContain('salario: canManageProntuario ? (normalizeBRLMoneyToNumber(formColab.salario) ?? 0) : 0');
    expect(criar).toContain('valor_hora: canManageProntuario ? (normalizeBRLMoneyToNumber(formColab.valor_hora) ?? 0) : 0');
    expect(criar).toContain('if (canManageProntuario && formColab.user_id) payload.user_id = formColab.user_id;');
  });

  it('publicar pede confirmação, trava o botão e manda os turnos que a tela mostra', () => {
    const publicar = entre(escalas, 'const handlePublicar = () => executarPublicar(', "toast.success('Escala publicada!');");
    expect(publicar.indexOf('await confirm(')).toBeLessThan(publicar.indexOf("('rh_escala_publicar'"));
    expect(publicar).toContain('p_turnos_vistos: slots.map(s => s.id)');
    expect(escalas).toContain('disabled={publicando || slots.length === 0}');
  });

  it('o seletor de usuário não oferece o próprio usuário, salvo se já for o vínculo', () => {
    expect(rhView).toContain('profiles.filter(p => p.id !== user?.id || p.id === form.user_id)');
  });

  it('mensagens de conflito e de criação', () => {
    expect(mensagemErroEdicaoColaborador('VINCULO_PROPRIO'))
      .toBe('Vincular o próprio usuário a um colaborador precisa ser feito por outro gestor do Prontuário.');
    expect(mensagemErroEdicaoColaborador('OPTIMISTIC_LOCK_CONFLICT'))
      .toBe('Outra pessoa alterou este colaborador enquanto você editava. Feche e abra de novo para ver os dados atuais.');
    expect(mensagemErroCriacaoColaborador('duplicate key value violates unique constraint "uq_rh_colaboradores_company_user"'))
      .toBe('O usuário escolhido já está vinculado a outro colaborador.');
    expect(mensagemErroCriacaoColaborador('new row violates row-level security policy for table "rh_colaboradores"'))
      .toBe('Sem permissão para criar este colaborador. Salário, valor/hora e usuário vinculado exigem gerenciar o Prontuário; o usuário vinculado precisa ter acesso a esta unidade e não pode ser você.');
    expect(mensagemErroCriacaoColaborador('falha de rede')).toBe('Erro ao criar colaborador: falha de rede');
  });
});
