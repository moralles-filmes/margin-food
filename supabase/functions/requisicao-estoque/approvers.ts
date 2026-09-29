/**
 * Quem recebe o aviso de "requisição aberta" no sininho: exatamente quem vê o
 * botão "Atender" na tela (`useCan('estoque:requisicoes:approve')`). O frontend
 * expande as chaves legadas de LEGACY_PERMISSION_MAP (src/permissions/registry.ts)
 * e libera tudo para o super-admin; o banco não expande nada, então a lista
 * precisa nomear cada chave. `src/permissions/requisicaoApprovers.test.ts` trava
 * a sincronia com o registry.
 */
export const REQUISICAO_APPROVER_PERMISSIONS = [
  "estoque:requisicoes:approve",
  "stock:requisitions:approve",
  "stock:write",
  "system:global:manage",
] as const;

export const REQUISICAO_ABERTA_TYPE = "REQUISICAO_ABERTA";

/** Mesmo destino da notificação de encerramento — o sininho resolve para Estoque → Requisições. */
export const REQUISICOES_LINK_PATH = "/?module=estoque&sub=requisicoes";

export function buildRequisicaoAbertaNotification(input: {
  requisicaoId: string;
  setor: string | null;
  totalItens: number;
  solicitanteNome: string | null;
}): { title: string; message: string } {
  const itens = input.totalItens === 1 ? "1 item" : `${input.totalItens} itens`;
  const setor = input.setor?.trim() || "—";
  const quem = input.solicitanteNome?.trim() ? `${input.solicitanteNome.trim()} pediu` : "Pedido de";
  return {
    title: "Nova requisição de estoque",
    message: `${quem} ${itens} para ${setor} (#${input.requisicaoId.slice(0, 8)}). Aguardando atendimento.`,
  };
}
