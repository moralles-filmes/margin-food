import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const CHUNK_RELOAD_KEY = 'chunk-reload-attempted';

function isChunkError(msg: string): boolean {
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Failed to load module script')
  );
}

function reloadOnceForChunkError(): void {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  } catch { /* ignore */ }
  window.location.reload();
}

window.addEventListener('error', (event) => {
  if (isChunkError(event.message ?? '')) {
    event.preventDefault();
    reloadOnceForChunkError();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason instanceof Error
    ? event.reason.message
    : String(event.reason ?? '');
  if (isChunkError(msg)) {
    event.preventDefault();
    reloadOnceForChunkError();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
