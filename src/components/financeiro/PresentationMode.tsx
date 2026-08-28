import { type ComponentProps, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Maximize2,
  Minimize2,
  Printer,
  Settings2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import PresentationSlideCanvas from '@/components/financeiro/PresentationSlideCanvas';
import type { PresentationSociosData } from '@/lib/financeiroPresentationAdapter';
import {
  presentationFilename,
} from '@/lib/presentationFormatting';
import { isPresentationSlideExportable } from '@/lib/presentationSlides';
import type { PresentationExportProgress } from '@/lib/presentationPdfExport';
import { getPresentationChapter, PRESENTATION_CHAPTERS } from '@/domain/financeiro/presentation';

interface PresentationModeProps {
  data: PresentationSociosData;
  canExport: boolean;
  onClose: () => void;
  displayMode?: 'overlay' | 'embedded';
  unitName?: string | null;
  toolbar?: ReactNode;
  onOpenExpenseCategory?: (categoryId: string) => void;
  onOpenResultDetail?: (target: 'revenue' | 'expense' | 'result' | 'margin') => void;
}

type ExportKind = 'pdf' | 'pptx' | 'print';

interface ExportJob extends PresentationExportProgress {
  kind: ExportKind;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
const PRESENTATION_DESIGN_WIDTH = 1280;
const PRESENTATION_DESIGN_HEIGHT = 720;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function nextPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.matches('input, select, textarea, [contenteditable="true"]')
      || Boolean(target.closest('[role="listbox"], [role="menu"]')));
}

