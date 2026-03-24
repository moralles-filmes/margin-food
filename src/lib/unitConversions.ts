/**
 * Centralized unit conversion logic for the entire system.
 *
 * Base units:
 *   peso   → kg
 *   volume → L
 *   unidade → un
 *
 * Used by: Estoque, Compras, Ficha Técnica, CMV, Inventário, Planejamento
 */

// ─── Static conversion table (from → base multiplier) ───
const TO_BASE: Record<string, { base: string; factor: number }> = {
  // Peso
  kg:  { base: 'KG', factor: 1 },
  KG:  { base: 'KG', factor: 1 },
  g:   { base: 'KG', factor: 0.001 },
  // Volume
  L:   { base: 'L', factor: 1 },
  l:   { base: 'L', factor: 1 },
  ml:  { base: 'L', factor: 0.001 },
  ML:  { base: 'L', factor: 0.001 },
  // Unidade
  un:  { base: 'UN', factor: 1 },
  UN:  { base: 'UN', factor: 1 },
};

// Aliases (case-insensitive lookup)
const ALIASES: Record<string, string> = {
  quilograma: 'kg',
  quilo: 'kg',
  grama: 'g',
  litro: 'L',
  litros: 'L',
  mililitro: 'ml',
  mililitros: 'ml',
  unidade: 'un',
  unidades: 'un',
};

function normalizeSymbol(sym: string): string {
  const trimmed = sym.trim();
  const lower = trimmed.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  // Return trimmed original — TO_BASE now has both cases for known units
  return trimmed;
}

/**
 * Check if two unit symbols are in the same measurement family
 * and return the conversion factor: how many `toUnit` fit in 1 `fromUnit`.
 *
 * Returns null if they are not directly convertible.
 */
export function getDirectConversionFactor(fromSymbol: string, toSymbol: string): number | null {
  const from = normalizeSymbol(fromSymbol);
  const to = normalizeSymbol(toSymbol);

  const fromEntry = TO_BASE[from];
  const toEntry = TO_BASE[to];

  if (!fromEntry || !toEntry) return null;
  if (fromEntry.base !== toEntry.base) return null;

  // factor = fromEntry.factor / toEntry.factor
  // e.g. ml→L = 0.001 / 1 = 0.001
  // e.g. kg→g = 1 / 0.001 = 1000
  return fromEntry.factor / toEntry.factor;
}

/**
 * Calculate the conversion factor for a product package.
 *
 * Given a package with `packageQty` units of `packageMeasureUnit`,
 * returns how many `baseUnit` are in one package.
 *
 * Example: packageQty=900, packageMeasureUnit='ml', baseUnit='L' → 0.9
 * Example: packageQty=5, packageMeasureUnit='kg', baseUnit='KG' → 5
 *
 * Returns { factor, isAuto } or { factor: null, isAuto: false } if not convertible.
 */
export function calcPackageConversionFactor(
  packageQty: number | null | undefined,
  packageMeasureUnit: string | null | undefined,
  baseUnit: string,
): { factor: number | null; isAuto: boolean } {
  if (!packageQty || packageQty <= 0 || !packageMeasureUnit) {
    return { factor: null, isAuto: false };
  }

  const directFactor = getDirectConversionFactor(packageMeasureUnit, baseUnit);
  if (directFactor !== null) {
    const result = parseFloat((packageQty * directFactor).toFixed(6));
    return { factor: result, isAuto: true };
  }

  return { factor: null, isAuto: false };
}

/**
 * Convert a quantity from one unit to another using the static conversion table.
 *
 * Returns null if the conversion is not possible (different families or unknown units).
 */
export function convertUnits(qty: number, fromUnit: string, toUnit: string): number | null {
  const factor = getDirectConversionFactor(fromUnit, toUnit);
  if (factor === null) return null;
  return parseFloat((qty * factor).toFixed(6));
}

/**
 * Convert purchase quantity to base unit using the product's conversion factor.
 *
 * Example: 10 garrafas × fator 0.9 = 9 litros
 */
export function purchaseToBase(purchaseQty: number, conversionFactor: number): number {
  return parseFloat((purchaseQty * conversionFactor).toFixed(6));
}

/**
 * Convert base quantity to purchase units using the product's conversion factor.
 *
 * Example: 9 litros ÷ fator 0.9 = 10 garrafas
 */
