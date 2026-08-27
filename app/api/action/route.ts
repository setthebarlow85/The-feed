import { getDb } from "@/lib/db";
import {
  goBack,
  listQueue,
  rabbitHole,
  recordFeedback,
  refillIfNeeded,
  skipCurrent,
} from "@/lib/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  await getDb();
  let body: { type?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const type = body.type || "";
  let extra: Record<string, unknown> = {};

  if (type === "skip" || type === "ended") {
    await skipCurrent();
  } else if (type === "back") {
    await goBack();
  } else if (type === "rabbit") {
    extra.rabbit_added = await rabbitHole();
  } else if (type === "more" || type === "less" || type === "follow") {
    await recordFeedback(type);
  }

  const refill = await refillIfNeeded();
  const upcoming = await listQueue();
  return Response.json({
    ok: true,
    ...extra,
    remaining_sec: refill.remaining,
    current: upcoming[0] ?? null,
    upcoming,
  });
}
