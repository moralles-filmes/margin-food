/**
 * ─── Custo projetado da escala semanal ───
 *
 * Soma horas × valor-hora dos turnos de TRABALHO. O valor-hora vem de
 * `rh_listar_colaboradores`, que mascara a remuneração por chave; por isso o
 * resultado distingue "não dá para calcular" de "custa zero" — gravar zero por
 * cima do custo projetado é o que se quer evitar.
 */

export interface TurnoCusto {
  colaborador_id: string;
  tipo: string;
  hora_inicio: string;
  hora_fim: string;
}

export interface ColaboradorCusto {
  id: string;
  valor_hora: number | null;
  /** false quando quem vê a escala não tem acesso à remuneração (valor_hora vem nulo). */
  remuneracao_visivel?: boolean;
}

export type CustoEscala =
  | { situacao: 'ok'; valor: number }
  /** Algum turno é de colaborador cuja remuneração o usuário não vê. */
  | { situacao: 'oculto' }
  /** Algum turno é de colaborador que ainda não está na lista (ex.: inativo, buscado à parte). */
  | { situacao: 'incompleto'; faltantes: string[] };

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** Horas do turno; fim antes do início é turno que passa da meia-noite. */
export function horasTurno(horaInicio: string, horaFim: string): number {
  const duracao = minutos(horaFim) - minutos(horaInicio);
  return (duracao < 0 ? duracao + 24 * 60 : duracao) / 60;
}

export function calcularCustoEscala(
  turnos: TurnoCusto[],
  colaboradoresPorId: ReadonlyMap<string, ColaboradorCusto>,
): CustoEscala {
  const trabalho = turnos.filter(t => t.tipo === 'TRABALHO');

  const faltantes = [...new Set(trabalho.map(t => t.colaborador_id))]
    .filter(id => !colaboradoresPorId.has(id));
  if (faltantes.length > 0) return { situacao: 'incompleto', faltantes };

  if (trabalho.some(t => colaboradoresPorId.get(t.colaborador_id)!.remuneracao_visivel === false)) {
    return { situacao: 'oculto' };
  }

  const total = trabalho.reduce((soma, t) => {
    const valorHora = colaboradoresPorId.get(t.colaborador_id)!.valor_hora ?? 0;
    return soma + horasTurno(t.hora_inicio, t.hora_fim) * valorHora;
  }, 0);
  return { situacao: 'ok', valor: Math.round(total * 100) / 100 };
}
