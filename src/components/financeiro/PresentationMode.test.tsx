import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import PresentationMode from '@/components/financeiro/PresentationMode';
import { createPresentationSociosData } from '@/test/fixtures/presentationSocios';
import { createPresentationWithRevenue } from '@/test/fixtures/presentationRevenue';
import { createPresentationWithExpenses } from '@/test/fixtures/presentationExpenses';
import { createPresentationWithInsights } from '@/test/fixtures/presentationInsights';

const exportMocks = vi.hoisted(() => ({
  pdf: vi.fn(),
  pptx: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/presentationPdfExport', () => ({
  createPresentationPdfBlob: exportMocks.pdf,
}));

vi.mock('@/lib/presentationPptxExport', () => ({
  createPresentationPptxBlob: exportMocks.pptx,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  exportMocks.pdf.mockReset();
  exportMocks.pptx.mockReset();
});

describe('modo apresentação', () => {
  it('abre embutido com capítulos ordenados, contexto e filtros persistentes', () => {
    const close = vi.fn();
    render(
      <PresentationMode
        data={createPresentationSociosData()}
        canExport={false}
        displayMode="embedded"
        unitName="Moralles Centro"
        toolbar={<input aria-label="Filtro persistente" defaultValue="2026-03" />}
        onClose={close}
      />,
    );

    const chapterNavigation = screen.getByRole('navigation', { name: /capítulos da apresentação/i });
    const chapterButtons = Array.from(chapterNavigation.querySelectorAll('button'));
    expect(chapterButtons.map(button => button.textContent)).toEqual([
      'Faturamento',
      'Despesas',
      'Resultados',
      'Insights',
    ]);
    expect(screen.getByText(/moralles centro · março de 2026 · faturamento/i)).toBeInTheDocument();

    const filter = screen.getByRole('textbox', { name: /filtro persistente/i });
    fireEvent.change(filter, { target: { value: '2026-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Despesas' }));
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === '2 de 8')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resultados' }));
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === '3 de 8')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Insights' }));
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === '8 de 8')).toBeInTheDocument();
    expect(filter).toHaveValue('2026-04');
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /abrir preparação e governança/i }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('usa apenas superfícies e cores semânticas compatíveis com os dois temas', () => {
    render(
      <PresentationMode
        data={createPresentationSociosData()}
        canExport={false}
        displayMode="embedded"
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('presentation-mode')).toHaveClass('bg-background', 'text-foreground');
    expect(document.querySelector('article.presentation-slide')).toHaveClass('bg-card', 'text-card-foreground');
    expect(screen.getByRole('button', { name: 'Faturamento' })).toHaveClass(
      'bg-primary-soft',
      'text-primary-ink',
    );
  });

  it('mantém filtros, capítulos e contagem com os três slides reais de Faturamento', () => {
    render(
      <PresentationMode
        data={createPresentationWithRevenue()}
        canExport={false}
        displayMode="embedded"
        toolbar={<input aria-label="Anos persistentes" defaultValue="2024,2025,2026" />}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === '1 de 12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Despesas' }));
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === '6 de 12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Faturamento' }));
    expect(screen.getByRole('textbox', { name: /anos persistentes/i })).toHaveValue('2024,2025,2026');
  });

  it('não usa as setas da apresentação enquanto um filtro está sendo editado', () => {
    render(
      <PresentationMode
        data={createPresentationSociosData()}
        canExport={false}
        displayMode="embedded"
        toolbar={<input aria-label="Mês em edição" defaultValue="2026-03" />}
        onClose={() => {}}
      />,
    );
    const input = screen.getByRole('textbox', { name: /mês em edição/i });
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === '1 de 8')).toBeInTheDocument();
  });

  it('navega por teclado com setas, PageUp/PageDown, Home e End', () => {
    render(<PresentationMode data={createPresentationSociosData()} canExport={false} onClose={() => {}} />);

    const position = (value: string) => screen.getByText((_, element) => (
      element?.tagName === 'P' && element.textContent === value
    ));
    expect(position('1 de 8')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(position('2 de 8')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(position('3 de 8')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(position('4 de 8')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(position('3 de 8')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'End' });
    expect(position('8 de 8')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(position('7 de 8')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Home' });
    expect(position('1 de 8')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(position('1 de 8')).toBeInTheDocument();
  });

  it('navega pelas duas páginas de Insights mantendo a ordem do registry', () => {
    render(
      <PresentationMode
        data={createPresentationWithInsights()}
        canExport={false}
        displayMode="embedded"
        onClose={() => {}}
      />,
    );
    const position = (value: string) => screen.getByText((_, element) => (
      element?.tagName === 'P' && element.textContent === value
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Insights' }));
    expect(position('16 de 17')).toBeInTheDocument();
    expect(screen.getByText('Pessoas concentrou despesas no mês')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(position('17 de 17')).toBeInTheDocument();
    expect(screen.getByText('Despesas aumentaram no mês')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(position('16 de 17')).toBeInTheDocument();
  });

  it('oferece controles de exportação somente com a permissão export', () => {
    const { rerender } = render(
      <PresentationMode data={createPresentationSociosData()} canExport={false} onClose={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: /exportar apresentação em pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /powerpoint/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /imprimir apresentação/i })).not.toBeInTheDocument();

    rerender(<PresentationMode data={createPresentationSociosData()} canExport onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /exportar apresentação em pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar apresentação em powerpoint/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /imprimir apresentação/i })).toBeInTheDocument();
  });

  it('fecha com Escape e restaura foco e estado de rolagem da página', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Abrir apresentação</button>
          {open ? (
            <PresentationMode
              data={createPresentationSociosData()}
              canExport={false}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /abrir apresentação/i });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByTestId('presentation-mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sair do modo apresentação/i })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('presentation-mode')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body.style.overflow).toBe('');
  });

  it('usa o mesmo conjunto paginado na impressão e aciona window.print', async () => {
    let printedSlideCount = 0;
    let printedText = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      printedSlideCount = document.querySelectorAll('.presentation-print-slide').length;
      printedText = document.querySelector('.presentation-print-root')?.textContent ?? '';
    });
    render(<PresentationMode data={createPresentationSociosData()} canExport onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /imprimir apresentação/i }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(printedSlideCount).toBe(8);
    expect(printedText).toContain('Março de 2026');
    expect(printedText).toContain('R$1.200,00');
    expect(printedText).toContain('R$700,00');
    expect(printedText).toContain('R$500,00');
    expect(printedText).toContain('41,7%');
    expect(printedText).toContain('Base zero - indisponível');
    expect(printedText).toContain('Efeito de despesa');
    expect(printedText).toContain('R$100,00');
    expect(printedText).toContain('Valores informativos e separados');
  });

  it('imprime os mesmos quatro slides reais de Despesas sem habilitar interações no papel', async () => {
    let printedSlideCount = 0;
    let printedText = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      printedSlideCount = document.querySelectorAll('.presentation-print-slide').length;
      printedText = document.querySelector('.presentation-print-root')?.textContent ?? '';
    });
    const data = createPresentationWithExpenses();
    render(<PresentationMode data={data} canExport onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /imprimir apresentação/i }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(printedSlideCount).toBe(data.slides.filter(slide => (
      slide.availability.state === 'available'
      || slide.availability.state === 'empty'
      || (slide.availability.state === 'unavailable' && slide.availability.reason === 'not-requested')
    )).length);
    expect(printedText).toContain('Redução de despesas');
    expect(printedText).toContain('Insumos');
    expect(printedText).toContain('Despesas financeiras — DFC · Regime de caixa');
  });

  it('imprime as mesmas páginas de Insights sem controles de drill-down', async () => {
    let printedSlideCount = 0;
    let printedText = '';
    let printedButtonCount = -1;
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      const printRoot = document.querySelector('.presentation-print-root');
      printedSlideCount = printRoot?.querySelectorAll('.presentation-print-slide').length ?? 0;
      printedText = printRoot?.textContent ?? '';
      printedButtonCount = printRoot?.querySelectorAll('button').length ?? 0;
    });
    const data = createPresentationWithInsights();
    render(<PresentationMode data={data} canExport onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /imprimir apresentação/i }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(printedSlideCount).toBe(17);
    expect(printedText).toContain('Pessoas concentrou despesas no mês');
    expect(printedText).toContain('Faturamento bruto — Fechamento de Caixa');
    expect(printedText).toContain('Despesas financeiras — regime de caixa do DFC');
    expect(printedButtonCount).toBe(0);
  });

  it('mantém o modo ativo quando o navegador recusa tela cheia nativa', async () => {
    const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
    const requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen');
    const requestFullscreen = vi.fn().mockRejectedValue(new Error('Fullscreen denied'));
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: requestFullscreen });

    try {
      render(<PresentationMode data={createPresentationSociosData()} canExport={false} onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /usar tela cheia do navegador/i }));

      await waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
      await waitFor(() => expect(toast.info).toHaveBeenCalledWith(
        'O navegador não permitiu a tela cheia; a apresentação continuará neste modo.',
      ));
      expect(screen.getByTestId('presentation-mode')).toBeInTheDocument();
    } finally {
      if (fullscreenEnabledDescriptor) Object.defineProperty(document, 'fullscreenEnabled', fullscreenEnabledDescriptor);
      else Reflect.deleteProperty(document, 'fullscreenEnabled');
      if (requestFullscreenDescriptor) Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', requestFullscreenDescriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
    }
  });

  it('mantém Tab e Shift+Tab presos aos controles do diálogo', () => {
    render(<PresentationMode data={createPresentationSociosData()} canExport={false} onClose={() => {}} />);

    const close = screen.getByRole('button', { name: /sair do modo apresentação/i });
    const next = screen.getByRole('button', { name: /próximo slide/i });
    expect(close).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(next).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('desconecta ResizeObserver ao fechar o modo apresentação', () => {
    const disconnect = vi.fn();
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() { disconnect(); }
    } as unknown as typeof ResizeObserver;

    const view = render(
      <PresentationMode data={createPresentationSociosData()} canExport={false} onClose={() => {}} />,
    );
    view.unmount();

    expect(disconnect).toHaveBeenCalledOnce();
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('remove listeners globais ao desmontar', () => {
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const view = render(
      <PresentationMode data={createPresentationSociosData()} canExport={false} onClose={() => {}} />,
    );

    view.unmount();

    expect(windowRemove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(windowRemove).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(documentRemove).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
  });

  it('aborta a exportação quando o modo é desmontado pela rota', async () => {
    let receivedSignal: AbortSignal | undefined;
    exportMocks.pdf.mockImplementation((_data, options) => {
      receivedSignal = options.signal;
      return new Promise(() => {});
    });
    const view = render(
      <PresentationMode data={createPresentationSociosData()} canExport onClose={() => {}} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /exportar apresentação em pdf/i }));
    await waitFor(() => expect(receivedSignal).toBeDefined());
    view.unmount();

    expect(receivedSignal?.aborted).toBe(true);
  });

  it('revoga a URL temporária após concluir o download', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:presentation-cleanup');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportMocks.pdf.mockResolvedValue(new Blob(['pdf']));

    try {
      render(<PresentationMode data={createPresentationSociosData()} canExport onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /exportar apresentação em pdf/i }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(revokeObjectURL).not.toHaveBeenCalled();

      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:presentation-cleanup');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancela exportação em andamento e libera novamente os controles', async () => {
    exportMocks.pdf.mockImplementation((_data, options) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(new DOMException('Exportação cancelada.', 'AbortError'));
      }, { once: true });
    }));
    render(<PresentationMode data={createPresentationSociosData()} canExport onClose={() => {}} />);

    const pdf = screen.getByRole('button', { name: /exportar apresentação em pdf/i });
    fireEvent.click(pdf);
    const cancel = await screen.findByRole('button', { name: /cancelar/i });
    expect(screen.getByTestId('presentation-mode')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /próximo slide/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /sair do modo apresentação/i })).toBeDisabled();
    fireEvent.click(cancel);

    await waitFor(() => expect(cancel).not.toBeInTheDocument());
    expect(pdf).toBeEnabled();
    expect(toast.info).toHaveBeenCalledWith('Exportação cancelada.');
  });

  it('usa Escape para cancelar a exportação sem fechar a apresentação', async () => {
    exportMocks.pdf.mockImplementation((_data, options) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(new DOMException('Exportação cancelada.', 'AbortError'));
      }, { once: true });
    }));
    const close = vi.fn();
    render(<PresentationMode data={createPresentationSociosData()} canExport onClose={close} />);

    fireEvent.click(screen.getByRole('button', { name: /exportar apresentação em pdf/i }));
    await screen.findByRole('button', { name: /cancelar/i });
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('Exportação cancelada.'));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByTestId('presentation-mode')).toBeInTheDocument();
  });

  it('impede duas exportações concorrentes do mesmo snapshot', async () => {
    let finishExport: ((blob: Blob) => void) | undefined;
    exportMocks.pptx.mockImplementation(() => new Promise<Blob>(resolve => {
      finishExport = resolve;
    }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:presentation-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<PresentationMode data={createPresentationSociosData()} canExport onClose={() => {}} />);

    const pptx = screen.getByRole('button', { name: /exportar apresentação em powerpoint/i });
    fireEvent.click(pptx);
    fireEvent.click(pptx);

    await waitFor(() => expect(exportMocks.pptx).toHaveBeenCalledOnce());
    finishExport?.(new Blob(['pptx']));
    await waitFor(() => expect(pptx).toBeEnabled());
  });
});
