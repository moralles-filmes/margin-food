import {
  normalizePresentationPeriod,
  type AvailablePeriodBounds,
  type IsoDate,
  type PresentationPeriodFilter,
  type PresentationPeriodPreset,
} from '@/domain/financeiro/presentation';

export interface PresentationFilterDraft {
  kind: PresentationPeriodPreset;
  month: string;
  startMonth: string;
  endMonth: string;
  year: string;
  through: IsoDate;
  customStart: IsoDate;
  customEnd: IsoDate;
}

function readYear(value: string): number {
  if (!/^\d{4}$/.test(value)) throw new RangeError('Informe um ano com quatro dígitos.');
  return Number(value);
}

export function createPresentationFilterDraft(today: IsoDate): PresentationFilterDraft {
  const month = today.slice(0, 7);
  return {
    kind: 'month',
    month,
    startMonth: month,
    endMonth: month,
    year: today.slice(0, 4),
    through: today,
    customStart: `${month}-01`,
    customEnd: today,
  };
}

export function createPresentationFilterDraftFromFilter(
  filter: PresentationPeriodFilter,
  today: IsoDate,
): PresentationFilterDraft {
  const draft = createPresentationFilterDraft(today);
  switch (filter.kind) {
    case 'month':
      return { ...draft, kind: filter.kind, month: filter.month };
    case 'month-range':
      return {
        ...draft,
        kind: filter.kind,
        startMonth: filter.startMonth,
        endMonth: filter.endMonth,
      };
    case 'year':
      return { ...draft, kind: filter.kind, year: String(filter.year) };
    case 'year-to-date':
      return {
        ...draft,
        kind: filter.kind,
        year: String(filter.year),
        through: filter.through,
      };
    case 'all-time':
      return { ...draft, kind: filter.kind };
    case 'custom':
      return {
        ...draft,
        kind: filter.kind,
        customStart: filter.start,
        customEnd: filter.endInclusive,
      };
  }
}

export function presentationFilterFromDraft(
  draft: PresentationFilterDraft,
  availableBounds?: AvailablePeriodBounds,
): PresentationPeriodFilter {
  let filter: PresentationPeriodFilter;
  switch (draft.kind) {
    case 'month':
      filter = { kind: draft.kind, month: draft.month };
      break;
    case 'month-range':
      filter = { kind: draft.kind, startMonth: draft.startMonth, endMonth: draft.endMonth };
      break;
    case 'year':
      filter = { kind: draft.kind, year: readYear(draft.year) };
      break;
    case 'year-to-date':
      filter = { kind: draft.kind, year: readYear(draft.year), through: draft.through };
      break;
    case 'all-time':
      filter = { kind: draft.kind };
      break;
    case 'custom':
      filter = { kind: draft.kind, start: draft.customStart, endInclusive: draft.customEnd };
      break;
  }
  normalizePresentationPeriod(filter, { availableBounds });
  return filter;
}
