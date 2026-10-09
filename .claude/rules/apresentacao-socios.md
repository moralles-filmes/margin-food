---
paths:
  - "src/components/financeiro/Presentation*"
  - "src/components/financeiro/ApresentacaoSociosSection*"
  - "src/components/financeiro/LegacyPresentationRedirect*"
  - "src/domain/financeiro/presentation/**"
  - "src/lib/presentation*"
---

# Apresentação Sócios — ao tocar a apresentação, sessões, decisões ou exportações

Antes de alterar, leia `docs/modules/apresentacao-socios.md` e, para os números, `docs/modules/financeiro.md` ("Relatórios" e "Fechamento de Caixa").

Pontos críticos:

- Escopo de unidade próprio (`presentationUnit`): queries, permissões, detalhes e exports herdam o provider local, não a empresa ativa global.
- Números são caixa pelo Livro Razão; faturamento bruto vem do Fechamento de Caixa; detalhamentos dependem do `grupo` efetivo da categoria.
- Decisões e ações são as entidades canônicas; atas só as referenciam, e snapshot aprovado nunca vira fonte financeira viva.
- Os 4 exportadores `src/lib/presentation*Export.ts` usam paleta literal, fora dos tokens: não migrar para `hsl(var(--token))`.
- A chave `financeiro:relatorio-socios:*` também governa o Borderô.
