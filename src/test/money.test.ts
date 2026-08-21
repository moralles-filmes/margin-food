import { describe, it, expect } from "vitest";
import { normalizeBRLMoneyToNumber, fmtBRL, fmtBRLRaw, fmtBRLCompact } from "@/lib/money";
import { formatPercentBR, formatDecimalBR, formatIntegerBR, formatFixedBR, formatMoneyBR, formatQuantityBR } from "@/lib/formatters";
import { parseDecimal } from "@/components/ui/decimal-input";

describe("normalizeBRLMoneyToNumber", () => {
  it('"1,90" → 1.9', () => {
    expect(normalizeBRLMoneyToNumber("1,90")).toBe(1.9);
  });

  it('"1.900,50" → 1900.5', () => {
    expect(normalizeBRLMoneyToNumber("1.900,50")).toBe(1900.5);
  });

  it('"R$ 2.345,67" → 2345.67', () => {
    expect(normalizeBRLMoneyToNumber("R$ 2.345,67")).toBe(2345.67);
  });

  it('"R$2.345,67" → 2345.67 (no space)', () => {
    expect(normalizeBRLMoneyToNumber("R$2.345,67")).toBe(2345.67);
  });

  it('"" → null', () => {
    expect(normalizeBRLMoneyToNumber("")).toBeNull();
  });

  it('"abc" → null', () => {
    expect(normalizeBRLMoneyToNumber("abc")).toBeNull();
  });

  it('"1.90" → 1.9', () => {
    expect(normalizeBRLMoneyToNumber("1.90")).toBe(1.9);
  });

  it('"1900,50" → 1900.5', () => {
    expect(normalizeBRLMoneyToNumber("1900,50")).toBe(1900.5);
  });

  it("null → null", () => {
    expect(normalizeBRLMoneyToNumber(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(normalizeBRLMoneyToNumber(undefined)).toBeNull();
  });
});

describe("fmtBRL (money display)", () => {
  it('1900.5 → "R$1.900,50" (no space)', () => {
    expect(fmtBRL(1900.5)).toBe("R$1.900,50");
  });

  it('0 → "R$0,00"', () => {
    expect(fmtBRL(0)).toBe("R$0,00");
  });

  it('0.5 → "R$0,50"', () => {
    expect(fmtBRL(0.5)).toBe("R$0,50");
  });

  it('0.05 → "R$0,05"', () => {
    expect(fmtBRL(0.05)).toBe("R$0,05");
  });

  it('1000 → "R$1.000,00"', () => {
    expect(fmtBRL(1000)).toBe("R$1.000,00");
  });

  it('100000 → "R$100.000,00"', () => {
    expect(fmtBRL(100000)).toBe("R$100.000,00");
  });

  it('null → "R$0,00"', () => {
    expect(fmtBRL(null)).toBe("R$0,00");
  });
});

describe("fmtBRLRaw (no symbol)", () => {
  it('1000 → "1.000,00"', () => {
    expect(fmtBRLRaw(1000)).toBe("1.000,00");
  });
});

describe("fmtBRLCompact", () => {
  it('1500 → "R$1,5k" (no space)', () => {
    expect(fmtBRLCompact(1500)).toBe("R$1,5k");
  });

  it('2500000 → "R$2,5M" (no space)', () => {
    expect(fmtBRLCompact(2500000)).toBe("R$2,5M");
  });
});

describe("formatPercentBR (always 2 decimals)", () => {
  it('10 → "10,00%"', () => {
    expect(formatPercentBR(10)).toBe("10,00%");
  });

  it('10.5 → "10,50%"', () => {
    expect(formatPercentBR(10.5)).toBe("10,50%");
  });

  it('0.5 → "0,50%"', () => {
    expect(formatPercentBR(0.5)).toBe("0,50%");
  });

  it('100 → "100,00%"', () => {
    expect(formatPercentBR(100)).toBe("100,00%");
  });

  it('1.5 → "1,50%"', () => {
    expect(formatPercentBR(1.5)).toBe("1,50%");
  });

  it('null → "0,00%"', () => {
    expect(formatPercentBR(null)).toBe("0,00%");
  });
});

describe("formatDecimalBR", () => {
  it('5.2 → "5,2"', () => {
    expect(formatDecimalBR(5.2)).toBe("5,2");
  });

  it('12 → "12"', () => {
    expect(formatDecimalBR(12)).toBe("12");
  });
});

describe("formatIntegerBR", () => {
  it('2300 → "2.300"', () => {
    expect(formatIntegerBR(2300)).toBe("2.300");
  });

  it('12 → "12"', () => {
    expect(formatIntegerBR(12)).toBe("12");
  });
});

describe("formatFixedBR", () => {
  it('5.2, 2 → "5,20"', () => {
    expect(formatFixedBR(5.2, 2)).toBe("5,20");
  });
});

describe("formatMoneyBR", () => {
  it('5000 with symbol → "R$5.000,00"', () => {
    expect(formatMoneyBR(5000)).toBe("R$5.000,00");
  });

  it('5000 without symbol → "5.000,00"', () => {
    expect(formatMoneyBR(5000, false)).toBe("5.000,00");
  });
});

describe("formatQuantityBR", () => {
  it('1500.5, "kg" → "1.500,50 kg"', () => {
    expect(formatQuantityBR(1500.5, "kg")).toBe("1.500,50 kg");
  });

  it('1500, "un", 0 → "1.500 un"', () => {
    expect(formatQuantityBR(1500, "un", 0)).toBe("1.500 un");
  });
});

describe("parseDecimal (DecimalInput)", () => {
  it('"1,5" → 1.5', () => {
    expect(parseDecimal("1,5")).toBe(1.5);
  });

  it('"1.5" → 1.5', () => {
    expect(parseDecimal("1.5")).toBe(1.5);
  });

  it('"" → null', () => {
    expect(parseDecimal("")).toBeNull();
  });

  it('"." → null', () => {
    expect(parseDecimal(".")).toBeNull();
  });

  it('"," → null', () => {
    expect(parseDecimal(",")).toBeNull();
  });

  it('"-" → null', () => {
    expect(parseDecimal("-")).toBeNull();
  });

  it('"10" → 10', () => {
    expect(parseDecimal("10")).toBe(10);
  });

  it('"0,001" → 0.001', () => {
    expect(parseDecimal("0,001")).toBe(0.001);
  });
});
