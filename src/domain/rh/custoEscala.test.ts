import { describe, expect, it } from 'vitest';
import { calcularCustoEscala, horasTurno, type ColaboradorCusto, type TurnoCusto } from './custoEscala';

const turno = (colaborador_id: string, hora_inicio: string, hora_fim: string, tipo = 'TRABALHO'): TurnoCusto =>
  ({ colaborador_id, hora_inicio, hora_fim, tipo });

const mapa = (...lista: ColaboradorCusto[]) => new Map(lista.map(c => [c.id, c]));

describe('horasTurno', () => {
  it('aceita hora com segundos, como o Postgres devolve o time', () => {
    expect(horasTurno('08:00:00', '16:30:00')).toBe(8.5);
  });

  it('turno que passa da meia-noite não fica negativo', () => {
    expect(horasTurno('22:00', '02:00')).toBe(4);
  });
});

describe('calcularCustoEscala', () => {
  it('soma horas × valor-hora só dos turnos de trabalho', () => {
    const custo = calcularCustoEscala(
      [turno('a', '08:00', '16:00'), turno('a', '08:00', '16:00', 'FOLGA'), turno('b', '10:00', '14:00')],
      mapa({ id: 'a', valor_hora: 10 }, { id: 'b', valor_hora: 12.5, remuneracao_visivel: true }),
    );
    expect(custo).toEqual({ situacao: 'ok', valor: 130 });
  });

  it('colaborador fora da lista deixa o custo incompleto, nunca some da soma', () => {
    // Era o defeito: o inativo não vinha na lista e o turno dele custava zero.
    const custo = calcularCustoEscala(
      [turno('ativo', '08:00', '16:00'), turno('inativo', '08:00', '16:00'), turno('inativo', '16:00', '20:00')],
      mapa({ id: 'ativo', valor_hora: 10 }),
    );
    expect(custo).toEqual({ situacao: 'incompleto', faltantes: ['inativo'] });
  });

  it('colaborador inativo carregado entra no custo como qualquer outro', () => {
    const custo = calcularCustoEscala(
      [turno('ativo', '08:00', '16:00'), turno('inativo', '08:00', '12:00')],
      mapa({ id: 'ativo', valor_hora: 10 }, { id: 'inativo', valor_hora: 20 }),
    );
    expect(custo).toEqual({ situacao: 'ok', valor: 160 });
  });

  it('remuneração oculta não vira custo zero', () => {
    const custo = calcularCustoEscala(
      [turno('a', '08:00', '16:00'), turno('b', '08:00', '16:00')],
      mapa({ id: 'a', valor_hora: 10 }, { id: 'b', valor_hora: null, remuneracao_visivel: false }),
    );
    expect(custo).toEqual({ situacao: 'oculto' });
  });

  it('folga de quem não está na lista não impede o cálculo', () => {
    const custo = calcularCustoEscala(
      [turno('a', '08:00', '16:00'), turno('x', '08:00', '16:00', 'FOLGA')],
      mapa({ id: 'a', valor_hora: 10 }),
    );
    expect(custo).toEqual({ situacao: 'ok', valor: 80 });
  });

  it('valor-hora não informado conta zero (remuneração visível)', () => {
    const custo = calcularCustoEscala([turno('a', '08:00', '16:00')], mapa({ id: 'a', valor_hora: null }));
    expect(custo).toEqual({ situacao: 'ok', valor: 0 });
  });

  it('arredonda para centavos', () => {
    const custo = calcularCustoEscala([turno('a', '08:00', '08:20')], mapa({ id: 'a', valor_hora: 10 }));
    expect(custo).toEqual({ situacao: 'ok', valor: 3.33 });
  });
});
