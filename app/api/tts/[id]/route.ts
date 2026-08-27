import { execute, get } from "@/lib/db";
import { audioContentType, readLocalAudio, saveAudio } from "@/lib/audio";
import { generateTts, synthWav } from "@/lib/tts";
import type { ScriptRow } from "@/lib/scripts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function audioResponse(buffer: Buffer, contentType: string, cache = true) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cache ? "public, max-age=3600" : "no-store",
      "Content-Length": String(buffer.length),
    },
  });
}

function failSafeWav(message = "The Feed. Audio is unavailable.") {
  try {
    return audioResponse(synthWav(message), "audio/wav", false);
  } catch {
    return audioResponse(synthWav("Feed."), "audio/wav", false);
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const safeId = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeId) return failSafeWav();

    const script = await get<ScriptRow>(
      "SELECT id, item_id, text, audio_url, duration_sec FROM scripts WHERE id = ?",
      [safeId]
    );
    if (!script?.text) return failSafeWav("The Feed. Story not found.");

    if (script.audio_url && /^https?:\/\//i.test(script.audio_url)) {
      return Response.redirect(script.audio_url, 302);
    }

    if (script.audio_url?.startsWith("/api/audio/")) {
      const parts = script.audio_url
        .replace(/^\/api\/audio\//, "")
        .split("/")
        .filter(Boolean);
      const name = parts[parts.length - 1] || "";
      const existing = readLocalAudio(parts);
      if (existing && !name.endsWith(".wav")) {
        return audioResponse(existing, audioContentType(name));
      }
    }

    const result = await generateTts(script.text);
    let url: string | null = null;
    try {
      url = await saveAudio(script.id, result.buffer, result.contentType, result.ext);
      await execute("UPDATE scripts SET audio_url = ? WHERE id = ?", [url, script.id]);
    } catch {
      /* still return bytes so the player is not silent */
    }
    return audioResponse(result.buffer, result.contentType);
  } catch {
    return failSafeWav();
  }
}
