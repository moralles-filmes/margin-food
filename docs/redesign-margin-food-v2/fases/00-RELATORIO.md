# Relatório — Fase 00 • Auditoria, cobertura e baseline

## Identificação

- Fase: 00. Data: 2026-10-03.
- Repositório `moralles-filmes/margin-food`, diretório `C:\Users\Yuri\Documents\Desenvolvedor\margin.food`.
- Branch `main`, SHA base `c6a9774f8fe42b15ae2bcae6eea3e344f8e090d2`. Nenhum commit feito; SHA final igual ao base.
- `git status` no início e no fim: somente `?? docs/redesign-margin-food-v2/` (pasta do pacote, não versionada). Nenhuma alteração anterior a preservar.
- Ambiente: Windows 11, Bun, Node; sem navegador disponível para automação (ver B1).

## Escopo entregue e preservado

Entregue: inventário de 408 linhas (21 de estrutura global + 387 de módulos), inventário de indicadores e gráficos, contrato dos oito cards do Dashboard Financeiro, observações visuais por módulo, proposta visual, decisões D01–D14, 71 suspeitas funcionais registradas, plano com subfases e baseline técnico.

Preservado: nenhum arquivo de `src/`, `supabase/`, configuração ou dependência foi alterado. Os prompts originais em `prompts/` e os templates em `templates/` estão intactos. `docs/redesign/` não foi tocado.

## Arquivos reais

Criados em `docs/redesign-margin-food-v2/`:

- `MATRIZ-DE-COBERTURA.md`
- `DECISOES.md`
- `PENDENCIAS-FUNCIONAIS.md`
- `PROGRESSO.md`
- `PROXIMO-CHAT.md`
- `fases/00-RELATORIO.md` (este arquivo)
- `fases/00-INVENTARIO-INDICADORES-E-GRAFICOS.md`
- `fases/00-OBSERVACOES-POR-MODULO.md`
- `fases/00-PROPOSTA-VISUAL.md`
- `handoffs/00-HANDOFF.md`

Alterado: `PLANO-DE-FASES.md` (estado da Fase 00 e subfases).

Fora do versionamento: `.ai-router/TASKS/RDV2-F00.json` (pasta ignorada pelo git) e `dist/` (gerada pelo build, ignorada).

Consultados diretamente: `CLAUDE.md`, `package.json`, `tsconfig.json`, `src/App.tsx`, `src/pages/Index.tsx`, `src/components/AppLayout.tsx`, `CompanySelector.tsx`, `FinanceiroView.tsx`, `ui/KpiCard.tsx`, `ui/ChartCard.tsx`, `ui/card.tsx`, `src/lib/chartTheme.ts`, `src/lib/companySelection.ts`, `src/index.css`, `src/contexts/CompanyScopeProvider.tsx`, `src/hooks/useTheme.ts`, `src/permissions/registry.ts` (estrutura), `docs/redesign/01-DESIGN-SYSTEM.md` (trechos). `AGENTS.md` é mantido idêntico a `CLAUDE.md` por regra do projeto; a igualdade não foi conferida nesta fase.

Os inventários por módulo foram levantados por cinco agentes de leitura em paralelo e conferidos por amostragem contra o código (fórmula das provisionadas, grade do dashboard, entradas de Salmão, `SelectItem` do RH, gate de `AnaliseItemView`, arquivo sem consumidor). Leitura parcial declarada pelos agentes está listada em `00-OBSERVACOES-POR-MODULO.md`.

## Validação

| Verificação | Comando / cenário | Resultado real | Evidência | Limitação |
|---|---|---|---|---|
| Testes | `bun run test` (vitest run) | 172 arquivos, 1.687 testes, todos passando, 46,5 s | Saída do comando nesta sessão | Aviso de source map do TypeScript, sem falha |
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` | 0 erros | Saída vazia, exit 0 | `tsconfig.json` raiz só referencia `app` e `node`; `tsconfig.node.json` não foi verificado; `strictNullChecks` e `noImplicitAny` estão desligados |
| Lint | `bun run lint` | 0 erros, 2.016 avisos | Saída do comando | Avisos preexistentes (maioria `no-explicit-any`) |
| Build | `bun run build` | Concluído em 8,84 s | Saída do comando | Aviso de chunk acima de 500 kB (preexistente) |
| Bundle | Tamanhos do build | `vendor-excel` 929,9 kB; `vendor-charts` 555,4 kB; `jspdf` 430,1 kB; `pptxgen` 368,5 kB; `EstoqueGeralView` 264,3 kB; `ApresentacaoSociosSection` 260,4 kB; `FinanceiroView` 221,9 kB; `vendor-radix` 221,7 kB; `index` 204,7 kB; `dist` 9,4 MB | Saída do build | Tamanhos sem gzip |
| Cruzamento registry × telas | 114 subtabs do registry procuradas nos inventários | Todas com linha na matriz; exceções documentadas na matriz | Script de conferência nesta sessão | Conferência por nome, não por execução |
| Dívida de tokens | Varredura em `src/components` e `src/pages` | 0 arquivos `.tsx` com hex literal de 6 dígitos; 2 arquivos com `dark:` | grep | `EtiquetaModal` tem hex no HTML de impressão (apontado pelo inventário) |
| Servidor local | `bun run dev` | Subiu em `http://127.0.0.1:8080` | Log do Vite | Encerrado em seguida |
| Navegador (claro/escuro, viewports, rede) | Extensão do Chrome | **Não executado** | Erro "Browser extension is not connected" | Bloqueio B1 |
| Perfis de teste | — | **Não levantado** | — | Sem login disponível; bloqueio B1 |

