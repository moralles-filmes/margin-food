import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConteinerEstreito } from './useConteinerEstreito';

let observado: ((largura: number) => void) | null = null;
const original = globalThis.ResizeObserver;
const larguraOriginal = window.innerWidth;
const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: px });

beforeEach(() => {
  observado = null;
  largura(1366);
  class ResizeObserverFalso {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      observado = (largura: number) => this.cb([{ contentRect: { width: largura } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverFalso);
});

afterEach(() => {
  vi.stubGlobal('ResizeObserver', original);
  largura(larguraOriginal);
});

function Exemplo({ histerese }: { histerese?: number }) {
  const [ref, estreito] = useConteinerEstreito(1000, histerese);
  return <div ref={ref}>{estreito ? 'lista' : 'tabela'}</div>;
}

describe('useConteinerEstreito', () => {
  it('troca para lista abaixo do limite e só volta à tabela com folga (histerese)', () => {
    render(<Exemplo />);
    expect(screen.getByText('tabela')).toBeInTheDocument();

    act(() => observado?.(990));
    expect(screen.getByText('lista')).toBeInTheDocument();

    // Abrir um diálogo some com a barra de rolagem: +8 px não pode trocar a marcação.
    act(() => observado?.(1008));
    expect(screen.getByText('lista')).toBeInTheDocument();

    act(() => observado?.(1040));
    expect(screen.getByText('tabela')).toBeInTheDocument();
  });

  it('histerese menor para contêiner com largura máxima pouco acima do limite', () => {
    render(<Exemplo histerese={8} />);
    act(() => observado?.(990));
    expect(screen.getByText('lista')).toBeInTheDocument();
    act(() => observado?.(1010));
    expect(screen.getByText('tabela')).toBeInTheDocument();
  });

  it('ignora medida zero (sem layout)', () => {
    render(<Exemplo />);
    act(() => observado?.(0));
    expect(screen.getByText('tabela')).toBeInTheDocument();
  });

  it('antes da primeira medida parte da largura da janela', () => {
    largura(600);
    render(<Exemplo />);
    expect(screen.getByText('lista')).toBeInTheDocument();
    act(() => observado?.(0));
    expect(screen.getByText('lista')).toBeInTheDocument();
  });
});
