declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
].join(", ");

function configuredAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("PUBLIC_SITE_URL") ?? "";
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS;
}

function resolveAllowedOrigin(req?: Request): string {
  const allowedOrigins = configuredAllowedOrigins();
  const requestOrigin = req?.headers.get("Origin")?.trim();

  if (!requestOrigin) return allowedOrigins[0];
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : "null";
}

export function getCorsHeaders(req?: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(req),
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
