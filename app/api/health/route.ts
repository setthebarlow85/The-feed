import { openaiConfigured, runtimeEnvironment } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const configured = openaiConfigured();
  return Response.json({
    openai_configured: configured,
    recommended_mode: configured ? "openai-tts" : "extractive",
    environment: runtimeEnvironment(),
  });
}
