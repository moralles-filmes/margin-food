import { useCallback, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useCan } from '@/permissions';
import { useMovimentacaoOperacional } from '@/hooks/useMovimentacaoOperacional';
import FluxoMovimentacao from './FluxoMovimentacao';
import HistoricoOperacional from './HistoricoOperacional';

/**
 * ─── Movimentação Operacional ───
 *
 * Submódulo simplificado de saída de estoque, para quem está no chão de
 * operação. Entrada é lançada no Controle de Estoque (módulo administrativo);
 * o banco recusa entrada por aqui. Grava na MESMA `movimentacoes_estoque` e
 * reflete no MESMO `produtos.saldo_atual` do módulo administrativo — duas
 * interfaces, uma fonte de verdade, sem sincronização.
 *
 * Esta tela nunca monta o `EstoqueGeralStore`: toda leitura passa pelas RPCs
 * `op_*`, que não projetam custo, preço, fornecedor nem qualquer indicador
 * administrativo.
 */
export default function MovimentacaoOperacionalView() {
  const podeVer = useCan('operacional:movimentacao:view');
  const podeCriar = useCan('operacional:movimentacao:create');
  const podeVerHistorico = useCan('operacional:historico:view');

  const dados = useMovimentacaoOperacional();
  const [versaoHistorico, setVersaoHistorico] = useState(0);

  const registrado = useCallback(() => setVersaoHistorico(v => v + 1), []);

  if (!podeVer) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-destructive" />
        <h2 className="mb-2 text-lg font-semibold">Acesso negado</h2>
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar a movimentação operacional.
        </p>
      </div>
    );
  }

  if (dados.setoresLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (dados.setoresErro) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-destructive-border bg-destructive-soft p-5 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <p className="text-sm font-medium text-destructive">{dados.setoresErro}</p>
      </div>
    );
  }

  // Sem setor autorizado não há operação possível — e o operador não tem como
  // se auto-conceder um. A tela diz o que fazer em vez de mostrar uma lista vazia.
  if (dados.setores.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-6 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h2 className="mb-2 text-base font-semibold text-foreground">Nenhum setor liberado</h2>
        <p className="text-sm text-muted-foreground">
          Você ainda não tem setores liberados para movimentar. Procure um responsável
          para configurar seu acesso em Controle de Estoque → Cadastros.
        </p>
      </div>
    );
  }

  // Com um tipo só, a tela abre direto no fluxo de saída: uma tela de escolha
  // seria um clique a mais antes de cada sessão de bipes.
  return (
    <div className="space-y-8 pb-8">
      {podeCriar ? (
        <FluxoMovimentacao
          setores={dados.setores}
          dados={dados}
          onRegistrado={registrado}
        />
      ) : (
        <div className="mx-auto w-full max-w-xl space-y-5">
          <h1 className="text-center text-2xl font-bold tracking-tight text-foreground">Movimentação de Estoque</h1>
          <p className="rounded-lg border border-border bg-background-subtle p-3 text-center text-sm text-muted-foreground">
            Seu acesso é somente de consulta. Procure um responsável para liberar o registro de movimentações.
          </p>
        </div>
      )}

      {podeVerHistorico && (
        <HistoricoOperacional carregar={dados.carregarHistorico} versao={versaoHistorico} />
      )}
    </div>
  );
}
