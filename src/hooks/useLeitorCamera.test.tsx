import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLeitorCamera } from '@/hooks/useLeitorCamera';
import { INTERVALO_LEITURA_CAMERA_MS, JANELA_REPETICAO_CAMERA_MS, SemSuporteError } from '@/domain/estoque/leituraCamera';

const mocks = vi.hoisted(() => ({
  carregarDetector: vi.fn(),
  detectar: vi.fn(),
}));

vi.mock('@/lib/camera/detectorCodigoBarras', () => ({ carregarDetector: mocks.carregarDetector }));

interface Opcoes { pausado?: boolean; onCodigo?: (c: string) => void; onEncerrada?: () => void }

function Harness({ pausado = false, onCodigo = vi.fn(), onEncerrada = vi.fn() }: Opcoes) {
  const { estado, videoRef, lanterna, zoom, aviso } = useLeitorCamera({ pausado, onCodigo, onEncerrada });
  return (
    <div>
      <video ref={videoRef} data-testid="video" />
      <span data-testid="fase">{estado.fase === 'erro' ? `erro:${estado.erro}` : estado.fase}</span>
      <span data-testid="aviso">{aviso}</span>
      {lanterna.disponivel && <button onClick={lanterna.alternar}>lanterna {lanterna.ligada ? 'ligada' : 'desligada'}</button>}
      {zoom.disponivel && <button onClick={zoom.alternar}>zoom {zoom.ativo ? '2x' : '1x'}</button>}
    </div>
  );
}

function criarStream(capacidades: Record<string, unknown> = {}) {
  const track = {
    stop: vi.fn(),
    getCapabilities: vi.fn(() => capacidades),
    applyConstraints: vi.fn(async () => undefined),
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

function instalarCamera(getUserMedia: () => Promise<MediaStream>) {
  const fn = vi.fn(getUserMedia);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: fn } });
  return fn;
}

let oculto = false;

async function montar(opcoes: Opcoes = {}) {
  const utils = render(<Harness {...opcoes} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return utils;
}

async function avancar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  oculto = false;
  mocks.detectar.mockReset().mockResolvedValue([]);
  mocks.carregarDetector.mockReset().mockResolvedValue({ origem: 'nativo', detectar: mocks.detectar });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculto });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (document as { hidden?: boolean }).hidden;
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
});

