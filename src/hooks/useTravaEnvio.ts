import { useCallback, useRef, useState } from 'react';

/**
 * Trava de envio para ações que gravam (salvar, registrar, gerar).
 *
 * A ref fecha a porta no mesmo tick do clique: o estado `enviando` só chega ao
 * `disabled` do botão no próximo render, e um duplo clique (ou Enter + clique)
 * dispara o handler duas vezes antes disso. Enquanto `executar` roda, novas
 * chamadas são ignoradas e devolvem `undefined`.
 *
 * Só protege a própria tela. Envio que mexe em dinheiro, estoque, ponto ou
 * mensagem externa precisa também de barreira no servidor (chave derivada +
 * índice único) — ver `@/lib/chaveOperacao`.
 */
export function useTravaEnvio() {
  const travaRef = useRef(false);
  const [enviando, setEnviando] = useState(false);

  const executar = useCallback(async <T,>(acao: () => Promise<T>): Promise<T | undefined> => {
    if (travaRef.current) return undefined;
    travaRef.current = true;
    setEnviando(true);
    try {
      return await acao();
    } finally {
      travaRef.current = false;
      setEnviando(false);
    }
  }, []);

  return { enviando, executar };
}
