import { openaiAuthMode, openaiConfigured, runtimeEnvironment } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const configured = openaiConfigured();
  const mode = openaiAuthMode();
  return Response.json({
    openai_configured: configured,
    openai_auth: mode,
    recommended_mode: configured ? "openai-tts" : "extractive",
    environment: runtimeEnvironment(),
    vercel: Boolean(process.env.VERCEL),
    oidc_present: Boolean(process.env.VERCEL_OIDC_TOKEN),
  });
}
