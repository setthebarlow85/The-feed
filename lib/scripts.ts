import { randomUUID } from "crypto";
import { execute, get } from "./db";
import { chatModel, getOpenAI } from "./openai";
import type { ItemRow } from "./rss";

const SYSTEM_PROMPT = `You are a radio writer for a private single-user news station called The Feed.
Write an ORIGINAL spoken brief (80–140 words) based on the source notes.
Rules:
- Original summary only. Do not quote more than a short phrase. Never reproduce article text.
- Conversational, present tense, good for driving. No clickbait.
- Start with a short desk tag like "World desk." or "Georgia desk."
- If FRINGE is true, open with: "Unverified. This is labeled theory, not established fact."
- If METADATA_ONLY is true (e.g. a podcast listing), describe the episode topic only. Never imply we are playing the show.
- No ripped podcasts. No music lyrics. Copyright-safe original copy.`;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(18, Math.round((words / 150) * 60));
}

export function extractiveScript(item: ItemRow): string {
  const body = stripHtml(item.content || item.summary || "");
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
  const picked = sentences.slice(0, 3).join(" ");
  const desk = (item.category || "news").replace(/_/g, " ");
  let script = `${desk} desk. ${item.title}. ${picked || "Details are thin in this dispatch."}`;
  if (item.fringe) {
    script = `Unverified. This is labeled theory, not established fact. ${script}`;
  }
  if (item.metadata_only) {
    script = `Show note only — we are not playing any podcast audio. ${script}`;
  }
  return script.slice(0, 1400);
}

export async function writeScriptText(item: ItemRow): Promise<string> {
  const openai = getOpenAI();
  if (!openai) return extractiveScript(item);
  try {
    const notes = stripHtml(item.summary || item.content || "").slice(0, 1800);
    const completion = await openai.chat.completions.create({
      model: chatModel(),
      temperature: 0.4,
      max_tokens: 320,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `TITLE: ${item.title}
CATEGORY: ${item.category}
FRINGE: ${item.fringe ? "true" : "false"}
METADATA_ONLY: ${item.metadata_only ? "true" : "false"}
SOURCE NOTES: ${notes || "(headline only)"}`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text && text.length > 40 ? text : extractiveScript(item);
  } catch {
    return extractiveScript(item);
  }
}

export type ScriptRow = {
  id: string;
  item_id: string;
  text: string;
  audio_url: string | null;
  duration_sec: number;
};

export async function ensureScript(item: ItemRow): Promise<ScriptRow> {
  const existing = await get<ScriptRow>(
    "SELECT id, item_id, text, audio_url, duration_sec FROM scripts WHERE item_id = ? ORDER BY created_at DESC LIMIT 1",
    [item.id]
  );
  if (existing) return existing;

  const text = await writeScriptText(item);
  const id = randomUUID();
  // Speak on first /api/tts hit so enqueue stays inside a Vercel time budget.
  const audio_url = null;
  const duration_sec = estimateDuration(text);
  await execute(
    `INSERT INTO scripts (id, item_id, text, audio_url, duration_sec, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, item.id, text, audio_url, duration_sec, Date.now()]
  );
  return { id, item_id: item.id, text, audio_url, duration_sec };
}
