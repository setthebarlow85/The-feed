import { openaiConfigured, runtimeEnvironment } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// env-reload

export async function GET() {
  const configured = openaiConfigured();
  const openaiLike = Object.keys(process.env)
    .filter((k) => /openai/i.test(k))
    .sort();
  const raw = process.env.OPENAI_API_KEY;
  return Response.json({
    openai_configured: configured,
    recommended_mode: configured ? "openai-tts" : "extractive",
    environment: runtimeEnvironment(),
    vercel: Boolean(process.env.VERCEL),
    openai_like_env_names: openaiLike,
    openai_api_key_length: raw ? raw.trim().length : 0,
  });
}
