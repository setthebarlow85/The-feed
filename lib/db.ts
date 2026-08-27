import { mkdirSync } from "fs";
import { dirname, join } from "path";
import type { Client, InArgs } from "@libsql/client";
import { isVercel, tursoConfigured } from "./env";

let client: Client | null = null;
let migrated = false;

/**
 * HARD RULE: never mkdir data/ (or anything under cwd) at import time
 * on Vercel. Directories are created lazily inside getDb() at request time.
 */
export function localDbPath(): string {
  if (isVercel()) return "/tmp/the-feed/feed.db";
  return join(process.cwd(), "data", "feed.db");
}

export async function getDb(): Promise<Client> {
  if (!client) {
    const { createClient } = await import("@libsql/client");
    if (tursoConfigured()) {
      client = createClient({
        url: process.env.TURSO_DATABASE_URL as string,
        authToken: process.env.TURSO_AUTH_TOKEN as string,
      });
    } else {
      const dbPath = localDbPath();
      mkdirSync(dirname(dbPath), { recursive: true });
      client = createClient({ url: `file:${dbPath}` });
    }
  }
  if (!migrated) {
    await migrate(client);
    migrated = true;
  }
  return client;
}

export async function execute(sql: string, args: InArgs = []) {
  const db = await getDb();
  return db.execute({ sql, args });
}

export async function all<T = Record<string, unknown>>(
  sql: string,
  args: InArgs = []
): Promise<T[]> {
  const result = await execute(sql, args);
  return result.rows as unknown as T[];
}

export async function get<T = Record<string, unknown>>(
  sql: string,
  args: InArgs = []
): Promise<T | null> {
  const rows = await all<T>(sql, args);
  return rows[0] ?? null;
}

async function migrate(db: Client) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT NOT NULL,
      fringe INTEGER DEFAULT 0,
      metadata_only INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      url TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      published_at INTEGER,
      category TEXT,
      fringe INTEGER DEFAULT 0,
      metadata_only INTEGER DEFAULT 0,
      hash TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      text TEXT NOT NULL,
      audio_url TEXT,
      duration_sec REAL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id TEXT NOT NULL,
      position INTEGER,
      status TEXT DEFAULT 'pending',
      added_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS follows (
      topic TEXT PRIMARY KEY,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT,
      category TEXT,
      kind TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_url ON items(url);
    CREATE INDEX IF NOT EXISTS idx_items_hash ON items(hash);
    CREATE INDEX IF NOT EXISTS idx_items_published ON items(published_at);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status, position);
  `);
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await get<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}
