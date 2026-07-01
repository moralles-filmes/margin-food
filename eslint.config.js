import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Dívida técnica existente: manter visível sem bloquear o gate global.
      // Não adicionar `any` novo sem justificativa; migrar por módulo para tipos/narrowing.
      "@typescript-eslint/no-explicit-any": "warn",
      // Blindagem de busca accent-insensitive — ver CLAUDE.md "Padrões de Busca de Texto"
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='includes'][callee.object.callee.property.name='toLowerCase']",
          message:
            "Não use .toLowerCase().includes() para busca de texto. ILIKE/lowercase NÃO remove acentos. Use includesNormalized() de '@/lib/utils' (accent-insensitive). Para casos não-busca (URL/erro/IDs), justifique com // eslint-disable-next-line no-restricted-syntax -- <motivo>.",
        },
        {
          selector:
            "CallExpression[callee.property.name='ilike']",
          message:
            "PostgREST .ilike() é case-insensitive mas NÃO accent-insensitive. Use a coluna gerada *_unaccent + normalizeSearchText() do termo cliente-side. Se a coluna NÃO tem acentos (uuid::text, email, codigo), justifique com // eslint-disable-next-line no-restricted-syntax -- <motivo>.",
        },
        {
          // Detecta strings com padrão `coluna.ilike.%termo%` em chamadas
          // .or('...') / .filter('...'). PostgREST não normaliza acentos.
          // Permitido apenas para colunas *_unaccent com disable inline.
          selector: "TemplateElement[value.raw=/\\.ilike\\./], Literal[value=/\\.ilike\\./]",
          message:
            "String com `.ilike.` em .or()/.filter() do PostgREST não é accent-insensitive. Use coluna *_unaccent + normalizeSearchText(). Se a coluna NÃO tem acentos, justifique com // eslint-disable-next-line no-restricted-syntax -- <motivo>.",
        },
      ],
    },
  },
);
