import { useEffect, useState } from 'react';

const TIMEOUT_MS = 5_000;
const INTERVALO_OFFLINE_MS = 15_000;
const INTERVALO_MINIMO_VISIBILIDADE_MS = 30_000;

/**
 * Confirma que a rede chega ao Supabase. `no-cors` não depende de CORS: qualquer resposta
 * (opaca) prova a conexão; só erro de rede ou timeout conta como offline.
 */
export async function servidorAlcancavel(): Promise<boolean> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`
    + `?apikey=${encodeURIComponent(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')}&_=${Date.now()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Offline confirmado contra o servidor, não só pelo `navigator.onLine` — o navegador
 * dá falso "offline" (DevTools/Service Worker em modo offline, VPN no macOS) e pode
 * perder o evento `online`. Enquanto offline, reconfere a cada 15s.
 */
export function useServidorOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let ativo = true;
    let verificando = false;
    let repetir = false;
    let ultimaVerificacao = 0;
    let intervalo: ReturnType<typeof setInterval> | undefined;

    const verificar = async () => {
      // A rede mudou durante a verificação: a resposta em curso já pode estar velha.
      if (verificando) { repetir = true; return; }
      verificando = true;
      ultimaVerificacao = Date.now();
      const alcancavel = await servidorAlcancavel();
      verificando = false;
      if (!ativo) return;
      if (repetir) { repetir = false; void verificar(); return; }
      setOffline(!alcancavel);
      if (!alcancavel && !intervalo) {
        intervalo = setInterval(verificar, INTERVALO_OFFLINE_MS);
      } else if (alcancavel && intervalo) {
        clearInterval(intervalo);
        intervalo = undefined;
      }
    };

    const aoMudarVisibilidade = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimaVerificacao < INTERVALO_MINIMO_VISIBILIDADE_MS) return;
      void verificar();
    };
    const aoMudarRede = () => { void verificar(); };

    void verificar();
    window.addEventListener('online', aoMudarRede);
    window.addEventListener('offline', aoMudarRede);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      ativo = false;
      if (intervalo) clearInterval(intervalo);
      window.removeEventListener('online', aoMudarRede);
      window.removeEventListener('offline', aoMudarRede);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, []);

  return offline;
}
