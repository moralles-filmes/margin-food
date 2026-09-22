import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Loader2, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ehLeituraDuplicada,
  mensagemBarcodeInvalido,
  validarBarcode,
} from '@/domain/estoque/barcode';

interface Props {
  /** Chamado com o código já normalizado e validado. */
  onLeitura: (codigo: string) => void;
  onLancarManualmente: () => void;
  /** Bloqueia novas leituras enquanto a anterior é resolvida. */
  ocupado: boolean;
  /** Mensagem do resultado anterior (produto não encontrado, sem acesso…). */
  aviso?: string;
  /** Sobe a cada nova operação concluída, para o campo voltar a receber foco. */
  focoToken: number;
}

/**
 * ─── Leitor de código de barras (HID) ───
 *
 * Leitor USB/Bluetooth se comporta como teclado: digita os dígitos e manda
 * Enter. O campo por isso fica sempre focado e é reencaixado depois de cada
 * operação — o operador não clica em nada entre um bipe e o outro.
 *
 * O campo é visível de propósito. Campo invisível parece elegante até o leitor
 * falhar: aí ninguém vê o que foi lido e não há como digitar o código à mão.
 */
export default function LeitorCodigoBarras({
  onLeitura, onLancarManualmente, ocupado, aviso, focoToken,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  // Guarda da leitura repetida: leitor em superfície reflexiva dispara duas
  // vezes e um bipe viraria duas movimentações.
  const ultimoCodigoRef = useRef<string | null>(null);
  const ultimoEmRef = useRef<number | null>(null);

  const focar = useCallback(() => {
    if (!ocupado) inputRef.current?.focus();
  }, [ocupado]);

  useEffect(() => { focar(); }, [focar, focoToken]);

  const processar = useCallback((raw: string) => {
    const { valido, codigo, motivo } = validarBarcode(raw);
    setValor('');

    if (!valido) {
      setErro(mensagemBarcodeInvalido(motivo!));
      return;
    }

    const agora = Date.now();
    if (ehLeituraDuplicada(codigo, ultimoCodigoRef.current, ultimoEmRef.current, agora)) {
      ultimoEmRef.current = agora;
      return;
    }
    ultimoCodigoRef.current = codigo;
    ultimoEmRef.current = agora;

    setErro(null);
    onLeitura(codigo);
  }, [onLeitura]);

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border-2 border-dashed border-primary-border bg-primary-soft p-6 text-center"
        onClick={focar}
      >
        {ocupado ? (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        ) : (
          <ScanLine className="mx-auto h-10 w-10 animate-pulse text-primary" />
        )}
        <p className="mt-3 text-base font-semibold text-foreground">
          {ocupado ? 'Buscando produto…' : 'Aguardando leitura do código de barras'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Use o leitor ou digite o código e pressione Enter.
        </p>

        <Input
          ref={inputRef}
          value={valor}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            processar(valor);
          }}
          // O leitor HID some com o foco se o operador tocar em outro ponto da
          // tela; devolver no blur mantém o próximo bipe funcionando.
          onBlur={() => window.setTimeout(focar, 0)}
          disabled={ocupado}
          inputMode="numeric"
          autoComplete="off"
          aria-label="Código de barras"
          placeholder="0000000000000"
          className="mt-4 h-14 text-center font-mono text-xl tracking-widest"
        />
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive-border bg-destructive-soft p-3">
          <p className="text-sm font-medium text-destructive">{erro}</p>
        </div>
      )}

      {aviso && (
        <div className="rounded-lg border border-warning-border bg-warning-soft p-3">
          <p className="text-sm font-medium text-foreground">{aviso}</p>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={onLancarManualmente}
        className="h-12 w-full rounded-xl text-base"
      >
        <Keyboard className="mr-2 h-5 w-5" />
        Lançar manualmente
      </Button>
    </div>
  );
}
