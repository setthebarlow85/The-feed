import { audioContentType, readLocalAudio } from "@/lib/audio";
import { basename } from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const buf = readLocalAudio(path || []);
  if (!buf) return new Response("Not found", { status: 404 });
  const name = basename((path || []).join("/"));
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": audioContentType(name),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