describe('useLeitorCamera', () => {
  it('liga a câmera traseira e passa a ler', async () => {
    const { stream } = criarStream();
    const getUserMedia = instalarCamera(async () => stream);
    await montar();

    expect(screen.getByTestId('fase')).toHaveTextContent('lendo');
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: false,
      video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
    }));
    expect((screen.getByTestId('video') as HTMLVideoElement).srcObject).toBe(stream);
  });

  it('permissão negada vira erro "negado"', async () => {
    instalarCamera(async () => { throw new DOMException('negado', 'NotAllowedError'); });
    await montar();
    expect(screen.getByTestId('fase')).toHaveTextContent('erro:negado');
  });

  it('navegador sem acesso à câmera vira "sem suporte"', async () => {
    await montar();
    expect(screen.getByTestId('fase')).toHaveTextContent('erro:sem_suporte');
  });

  it('leitor que não carregou desliga a câmera que já tinha aberto', async () => {
    const { stream, track } = criarStream();
    instalarCamera(async () => stream);
    mocks.carregarDetector.mockRejectedValue(new SemSuporteError());
    await montar();

    expect(screen.getByTestId('fase')).toHaveTextContent('erro:sem_suporte');
    expect(track.stop).toHaveBeenCalled();
  });

  it('fechar a tela desliga a câmera', async () => {
    const { stream, track } = criarStream();
    instalarCamera(async () => stream);
    const { unmount } = await montar();

    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('câmera que chega depois de fechar a tela é desligada na hora', async () => {
    const { stream, track } = criarStream();
    let liberar: (s: MediaStream) => void = () => undefined;
    instalarCamera(() => new Promise(resolve => { liberar = resolve; }));
    const { unmount } = await montar();

    unmount();
    await act(async () => { liberar(stream); await vi.advanceTimersByTimeAsync(0); });
    expect(track.stop).toHaveBeenCalled();
  });

  it('produto parado na frente da câmera abre uma vez só', async () => {
    instalarCamera(async () => criarStream().stream);
    mocks.detectar.mockResolvedValue([{ valor: '7891234567895' }]);
    const onCodigo = vi.fn();
    await montar({ onCodigo });

    await avancar(INTERVALO_LEITURA_CAMERA_MS * 10);
    expect(onCodigo).toHaveBeenCalledTimes(1);
    expect(onCodigo).toHaveBeenCalledWith('7891234567895');
  });

  it('só abre o código que está dentro da mira', async () => {
    // vídeo 1280x720 numa caixa 400x300: a mira pega o meio da imagem
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(400);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(300);
    instalarCamera(async () => criarStream().stream);
    const prateleira = { valor: '78912342', caixa: { x: 0, y: 330, width: 100, height: 30 } };
    const apontado = { valor: '7891234567895', caixa: { x: 590, y: 345, width: 100, height: 30 } };
    mocks.detectar.mockResolvedValue([prateleira]);
    const onCodigo = vi.fn();
    await montar({ onCodigo });

    await avancar(INTERVALO_LEITURA_CAMERA_MS * 4);
    expect(onCodigo).not.toHaveBeenCalled();

    mocks.detectar.mockResolvedValue([prateleira, apontado]);
    await avancar(INTERVALO_LEITURA_CAMERA_MS * 4);
    expect(onCodigo).toHaveBeenCalledTimes(1);
    expect(onCodigo).toHaveBeenCalledWith('7891234567895');
  });

  it('pausada não analisa a imagem', async () => {
    instalarCamera(async () => criarStream().stream);
    mocks.detectar.mockResolvedValue([{ valor: '7891234567895' }]);
    const onCodigo = vi.fn();
    await montar({ pausado: true, onCodigo });

    await avancar(INTERVALO_LEITURA_CAMERA_MS * 10);
    expect(mocks.detectar).not.toHaveBeenCalled();
    expect(onCodigo).not.toHaveBeenCalled();
  });

  it('ao retomar, o produto que continua na frente não reabre', async () => {
    instalarCamera(async () => criarStream().stream);
    mocks.detectar.mockResolvedValue([{ valor: '7891234567895' }]);
    const onCodigo = vi.fn();
    const { rerender } = await montar({ onCodigo });
    await avancar(INTERVALO_LEITURA_CAMERA_MS);
    expect(onCodigo).toHaveBeenCalledTimes(1);

    // cartão de quantidade aberto por 10 s
    rerender(<Harness pausado onCodigo={onCodigo} />);
    await avancar(10_000);
    rerender(<Harness pausado={false} onCodigo={onCodigo} />);
    await avancar(INTERVALO_LEITURA_CAMERA_MS * 8);
    expect(onCodigo).toHaveBeenCalledTimes(1);

    // tirou o produto da frente por mais que a janela: vale de novo
    mocks.detectar.mockResolvedValue([]);
    await avancar(JANELA_REPETICAO_CAMERA_MS + INTERVALO_LEITURA_CAMERA_MS);
    mocks.detectar.mockResolvedValue([{ valor: '7891234567895' }]);
    await avancar(INTERVALO_LEITURA_CAMERA_MS * 2);
    expect(onCodigo).toHaveBeenCalledTimes(2);
  });

  it('quadro com erro de análise não derruba a leitura', async () => {
    instalarCamera(async () => criarStream().stream);
    mocks.detectar.mockRejectedValueOnce(new Error('quadro ruim')).mockResolvedValue([{ valor: '78912342' }]);
    const onCodigo = vi.fn();
    await montar({ onCodigo });

    await avancar(INTERVALO_LEITURA_CAMERA_MS * 3);
    expect(onCodigo).toHaveBeenCalledWith('78912342');
  });

  it('ir para outro app desliga a câmera e avisa a tela', async () => {
    const { stream, track } = criarStream();
    instalarCamera(async () => stream);
    const onEncerrada = vi.fn();
    await montar({ onEncerrada });

    oculto = true;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(track.stop).toHaveBeenCalled();
    expect(onEncerrada).toHaveBeenCalledTimes(1);
  });

  it('lanterna e zoom só aparecem quando o aparelho oferece', async () => {
    instalarCamera(async () => criarStream().stream);
    await montar();
    expect(screen.queryByText(/lanterna/)).not.toBeInTheDocument();
    expect(screen.queryByText(/zoom/)).not.toBeInTheDocument();
  });

  it('liga a lanterna e o zoom 2x pela câmera', async () => {
    const { stream, track } = criarStream({ torch: true, zoom: { min: 1, max: 5 } });
    instalarCamera(async () => stream);
    await montar();

    await act(async () => { fireEvent.click(screen.getByText('lanterna desligada')); });
    expect(track.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ torch: true }] });
    expect(screen.getByText('lanterna ligada')).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByText('zoom 1x')); });
    expect(track.applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ zoom: 2 }] });
    expect(screen.getByText('zoom 2x')).toBeInTheDocument();
  });

  it('lanterna que o aparelho recusa avisa na tela; o próximo ajuste certo limpa o aviso', async () => {
    const { stream, track } = criarStream({ torch: true, zoom: { min: 1, max: 5 } });
    track.applyConstraints.mockRejectedValueOnce(new DOMException('ocupada', 'NotReadableError'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    instalarCamera(async () => stream);
    await montar();

    await act(async () => { fireEvent.click(screen.getByText('lanterna desligada')); });
    expect(screen.getByText('lanterna desligada')).toBeInTheDocument();
    expect(screen.getByTestId('aviso')).toHaveTextContent('Não foi possível ligar a lanterna.');

    await act(async () => { fireEvent.click(screen.getByText('zoom 1x')); });
    expect(screen.getByTestId('aviso')).toBeEmptyDOMElement();
  });
});
