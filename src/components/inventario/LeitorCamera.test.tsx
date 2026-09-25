import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LeitorCamera from '@/components/inventario/LeitorCamera';
import type { useLeitorCamera } from '@/hooks/useLeitorCamera';
import { MENSAGEM_ERRO_CAMERA } from '@/domain/estoque/leituraCamera';

type RetornoHook = ReturnType<typeof useLeitorCamera>;

// O hook (câmera, detector, lanterna) é coberto em useLeitorCamera.test.tsx;
// aqui só o que a tela mostra para cada estado.
const hook = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock('@/hooks/useLeitorCamera', () => ({ useLeitorCamera: () => hook.atual }));

function estadoHook(parcial: Partial<RetornoHook> = {}): RetornoHook {
  return {
    estado: { fase: 'lendo' },
    videoRef: { current: null },
    lanterna: { disponivel: false, ligada: false, alternar: vi.fn() },
    zoom: { disponivel: false, ativo: false, alternar: vi.fn() },
    aviso: null,
    ...parcial,
  };
}

function renderizar(parcial?: Partial<RetornoHook>) {
  hook.atual = estadoHook(parcial);
  const onFechar = vi.fn();
  render(<LeitorCamera pausado={false} oculto={false} onCodigo={vi.fn()} onFechar={onFechar} />);
  return { onFechar, hook: hook.atual as RetornoHook };
}

afterEach(cleanup);

describe('LeitorCamera', () => {
  it('erro da câmera mostra a orientação e o botão de fechar', () => {
    const { onFechar } = renderizar({ estado: { fase: 'erro', erro: 'negado' } });

    expect(screen.getByRole('alert')).toHaveTextContent(MENSAGEM_ERRO_CAMERA.negado);
    expect(screen.queryByLabelText('Imagem da câmera')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /fechar câmera/i }));
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('enquanto abre, avisa que a câmera está abrindo', () => {
    renderizar({ estado: { fase: 'iniciando' } });
    expect(screen.getByText('Abrindo câmera…')).toBeInTheDocument();
  });

  it('sem lanterna e zoom no aparelho, só mostra o fechar', () => {
    renderizar();
    expect(screen.getByLabelText('Imagem da câmera')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lanterna' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zoom 2x' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fechar câmera/i })).toBeInTheDocument();
  });

  it('lanterna e zoom são botões liga/desliga com nome fixo', () => {
    const { hook: h } = renderizar({
      lanterna: { disponivel: true, ligada: true, alternar: vi.fn() },
      zoom: { disponivel: true, ativo: false, alternar: vi.fn() },
    });

    const lanterna = screen.getByRole('button', { name: 'Lanterna' });
    expect(lanterna).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(lanterna);
    expect(h.lanterna.alternar).toHaveBeenCalledTimes(1);

    const zoom = screen.getByRole('button', { name: 'Zoom 2x' });
    expect(zoom).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(zoom);
    expect(h.zoom.alternar).toHaveBeenCalledTimes(1);
  });

  it('ajuste que o aparelho recusou aparece na tela', () => {
    renderizar({ aviso: 'Não foi possível ligar a lanterna.' });
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível ligar a lanterna.');
  });
});
