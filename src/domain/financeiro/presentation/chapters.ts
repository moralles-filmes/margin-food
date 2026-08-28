export const PRESENTATION_CHAPTERS = [
  { id: 'revenue', label: 'Faturamento', order: 0 },
  { id: 'expenses', label: 'Despesas', order: 1 },
  { id: 'results', label: 'Resultados', order: 2 },
  { id: 'insights', label: 'Insights', order: 3 },
] as const;

export type PresentationChapterId = typeof PRESENTATION_CHAPTERS[number]['id'];

export function getPresentationChapter(chapterId: PresentationChapterId) {
  return PRESENTATION_CHAPTERS.find(chapter => chapter.id === chapterId)!;
}

