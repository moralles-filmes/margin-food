# Redesign Visual — Azul / Branco / Preto

Redesign visual completo do MarginPro (Moralles Food), executado em **11 fases sequenciais**.

> **Escopo:** UI, UX, design system, layout, cores, tema claro/escuro, gráficos, datas, densidade.
> **Fora de escopo:** backend, banco, APIs, cálculos, permissões (RBAC), rotas, regras de negócio.

---

## 📌 PROTOCOLO OBRIGATÓRIO PARA AGENTES

Leia esta seção antes de começar qualquer fase.

1. **Leia `CLAUDE.md` / `AGENTS.md` da raiz** — as regras do projeto continuam valendo integralmente.
2. **Leia [PLANO-DE-FASES.md](PLANO-DE-FASES.md)** para saber onde sua fase se encaixa.
3. **Leia [01-DESIGN-SYSTEM.md](01-DESIGN-SYSTEM.md)** — é a fonte única de cor/raio/sombra. Nunca escreva hex em componente.
4. **Leia [referencias/MOCKUPS.md](referencias/MOCKUPS.md)** — a direção visual alvo. Se houver PNGs em `referencias/`, abra-os.
5. Execute **apenas a sua fase**. Não adiante trabalho de fases seguintes — isso quebra a rastreabilidade e infla o diff.
6. Ao terminar, rode a **bateria de validação** (abaixo) — a fase só fecha com tudo verde.
7. Atualize o **checklist da sua fase** em [PLANO-DE-FASES.md](PLANO-DE-FASES.md) (marque `[x]`) e registre o que mudou em [PROGRESSO.md](PROGRESSO.md).
8. **⚠️ ENTREGA FINAL DE TODA FASE:** escreva o prompt da próxima fase em `docs/redesign/prompts/FASE-NN.md` **e cole o conteúdo desse prompt na resposta ao usuário**, dentro de um bloco de código, para que ele possa copiar e colar numa sessão nova. *Nenhuma fase é considerada concluída sem isso.*

### Bateria de validação (fim de cada fase)

```bash
npx tsc --noEmit          # deve sair 0
bun run lint              # 0 errors (warnings de `any` são pré-existentes)
bun run test              # 61 arquivos / 518 testes passando
bun run build             # deve concluir
```

Baseline registrado em 2026-08-27 (antes da Fase 1): typecheck 0, lint **0 errors / 678 warnings**,
**518 testes** passando, build OK. Qualquer número pior que isso é regressão da sua fase.

### Regras invioláveis

- **Não trocar a família tipográfica.** Inter (corpo) + Space Grotesk (`font-display`). Peso, tamanho e espaçamento podem mudar.
- **Não alterar rotas, `TabId`, chaves de permissão, nomes de RPC ou payloads.**
- **Não inventar dados.** Card sem dado → empty state, nunca número fictício.
- **Não usar patch improvisado** (`.dark * { color: white !important }`, `svg { stroke: blue !important }`).
- **Não duplicar componente** — procure o equivalente em `src/components/ui/` antes de criar.
- **Sem hex em componente.** Toda cor sai de `hsl(var(--token))` ou de classe Tailwind do design system.
- **Segurança:** as checagens de `CLAUDE.md` (JWT, `.env`, `sb_secret_`) valem para qualquer commit.

---

## Documentos

| Arquivo | Conteúdo |
|---|---|
| [00-AUDITORIA.md](00-AUDITORIA.md) | Estado encontrado antes do redesign: arquitetura, inventário de gráficos e datepickers, problemas |
| [01-DESIGN-SYSTEM.md](01-DESIGN-SYSTEM.md) | Referência completa de tokens, paleta, contraste, aliases legados |
| [PLANO-DE-FASES.md](PLANO-DE-FASES.md) | As 11 fases, escopo e checklist de cada uma |
| [PROGRESSO.md](PROGRESSO.md) | Registro do que cada fase entregou |
| [referencias/MOCKUPS.md](referencias/MOCKUPS.md) | Descrição detalhada dos mockups de referência |
| [prompts/](prompts/) | Prompt pronto para iniciar cada fase |

---

## 🧹 Limpeza final

O agente da **Fase 11** deve, ao terminar:

- apagar a pasta `docs/redesign/referencias/` inteira (incluindo os PNGs de mockup);
- apagar `docs/redesign/prompts/`;
- manter `00-AUDITORIA.md`, `01-DESIGN-SYSTEM.md`, `PLANO-DE-FASES.md` e `PROGRESSO.md` (viram documentação permanente do design system);
- atualizar `CLAUDE.md` **e** `AGENTS.md` com as decisões arquiteturais do redesign que precisam sobreviver — sem inflar (regra de enxugamento no topo do `CLAUDE.md`).
