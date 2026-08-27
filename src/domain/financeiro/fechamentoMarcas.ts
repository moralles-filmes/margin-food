import { normalizeBRLMoneyToNumber } from '@/lib/formatters';

interface MarcaRef {
  id: string;
}

export interface FechamentoMarcaPayloadItem {
  marca_id: string;
  valor: number;
}

export function buildFechamentoMarcaPayload(
  brands: MarcaRef[],
  values: Record<string, string>
) {
  const items = brands.map<FechamentoMarcaPayloadItem>(brand => ({
    marca_id: brand.id,
    valor: normalizeBRLMoneyToNumber(values[brand.id] || '') ?? 0,
  }));

  return {
    items,
    total: items.reduce((sum, item) => sum + item.valor, 0),
  };
}
