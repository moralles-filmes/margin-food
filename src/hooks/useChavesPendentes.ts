import { useMemo } from 'react';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { chavesPendentesDaAba, type ChavesPendentes, type FormatoChave } from '@/lib/chaveOperacao';

/**
 * Sementes por conteúdo pendente de uma tela (`escopo`), da empresa em que ela
 * grava (a do `CompanyScopeProvider`, o mesmo escopo do cliente de
 * `useSupabase`). Sobrevivem a fechar e reabrir o formulário e a recarregar a
 * página — ver `chavesPendentesDaAba`. Uso: `chave(conteudo)` no envio,
 * `confirmar(conteudo)` só no sucesso DAQUELE conteúdo.
 */
export function useChavesPendentes<T = unknown>(
  escopo: string,
  formato: FormatoChave = 'texto',
): ChavesPendentes<T> {
  const particao = useCompanyScope()?.companyId ?? '';
  return useMemo(
    () => chavesPendentesDaAba<T>(escopo, particao, { formato }),
    [escopo, particao, formato],
  );
}
