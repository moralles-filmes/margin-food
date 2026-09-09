import { vi } from "vitest";
import { JSDOM } from "jsdom";
import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Unit-test transport placeholders; integration tests use a real PostgreSQL database.
vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");

// Node 25 exposes an unavailable global storage; use jsdom's browser storage.
const storageWindow = new JSDOM('', { url:'http://localhost/' }).window;
Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:storageWindow.localStorage });
Object.defineProperty(globalThis, 'sessionStorage', { configurable:true, value:storageWindow.sessionStorage });
