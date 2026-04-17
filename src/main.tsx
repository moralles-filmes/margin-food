import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { clearSwAndReload } from "./lib/swRecovery.ts";

const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';

function isChunkError(msg: string): boolean {
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Failed to load module script')
  );
}

window.addEventListener('error', (event) => {
  if (!isChunkError(event.message ?? '')) return;
  event.preventDefault();
  try {
    if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      window.location.reload();
    } else {
      // Second consecutive chunk error: SW cache is stale — clear and reload
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      void clearSwAndReload();
    }
  } catch { void clearSwAndReload(); }
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason instanceof Error
    ? event.reason.message
    : String(event.reason ?? '');
  if (!isChunkError(msg)) return;
  event.preventDefault();
  try {
    if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      window.location.reload();
    } else {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      void clearSwAndReload();
    }
  } catch { void clearSwAndReload(); }
});

createRoot(document.getElementById("root")!).render(<App />);
