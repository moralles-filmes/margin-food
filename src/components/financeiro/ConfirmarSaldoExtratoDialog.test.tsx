import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmarSaldoExtratoDialog from './ConfirmarSaldoExtratoDialog';

const mocks = vi.hoisted(() => {
  const state = {
    can: {} as Record<string, boolean>,
    saldoBase: 0,
    anteriores: [] as { id: string }[],
    posteriores: [] as { id: string }[],
    conta: null as Record<string, unknown> | null,
    updateError: null as { message: string } | null,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    queries: [] as Array<{ table: string; calls: Array<[string, unknown[]]> }>,
  };

  // A consulta de lançamentos posteriores é a única com `data_pagamento.gt.`.
  const ehConsultaPosterior = (calls: Array<[string, unknown[]]>) =>
    calls.some(([metodo, args]) => metodo === 'or' && String(args[0]).startsWith('data_pagamento.gt.'));

  const resultado = (table: string, calls: Array<[string, unknown[]]>) => {
    if (table === 'fin_contas') return { data: state.conta, error: null };
    return { data: ehConsultaPosterior(calls) ? state.posteriores : state.anteriores, error: null };
  };

  const client = {
    from(table: string) {
      const calls: Array<[string, unknown[]]> = [];
      state.queries.push({ table, calls });
      const builder: Record<string, unknown> = {};
      for (const metodo of ['select', 'in', 'or', 'eq', 'limit']) {
        builder[metodo] = (...args: unknown[]) => { calls.push([metodo, args]); return builder; };
      }
      builder.maybeSingle = () => Promise.resolve(resultado(table, calls));
      builder.then = (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) =>
        Promise.resolve(resultado(table, calls)).then(ok, falha);
      return builder;
    },
    // `rpc` depende do `this` no cliente real; chamada solta quebra no navegador.
    async rpc(this: unknown, fn: string, args: Record<string, unknown>) {
      if (this !== client) throw new Error('rpc chamado sem this');
      state.rpcCalls.push({ fn, args });
      if (fn === 'get_fin_saldo_conta_em') return { data: state.saldoBase, error: null };
      if (fn === '_guarded_ajustar_saldo_inicial_conta') {
        if (state.updateError) return { data: null, error: state.updateError };
        // A RPC refaz as checagens de histórico sob lock antes de gravar.
        if (state.anteriores.length > 0) return { data: null, error: { message: 'LANCAMENTO_ANTERIOR' } };
        if (state.posteriores.length > 0) return { data: null, error: { message: 'LANCAMENTO_POSTERIOR' } };
        state.saldoBase = args.p_saldo_inicial as number;
        return { data: { status: 'adjusted', id: args.p_conta_id }, error: null };
      }
      return { data: null, error: { message: `rpc inesperada: ${fn}` } };
    },
  };

  const toast = { success: vi.fn(), error: vi.fn() };
  const emitDataEvent = vi.fn();
  return { state, client, toast, emitDataEvent };
});

vi.mock('@/permissions/hooks', () => ({
  useCan: (key: string) => mocks.state.can[key] ?? true,
}));
vi.mock('@/contexts/CompanyScopeContext', () => ({
  useSupabase: () => mocks.client,
  useCompanyScope: () => null,
}));
vi.mock('@/hooks/useScopedToast', () => ({
  useScopedToast: () => mocks.toast,
}));
vi.mock('@/lib/dataEvents', () => ({
  useEmitDataEvent: () => mocks.emitDataEvent,
}));

beforeEach(() => {
  mocks.state.can = {};
  mocks.state.saldoBase = 0;
  mocks.state.anteriores = [];
  mocks.state.posteriores = [];
  mocks.state.conta = null;
  mocks.state.updateError = null;
  mocks.state.rpcCalls = [];
  mocks.state.queries = [];
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
  mocks.emitDataEvent.mockClear();
});

