-- Backfill único da padronização de maiúsculas/minúsculas (Grupo 1).
--
-- Rodar na MESMA sessão, logo depois de padronizar_texto.sql (que cria as
-- funções pg_temp e confere os casos). Sem `set padronizacao.aplicar = 'sim';`
-- é simulação: os UPDATEs rodam com todos os triggers e o bloco aborta no fim
-- (rollback), devolvendo as contagens na mensagem de erro.
--
-- Fora daqui de propósito: texto do extrato bancário (origem 'conciliacao'),
-- transferências, observações e os cadastros do Grupo 2 (nome copiado como
-- texto em outras tabelas). O texto antigo fica em audit_logs.

do $backfill$
declare
  c_placeholder constant uuid := '00000000-0000-0000-0000-000000000001';
  v_cp int;
  v_cr int;
  v_lancamentos int;
  v_centros int;
  v_produtos int;
  v_fichas int;
  v_pedidos int;
  v_cotacoes int;
  v_colaboradores int;
  v_resumo text;
begin
  update public.fin_contas_pagar t
     set descricao = pg_temp.padronizar_texto(t.descricao)
   where t.company_id is distinct from c_placeholder
     and t.descricao is distinct from pg_temp.padronizar_texto(t.descricao);
  get diagnostics v_cp = row_count;

  update public.fin_contas_receber t
     set descricao = pg_temp.padronizar_texto(t.descricao)
   where t.company_id is distinct from c_placeholder
     and t.descricao is distinct from pg_temp.padronizar_texto(t.descricao);
  get diagnostics v_cr = row_count;

  -- Lançamento digitado e espelho de título; o espelho copia a descrição do
  -- título, então os dois continuam iguais depois do backfill.
  update public.fin_lancamentos t
     set descricao = pg_temp.padronizar_texto(t.descricao)
   where t.company_id is distinct from c_placeholder
     and t.origem in ('manual', 'espelho_cp', 'espelho_cr')
     and t.tipo <> 'TRANSFERENCIA'
     and t.descricao is distinct from pg_temp.padronizar_texto(t.descricao);
  get diagnostics v_lancamentos = row_count;

  update public.fin_centros_custo t
     set nome = pg_temp.padronizar_texto(t.nome)
   where t.company_id is distinct from c_placeholder
     and t.nome is distinct from pg_temp.padronizar_texto(t.nome);
  get diagnostics v_centros = row_count;

  update public.produtos t
     set nome_produto = pg_temp.padronizar_texto(t.nome_produto)
   where t.company_id is distinct from c_placeholder
     and t.nome_produto is distinct from pg_temp.padronizar_texto(t.nome_produto);
  get diagnostics v_produtos = row_count;

  update public.ficha_componentes t
     set nome = pg_temp.padronizar_texto(t.nome),
         categoria = pg_temp.padronizar_texto(t.categoria)
   where t.company_id is distinct from c_placeholder
     and (t.nome is distinct from pg_temp.padronizar_texto(t.nome)
       or t.categoria is distinct from pg_temp.padronizar_texto(t.categoria));
  get diagnostics v_fichas = row_count;

  update public.purchase_orders t
     set title = pg_temp.padronizar_texto(t.title)
   where t.company_id is distinct from c_placeholder
     and t.title is distinct from pg_temp.padronizar_texto(t.title);
  get diagnostics v_pedidos = row_count;

  update public.cotacoes t
     set titulo = pg_temp.padronizar_texto(t.titulo)
   where t.company_id is distinct from c_placeholder
     and t.titulo is distinct from pg_temp.padronizar_texto(t.titulo);
  get diagnostics v_cotacoes = row_count;

  update public.rh_colaboradores t
     set nome = pg_temp.padronizar_texto(t.nome),
         cargo = pg_temp.padronizar_texto(t.cargo),
         funcao = pg_temp.padronizar_texto(t.funcao)
   where t.company_id is distinct from c_placeholder
     and (t.nome is distinct from pg_temp.padronizar_texto(t.nome)
       or t.cargo is distinct from pg_temp.padronizar_texto(t.cargo)
       or t.funcao is distinct from pg_temp.padronizar_texto(t.funcao));
  get diagnostics v_colaboradores = row_count;

  v_resumo := format(
    'contas_pagar=%s contas_receber=%s lancamentos=%s centros_custo=%s produtos=%s fichas=%s pedidos=%s cotacoes=%s colaboradores=%s',
    v_cp, v_cr, v_lancamentos, v_centros, v_produtos, v_fichas, v_pedidos, v_cotacoes, v_colaboradores
  );

  if coalesce(current_setting('padronizacao.aplicar', true), '') <> 'sim' then
    raise exception 'SIMULACAO (nada gravado): %', v_resumo;
  end if;
  raise notice 'APLICADO: %', v_resumo;
end $backfill$;
