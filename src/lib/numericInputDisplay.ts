export function isZeroNumericValue(value: unknown): boolean {
  if (typeof value === "number") return value === 0;
  if (typeof value !== "string") return false;
  return /\d/.test(value) && !/[1-9]/.test(value);
}

export function stripLeadingZeros(raw: string): string {
  return raw.replace(/^(-?)0+(?=\d)/, "$1");
}

export function parseLooseNumber(raw: string): number {
  if (["", "-", ",", ".", "-,", "-."].includes(raw)) return 0;
  return Number(raw.replace(",", "."));
}