describe('ConfirmarSaldoExtratoDialog', () => {
  const baseProps = {
    open: true,
    nomeArquivo: 'santander.ofx',
    periodoInicio: '2026-08-01',
    periodoFim: '2026-09-01',
    linhasExtrato: [
      { data: '2026-08-31', descricao: 'APLICACAO CONTAMAX', tipo: 'DESPESA', valor: 327.41 },
      { data: '2026-09-01', descricao: 'PIX RECEBIDO', tipo: 'RECEITA', valor: 130.91 },
    ],
    saldoSugerido: { valor: 130.91, data: '2026-09-01' },
    saldoContaCorrenteArquivo: { valor: 130.91, data: '2026-09-01' },
    contaId: '11111111-1111-4111-8111-111111111111',
    onCancel: vi.fn(),
    onConfirmed: vi.fn(),
  };

  it('orienta a confirmar o saldo Santander consolidado quando há ContaMax', () => {
    render(<ConfirmarSaldoExtratoDialog {...baseProps} internalMovementCount={2} />);

    expect(screen.getByRole('alert')).toHaveTextContent('2 movimentação(ões) interna(s) ContaMax detectada(s)');
    expect(screen.getByRole('alert')).toHaveTextContent('saldo total exibido pelo Santander');
    expect(screen.getByRole('alert')).toHaveTextContent('conta corrente + ContaMax');
    expect(screen.getByRole('alert')).toHaveTextContent('R$130,91 da conta corrente em 01/09/2026');
    expect(screen.getByRole('alert')).toHaveTextContent('esse valor não preenche o total consolidado');
    expect(screen.getByLabelText('Saldo consolidado nessa data')).toHaveValue('');
    expect(screen.getByLabelText('Data do saldo informado')).toHaveValue('2026-08-31');
  });

  it('não exibe o alerta quando o arquivo não contém ContaMax', () => {
    render(<ConfirmarSaldoExtratoDialog {...baseProps} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('confirma o saldo total na data escolhida sem incluir a linha posterior', () => {
    const onConfirmed = vi.fn();
    render(
      <ConfirmarSaldoExtratoDialog
        {...baseProps}
        internalMovementCount={2}
        onConfirmed={onConfirmed}
      />,
    );

    fireEvent.change(screen.getByLabelText('Saldo consolidado nessa data'), {
      target: { value: '23289,29' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar valor' }));

    expect(onConfirmed).toHaveBeenCalledWith({ valor: 23289.29, data: '2026-08-31' });
    expect(screen.queryByText('Saldo não confere')).not.toBeInTheDocument();
  });
});

describe('ConfirmarSaldoExtratoDialog — saldo inicial cadastrado com o saldo de hoje', () => {
  const contaId = '90c37aef-2206-432d-bf50-a2ea18b0cd21';
  // Caso real (Stone): conta criada em 05/10 com o saldo do dia, extrato de 01–02/10 só com saídas.
  const stoneProps = {
    open: true,
    nomeArquivo: 'extrato-stone.ofx',
    periodoInicio: '2026-10-01',
    periodoFim: '2026-10-02',
    linhasExtrato: [
      { data: '2026-10-01', descricao: 'NATAN - Transferência | Pix', tipo: 'DESPESA', valor: 17901.99 },
      { data: '2026-10-01', descricao: 'NATAN - Transferência | Pix', tipo: 'DESPESA', valor: 7298.01 },
      { data: '2026-10-02', descricao: 'Folha - Transferência | Pix', tipo: 'DESPESA', valor: 39800 },
    ],
    saldoSugerido: { valor: 299.47, data: '2026-10-02' },
    contaId,
    onCancel: vi.fn(),
  };
  const contaStone = {
    id: contaId,
    nome: 'STONE',
    tipo: 'corrente',
    banco: null,
    agencia: '',
    numero_conta: null,
    saldo_inicial: 299.47,
    updated_at: '2026-10-05T19:53:36.637085+00:00',
  };

  beforeEach(() => {
    mocks.state.saldoBase = 299.47;
    mocks.state.conta = contaStone;
  });

  const confirmarSaldoDoArquivo = () => {
    expect(screen.getByLabelText('Saldo final nessa data')).toHaveValue('299,47');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar valor' }));
  };

  it('explica a causa e ajusta o saldo inicial para o saldo da véspera, que passa a conferir', async () => {
    const onConfirmed = vi.fn();
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={onConfirmed} />);
    confirmarSaldoDoArquivo();

    const nota = await screen.findByRole('note', { name: 'O saldo inicial da conta não bate com este extrato' });
    expect(nota).toHaveTextContent('não tem lançamentos antes de 01/10/2026');
    expect(nota).toHaveTextContent('saldo do sistema em 30/09/2026 é o próprio saldo inicial cadastrado: R$299,47');
    expect(nota).toHaveTextContent('saldo do banco em 30/09/2026 era R$65.299,47');
    expect(nota).toHaveTextContent('Confira no app do banco o saldo de 30/09/2026 antes de ajustar.');
    expect(onConfirmed).not.toHaveBeenCalled();

    // A sugestão só nasce depois de confirmar que não há lançamento até a véspera
    // e de saber se há lançamento depois do período.
    const [consultaAnteriores, consultaPosteriores] = mocks.state.queries.filter(q => q.table === 'fin_lancamentos');
    expect(consultaAnteriores.calls).toEqual(expect.arrayContaining([
      ['in', ['status', ['REALIZADO', 'CONCILIADO']]],
      ['or', [`conta_id.eq.${contaId},conta_destino_id.eq.${contaId}`]],
      ['or', ['data_competencia.lte.2026-09-30,data_pagamento.lte.2026-09-30,conciliado_em.lt.2026-10-01T00:00:00-03:00']],
    ]));
    expect(consultaPosteriores.calls).toEqual(expect.arrayContaining([
      ['or', [`conta_id.eq.${contaId},conta_destino_id.eq.${contaId}`]],
      ['or', [
        'data_pagamento.gt.2026-10-02,'
        + 'and(data_pagamento.is.null,conciliado_em.gte.2026-10-03T00:00:00-03:00),'
        + 'and(data_pagamento.is.null,conciliado_em.is.null,data_competencia.gt.2026-10-02)',
      ]],
    ]));

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar saldo inicial para R$65.299,47' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({ valor: 299.47, data: '2026-10-02' }));
    expect(mocks.state.rpcCalls.find(c => c.fn === '_guarded_ajustar_saldo_inicial_conta')?.args).toEqual({
      p_conta_id: contaId,
      p_saldo_inicial: 65299.47,
      p_ate: '2026-09-30',
      p_periodo_fim: '2026-10-02',
      p_expected_updated_at: '2026-10-05T19:53:36.637085+00:00',
      p_contexto: { arquivo: 'extrato-stone.ofx', saldo_informado: 299.47, data_saldo: '2026-10-02' },
    });
    expect(mocks.emitDataEvent).toHaveBeenCalledWith('financeiro:contas');
    expect(mocks.toast.success).toHaveBeenCalledWith(
      'Saldo inicial ajustado para R$65.299,47. O saldo da conta fecha com o banco depois de processar as linhas deste extrato.',
    );
  });

  it('com lançamento depois do período, explica mas não oferece o ajuste de um clique', async () => {
    mocks.state.posteriores = [{ id: 'lanc-novembro' }];
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={vi.fn()} />);
    confirmarSaldoDoArquivo();

    const nota = await screen.findByRole('note', { name: 'O saldo inicial da conta não bate com este extrato' });
    expect(nota).toHaveTextContent('Esta conta já tem lançamentos depois de 02/10/2026');
    expect(nota).toHaveTextContent('corrija em Contas Bancárias só se for importar todo o período até esses lançamentos');
    expect(screen.queryByRole('button', { name: /Ajustar saldo inicial/ })).not.toBeInTheDocument();
  });

  it('servidor recusa porque chegou lançamento anterior no meio: avisa e reconfere, sem ajustar', async () => {
    const onConfirmed = vi.fn();
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={onConfirmed} />);
    confirmarSaldoDoArquivo();
    const botao = await screen.findByRole('button', { name: 'Ajustar saldo inicial para R$65.299,47' });

    // Outra aba importou um extrato de setembro enquanto esta tela estava aberta.
    mocks.state.anteriores = [{ id: 'lanc-setembro' }];
    fireEvent.click(botao);

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(
      'A conta recebeu lançamentos até 30/09/2026 enquanto você conferia. Confira o saldo de novo.',
    ));
    expect(mocks.state.saldoBase).toBe(299.47);
    // Reconferência: o lançamento novo derruba a sugestão e volta a divergência genérica.
    expect(await screen.findByText(/pode haver lançamento\(s\) incorreto\(s\)/)).toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(mocks.emitDataEvent).not.toHaveBeenCalled();
  });

  it('servidor recusa porque chegou lançamento posterior no meio: avisa e não ajusta', async () => {
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={vi.fn()} />);
    confirmarSaldoDoArquivo();
    const botao = await screen.findByRole('button', { name: 'Ajustar saldo inicial para R$65.299,47' });

    mocks.state.posteriores = [{ id: 'lanc-outubro' }];
    fireEvent.click(botao);

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(
      'A conta recebeu lançamentos depois de 02/10/2026 enquanto você conferia. Confira o saldo de novo.',
    ));
    expect(mocks.state.saldoBase).toBe(299.47);
    // Reconferência mostra a explicação, agora sem o botão.
    expect(await screen.findByText(/Esta conta já tem lançamentos depois de 02\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajustar saldo inicial/ })).not.toBeInTheDocument();
  });

  it('sem leitura de lançamentos, não sugere — lista vazia pela RLS não prova conta sem histórico', async () => {
    mocks.state.can = { 'financeiro:lancamentos:view': false };
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={vi.fn()} />);
    confirmarSaldoDoArquivo();

    expect(await screen.findByText(/pode haver lançamento\(s\) incorreto\(s\)/)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(mocks.state.queries.some(q => q.table === 'fin_lancamentos')).toBe(false);
  });

  it('não monta o filtro do PostgREST com identificador fora do formato', async () => {
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} contaId="x,id.neq.0" onConfirmed={vi.fn()} />);
    confirmarSaldoDoArquivo();

    expect(await screen.findByText(/pode haver lançamento\(s\) incorreto\(s\)/)).toBeInTheDocument();
    expect(mocks.state.queries).toHaveLength(0);
  });

  it('erro de permissão do servidor vira texto fixo, sem a mensagem crua', async () => {
    mocks.state.updateError = { message: 'PERMISSION_DENIED: financeiro:contas:edit' };
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={vi.fn()} />);
    confirmarSaldoDoArquivo();

    fireEvent.click(await screen.findByRole('button', { name: 'Ajustar saldo inicial para R$65.299,47' }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(
      'Você não tem permissão para editar contas bancárias nesta unidade.',
    ));
  });

  it('com lançamento antes do período, mantém a divergência genérica — o saldo inicial não é a única explicação', async () => {
    mocks.state.anteriores = [{ id: 'lanc-anterior' }];
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={vi.fn()} />);
    confirmarSaldoDoArquivo();

    expect(await screen.findByText(/pode haver lançamento\(s\) incorreto\(s\) ou faltando antes de 01\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajustar saldo inicial/ })).not.toBeInTheDocument();
    expect(mocks.state.queries.some(q => q.table === 'fin_contas')).toBe(false);
  });

  it('não sugere quando o saldo da véspera já difere do saldo inicial (há lançamento que o filtro não pegou)', async () => {
    mocks.state.saldoBase = 150;
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={vi.fn()} />);
    confirmarSaldoDoArquivo();

    expect(await screen.findByText(/pode haver lançamento\(s\) incorreto\(s\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajustar saldo inicial/ })).not.toBeInTheDocument();
  });

  it('sem permissão para editar contas, explica a causa sem oferecer o ajuste', async () => {
    mocks.state.can = { 'financeiro:contas:edit': false };
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={vi.fn()} />);
    confirmarSaldoDoArquivo();

    const nota = await screen.findByRole('note', { name: 'O saldo inicial da conta não bate com este extrato' });
    expect(nota).toHaveTextContent('Peça a quem pode editar contas bancárias para ajustar o saldo inicial.');
    expect(screen.queryByRole('button', { name: /Ajustar saldo inicial/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar mesmo assim' })).toBeInTheDocument();
  });

  it('conta alterada por outra pessoa: avisa e não confirma o saldo', async () => {
    mocks.state.updateError = { message: 'OPTIMISTIC_LOCK_CONFLICT' };
    const onConfirmed = vi.fn();
    render(<ConfirmarSaldoExtratoDialog {...stoneProps} onConfirmed={onConfirmed} />);
    confirmarSaldoDoArquivo();

    fireEvent.click(await screen.findByRole('button', { name: 'Ajustar saldo inicial para R$65.299,47' }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(
      'A conta foi alterada por outra pessoa. Cancele e importe o extrato de novo.',
    ));
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(mocks.emitDataEvent).not.toHaveBeenCalled();
    expect(screen.getByText('Saldo não confere')).toBeInTheDocument();
  });
});