export function baseToPurchase(baseQty: number, conversionFactor: number): number {
  if (conversionFactor <= 0) return baseQty;
  return parseFloat((baseQty / conversionFactor).toFixed(6));
}

/**
 * Get the base unit symbol for a measurement type.
 */
export function getBaseUnit(tipo: 'peso' | 'volume' | 'unidade'): string {
  switch (tipo) {
    case 'peso': return 'KG';
    case 'volume': return 'L';
    case 'unidade': return 'UN';
  }
}

/**
 * Determine the measurement type from a unit symbol.
 */
export function getUnitType(symbol: string): 'peso' | 'volume' | 'unidade' | null {
  const norm = normalizeSymbol(symbol);
  const entry = TO_BASE[norm];
  if (!entry) return null;
  switch (entry.base) {
    case 'KG': return 'peso';
    case 'L': return 'volume';
    case 'UN': return 'unidade';
    default: return null;
  }
}

/**
 * Format a conversion description for display.
 *
 * Example: formatConversionLabel('Garrafa', 900, 'ml', 0.9, 'L')
 *   → "1 Garrafa (900ml) = 0,9 L"
 */
export function formatConversionLabel(
  purchaseUnit: string,
  packageQty: number | null,
  packageMeasureUnit: string | null,
  factor: number,
  baseUnit: string,
): string {
  const factorStr = factor.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  if (packageQty && packageMeasureUnit) {
    return `1 ${purchaseUnit} (${packageQty}${packageMeasureUnit}) = ${factorStr} ${baseUnit}`;
  }
  return `1 ${purchaseUnit} = ${factorStr} ${baseUnit}`;
}

/** All known base unit symbols */
export const BASE_UNITS = ['KG', 'L', 'UN'] as const;

/** Package measure unit options for the form */
export const PACKAGE_MEASURE_UNITS = ['ml', 'L', 'g', 'kg', 'un'] as const;

/** Purchase unit options for the form */
export const PURCHASE_UNITS = [
  'UN', 'KG', 'L', 'Pacote', 'Saco', 'Caixa', 'Galão', 'Lata',
  'Fardo', 'CX', 'PCT', 'Garrafa', 'Sachê', 'Balde', 'Bag', 'Bandeja',
] as const;

// ─── Stock Layer Decomposition ───

export interface StockLayers {
  /** Full packages count */
  packages: number;
  /** Remaining quantity in base unit */
  remainder: number;
  /** Purchase unit label */
  purchaseUnit: string;
  /** Base unit label */
  baseUnit: string;
  /** Whether layered display makes sense for this item */
  hasLayers: boolean;
}

/**
 * Decompose a base-unit stock balance into full packages + remainder.
 *
 * Example: saldoBase=7.6, factor=0.9, purchaseUnit='Garrafa', baseUnit='L'
 *   → { packages: 8, remainder: 0.4, purchaseUnit: 'Garrafa', baseUnit: 'L', hasLayers: true }
 */
export function decomposeStockLayers(
  saldoBase: number,
  conversionFactor: number,
  purchaseUnit: string,
  baseUnit: string,
): StockLayers {
  // No layering if same unit or invalid factor
  if (!purchaseUnit || purchaseUnit === baseUnit || conversionFactor <= 0 || conversionFactor === 1 && purchaseUnit === baseUnit) {
    return { packages: 0, remainder: saldoBase, purchaseUnit, baseUnit, hasLayers: false };
  }

  const packages = Math.floor(saldoBase / conversionFactor);
  const remainder = parseFloat((saldoBase - packages * conversionFactor).toFixed(4));

  return {
    packages,
    remainder: Math.max(0, remainder), // avoid -0 from float math
    purchaseUnit,
    baseUnit,
    hasLayers: true,
  };
}

/**
 * Format stock layers as a human-readable string.
 *
 * Example: "8 garrafas + 0,4 L" or "3 pacotes + 1,2 kg"
 */
export function formatStockLayers(layers: StockLayers): string {
  if (!layers.hasLayers) {
    return `${layers.remainder.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${layers.baseUnit}`;
  }
  const pkgStr = `${layers.packages} ${layers.purchaseUnit}`;
  if (layers.remainder <= 0.001) return pkgStr;
  const remStr = `${layers.remainder.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${layers.baseUnit}`;
  return `${pkgStr} + ${remStr}`;
}
