import { useQuery } from '@tanstack/react-query';
import {
  type PresentationCategoryMetadata,
  type PresentationCategoryMetadataMap,
} from '@/domain/financeiro/presentation/dashboard';
import { supabase } from '@/integrations/supabase/client';

export const PRESENTATION_CATEGORY_METADATA_QUERY_ROOT = [
  'financeiro',
  'presentation-socios',
  'category-metadata',
] as const;

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new TypeError(`${path} deve ser texto ou null.`);
  return value;
}

export function parsePresentationCategoryMetadata(payload: unknown): PresentationCategoryMetadataMap {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TypeError('Metadados de categoria devem ser um objeto.');
  }

  const parsed: Record<string, PresentationCategoryMetadata> = {};
  for (const [categoryId, value] of Object.entries(payload)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError(`Metadados da categoria ${categoryId} devem ser um objeto.`);
    }
    const record = value as Record<string, unknown>;
    parsed[categoryId] = {
      group: nullableString(record.group, `${categoryId}.group`),
      dreLine: nullableString(record.dreLine, `${categoryId}.dreLine`),
    };
  }
  return parsed;
}

export async function fetchPresentationCategoryMetadata(): Promise<PresentationCategoryMetadataMap> {
  const { data, error } = await supabase.rpc('get_fin_presentation_category_metadata');
  if (error) throw error;
  return parsePresentationCategoryMetadata(data);
}

export function usePresentationCategoryMetadata(companyId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...PRESENTATION_CATEGORY_METADATA_QUERY_ROOT, companyId ?? 'unresolved'],
    queryFn: fetchPresentationCategoryMetadata,
    enabled: enabled && Boolean(companyId),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}
