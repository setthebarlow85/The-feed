import { getDb } from "@/lib/db";
import { listQueue, markPlaying, refillIfNeeded, remainingSeconds } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function loadQueue() {
  let refill = await refillIfNeeded();
  let upcoming = await listQueue();
  if (upcoming.length === 0) {
    const { ingestAll } = await import("@/lib/rss");
    await ingestAll();
    refill = await refillIfNeeded();
    upcoming = await listQueue();
  }
  return { refill, upcoming };
}

export async function GET() {
  await getDb();
  const { refill, upcoming } = await loadQueue();
  const remaining_sec = refill.remaining || (await remainingSeconds());
  return Response.json({
    remaining_sec,
    added: refill.added,
    current: upcoming[0] ?? null,
    upcoming,
  });
}

export async function POST(request: Request) {
  await getDb();
  let body: { queue_id?: number } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.queue_id) await markPlaying(body.queue_id);
  const { refill, upcoming } = await loadQueue();
  return Response.json({
    remaining_sec: refill.remaining,
    added: refill.added,
    current: upcoming[0] ?? null,
    upcoming,
  });
}
