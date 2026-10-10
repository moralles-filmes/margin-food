import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useRetornoFoco } from './useRetornoFoco';

export type EscopoSerie = 'esta' | 'serie';

interface Props {
  /** Parcela em edição; `null` fecha o diálogo. */
  parcela: { atual: number; total: number } | null;
  variant: 'pagar' | 'receber';
  onEscolher: (escopo: EscopoSerie) => void;
  onVoltar: () => void;
}

/** Ao salvar uma parcela de série: grava só nela ou também nas próximas em aberto. */
export default function EscopoSerieDialog({ parcela, variant, onEscolher, onVoltar }: Props) {
  const retornoFoco = useRetornoFoco();
  const quitadas = variant === 'pagar' ? 'pagas' : 'recebidas';

  return (
    <AlertDialog open={parcela !== null} onOpenChange={o => { if (!o) onVoltar(); }}>
      <AlertDialogContent {...retornoFoco}>
        <AlertDialogHeader>
          <AlertDialogTitle>Aplicar a alteração a quais parcelas?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta conta é a parcela {parcela?.atual} de {parcela?.total}. Você pode salvar só nela ou levar as
            alterações também para as próximas parcelas em aberto.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Só o que você alterou agora vai para as próximas e substitui o que cada uma tinha nesses campos,
            mesmo que tenha sido ajustado à mão. O resto de cada parcela fica como está.
          </li>
          <li>Se mudar o vencimento, as próximas acompanham a nova data, parcela a parcela.</li>
          <li>Parcelas anteriores e as já {quitadas} ou canceladas não mudam.</li>
          {variant === 'pagar' && <li>O código de pagamento de cada boleto é mantido.</li>}
          {variant === 'pagar' && <li>Cada parcela alterada passa de novo pela regra de aprovação, como na edição de uma só.</li>}
        </ul>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button variant="outline" onClick={() => onEscolher('esta')}>Somente esta parcela</Button>
          <Button onClick={() => onEscolher('serie')}>Esta e as próximas</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
