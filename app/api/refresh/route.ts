import { getDb, setSetting } from "@/lib/db";
import { ingestAll } from "@/lib/rss";
import { refillIfNeeded } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function run() {
  await getDb();
  const ingest = await ingestAll();
  const refill = await refillIfNeeded();
  await setSetting("last_refresh", String(Date.now()));
  return { ok: true, ingest, queue: refill };
}

export async function GET() {
  return Response.json(await run());
}

export async function POST() {
  return Response.json(await run());
}
