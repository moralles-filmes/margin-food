import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScopedToast } from '@/hooks/useScopedToast';

/** A apresentação pode quebrar linhas; a cópia sempre usa o valor original inteiro. */
export default function CodigoPagamento({ codigo }: { codigo: string }) {
  const toast = useScopedToast();
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success('Código copiado!');
    } catch {
      console.error('[CodigoPagamento.copiar] Clipboard indisponível');
      toast.error('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  };
  return (
    <div className="min-w-0 space-y-2">
      <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all select-all font-mono text-xs">{codigo}</p>
      <Button type="button" size="sm" variant="outline" onClick={e => { e.stopPropagation(); void copiar(); }}>
        <Copy className="mr-2 h-4 w-4" /> Copiar
      </Button>
    </div>
  );
}
