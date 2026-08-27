export function isVercel(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

export function openaiKeyConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && key.trim().length > 8);
}

export function gatewayToken(): string | null {
  const gw = process.env.AI_GATEWAY_API_KEY?.trim();
  if (gw && gw.length > 8) return gw;
  const oidc = process.env.VERCEL_OIDC_TOKEN?.trim();
  if (oidc && oidc.length > 8) return oidc;
  return null;
}

export function usingGateway(): boolean {
  return !openaiKeyConfigured() && Boolean(gatewayToken());
}

/** Direct OpenAI key or Vercel AI Gateway (OIDC on Vercel deployments). */
export function openaiConfigured(): boolean {
  return openaiKeyConfigured() || Boolean(gatewayToken());
}

export function openaiAuthMode(): "openai-key" | "vercel-gateway" | "none" {
  if (openaiKeyConfigured()) return "openai-key";
  if (gatewayToken()) return "vercel-gateway";
  return "none";
}

export function tursoConfigured(): boolean {
  return Boolean(
    process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN
  );
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function runtimeEnvironment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}
