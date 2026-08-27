import { all } from "./db";
import type { ItemRow } from "./rss";

type Ranked = ItemRow & { score: number };

export async function rankUnqueued(limit = 12): Promise<ItemRow[]> {
  const items = await all<ItemRow>(
    `SELECT i.* FROM items i
     WHERE i.id NOT IN (SELECT item_id FROM scripts)
     ORDER BY i.published_at DESC
     LIMIT 80`
  );

  const more = await all<{ category: string; n: number }>(
    "SELECT category, COUNT(*) as n FROM feedback WHERE kind = 'more' GROUP BY category"
  );
  const less = await all<{ category: string; n: number }>(
    "SELECT category, COUNT(*) as n FROM feedback WHERE kind = 'less' GROUP BY category"
  );
  const follows = await all<{ topic: string }>("SELECT topic FROM follows");

  const moreMap = Object.fromEntries(more.map((r) => [r.category, Number(r.n)]));
  const lessMap = Object.fromEntries(less.map((r) => [r.category, Number(r.n)]));
  const followSet = new Set(follows.map((f) => f.topic.toLowerCase()));

  const now = Date.now();
  const ranked: Ranked[] = items.map((item) => {
    const ageH = Math.max(0, (now - Number(item.published_at || now)) / 3600000);
    let score = 40 * Math.exp(-ageH / 18);
    score += (moreMap[item.category || ""] || 0) * 6;
    score -= (lessMap[item.category || ""] || 0) * 8;
    if (item.fringe) score -= 12;
    if (item.metadata_only) score -= 6;
    const blob = `${item.title} ${item.category}`.toLowerCase();
    for (const topic of followSet) {
      if (topic && blob.includes(topic)) score += 14;
    }
    if (["georgia", "uga", "markets", "ai"].includes(item.category || "")) score += 4;
    return { ...item, score };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

export function keywords(title: string): string[] {
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "after",
    "from", "over", "under", "about", "says", "said", "new", "as", "at", "by",
    "is", "are", "was", "were", "be", "this", "that", "its", "it", "into",
  ]);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w))
    .slice(0, 8);
}
