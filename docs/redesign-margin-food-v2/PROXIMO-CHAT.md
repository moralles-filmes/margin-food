Continue o Redesign Visual V2 do MARGIN FOOD (sistema EMPRESARIAL de gestão
para restaurantes), repositório moralles-filmes/margin-food.
Execute exclusivamente a FASE 04B — Conciliação Bancária (sub-aba
"Conciliação Bancária" de Lançamentos). Somente apresentação. Não mexa de
novo em Contas Bancárias, Livro Razão, Fluxo de Caixa ou Projeção (Fase 04A
concluída) e não inicie a Fase 05A.

ESTADO REAL DEIXADO PELA FASE 04A (2026-10-04)
- Branch feat/redesign-v2-f04a, criada de feat/redesign-v2-f03 em
  197dea7. Fase 04A commitada em a170be6 (código) e 44b8449
  (documentação), mais um commit de documentação com estes SHAs. Sem push,
  PR ou merge. main intocada (c6a9774).
- Fase 04A validada com ressalvas: bun run test = 187 arquivos / 1.821
  testes; tsc --noEmit -p tsconfig.app.json = 0 erros; bun run lint = 0
  erros e 2.016 avisos; bun run build ok (vendor-charts 555,44 kB;
  FinanceiroView 247,25 kB; index 204,80 kB; Index 41,12 kB; CSS 121,66 kB).
- Entregue na 04A: Contas (total azul de todas as ativas + contas brancas,
  "Saldo na referência"), Livro Razão (totais rotulados pelo contrato das
  RPCs, tabela/lista por container query), Fluxo de Caixa e Projeção;
  kpiGridClassFor em src/components/ui/kpiGrid.ts (2/3/4 colunas);
  primitivas FinScreenHeader/FinSectionGroup/FinKpiGrid/FinNote em
  src/components/financeiro/finV2Layout.tsx; SegmentedControl com ariaLabel
  e manualActivation. O alternador Livro Razão/Conciliação já usa
  SegmentedControl com ativação manual (D39) — a Conciliação em si não foi
  tocada.
- Ressalvas da 04A (não bloqueiam a 04B): exportação, diálogos destrutivos
  e sem acesso só em teste/diff; leitor de tela e movimento normal não
  observados; larguras pequenas em iframe; foco não volta à linha ao fechar
  o detalhe do Livro Razão.

ANTES DE EDITAR
1. Confirme diretório, branch, SHA e git status. PERGUNTE ao proprietário se
   a 04B segue em nova branch a partir da atual (ex.: feat/redesign-v2-f04b)
   ou na mesma, com commit separado por fase, e se haverá commit ao final.
   Não reverta nem sobrescreva o que existir. Sem push, merge ou deploy sem
   pedido dele.
2. Leia, nesta ordem:
   - CLAUDE.md (AGENTS.md é idêntico). ATENÇÃO às regras da Conciliação:
     FITID instável, dedup por conteúdo com espaços colapsados, ocorrência
     (p_occurrence_index), transferência como um único lançamento,
     ContaMax, "Processar" abre revisão antes de baixar, banner de
     conferência de saldo como rede final. Nada disso pode mudar.
   - docs/redesign-margin-food-v2/PROMPT-MESTRE.md
   - docs/redesign-margin-food-v2/PROGRESSO.md
   - docs/redesign-margin-food-v2/DECISOES.md (D15–D19, D22–D30, D31–D44;
     em especial D37–D44 da 04A)
   - docs/redesign-margin-food-v2/handoffs/04A-HANDOFF.md
   - docs/redesign-margin-food-v2/fases/04A-RELATORIO.md
   - docs/redesign-margin-food-v2/MATRIZ-DE-COBERTURA.md, somente as linhas
     FIN-A-016 a FIN-A-035 (Conciliação)
   - docs/redesign-margin-food-v2/PENDENCIAS-FUNCIONAIS.md, só as linhas
     que citam Conciliação (ex.: PF-014, PF-084); não corrigir
   - docs/redesign-margin-food-v2/prompts/04-contas-bancarias-e-movimentacao-financeira.md
     (aplicar só à parte de conciliação e importação)
