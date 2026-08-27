export function isVercel(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

export function openaiKeyConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && key.trim().length > 8);
}

/** AI Gateway token: env key, build OIDC, or the function request header. */
export async function gatewayToken(): Promise<string | null> {
  const gw = process.env.AI_GATEWAY_API_KEY?.trim();
  if (gw && gw.length > 8) return gw;
  const oidc = process.env.VERCEL_OIDC_TOKEN?.trim();
  if (oidc && oidc.length > 8) return oidc;
  try {
    const { headers } = await import("next/headers");
    const t = (await headers()).get("x-vercel-oidc-token")?.trim();
    if (t && t.length > 8) return t;
  } catch {
    /* not in a Next request */
  }
  return null;
}

export function usingGateway(): boolean {
  return !openaiKeyConfigured();
}

export async function openaiConfigured(): Promise<boolean> {
  if (openaiKeyConfigured()) return true;
  return Boolean(await gatewayToken());
}

export async function openaiAuthMode(): Promise<"openai-key" | "vercel-gateway" | "none"> {
  if (openaiKeyConfigured()) return "openai-key";
  if (await gatewayToken()) return "vercel-gateway";
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
