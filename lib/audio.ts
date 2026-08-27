import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { blobConfigured } from "./env";

const TMP_AUDIO = "/tmp/the-feed/audio";

/**
 * HARD RULE: never mkdir or write public/audio (or anything under
 * process.cwd()/public) at module load. Audio lives in Vercel Blob
 * or /tmp/the-feed/audio, created lazily at request time.
 */
export function localAudioDir(): string {
  return TMP_AUDIO;
}

export async function saveAudio(
  id: string,
  buffer: Buffer
): Promise<string> {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeId}.mp3`;

  if (blobConfigured()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`the-feed/audio/${filename}`, buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: "audio/mpeg",
      addRandomSuffix: false,
    });
    return blob.url;
  }

  mkdirSync(TMP_AUDIO, { recursive: true });
  writeFileSync(join(TMP_AUDIO, filename), buffer);
  return `/api/audio/${filename}`;
}

export function readLocalAudio(pathParts: string[]): Buffer | null {
  const name = basename(pathParts.join("/"));
  if (!name || name !== name.replace(/[^a-zA-Z0-9._-]/g, "")) return null;
  if (!name.endsWith(".mp3")) return null;
  const file = join(TMP_AUDIO, name);
  if (!existsSync(file)) return null;
  return readFileSync(file);
}
