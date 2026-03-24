export interface SalmonEntry {
  id: string;
  date: string;
  lot: string;
  sif: string;
  supplier: string;
  totalValue: number;
  pricePerKg?: number;
  boxes: number;
  units: number;
  grossKg: number;
  notes: string;
  createdAt: string;
}

export interface Manipulation {
  id: string;
  entryId: string;
  date: string;
  lot: string;
  sif: string;
  supplier: string;
  fishCount: number;
  grossKg: number;
  cleanKg: number;
  leftoverKg: number;
  leftoverRecorded?: boolean;
  lossKg: number;
  lossPercent: number;
  yieldKg: number;
  yieldPercent: number;
  custoKgBrutoLote?: number;
  custoManipulacao?: number;
  custoKgLimpo?: number;
  perdaValor?: number;
  valorTotalBruto?: number;
  valorTotalLimpo?: number;
  divergenciaLote?: boolean;
  divergenciaMotivo?: string;
  createdAt: string;
}

export interface LotStock {
  entryId: string;
  lot: string;
  sif: string;
  supplier: string;
  supplierActive: boolean;
  entryDate: string;
  entryGrossKg: number;
  entryTotalValue: number;
  costPerKgBruto: number;
  manipulatedKg: number;
  balanceKg: number;
  avgYield?: number;
  lastMovementDate: string;
  daysSinceMovement: number;
  isStale: boolean;
}

export interface LoteSalmaoLimpo {
  manipulacaoId: string;
  kgLimpoTotal: number;
  kgConsumido: number;
  kgRestante: number;
  custoKg: number;
  dataManipulacao: string;
  dataValidade: string;
  lote: string;
  sif: string;
  fornecedor: string;
  status: 'FRESCO' | 'VENCE_HOJE' | 'VENCIDO';
}

export interface DailyRecord {
  id: string;
  date: string;
  revenue: number;
  customers: number;
  createdAt: string;
}

export interface StockConfig {
  minGrossKg: number;
  minCleanKg: number;
  staleDaysLimit: number;
  perdaPercentAlerta: number;
  perdaValorAlerta: number;
  validadePadraoDias: number;
  alertaVencimentoDias: number;
}

export interface StockState {
  grossKg: number;
  cleanKg: number;
  grossValue: number;
  avgCostPerKg: number;
}

export interface Supplier {
  id: string;
  name: string;
  cnpj: string;
  contact: string;
  notes: string;
  active: boolean;
  categoriasAtendidas: string[];
  prazoEntregaPadrao: number;
  formaPagamentoPadrao: string;
  createdAt: string;
}

export interface MetaCompraMensal {
  id: string;
  mesAno: string;
  categoria: string;
  metaValorCompra: number;
  alertaAmareloPercent: number;
  alertaVermelhoPercent: number;
  createdAt: string;
}

export interface MetaProvisionadaSalmao {
  id: string;
  mesAno: string;
  metaGramasPorCliente: number;
  createdAt: string;
}

export interface PurchaseRecord {
  id: string;
  date: string;
  totalValue: number;
  supplier: string;
  categoria: string;
  source: 'salmon' | 'geral';
}

export interface AuditoriaCompra {
  id: string;
  entradaId: string;
  dataEntrada: string;
  valorTotal: number;
  fornecedor: string;
  mesAno: string;
  statusMetaNoMomento: 'boa' | 'perto' | 'estourado';
  statusProjecaoNoMomento: 'boa' | 'perto' | 'estourado';
  statusSemanaNoMomento: 'boa' | 'perto' | 'estourado';
  overrideAlerta: boolean;
  overrideTipo: string[];
  overrideMotivo: string;
  createdBy: string;
  overrideUser: string;
  createdAt: string;
  overrideAt: string;
}

export interface SmartSuggestion {
  kgLimpoSugerido: number;
  kgBrutoSugerido: number;
  peixesSugeridos: number;
  fallback: boolean;
  fatorSemanaMes?: number;
  ajustePressao?: number;
  historicoBase?: number;
  explicacao: string;
}

export type TabId = 'salmon' | 'estoque-geral' | 'inventario' | 'compras' | 'planning' | 'suppliers' | 'relatorios' | 'cmv' | 'ficha-tecnica' | 'configuracoes' | 'ia' | 'rh' | 'financeiro';

export type SalmonSubTab = 'dashboard' | 'entries' | 'manipulation' | 'stock' | 'goals' | 'planning-salmon';

export interface Produto {
  id: string;
  nomeProduto: string;
  sku: string;
  categoria: string;
  unidadeMedida: 'UN' | 'KG' | 'L' | 'CX' | 'PCT';
  conversoes: string;
  custoPadrao: number;
  fornecedoresPreferenciais: string[];
  leadTimeDias: number;
  estoqueMinimo: number;
  estoqueIdeal: number;
  localEstoque: string;
  ativo: boolean;
  observacoes: string;
  createdAt: string;
}

export interface MovimentacaoEstoque {
  id: string;
  produtoId: string;
  data: string;
  tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'BAIXA_PERDA';
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;
  origem: string;
  referenciaId: string;
  observacao: string;
  createdBy: string;
  createdAt: string;
}

export interface SolicitacaoEstoque {
  id: string;
  setor: string;
  solicitanteUserId: string;
  data: string;
  status: 'RASCUNHO' | 'ENVIADA' | 'APROVADA' | 'REJEITADA' | 'ATENDIDA_PARCIAL' | 'CANCELADA';
  observacao: string;
  itens: ItemSolicitacao[];
  createdAt: string;
}

export interface ItemSolicitacao {
  id: string;
  solicitacaoId: string;
  produtoId: string;
  quantidadeSolicitada: number;
  quantidadeAprovada: number;
  quantidadeAtendida: number;
  unidade: string;
}

export interface CalendarioCompras {
  id: string;
  diaSemana: string;
  categorias: string[];
  regra: string;
  ativo: boolean;
}

export interface RequisicaoCompra {
  id: string;
  data: string;
  origem: string;
  status: 'RASCUNHO' | 'EM_COTACAO' | 'APROVADA' | 'CONVERTIDA_EM_PEDIDO' | 'CANCELADA';
  observacao: string;
  createdBy: string;
  createdAt: string;
}

export interface PedidoCompra {
  id: string;
  fornecedorId: string;
  dataPedido: string;
  dataPrevistaEntrega: string;
  status: 'EMITIDO' | 'PARCIAL' | 'RECEBIDO' | 'CANCELADO';
  formaPagamento: string;
  observacao: string;
  createdAt: string;
}
