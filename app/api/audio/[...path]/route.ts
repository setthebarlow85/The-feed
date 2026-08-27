import { audioContentType, readLocalAudio, saveAudio } from "@/lib/audio";
import { generateTts } from "@/lib/tts";
import { get } from "@/lib/db";
import { basename } from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const name = basename((path || []).join("/"));
  const buf = readLocalAudio(path || []);
  if (buf) {
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": audioContentType(name),
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const id = name.replace(/\.(mp3|wav)$/i, "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) return new Response("Not found", { status: 404 });

  try {
    const script = await get<{ id: string; text: string }>(
      "SELECT id, text FROM scripts WHERE id = ?",
      [id]
    );
    if (!script?.text) return new Response("Not found", { status: 404 });
    const result = await generateTts(script.text);
    try {
      await saveAudio(script.id, result.buffer, result.contentType, result.ext);
    } catch {
      /* still return bytes */
    }
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