3. Abra 00-card-azul-aprovado.png, 02-contas-bancarias.png (bloco "Saldo
   na referência") e 07-sidebar-e-componentes.png em
   docs/redesign-margin-food-v2/referencias/ (consulte o MANIFESTO.md). Não
   há prancha própria da Conciliação: siga a família já aplicada na 04A.
4. Inspecione o código real antes de propor mudanças:
   src/components/financeiro/ConciliacaoBancariaSection.tsx (~3.700
   linhas), CriarLancamentoExtratoDialog, ConfirmarSaldoExtratoDialog e os
   demais diálogos que ela abre; leia sem alterar src/lib/extratoParser.ts,
   conciliacaoConciliados.ts, conciliacaoOcorrencia.ts,
   conciliacaoTransferMatch.ts e conciliacaoSaldoExtrato.ts. Como exemplo do
   padrão aplicado: LivroRazaoSection.tsx, ContasBancariasSection.tsx,
   finV2Layout.tsx, kpiGrid.ts.

CUIDADO COM ESCRITA AUTOMÁTICA (lido no código na 04A)
- Só CARREGAR um extrato já grava no banco: processarLinhas chama
  reconcile_neutralize_contamax (linha ~1291) e
  reconcile_auto_bind_transfer_counterparts (linha ~1298) antes de qualquer
  clique de confirmação. Portanto NÃO carregue arquivo em unidade real.
  Para validar a visão Importar: unidade de teste autorizada pelo
  proprietário + arquivo OFX/CSV SINTÉTICO com valores fictícios + fetch
  interceptado na aba bloqueando (resposta simulada) TODA chamada de
  escrita (reconcile_*, unreconcile_*, _guarded_*, create/delete). Registre
  no relatório a lista de POSTs vistos e confirme que nenhum de escrita
  chegou ao servidor.
- Nunca clicar Processar, Conciliar, Conciliar Todos, Baixar, Criar,
  Vincular, Ignorar, Reconsiderar, Desconciliar, Excluir, Marcar como
  Transferência nem confirmar diálogo. Diálogos: abrir e fechar com Esc ou
  Cancelar. Na dúvida se uma ação grava, não clique.

NAVEGADOR
- Há um Vite do projeto normalmente em http://127.0.0.1:8080. Se subir
  outro, leia a porta no log e pare o seu ao terminar.
- Na 04A o Chrome estava no login "Administrador Principal"; a unidade de
  teste é a Moralles (sem conta ativa) e o proprietário autorizou, SÓ para
  a 04A, ler a unidade real Ren Sushi. Nada disso vale automaticamente
  para a 04B: pergunte de novo, prefira empresa e usuário de teste e nunca
  digite senha. Download e abertura de PDF/Excel só com autorização.
- Atenção (D09): valores das imagens de referência COINCIDEM com dados
  reais de uma unidade (visto na 04A). Nada de número da imagem no código,
  nos testes ou na documentação; valores de unidade real não vão para o
  repositório.
- Capture o "antes" (claro, escuro, desktop e celular) da Conciliação
  ANTES de alterar qualquer arquivo, com a mesma unidade/conta/arquivo que
  usará no "depois". Capturas ficam na pasta temporária, nunca no repo.
- A janela do Chrome não fica menor que 500 px: use iframe da própria
  página para 320/390 px (4 px a mais por causa da borda). Casos extremos
  (muitas linhas, descrição longa, valores de milhões, duplicata,
  transferência, ContaMax, saldo que não confere) por fixture no cliente.
- O navegador costuma estar com prefers-reduced-motion ativo. O texto de
  cada opção do SegmentedControl aparece duplicado no DOM (cópia invisível
  em negrito, D29): ao localizar por texto use includes, não igualdade.
- Sem navegador ou login, a fase termina como "implementada, aguardando
  validação" e o próximo prompt é de validação da 04B.

DECISÕES VIGENTES (não reverter sem registrar)
- D15–D17: KpiCard appearance default | summary | highlight; no highlight
  tudo é branco e o negativo se identifica pelo sinal (D16); estado
  crítico usa summary + variant semântica.
- D19/D31/D38: valor nunca diminui para caber; a grade reorganiza
  (kpiGridClassFor em src/components/ui/kpiGrid.ts).
- D29/D39: SegmentedControl com visual aprovado; alternância que desmonta
  conteúdo com estado não salvo usa manualActivation.
- D33/D41: período e data sempre junto do valor; rótulos descrevem os
  números exibidos (parâmetros da resposta, não o filtro recém-trocado).
- D40: FinScreenHeader, FinSectionGroup, FinKpiGrid e FinNote para
  cabeçalho, grupos e notas. D41: tabela larga vira lista empilhada por
  container query, sem rolagem horizontal da página.
- D44: vocabulário de conferência "Confere"/"Pendente"; extrato × sistema
  só na mesma data, comparação em centavos.
- D08, D09, D13. Gradiente só no card de destaque e no item ativo da
  sidebar. Nenhum hex em componente; nenhum dark: avulso; sem opacidade
  para hierarquia semântica.

ESCOPO DA FASE 04B (FIN-A-016 a FIN-A-035)
1. Cabeçalho, seletor de conta e alternador "Importar Extrato" /
   "Lançamentos" no padrão da 04A.
2. Visão Importar: upload e vazio; banner de conferência de saldo
   (confere / não confere, com o dia da divergência) — preserve a
   semântica, só a apresentação muda; avisos (extrato anterior ausente,
   ContaMax aguardando); tabela de linhas do extrato com chips de filtro,
   legível no celular.
3. Visão Lançamentos (conciliar/desconciliar): tabela, contagem de
   pendentes, estados ("Carregando", vazio, "Selecione uma conta").
4. Diálogos FIN-A-023 a 035 (sugestões, confirmar baixa, vincular boleto,
   já está no Livro Razão, possíveis duplicadas, rateio, transferência,
   criar registro, conta diverge, linhas não processadas, confirmar saldo
   do extrato em 2 passos, edição): só visual, mesmos textos de decisão e
   mesma ordem de confirmação.
5. Desktop/celular, claro/escuro, teclado, foco ao fechar diálogos.

FORA DE ESCOPO
Parser, matching, dedup, FITID, ocorrência, idempotência, payloads, ordem
das chamadas, chaves de sessionStorage, RPC, migration, RLS, permissão,
cálculo de saldo, importadores; textos que mudem o sentido de avisos de
duplicata/divergência; fundir ou separar botões de ação; Contas, Livro
Razão, Fluxo, Projeção e Dashboard (fases concluídas); Fases 05–07;
os quatro src/lib/presentation*Export.ts; corrigir PF-*. Se extrair
componentes de apresentação do arquivo grande, só JSX recebendo props —
sem mover estado, efeitos ou handlers.

VALIDAÇÃO OBRIGATÓRIA
- bun run test, node node_modules/typescript/bin/tsc --noEmit -p
  tsconfig.app.json, bun run lint, bun run build — comparar com os números
  acima e explicar qualquer diferença. Se um teste travar, procure mock de
  cliente instável (objeto novo a cada render recria callbacks e o efeito
  de carga roda sem parar — aconteceu na 04A).
- Em navegador (com a proteção de escrita acima): mesma unidade/conta/
  arquivo antes e depois; contagens de linhas, totais e banner idênticos;
  chips de filtro; seletor de conta; alternador; estados de loading/erro
  (simulado só no cliente)/vazio; todos os diálogos abertos e fechados sem
  confirmar; banner verde e vermelho; claro e escuro; 320, 390, 768, 1024,
  1366 e 1920 px; sidebar expandida, recolhida e redimensionada; teclado.
- Medir contraste nos dois temas sobre o fundo real (banner, chips,
  badges, linhas destacadas).
- Auditoria de módulo (saas-audit-br:module --audit-only) com foco em
  processo de negócio (duplicata, ordem de confirmação, estados que
  escondem linha pendente). Não tratar leitura de código como teste.
  Registrar o que não foi executado.

PENDÊNCIAS CONHECIDAS
- PENDENCIAS-FUNCIONAIS.md: PF-001 a PF-085. Da Conciliação: PF-014
  (botões sem gate no render); PF-084 (sub-aba visível sem permissão).
  PF-078 a PF-083 e PF-085 são das telas da 04A. Não corrigir nesta fase.
- Observações da 04A: foco não volta à linha ao fechar o ContaDetailDialog
  (Fase 05); texto do Select cortado a 320 px; PF-072 (503 nas contagens
  HEAD do menu) continua.
- A tela de login registra dois erros de console de consultas antes da
  autenticação (permission denied for table produtos). Preexistente.
- O catálogo de desenvolvimento fica em /__catalogo (só com bun run dev).

ENTREGA AO FINAL
1. Atualizar PROGRESSO.md, DECISOES.md e as linhas FIN-A-016 a 035 na
   MATRIZ-DE-COBERTURA.md com estado e evidência reais.
2. Gravar fases/04B-RELATORIO.md e handoffs/04B-HANDOFF.md.
3. Reescrever PROXIMO-CHAT.md e MOSTRAR na resposta o prompt completo:
   Fase 05A (Contas a Pagar, Contas a Receber, Códigos de Pagamento,
   Recorrências, Alertas) se os gates passaram com navegador;
   validação/correção da 04B caso contrário.
4. PARAR. Não iniciar a Fase 05A no mesmo chat.
