import { bankLineKey } from '@/lib/conciliacaoConciliados';

/**
 * Ocorrência de uma linha do extrato entre as linhas IGUAIS (mesma
 * `bankLineKey`: data, valor, tipo e descrição normalizada) — o
 * `p_occurrence_index` de `reconcile_import_lancamento`.
 *
 * O servidor usa o índice em dois lugares: sem FITID ele entra na chave de
 * idempotência (ocorrência 0 = chave legada, n ≥ 1 = chave própria) e, com ou
 * sem FITID, a linha só volta como `possible_duplicate` se já existirem mais de
 * `índice` lançamentos com aquele conteúdo. Por isso a numeração segue a ordem
 * de CRIAÇÃO — o n-ésimo lançamento daquele conteúdo tem o índice n —, que é o
 * que o reconhecimento por contagem (`buildConciliadosCounts`) supõe ao
 * reimportar: as primeiras linhas iguais do arquivo aparecem como já
 * conciliadas e as seguintes continuam a contagem. Numerar pela posição no
 * arquivo não serve: depois de ignorar ou processar fora de ordem uma das
 * linhas iguais, a reimportação reconhece OUTRA linha e a chave da seguinte
 * colide com um lançamento que já é de outra venda.
 *
 * Linha nova recebe `max(reconhecidas, próxima livre, maior guardada + 1) +
 * posição no envio`: `reconhecidas` são as linhas iguais que a tela mostra como
 * já conciliadas, e `próxima livre` lembra as ocorrências usadas nesta sessão
 * por linhas que já saíram da lista. Sem ela, processar as linhas iguais em
 * etapas repetia o índice da 1ª e a 2ª venda voltava `duplicate`, apontando
 * para o lançamento da 1ª. Linha recusada como possível duplicata guarda o
 * índice (`ocorrencia`): "Importar mesmo assim" e um novo "Processar" reenviam
 * com ele — com um índice maior ela passaria sem o aviso.
 */

export interface LinhaComOcorrencia {
  data: string;
  valor: number;
  tipo: string;
  descricao?: string | null;
  jaConciliada?: boolean;
  /** Índice já usado num envio que voltou `possible_duplicate`. */
  ocorrencia?: number;
}

/** Próxima ocorrência livre por `bankLineKey` na sessão de conciliação da conta. */
export type OcorrenciasLivres = Readonly<Record<string, number>>;

export interface ReservaOcorrencias<T> {
  /** Índice a enviar para cada linha do envio. */
  indices: Map<T, number>;
  /** `livres` depois do envio — gravar só quando o envio terminar. */
  livres: Record<string, number>;
}

/**
 * Índices de um envio (`envio` ⊂ `linhas`, na ordem em que serão enviados).
 * Função pura: o mesmo estado devolve os mesmos índices, então repetir um
 * envio que falhou no meio reenvia as mesmas chaves.
 */
export function reservarOcorrencias<T extends LinhaComOcorrencia>(
  linhas: readonly T[],
  envio: readonly T[],
  livres: OcorrenciasLivres,
): ReservaOcorrencias<T> {
  const reconhecidas = new Map<string, number>();
  const maiorGuardada = new Map<string, number>();
  for (const linha of linhas) {
    const key = bankLineKey(linha);
    if (linha.jaConciliada) reconhecidas.set(key, (reconhecidas.get(key) ?? 0) + 1);
    if (linha.ocorrencia != null) {
      maiorGuardada.set(key, Math.max(maiorGuardada.get(key) ?? -1, linha.ocorrencia));
    }
  }

  const proximas = new Map<string, number>();
  const indices = new Map<T, number>();
  const novasLivres: Record<string, number> = { ...livres };
  for (const linha of envio) {
    const key = bankLineKey(linha);
    let indice = linha.ocorrencia;
    if (indice == null) {
      indice = proximas.get(key) ?? Math.max(
        reconhecidas.get(key) ?? 0,
        livres[key] ?? 0,
        (maiorGuardada.get(key) ?? -1) + 1,
      );
      proximas.set(key, indice + 1);
    }
    indices.set(linha, indice);
    novasLivres[key] = Math.max(novasLivres[key] ?? 0, indice + 1);
  }
  return { indices, livres: novasLivres };
}

/** `livres` depois de uma linha avulsa gravada com `indice` (criar lançamento a partir da linha). */
export function registrarOcorrenciaUsada(
  livres: OcorrenciasLivres,
  linha: LinhaComOcorrencia,
  indice: number,
): Record<string, number> {
  const key = bankLineKey(linha);
  return { ...livres, [key]: Math.max(livres[key] ?? 0, indice + 1) };
}
