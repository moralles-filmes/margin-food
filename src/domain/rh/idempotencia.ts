/**
 * ─── Chaves de idempotência dos envios do RH ───
 *
 * Cada função descreve o que identifica a operação para o servidor. Semente,
 * derivação e o porquê: `@/lib/chaveOperacao`.
 */

import { chaveOperacao, chaveOperacaoUuid, novaSemente } from '@/lib/chaveOperacao';

export interface BatidaPonto {
  tipo: string;
  semente: string;
}

/**
 * Semente de uma batida de ponto. Continua a mesma enquanto o usuário repete a
 * MESMA batida sem confirmação (o retry reaproveita a chave e o servidor devolve
 * o registro já gravado); troca quando a batida muda de tipo. Depois do sucesso
 * a tela descarta a batida (`null`).
 *
 * Trocar ao mudar de tipo fecha um buraco: ENTRADA (resposta perdida) → SAÍDA
 * (resposta perdida) → ENTRADA do 2º turno reaproveitaria a chave da 1ª ENTRADA,
 * e o servidor devolveria o registro antigo como se fosse o novo.
 */
export function sementeDaBatida(
  anterior: BatidaPonto | null,
  tipo: string,
  gerar: () => string = novaSemente,
): BatidaPonto {
  if (anterior && anterior.tipo === tipo) return anterior;
  return { tipo, semente: gerar() };
}

/**
 * Registro de ponto (`rh_registrar_ponto`). A data entra na chave: numa aba
 * aberta de um dia para o outro, a batida de ontem que ficou sem resposta não
 * pode reaproveitar a chave e engolir a de hoje. O servidor compara colaborador
 * e tipo no reenvio.
 */
export function chavePonto(
  semente: string,
  dados: { colaboradorId: string; tipo: string; data: string },
): Promise<string> {
  return chaveOperacao(semente, {
    op: 'rh_ponto',
    colaborador_id: dados.colaboradorId,
    tipo: dados.tipo,
    data: dados.data,
  });
}

export interface DocumentoRhChave {
  colaboradorId: string;
  tipo: string;
  nome: string;
  descricao: string;
  dataEmissao: string | null;
  dataVencimento: string | null;
  obrigatorio: boolean;
  alertarVencimento: boolean;
  diasAlertaAntes: number;
  arquivo: { nome: string; tamanho: number; tipo: string; modificadoEm: number } | null;
}

/**
 * Id do documento de RH (`rh_documentos.id`, UUID). Derivado do conteúdo: o
 * retry do mesmo envio reaproveita o id e a PK barra a duplicata; trocar o
 * arquivo ou qualquer campo gera outro id — e outro caminho no Storage, que é
 * montado a partir dele.
 */
export function idDocumentoRh(semente: string, dados: DocumentoRhChave): Promise<string> {
  return chaveOperacaoUuid(semente, {
    op: 'rh_documento',
    colaborador_id: dados.colaboradorId,
    tipo: dados.tipo,
    nome: dados.nome,
    descricao: dados.descricao,
    data_emissao: dados.dataEmissao,
    data_vencimento: dados.dataVencimento,
    obrigatorio: dados.obrigatorio,
    alertar_vencimento: dados.alertarVencimento,
    dias_alerta_antes: dados.diasAlertaAntes,
    arquivo: dados.arquivo,
  });
}
