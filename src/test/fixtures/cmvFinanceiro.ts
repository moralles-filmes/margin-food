/**
 * Fixture do CMV Financeiro — dados FICTÍCIOS, só para teste.
 * Formato cru de `get_fin_cmv_financeiro` (snake_case, centavos inteiros).
 *
 * Semana atual 07–13/09/2026: R = R$ 10.000,00, C = R$ 3.100,00 → 31,00%.
 * Semana anterior 31/08–06/09: R = R$ 8.000,00, C = R$ 2.000,00 → 25,00%.
 */
import type { CmvFiltro } from '@/domain/financeiro/cmv';

export const CMV_FILTRO_SEMANA: CmvFiltro = { modo: 'semanal', inicio: '2026-09-07', fim: '2026-09-13' };

export const CAT = {
  despesas: '00000000-0000-4000-8000-000000000001',
  mercadorias: '00000000-0000-4000-8000-000000000002',
  peixes: '00000000-0000-4000-8000-000000000003',
  salmao: '00000000-0000-4000-8000-000000000004',
  atum: '00000000-0000-4000-8000-000000000005',
  bebidas: '00000000-0000-4000-8000-000000000006',
  frutos: '00000000-0000-4000-8000-000000000007',
} as const;

type Raw = Record<string, unknown>;

export function cmvPayloadCru(overrides: Raw = {}): Raw {
  return {
    contrato: 'cmv-financeiro/v1',
    gerado_em: '2026-09-20T15:30:00+00:00',
    hoje: '2026-09-20',
    classificacao_ativa: true,
    empresa: 'Unidade Teste',
    periodo: { inicio: '2026-09-07', fim: '2026-09-13' },
    anterior: { inicio: '2026-08-31', fim: '2026-09-06' },
    faturamento: [
      { data: '2026-09-01', centavos: 400000 },
      { data: '2026-09-02', centavos: 400000 },
      { data: '2026-09-08', centavos: 150000 },
      { data: '2026-09-09', centavos: 150000 },
      { data: '2026-09-10', centavos: 200000 },
      { data: '2026-09-11', centavos: 200000 },
      { data: '2026-09-12', centavos: 200000 },
      { data: '2026-09-13', centavos: 100000 },
    ],
    cmv: [
      { data: '2026-09-01', categoria_id: CAT.salmao, centavos: 100000 },
      { data: '2026-09-02', categoria_id: CAT.bebidas, centavos: 100000 },
      { data: '2026-09-08', categoria_id: CAT.salmao, centavos: 150000 },
      { data: '2026-09-09', categoria_id: CAT.atum, centavos: 50000 },
      { data: '2026-09-10', categoria_id: CAT.bebidas, centavos: 60000 },
      { data: '2026-09-11', categoria_id: CAT.frutos, centavos: 40000 },
      { data: '2026-09-12', categoria_id: null, centavos: 10000 },
    ],
    boletos: [
      { data: '2026-09-01', quantidade: 1 },
      { data: '2026-09-02', quantidade: 1 },
      { data: '2026-09-08', quantidade: 1 },
      { data: '2026-09-09', quantidade: 1 },
      { data: '2026-09-10', quantidade: 1 },
      { data: '2026-09-11', quantidade: 1 },
      { data: '2026-09-12', quantidade: 1 },
    ],
    qualidade: [
      { data: '2026-09-09', situacao: 'pendente', titulos: 2, centavos: 12345 },
      { data: '2026-09-10', situacao: 'fora', titulos: 1, centavos: 35000 },
    ],
    categorias: [
      { id: CAT.despesas, nome: 'Despesas Operacionais', parent_id: null, codigo: '3', ordem: 1, ativo: true, indice: 10 },
      { id: CAT.mercadorias, nome: 'Mercadorias', parent_id: CAT.despesas, codigo: '3.1', ordem: 1, ativo: true, indice: 11 },
      { id: CAT.peixes, nome: 'Peixes', parent_id: CAT.mercadorias, codigo: '3.1.1', ordem: 1, ativo: true, indice: 12 },
      { id: CAT.salmao, nome: 'Salmão', parent_id: CAT.peixes, codigo: null, ordem: 1, ativo: true, indice: 13 },
      { id: CAT.atum, nome: 'Atum', parent_id: CAT.peixes, codigo: null, ordem: 2, ativo: false, indice: 14 },
      { id: CAT.bebidas, nome: 'Bebidas', parent_id: CAT.mercadorias, codigo: '3.1.2', ordem: 2, ativo: true, indice: 15 },
      { id: CAT.frutos, nome: 'Frutos do Mar', parent_id: CAT.mercadorias, codigo: '3.1.3', ordem: 3, ativo: true, indice: 16 },
    ],
    sem_competencia: { titulos: 1, centavos: 9900 },
    pendentes_geral: { titulos: 7, centavos: 123400 },
    ...overrides,
  };
}
