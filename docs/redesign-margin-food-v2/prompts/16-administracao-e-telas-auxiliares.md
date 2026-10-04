# PROMPT — FASE 16 • Usuários, Configurações, Administração e auxiliares

Você está no repositório `moralles-filmes/margin-food`, executando o Redesign Visual V2. Leia `docs/redesign-margin-food-v2/PROMPT-MESTRE.md` e cumpra seus contratos. Execute SOMENTE esta fase.

## Entrada e limite de escopo

Confirme repo/branch/SHA/status; leia progresso, decisões, trecho da matriz, último handoff e relatório de pré-requisitos. Se uma fase anterior necessária estiver bloqueada, não avance ocultando o bloqueio. Não assuma que este documento registra trabalho executado: ele é uma instrução.

Concluir a propagação do padrão às áreas administrativas e telas auxiliares, incluindo as superfícies que não aparecem na navegação principal.

## Leitura dirigida

Leia ConfiguracoesView, AdminUsersView, AdminPanel, PermissionMatrix, GlobalAuditView/AuditView, PerformanceMonitorView se presentes, Login, ResetPassword, NotFound, notificações, calculadora e PWA/tema, além de cada subaba encontrada na matriz. Nomes são pontos de partida a confirmar.

## Referências visuais

Os arquivos ficam em `docs/redesign-margin-food-v2/referencias/`. Consulte o manifesto. `00-sidebar-aprovada.png`, `07-sidebar-e-componentes.png` e identidade geral das telas aprovadas.

## Implementação / entregáveis

1. Padronize tabelas de usuários, perfis, empresas e configurações existentes, com busca, filtros, status, ações e formulários consistentes.
2. Faça a matriz de permissões legível por módulo/ação; mantenha estados e grupos reais, com scroll localizado em matrizes grandes. Não criar permissão ou agrupar ações alterando efeito.
3. Revise painéis administrativos, auditoria global e monitoramento sem expor dados privados a perfis comuns.
4. Harmonize login, recuperação de senha, acesso negado e página não encontrada, respeitando layout/contexto distintos das telas autenticadas.
5. Revise sino de notificações, popovers, calculadora flutuante se existente, indicação offline e atualização PWA. Preserve eventos e ações originais; não mudar política de cache/deploy.
6. Mantenha toggle de tema, menus de conta, validações de senha, máscaras e proteção de formulário sujo.
7. Faça nova conferência da matriz para encontrar qualquer módulo/tela ainda sem fase; atribua subfase explícita e implemente antes do fechamento.
8. Documente áreas que necessitam de ambiente/perfil específicos para validação; não habilite conta administrativa artificialmente.

## Invariantes específicos

Sem mudanças de RBAC, criação de papel, redefinição real de senha, exclusão de usuário, escopo global, configuração de integrações ou atualização do service worker por conveniência estética. Não publicar credenciais em screenshots. Não remover controles da administração para imitar uma sidebar limpa.

Continuam obrigatórios: sem alteração de domínio/RPC/RLS/segredos/dependências/produção; sem remover funcionalidade; mocks apenas isolados; sem overwrite do trabalho alheio; conservar ações, filtros, estados, permissões e isolamento da empresa. Se a fase demandar ajuste funcional fora desses limites, registrar e pedir decisão, não executar silenciosamente.

## Validação específica

Testar usuário restrito/admin autorizado em ambiente isolado, formulário inválido, senhas sem expor valor, confirmação, envio de recuperação apenas simulado/autorizado, page not found, tema, popovers nas bordas e notificações. Conferir matriz de permissões antes/depois e ausência de ações novas. Validar fallback de offline/PWA conforme capacidades reais, com limitações documentadas.

Além disso, executar os gates pertinentes do mestre. Evidência real deve indicar ambiente, perfil, tema, viewport e dados controlados. Testes não executados ficam explicitamente pendentes. Não afirmar conformidade integral ou ausência de bugs sem base.

## Saída obrigatória e parada

Atualize a matriz e `PROGRESSO.md`; registre `fases/16-RELATORIO.md`, arquivos reais, diff, testes, evidências e limitações. Use o template de handoff, grave um arquivo numerado em `handoffs/` e atualize `PROXIMO-CHAT.md`.

Ao passar nos gates, prepare a Fase 17. O prompt da próxima etapa precisa conter decisões e estado reais desta execução, não apenas este texto genérico. Se houver falha impeditiva, escreva prompt de retomada/correção da Fase 16.

Mostre o prompt de continuidade completo na resposta e PARE. Não execute outra fase no mesmo chat.
