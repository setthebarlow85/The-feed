import { all, execute, get } from "./db";
import { rankUnqueued, keywords } from "./rank";
import { ensureScript } from "./scripts";
import type { ItemRow } from "./rss";

const MIN_QUEUE_SEC = 15 * 60;
const TARGET_QUEUE_SEC = 22 * 60;

export type QueueCard = {
  queue_id: number;
  script_id: string;
  item_id: string;
  title: string;
  text: string;
  audio_url: string | null;
  duration_sec: number;
  category: string | null;
  fringe: boolean;
  metadata_only: boolean;
  source_url: string | null;
  source_id: string;
  status: string;
};

export async function remainingSeconds(): Promise<number> {
  const row = await get<{ remaining: number }>(
    `SELECT COALESCE(SUM(s.duration_sec), 0) AS remaining
     FROM queue q
     JOIN scripts s ON s.id = q.script_id
     WHERE q.status IN ('pending', 'playing')`
  );
  return Number(row?.remaining ?? 0);
}

export async function listQueue(): Promise<QueueCard[]> {
  return all<QueueCard>(
    `SELECT
        q.id AS queue_id,
        q.script_id AS script_id,
        q.status AS status,
        s.item_id AS item_id,
        s.text AS text,
        s.audio_url AS audio_url,
        s.duration_sec AS duration_sec,
        i.title AS title,
        i.category AS category,
        i.fringe AS fringe,
        i.metadata_only AS metadata_only,
        i.url AS source_url,
        i.source_id AS source_id
     FROM queue q
     JOIN scripts s ON s.id = q.script_id
     JOIN items i ON i.id = s.item_id
     WHERE q.status IN ('pending', 'playing')
     ORDER BY q.position ASC, q.id ASC`
  ).then((rows) =>
    rows.map((r) => ({
      ...r,
      fringe: Boolean(r.fringe),
      metadata_only: Boolean(r.metadata_only),
    }))
  );
}

async function nextPosition(): Promise<number> {
  const row = await get<{ m: number }>("SELECT COALESCE(MAX(position), 0) AS m FROM queue");
  return Number(row?.m ?? 0) + 1;
}

export async function enqueueItem(item: ItemRow, front = false): Promise<QueueCard | null> {
  const script = await ensureScript(item);
  const already = await get(
    "SELECT id FROM queue WHERE script_id = ? AND status IN ('pending','playing')",
    [script.id]
  );
  if (already) return null;
  let pos = await nextPosition();
  if (front) {
    const current = await get<{ position: number }>(
      "SELECT position FROM queue WHERE status = 'playing' ORDER BY position LIMIT 1"
    );
    pos = current ? Number(current.position) + 1 : 1;
    await execute(
      "UPDATE queue SET position = position + 1 WHERE status = 'pending' AND position >= ?",
      [pos]
    );
  }
  await execute(
    "INSERT INTO queue (script_id, position, status, added_at) VALUES (?, ?, 'pending', ?)",
    [script.id, pos, Date.now()]
  );
  const cards = await listQueue();
  return cards.find((c) => c.script_id === script.id) ?? null;
}

let refillLock = false;

export async function refillIfNeeded(): Promise<{ remaining: number; added: number }> {
  const remaining = await remainingSeconds();
  if (remaining >= MIN_QUEUE_SEC) return { remaining, added: 0 };
  if (refillLock) return { remaining, added: 0 };
  refillLock = true;
  let added = 0;
  try {
    const ranked = await rankUnqueued(10);
    for (const item of ranked) {
      const now = await remainingSeconds();
      if (now >= TARGET_QUEUE_SEC) break;
      const card = await enqueueItem(item);
      if (card) added += 1;
    }
  } finally {
    refillLock = false;
  }
  return { remaining: await remainingSeconds(), added };
}

export async function markPlaying(queueId: number) {
  await execute("UPDATE queue SET status = 'played' WHERE status = 'playing'");
  await execute("UPDATE queue SET status = 'playing' WHERE id = ?", [queueId]);
}

export async function skipCurrent() {
  const current = await get<{ id: number }>(
    "SELECT id FROM queue WHERE status = 'playing' ORDER BY id LIMIT 1"
  );
  if (current) {
    await execute("UPDATE queue SET status = 'skipped' WHERE id = ?", [current.id]);
  } else {
    const next = await get<{ id: number }>(
      "SELECT id FROM queue WHERE status = 'pending' ORDER BY position, id LIMIT 1"
    );
    if (next) await execute("UPDATE queue SET status = 'skipped' WHERE id = ?", [next.id]);
  }
}

export async function goBack() {
  const last = await get<{ id: number }>(
    "SELECT id FROM queue WHERE status IN ('played','skipped') ORDER BY id DESC LIMIT 1"
  );
  if (!last) return;
  await execute("UPDATE queue SET status = 'pending', position = 0 WHERE id = ?", [last.id]);
  await execute("UPDATE queue SET status = 'pending' WHERE status = 'playing'");
}

export async function rabbitHole(): Promise<number> {
  const current = await get<QueueCard>(
    `SELECT
        q.id AS queue_id, s.item_id AS item_id, i.title AS title, i.category AS category
     FROM queue q
     JOIN scripts s ON s.id = q.script_id
     JOIN items i ON i.id = s.item_id
     WHERE q.status IN ('playing','pending')
     ORDER BY CASE q.status WHEN 'playing' THEN 0 ELSE 1 END, q.position
     LIMIT 1`
  );
  if (!current) return 0;
  const words = keywords(String(current.title || ""));
  if (words.length === 0) return 0;
  const like = words.map(() => "i.title LIKE ?").join(" OR ");
  const args = words.map((w) => `%${w}%`);
  const related = await all<ItemRow>(
    `SELECT i.* FROM items i
     WHERE i.id != ?
       AND i.id NOT IN (SELECT item_id FROM scripts)
       AND (${like})
     ORDER BY i.published_at DESC
     LIMIT 3`,
    [current.item_id, ...args]
  );
  let added = 0;
  for (const item of related) {
    const card = await enqueueItem(item, true);
    if (card) added += 1;
  }
  if (added === 0 && current.category) {
    const fallback = await all<ItemRow>(
      `SELECT i.* FROM items i
       WHERE i.category = ? AND i.id != ?
         AND i.id NOT IN (SELECT item_id FROM scripts)
       ORDER BY i.published_at DESC LIMIT 2`,
      [current.category, current.item_id]
    );
    for (const item of fallback) {
      const card = await enqueueItem(item, true);
      if (card) added += 1;
    }
  }
  return added;
}

export async function recordFeedback(kind: "more" | "less" | "follow") {
  const current = await get<{ item_id: string; category: string; title: string }>(
    `SELECT s.item_id AS item_id, i.category AS category, i.title AS title
     FROM queue q
     JOIN scripts s ON s.id = q.script_id
     JOIN items i ON i.id = s.item_id
     WHERE q.status IN ('playing','pending')
     ORDER BY CASE q.status WHEN 'playing' THEN 0 ELSE 1 END, q.position
     LIMIT 1`
  );
  if (!current) return;
  await execute(
    "INSERT INTO feedback (item_id, category, kind, created_at) VALUES (?, ?, ?, ?)",
    [current.item_id, current.category, kind, Date.now()]
  );
  if (kind === "follow") {
    const topic = keywords(current.title)[0] || current.category;
    if (topic) {
      await execute(
        "INSERT INTO follows (topic, created_at) VALUES (?, ?) ON CONFLICT(topic) DO NOTHING",
        [topic, Date.now()]
      );
    }
  }
}
