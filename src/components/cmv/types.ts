export interface CmvResult {
  faturamento: number;
  custoConsumidoGeral: number;
  custoConsumidoSalmao: number;
  custoTotal: number;
  cmvGeralPct: number;
  cmvSalmaoPct: number;
  cmvTotalPct: number;
  margemBruta: number;
  impactoSalmao: number;
  metodoUsado: string;
  eiValor: number;
  efValor: number;
  totalEntradas: number;
  cmvPorCategoria: { categoria: string; custo: number; quantidade: number; percentCmv: number }[];
  cmvPorSetor: { setor: string; custo: number; quantidade: number; percentCmv: number }[];
  cmvSemanal: { semana: string; custo: number }[];
}

export interface MetaCmv {
  id: string;
  mes_ano: string;
  meta_cmv_geral: number;
  meta_cmv_salmao: number;
  meta_cmv_total: number;
  alerta_amarelo_percent: number;
  alerta_vermelho_percent: number;
}

export interface RankingItem {
  produtoId: string;
  nome: string;
  categoria: string;
  custoConsumido: number;
  percentCmv: number;
  quantidade: number;
  custoMedioSnapshot: number;
}
