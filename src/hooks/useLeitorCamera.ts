import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { carregarDetector, type DetectorCodigo } from '@/lib/camera/detectorCodigoBarras';
import {
  classificarErroCamera, criarFiltroRepeticao, dentroDaMira, INTERVALO_LEITURA_CAMERA_MS, type ErroCamera,
} from '@/domain/estoque/leituraCamera';

export type EstadoCamera =
  | { fase: 'iniciando' }
  | { fase: 'lendo' }
  | { fase: 'erro'; erro: ErroCamera };

interface Opcoes {
  /** Com o cartão de quantidade aberto: a câmera fica ligada, mas não analisa. */
  pausado: boolean;
  onCodigo: (codigo: string) => void;
  /** A câmera desligou sozinha (app em segundo plano); a tela deve fechá-la. */
  onEncerrada: () => void;
}

interface Capacidades {
  torch: boolean;
  zoomMin: number;
  zoomMax: number;
}

/** Campos que o Chrome expõe e o lib.dom do TypeScript ainda não tipa. */
type CapacidadesTrilha = MediaTrackCapabilities & { torch?: boolean; zoom?: { min?: number; max?: number } };

function pararStream(stream: MediaStream) {
  stream.getTracks().forEach(t => t.stop());
}

function tocar(video: HTMLVideoElement | null) {
  // play() rejeita se o vídeo ainda não tem fonte ou o navegador barrar; a
  // próxima retomada tenta de novo.
  try { void video?.play()?.catch(() => undefined); } catch { /* idem */ }
}

/**
 * Liga a câmera traseira ao montar e desliga ao desmontar ou quando o app vai
 * para segundo plano. Analisa um quadro por vez, ~8 por segundo, e entrega
 * uma vez só (ver criarFiltroRepeticao) cada código que estiver na mira (ver
 * dentroDaMira). A imagem nunca sai do aparelho.
 */
export function useLeitorCamera({ pausado, onCodigo, onEncerrada }: Opcoes): {
  estado: EstadoCamera;
  videoRef: RefObject<HTMLVideoElement>;
  lanterna: { disponivel: boolean; ligada: boolean; alternar: () => void };
  zoom: { disponivel: boolean; ativo: boolean; alternar: () => void };
  /** Lanterna ou zoom que o aparelho recusou; some no próximo ajuste que der certo. */
  aviso: string | null;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState<EstadoCamera>({ fase: 'iniciando' });
  const [trilha, setTrilha] = useState<MediaStreamTrack | null>(null);
  const [capacidades, setCapacidades] = useState<Capacidades | null>(null);
  const [lanternaLigada, setLanternaLigada] = useState(false);
  const [zoomAtivo, setZoomAtivo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const pausadoRef = useRef(pausado);
  const onCodigoRef = useRef(onCodigo);
  const onEncerradaRef = useRef(onEncerrada);
  const filtroRef = useRef(criarFiltroRepeticao());

  useEffect(() => {
    onCodigoRef.current = onCodigo;
    onEncerradaRef.current = onEncerrada;
  }, [onCodigo, onEncerrada]);

  useEffect(() => {
    const estavaPausado = pausadoRef.current;
    pausadoRef.current = pausado;
    if (estavaPausado && !pausado) {
      filtroRef.current.reiniciar(Date.now());
      // No iPhone o vídeo pode parar enquanto fica escondido.
      tocar(videoRef.current);
    }
  }, [pausado]);

  useEffect(() => {
    let encerrado = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    const desligar = () => {
      encerrado = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      if (stream) pararStream(stream);
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    function aoMudarVisibilidade() {
      if (!document.hidden || encerrado) return;
      desligar();
      onEncerradaRef.current();
    }
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    const ler = (detector: DetectorCodigo, video: HTMLVideoElement) => {
      const ciclo = async () => {
        if (encerrado) return;
        if (!pausadoRef.current && video.readyState >= 2) {
          try {
            const lidos = await detector.detectar(video);
            if (!encerrado && !pausadoRef.current) {
              const agora = Date.now();
              const imagem = { largura: video.videoWidth, altura: video.videoHeight };
              const tela = { largura: video.clientWidth, altura: video.clientHeight };
              const aceito = lidos.find(c => dentroDaMira(c.caixa, imagem, tela) && filtroRef.current.aceitar(c.valor, agora));
              if (aceito) onCodigoRef.current(aceito.valor);
            }
          } catch {
            // Quadro que o leitor não conseguiu analisar: segue para o próximo.
          }
        }
        if (!encerrado) timer = window.setTimeout(() => { void ciclo(); }, INTERVALO_LEITURA_CAMERA_MS);
      };
      void ciclo();
    };

    const iniciar = async () => {
      if (typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        setEstado({ fase: 'erro', erro: 'sem_suporte' });
        return;
      }
      const pedido = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      let detector: DetectorCodigo;
      let recebido: MediaStream;
      try {
        [detector, recebido] = await Promise.all([carregarDetector(), pedido]);
      } catch (erro) {
        // Se só o leitor falhou, a câmera pode ter aberto: não deixar ligada.
        pedido.then(pararStream, () => undefined);
        if (!encerrado) setEstado({ fase: 'erro', erro: classificarErroCamera(erro) });
        return;
      }
      const video = videoRef.current;
      if (encerrado || !video) {
        pararStream(recebido);
        return;
      }
      stream = recebido;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = recebido;
      tocar(video);

      const [primeira] = recebido.getVideoTracks();
      const caps = primeira?.getCapabilities?.() as CapacidadesTrilha | undefined;
      setTrilha(primeira ?? null);
      setCapacidades({
        torch: caps?.torch === true,
        zoomMin: caps?.zoom?.min ?? 1,
        zoomMax: caps?.zoom?.max ?? 1,
      });
      setEstado({ fase: 'lendo' });
      ler(detector, video);
    };

    void iniciar();
    return desligar;
  }, []);

  const alternarLanterna = useCallback(() => {
    if (!trilha) return;
    const ligar = !lanternaLigada;
    trilha.applyConstraints({ advanced: [{ torch: ligar } as MediaTrackConstraintSet] }).then(
      () => { setLanternaLigada(ligar); setAviso(null); },
      erro => {
        console.error('[camera] lanterna', erro);
        setAviso(ligar ? 'Não foi possível ligar a lanterna.' : 'Não foi possível desligar a lanterna.');
      },
    );
  }, [trilha, lanternaLigada]);

  const alternarZoom = useCallback(() => {
    if (!trilha || !capacidades) return;
    const ativar = !zoomAtivo;
    const valor = ativar ? Math.min(2, capacidades.zoomMax) : Math.max(1, capacidades.zoomMin);
    trilha.applyConstraints({ advanced: [{ zoom: valor } as MediaTrackConstraintSet] }).then(
      () => { setZoomAtivo(ativar); setAviso(null); },
      erro => {
        console.error('[camera] zoom', erro);
        setAviso('Não foi possível mudar o zoom.');
      },
    );
  }, [trilha, capacidades, zoomAtivo]);

  return {
    estado,
    videoRef,
    lanterna: { disponivel: capacidades?.torch === true, ligada: lanternaLigada, alternar: alternarLanterna },
    zoom: { disponivel: (capacidades?.zoomMax ?? 1) >= 2, ativo: zoomAtivo, alternar: alternarZoom },
    aviso,
  };
}
