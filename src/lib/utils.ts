import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Strip diacritics (accents) and lowercase a string for search comparison.
 * "Açúcar" → "acucar", "Limão" → "limao", "Óleo" → "oleo"
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Check if `haystack` contains `needle` using accent-insensitive,
 * case-insensitive comparison.
 */
export function includesNormalized(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return normalizeSearchText(haystack).includes(normalizeSearchText(needle));
}