function PresentationScreenViewport(props: ComponentProps<typeof PresentationSlideCanvas>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const updateScale = () => {
      const bounds = viewportRef.current?.getBoundingClientRect();
      if (!bounds?.width || !bounds.height) return;
      setScale(Math.min(
        bounds.width / PRESENTATION_DESIGN_WIDTH,
        bounds.height / PRESENTATION_DESIGN_HEIGHT,
      ));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateScale)
      : null;
    if (viewportRef.current) observer?.observe(viewportRef.current);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  return (
    <div ref={viewportRef} className="relative aspect-video w-full overflow-hidden" data-testid="presentation-slide-viewport">
      <div
        className="absolute left-0 top-0"
        style={{
          width: PRESENTATION_DESIGN_WIDTH,
          height: PRESENTATION_DESIGN_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <PresentationSlideCanvas {...props} />
      </div>
    </div>
  );
}

export default function PresentationMode({
  data,
  canExport,
  onClose,
  displayMode = 'overlay',
  unitName,
  toolbar,
  onOpenExpenseCategory,
  onOpenResultDetail,
}: PresentationModeProps) {
  const slides = useMemo(
    () => [...data.slides].sort((left, right) => left.order - right.order),
    [data.slides],
  );
  const exportableSlides = useMemo(
    () => slides.filter(isPresentationSlideExportable),
    [slides],
  );
  const firstSlideByChapter = useMemo(() => new Map(
    PRESENTATION_CHAPTERS.map(chapter => [
      chapter.id,
      slides.findIndex(slide => slide.chapter === chapter.id),
    ]),
  ), [slides]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportBusyRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const goTo = useCallback((index: number) => {
    setCurrentIndex(Math.min(Math.max(index, 0), Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  const close = useCallback(() => {
    exportAbortRef.current?.abort();
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
    closeRef.current();
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const scrollPosition = { x: window.scrollX, y: window.scrollY };
    if (displayMode === 'overlay') document.body.style.overflow = 'hidden';
    if (displayMode === 'overlay') closeButtonRef.current?.focus();
    else rootRef.current?.focus();

    return () => {
      if (displayMode === 'overlay') document.body.style.overflow = previousOverflow;
      if (
        displayMode === 'overlay'
        && (window.scrollX !== scrollPosition.x || window.scrollY !== scrollPosition.y)
      ) {
        window.scrollTo(scrollPosition.x, scrollPosition.y);
      }
      requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [displayMode]);

  useEffect(() => {
    setCurrentIndex(index => Math.min(index, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  useEffect(() => () => {
    exportAbortRef.current?.abort();
    exportAbortRef.current = null;
    exportBusyRef.current = false;
  }, []);

  useEffect(() => {
    setFullscreenSupported(Boolean(document.fullscreenEnabled && rootRef.current?.requestFullscreen));
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement === rootRef.current;
      setNativeFullscreen(isFullscreen);
      if (!isFullscreen && nativeFullscreen && displayMode === 'overlay') closeRef.current();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [displayMode, nativeFullscreen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        displayMode === 'embedded'
        && !nativeFullscreen
        && !rootRef.current?.contains(document.activeElement)
      ) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (exportJob) {
          if (exportJob.cancellable) exportAbortRef.current?.abort();
          return;
        }
        close();
        return;
      }
      if (exportJob) return;
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        setCurrentIndex(index => Math.min(index + 1, slides.length - 1));
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        setCurrentIndex(index => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        setCurrentIndex(0);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        setCurrentIndex(Math.max(slides.length - 1, 0));
        return;
      }
      if (event.key === 'Tab' && rootRef.current && (displayMode === 'overlay' || nativeFullscreen)) {
        const focusable = Array.from(rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close, displayMode, exportJob, nativeFullscreen, slides.length]);

  const toggleNativeFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (rootRef.current?.requestFullscreen) {
        await rootRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error('Erro ao alternar tela cheia:', error);
      toast.info('O navegador não permitiu a tela cheia; a apresentação continuará neste modo.');
    }
  }, []);

  const updateExportProgress = useCallback((kind: ExportKind, progress: PresentationExportProgress) => {
    setExportJob({ kind, ...progress });
  }, []);

  const runExport = useCallback(async (kind: Exclude<ExportKind, 'print'>) => {
    if (!canExport || exportBusyRef.current) return;
    exportBusyRef.current = true;
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportJob({ kind, completed: 0, total: exportableSlides.length, message: 'Carregando exportador', cancellable: true });

    try {
      if (kind === 'pdf') {
        const { createPresentationPdfBlob } = await import('@/lib/presentationPdfExport');
        const blob = await createPresentationPdfBlob(data, {
          signal: controller.signal,
          onProgress: progress => updateExportProgress(kind, progress),
        });
        downloadBlob(blob, presentationFilename(data, 'pdf'));
        toast.success('PDF gerado com sucesso.');
      } else {
        const { createPresentationPptxBlob } = await import('@/lib/presentationPptxExport');
        const blob = await createPresentationPptxBlob(data, {
          signal: controller.signal,
          onProgress: progress => updateExportProgress(kind, progress),
        });
        downloadBlob(blob, presentationFilename(data, 'pptx'));
        toast.success('PowerPoint gerado com sucesso.');
      }
    } catch (error) {
      if (isAbortError(error)) toast.info('Exportação cancelada.');
      else {
        console.error(`Erro ao exportar ${kind.toUpperCase()}:`, error);
        toast.error(`Não foi possível gerar o ${kind === 'pdf' ? 'PDF' : 'PowerPoint'}.`);
      }
    } finally {
      exportAbortRef.current = null;
      exportBusyRef.current = false;
      setExportJob(null);
    }
  }, [canExport, data, exportableSlides.length, updateExportProgress]);

  const printPresentation = useCallback(async () => {
    if (!canExport || exportBusyRef.current) return;
    exportBusyRef.current = true;
    setExportJob({ kind: 'print', completed: 0, total: exportableSlides.length, message: 'Preparando impressão', cancellable: false });
    try {
      await nextPaint();
      setExportJob({ kind: 'print', completed: exportableSlides.length, total: exportableSlides.length, message: 'Abrindo impressão', cancellable: false });
      window.print();
    } catch (error) {
      console.error('Erro ao preparar impressão:', error);
      toast.error('Não foi possível abrir a impressão.');
    } finally {
      exportBusyRef.current = false;
      setExportJob(null);
    }
  }, [canExport, exportableSlides.length]);

  const cancelExport = useCallback(() => {
    if (exportJob?.cancellable) exportAbortRef.current?.abort();
  }, [exportJob?.cancellable]);

  if (slides.length === 0) return null;
  const currentSlide = slides[currentIndex];
  const currentChapter = getPresentationChapter(currentSlide.chapter);
  const progressPercent = exportJob && exportJob.total > 0
    ? (exportJob.completed / exportJob.total) * 100
    : 0;

  const shell = (
    <div
      ref={rootRef}
      className={displayMode === 'overlay'
        ? 'presentation-mode fixed inset-0 z-[100] flex min-h-[100dvh] flex-col bg-background text-foreground'
        : 'presentation-mode flex h-[clamp(42rem,78dvh,58rem)] min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm'}
      role={displayMode === 'overlay' ? 'dialog' : 'region'}
      aria-modal={displayMode === 'overlay' ? true : undefined}
      aria-labelledby="presentation-mode-title"
      aria-busy={Boolean(exportJob)}
      data-testid="presentation-mode"
      data-display-mode={displayMode}
      tabIndex={-1}
    >
      <h1 id="presentation-mode-title" className="sr-only">Modo apresentação: {data.periodLabel}</h1>
      <div className="presentation-mode-screen flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-elevated px-3 py-2 sm:px-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Apresentação Sócios</p>
            <p className="break-words text-xs text-muted-foreground">
              {unitName ? `${unitName} · ` : ''}{data.periodLabel} · {currentChapter.label}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canExport ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => { void runExport('pdf'); }} disabled={Boolean(exportJob)} aria-label="Exportar apresentação em PDF" className="border-border bg-card text-foreground hover:bg-surface-hover hover:text-foreground">
                  <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" /> PDF
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { void runExport('pptx'); }} disabled={Boolean(exportJob)} aria-label="Exportar apresentação em PowerPoint" className="border-border bg-card text-foreground hover:bg-surface-hover hover:text-foreground">
                  <Download className="mr-1.5 h-4 w-4" aria-hidden="true" /> PowerPoint
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { void printPresentation(); }} disabled={Boolean(exportJob)} aria-label="Imprimir apresentação" className="border-border bg-card text-foreground hover:bg-surface-hover hover:text-foreground">
                  <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" /> Imprimir
                </Button>
              </>
            ) : null}
            {fullscreenSupported ? (
              <Button type="button" variant="outline" size="icon" onClick={() => { void toggleNativeFullscreen(); }} disabled={Boolean(exportJob)} aria-label={nativeFullscreen ? 'Sair da tela cheia do navegador' : 'Usar tela cheia do navegador'} className="border-border bg-card text-foreground hover:bg-surface-hover hover:text-foreground">
                {nativeFullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
              </Button>
            ) : null}
            <Button
              ref={closeButtonRef}
              type="button"
              variant="outline"
              size={displayMode === 'overlay' ? 'icon' : 'sm'}
              onClick={close}
              disabled={Boolean(exportJob)}
              aria-label={displayMode === 'overlay' ? 'Sair do modo apresentação' : 'Abrir preparação e governança'}
              className="border-border bg-card text-foreground hover:bg-surface-hover hover:text-foreground"
            >
              {displayMode === 'overlay' ? <X className="h-4 w-4" aria-hidden="true" /> : (
                <><Settings2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Preparação</>
              )}
            </Button>
          </div>
        </header>

        {toolbar ? <div className="shrink-0 bg-background p-2 text-foreground">{toolbar}</div> : null}

        <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface-elevated px-3 py-2 sm:px-5" aria-label="Capítulos da apresentação">
          {PRESENTATION_CHAPTERS.map(chapter => {
            const chapterIndex = firstSlideByChapter.get(chapter.id) ?? -1;
            const active = chapter.id === currentSlide.chapter;
            return (
              <button
                key={chapter.id}
                type="button"
                disabled={chapterIndex < 0 || Boolean(exportJob)}
                aria-current={active ? 'step' : undefined}
                onClick={() => goTo(chapterIndex)}
                className={active
                  ? 'rounded-md border border-primary-border bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary-ink'
                  : 'rounded-md border border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground disabled:opacity-40'}
              >
                {chapter.label}
              </button>
            );
          })}
        </nav>

        {exportJob ? (
          <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background-subtle px-4 py-2" role="status" aria-live="polite">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex justify-between gap-3 text-xs text-ink-secondary">
                <span>{exportJob.message}</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <Progress value={progressPercent} className="h-1.5 bg-muted" />
            </div>
            {exportJob.cancellable ? (
              <Button type="button" variant="ghost" size="sm" onClick={cancelExport}>Cancelar</Button>
            ) : null}
          </div>
        ) : null}

        <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
          <div className="w-full max-w-[min(1600px,calc((100dvh-8rem)*16/9))]">
            <PresentationScreenViewport
              key={currentSlide.id}
              slide={currentSlide}
              generatedAt={data.generatedAt}
              slideNumber={currentIndex + 1}
              totalSlides={slides.length}
              onOpenExpenseCategory={onOpenExpenseCategory}
              onOpenResultDetail={onOpenResultDetail}
            />
          </div>
        </main>

        <nav className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface-elevated px-3 py-2 sm:px-5" aria-label="Navegação dos slides">
          <Button type="button" variant="outline" size="sm" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0 || Boolean(exportJob)} aria-label="Slide anterior" className="border-border bg-card text-foreground hover:bg-surface-hover hover:text-foreground">
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Anterior
          </Button>
          <div className="min-w-0 text-center text-sm text-ink-secondary" aria-live="polite" aria-atomic="true">
            <p className="break-words text-xs text-muted-foreground">{currentChapter.label} · {currentSlide.title}</p>
            <p><span className="font-semibold text-foreground">{currentIndex + 1}</span> de {slides.length}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => goTo(currentIndex + 1)} disabled={currentIndex === slides.length - 1 || Boolean(exportJob)} aria-label="Próximo slide" className="border-border bg-card text-foreground hover:bg-surface-hover hover:text-foreground">
            Próximo <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </nav>
      </div>

      {exportJob?.kind === 'print' ? (
        <section className="presentation-print-root" aria-label="Apresentação para impressão">
          {exportableSlides.map((slide, index) => (
            <PresentationSlideCanvas
              key={`print-${slide.id}`}
              slide={slide}
              generatedAt={data.generatedAt}
              slideNumber={index + 1}
              totalSlides={exportableSlides.length}
              className="presentation-print-slide"
            />
          ))}
        </section>
      ) : null}
    </div>
  );

  return displayMode === 'overlay' ? createPortal(shell, document.body) : shell;
}
