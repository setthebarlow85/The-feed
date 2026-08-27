import Parser from "rss-parser";
import { all, execute, get } from "./db";
import { upsertSources, type SourceDef } from "./sources";
import { createHash, randomUUID } from "crypto";

const parser = new Parser({
  timeout: 12000,
  headers: { "User-Agent": "TheFeed/1.0 (private personal news radio)" },
});

export type ItemRow = {
  id: string;
  source_id: string;
  url: string | null;
  title: string;
  summary: string | null;
  content: string | null;
  published_at: number | null;
  category: string | null;
  fringe: number;
  metadata_only: number;
  hash: string | null;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid"].forEach(
      (k) => u.searchParams.delete(k)
    );
    return u.toString();
  } catch {
    return raw;
  }
}

function titleHash(title: string): string {
  const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 96);
  return createHash("sha1").update(norm).digest("hex");
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return out;
}

async function ingestSource(source: {
  id: string;
  name: string;
  url: string;
  category: string;
  fringe: number;
  metadata_only: number;
}): Promise<{ source: string; inserted: number; error?: string }> {
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "TheFeed/1.0 (private personal news radio)" },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!res.ok) return { source: source.id, inserted: 0, error: `HTTP ${res.status}` };
    const xml = await res.text();
    const feed = await parser.parseString(xml);
    let inserted = 0;
    const entries = (feed.items || []).slice(0, 18);

    for (const entry of entries) {
      const title = (entry.title || "").trim();
      if (!title) continue;
      const url =
        normalizeUrl(entry.link) ||
        normalizeUrl((entry as { guid?: string }).guid);
      const hash = titleHash(title);
      if (url) {
        const exists = await get("SELECT id FROM items WHERE url = ?", [url]);
        if (exists) continue;
      }
      const hashHit = await get("SELECT id FROM items WHERE hash = ?", [hash]);
      if (hashHit) continue;

      const summary = stripHtml(
        entry.contentSnippet ||
          entry.summary ||
          (typeof entry.content === "string" ? entry.content : "") ||
          ""
      ).slice(0, 2000);

      // JRE: metadata only — drop enclosures / audio URLs from stored content
      const content = source.metadata_only
        ? summary
        : stripHtml(
            (typeof entry.content === "string" ? entry.content : "") ||
              entry.contentSnippet ||
              ""
          ).slice(0, 4000);

      const published = entry.isoDate
        ? Date.parse(entry.isoDate)
        : entry.pubDate
          ? Date.parse(entry.pubDate)
          : Date.now();

      await execute(
        `INSERT INTO items (id, source_id, url, title, summary, content, published_at, category, fringe, metadata_only, hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          source.id,
          url,
          title.slice(0, 400),
          summary,
          content,
          Number.isFinite(published) ? published : Date.now(),
          source.category,
          source.fringe,
          source.metadata_only,
          hash,
          Date.now(),
        ]
      );
      inserted += 1;
    }
    return { source: source.id, inserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { source: source.id, inserted: 0, error: message };
  }
}

export async function ingestAll(): Promise<{
  inserted: number;
  results: { source: string; inserted: number; error?: string }[];
}> {
  await upsertSources();
  const sources = await all<{
    id: string;
    name: string;
    url: string;
    category: string;
    fringe: number;
    metadata_only: number;
  }>("SELECT * FROM sources WHERE active = 1");
  const results = await mapPool(sources, 4, ingestSource);
  const inserted = results.reduce((n, r) => n + r.inserted, 0);
  return { inserted, results };
}

export type { SourceDef };
