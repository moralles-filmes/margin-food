import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScopedToast } from '@/hooks/useScopedToast';

/** Tempo em que o botão mostra "Copiado" depois de uma cópia bem-sucedida. */
const RETORNO_MS = 2000;

/**
 * A apresentação pode quebrar linhas; a cópia sempre usa o valor original inteiro.
 * `rotulo` dá contexto ao nome acessível do botão quando há vários códigos na tela.
 */
export default function CodigoPagamento({ codigo, rotulo }: { codigo: string; rotulo?: string }) {
  const toast = useScopedToast();
  const [copiado, setCopiado] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success('Código copiado!');
      setCopiado(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { setCopiado(false); timer.current = null; }, RETORNO_MS);
    } catch {
      console.error('[CodigoPagamento.copiar] Clipboard indisponível');
      setCopiado(false);
      toast.error('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  };
  // O nome acompanha o texto visível; o toast já anuncia a cópia ao leitor de tela.
  const alvo = rotulo ? `código de ${rotulo}` : 'código';
  const nome = copiado ? `Copiado: ${alvo}` : `Copiar ${alvo}`;

  return (
    <div className="min-w-0 space-y-2">
      <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all select-all rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs text-foreground">{codigo}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={nome}
        className="h-8"
        onClick={e => { e.stopPropagation(); void copiar(); }}
      >
        {copiado
          ? <><Check aria-hidden="true" className="mr-2 h-4 w-4 text-success" /> Copiado</>
          : <><Copy aria-hidden="true" className="mr-2 h-4 w-4" /> Copiar</>}
      </Button>
    </div>
  );
}
