import { openaiAuthMode, openaiConfigured, runtimeEnvironment } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const configured = await openaiConfigured();
  const mode = await openaiAuthMode();
  let oidc_header = false;
  try {
    const { headers } = await import("next/headers");
    oidc_header = Boolean((await headers()).get("x-vercel-oidc-token"));
  } catch {
    oidc_header = false;
  }
  return Response.json({
    openai_configured: configured,
    openai_auth: mode,
    recommended_mode: configured ? "openai-tts" : "extractive",
    environment: runtimeEnvironment(),
    vercel: Boolean(process.env.VERCEL),
    oidc_env: Boolean(process.env.VERCEL_OIDC_TOKEN),
    oidc_header,
  });
}
