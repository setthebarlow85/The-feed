import { gatewayToken, openaiAuthMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const mode = await openaiAuthMode();
  const token = await gatewayToken();
  if (!token) {
    return Response.json({
      openai_auth: mode,
      gateway_status: null,
      gateway_error: "no token",
      got_audio: false,
    });
  }

  const res = await fetch("https://ai-gateway.vercel.sh/v4/ai/speech-model", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "ai-model-id": "openai/tts-1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: "The Feed.",
      voice: "alloy",
      outputFormat: "mp3",
    }),
    signal: AbortSignal.timeout(25000),
  });
  const raw = await res.text();
  let got_audio = false;
  try {
    const json = JSON.parse(raw) as { audio?: string };
    got_audio = Boolean(json?.audio && json.audio.length > 80);
  } catch {
    got_audio = false;
  }
  return Response.json({
    openai_auth: mode,
    gateway_status: res.status,
    gateway_error: res.ok ? null : raw.slice(0, 500),
    got_audio,
    body_len: raw.length,
  });
}