## Diagnóstico resumido

Por leitura de código (a confirmar em navegador):

1. O sistema de tokens está limpo: sem hex em componente, tema escuro completo, gráficos já no tema central. A V2 parte de uma base consistente.
2. A inconsistência está acima dos tokens: `KpiCard` existe mas boa parte das telas monta cards à mão; `ChartCard` não tem nenhum consumidor; convivem quatro padrões de sub-navegação e cinco ou seis desenhos de "sem permissão"; várias telas devolvem tela em branco sem permissão.
3. Opacidade como hierarquia e texto de 8–10 px são recorrentes em Salmão, Relatórios, Compras e Apresentação Sócios.
4. Mobile de verdade só existe na Movimentação Operacional, na contagem por código e em Códigos de Pagamento.
5. O dashboard financeiro tem os oito cards e os três gráficos; faltam agrupamento, destaque, indicação da janela dos gráficos e tratamento de erro distinto de zero.

## Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | Pintar de azul todos os `variant="primary"` (14 arquivos) | Propriedade `appearance` separada (D01) |
| R2 | Mexer no fluxo de troca de unidade ao redesenhar o seletor | Só aparência; `setActiveCompany` e `CompanyScopeProvider` intactos; testar A → B → A, falha e formulário sujo |
| R3 | Erro da RPC do dashboard aparece como R$ 0,00 | É preexistente (PF registrada). A V2 pode dar um estado de erro visual sem mudar dados; decidir na Fase 03 |
| R4 | Fase validada sem navegador | D13: sem navegador a fase não é marcada validada |
| R5 | Arquivos muito grandes (Conciliação ~3.700 linhas, Apresentação) | Subfases 04B e 06B |
| R6 | Mudança global de raio/altura quebrar telas densas | Raio por classe própria (D10) |
| R7 | Mockups com dados e elementos sem fonte | D09 e tabela de divergências em `00-PROPOSTA-VISUAL.md` |
| R8 | Regra antiga "sem gradiente" contradiz o card azul | D03: exceção nomeada |
| R9 | Screenshots com dados reais da empresa | Usar empresa/perfil de teste; evidência saneada; nada de valores reais nos relatórios |
| R10 | Sessões paralelas no mesmo checkout | Trabalhar em branch própria por fase; conferir `git status` no início |

## Bloqueios e acessos que faltam para QA

**B1 — Sem navegador.** A extensão Claude in Chrome não estava conectada e o projeto não tem Playwright/Puppeteer instalado. Por isso não há screenshot de antes, nem medição de rede, nem conferência de tema e viewport. Nada foi contornado.

Para destravar, antes da Fase 01:

1. Abrir o Chrome com a extensão Claude conectada à mesma conta.
2. Rodar `bun run dev` e abrir `http://127.0.0.1:8080`.
3. O próprio proprietário faz o login, com um usuário de teste em uma empresa de teste (o assistente não digita senhas em serviço hospedado). Ideal: um perfil admin e um perfil restrito (ex.: operador), e um usuário com acesso a duas ou mais lojas para testar o seletor.
4. Informar no chat qual empresa e perfil estão em uso.

Sem isso, a Fase 01 pode ser implementada, mas termina como "implementada, aguardando validação".

## Pendências e regressões

- Introduzidas: nenhuma (nenhum código alterado).
- Preexistentes: 71 suspeitas em `PENDENCIAS-FUNCIONAIS.md`, nenhuma reproduzida.
- Decisão aberta: D07 (usuário no rodapé da sidebar; seletor repetido no cabeçalho).

## Rollback seletivo

A fase só criou documentação dentro de `docs/redesign-margin-food-v2/`. Reverter = apagar os arquivos listados em "Arquivos reais" e restaurar `PLANO-DE-FASES.md` do pacote original.

## Decisão de avanço

Fase 00 **concluída com ressalva**: inventário, diagnóstico, riscos, proposta, matriz e plano entregues; baseline técnico executado; baseline em navegador bloqueado e documentado (B1). Próxima: Fase 01, que começa capturando o "antes" em navegador se B1 estiver resolvido.
