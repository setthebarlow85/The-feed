import { getDb, setSetting } from "@/lib/db";
import { ingestAll } from "@/lib/rss";
import { refillIfNeeded } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  await getDb();
  const ingest = await ingestAll();
  const refill = await refillIfNeeded();
  await setSetting("last_seed", String(Date.now()));
  return Response.json({
    ok: true,
    ingest,
    queue: refill,
  });
}

export async function GET() {
  return POST();
}
