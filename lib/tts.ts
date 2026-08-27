import { getOpenAI } from "./openai";
import { openaiConfigured } from "./env";

export type TtsResult = {
  buffer: Buffer;
  contentType: "audio/mpeg" | "audio/wav";
  ext: "mp3" | "wav";
};

const UA = "Mozilla/5.0";

/** Always returns playable bytes. OpenAI → Google Translate TTS → local formant WAV. */
export async function generateTts(text: string): Promise<TtsResult> {
  const input = (text || "The Feed.")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000) || "The Feed.";

  if (openaiConfigured()) {
    try {
      const r = await speakOpenAI(input);
      if (r) return r;
    } catch {
      /* fall through */
    }
  }

  try {
    const r = await speakGoogle(input);
    if (r) return r;
  } catch {
    /* fall through */
  }

  return speakLocal(input);
}

async function speakOpenAI(text: string): Promise<TtsResult | null> {
  const openai = getOpenAI();
  if (!openai) return null;
  const speech = await openai.audio.speech.create({
    model: "tts-1",
    voice: "onyx",
    input: text.slice(0, 4000),
    response_format: "mp3",
  });
  const buffer = Buffer.from(await speech.arrayBuffer());
  if (buffer.length < 1000) return null;
  return { buffer, contentType: "audio/mpeg", ext: "mp3" };
}

async function speakGoogle(text: string): Promise<TtsResult | null> {
  const chunks = chunkText(text, 180);
  if (chunks.length === 0) return null;
  const parts: Buffer[] = [];
  const deadline = Date.now() + 15000;
  for (const chunk of chunks) {
    const remain = deadline - Date.now();
    if (remain < 400) return null;
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en-US&q=" +
      encodeURIComponent(chunk);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "audio/mpeg,*/*" },
      signal: AbortSignal.timeout(Math.min(5000, remain)),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null;
    parts.push(buf);
  }
  return {
    buffer: Buffer.concat(parts),
    contentType: "audio/mpeg",
    ext: "mp3",
  };
}

function chunkText(text: string, maxLen: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  const pushWords = (s: string) => {
    const words = s.split(/\s+/);
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length <= maxLen) {
        cur = next;
      } else {
        if (cur) chunks.push(cur);
        if (w.length <= maxLen) cur = w;
        else {
          for (let i = 0; i < w.length; i += maxLen) chunks.push(w.slice(i, i + maxLen));
          cur = "";
        }
      }
    }
  };
  for (const s of sentences) {
    const next = cur ? `${cur} ${s}` : s;
    if (next.length <= maxLen) cur = next;
    else {
      if (cur) chunks.push(cur);
      cur = "";
      if (s.length <= maxLen) cur = s;
      else pushWords(s);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/* ---------- last-resort formant / SAM-style reciter (16-bit 22050 Hz WAV) ---------- */

const SR = 22050;

type P = { f1: number; f2: number; f3: number; dur: number; v: number; nz: number; a: number };

const PH: Record<string, P> = {
  AA: { f1: 730, f2: 1090, f3: 2440, dur: 95, v: 1, nz: 0, a: 1 },
  AE: { f1: 660, f2: 1720, f3: 2410, dur: 85, v: 1, nz: 0, a: 1 },
  AH: { f1: 640, f2: 1190, f3: 2390, dur: 65, v: 1, nz: 0, a: 0.9 },
  AO: { f1: 570, f2: 840, f3: 2410, dur: 95, v: 1, nz: 0, a: 1 },
  EH: { f1: 530, f2: 1840, f3: 2480, dur: 75, v: 1, nz: 0, a: 1 },
  ER: { f1: 490, f2: 1350, f3: 1690, dur: 95, v: 1, nz: 0, a: 1 },
  IH: { f1: 390, f2: 1990, f3: 2550, dur: 55, v: 1, nz: 0, a: 0.9 },
  IY: { f1: 270, f2: 2290, f3: 3010, dur: 85, v: 1, nz: 0, a: 1 },
  UH: { f1: 440, f2: 1020, f3: 2240, dur: 55, v: 1, nz: 0, a: 0.9 },
  UW: { f1: 300, f2: 870, f3: 2240, dur: 85, v: 1, nz: 0, a: 1 },
  B: { f1: 200, f2: 720, f3: 1300, dur: 45, v: 1, nz: 0.1, a: 0.35 },
  D: { f1: 280, f2: 1700, f3: 2600, dur: 40, v: 1, nz: 0.15, a: 0.4 },
  G: { f1: 250, f2: 1400, f3: 2200, dur: 45, v: 1, nz: 0.1, a: 0.35 },
  P: { f1: 200, f2: 800, f3: 1750, dur: 50, v: 0, nz: 0.45, a: 0.45 },
  T: { f1: 350, f2: 1800, f3: 2700, dur: 45, v: 0, nz: 0.55, a: 0.5 },
  K: { f1: 300, f2: 1600, f3: 2500, dur: 50, v: 0, nz: 0.4, a: 0.45 },
  M: { f1: 250, f2: 1000, f3: 2200, dur: 70, v: 1, nz: 0, a: 0.55 },
  N: { f1: 250, f2: 1600, f3: 2500, dur: 65, v: 1, nz: 0, a: 0.55 },
  NG: { f1: 250, f2: 1400, f3: 2200, dur: 75, v: 1, nz: 0, a: 0.5 },
  F: { f1: 340, f2: 1100, f3: 2800, dur: 75, v: 0, nz: 0.85, a: 0.4 },
  V: { f1: 340, f2: 1100, f3: 2500, dur: 65, v: 1, nz: 0.35, a: 0.45 },
  S: { f1: 400, f2: 1800, f3: 7000, dur: 80, v: 0, nz: 1, a: 0.4 },
  Z: { f1: 400, f2: 1700, f3: 6000, dur: 70, v: 1, nz: 0.45, a: 0.4 },
  SH: { f1: 350, f2: 1800, f3: 3500, dur: 85, v: 0, nz: 0.9, a: 0.45 },
  ZH: { f1: 350, f2: 1800, f3: 3200, dur: 75, v: 1, nz: 0.4, a: 0.4 },
  TH: { f1: 350, f2: 1400, f3: 2500, dur: 65, v: 0, nz: 0.7, a: 0.35 },
  DH: { f1: 350, f2: 1400, f3: 2500, dur: 55, v: 1, nz: 0.3, a: 0.4 },
  HH: { f1: 400, f2: 1400, f3: 2200, dur: 50, v: 0, nz: 0.55, a: 0.28 },
  L: { f1: 380, f2: 1050, f3: 2650, dur: 65, v: 1, nz: 0, a: 0.7 },
  R: { f1: 400, f2: 1100, f3: 1550, dur: 65, v: 1, nz: 0, a: 0.7 },
  W: { f1: 300, f2: 610, f3: 2150, dur: 55, v: 1, nz: 0, a: 0.7 },
  Y: { f1: 280, f2: 2200, f3: 3050, dur: 55, v: 1, nz: 0, a: 0.7 },
  CH: { f1: 350, f2: 1800, f3: 2600, dur: 75, v: 0, nz: 0.75, a: 0.5 },
  JH: { f1: 350, f2: 1800, f3: 2600, dur: 65, v: 1, nz: 0.35, a: 0.45 },
  SP: { f1: 500, f2: 1500, f3: 2500, dur: 50, v: 0, nz: 0, a: 0 },
  SIL: { f1: 500, f2: 1500, f3: 2500, dur: 140, v: 0, nz: 0, a: 0 },
};

const LEX: Record<string, string[]> = {
  the: ["DH", "AH"], a: ["AH"], an: ["AE", "N"], and: ["AE", "N", "D"], of: ["AH", "V"],
  to: ["T", "UW"], for: ["F", "AO", "R"], in: ["IH", "N"], on: ["AA", "N"], is: ["IH", "Z"],
  it: ["IH", "T"], that: ["DH", "AE", "T"], this: ["DH", "IH", "S"], with: ["W", "IH", "DH"],
  from: ["F", "R", "AH", "M"], by: ["B", "AY"], as: ["AE", "Z"], at: ["AE", "T"],
  be: ["B", "IY"], was: ["W", "AH", "Z"], are: ["AA", "R"], not: ["N", "AA", "T"],
  have: ["HH", "AE", "V"], has: ["HH", "AE", "Z"], had: ["HH", "AE", "D"],
  will: ["W", "IH", "L"], would: ["W", "UH", "D"], can: ["K", "AE", "N"],
  news: ["N", "UW", "Z"], desk: ["D", "EH", "S", "K"], world: ["W", "ER", "L", "D"],
  feed: ["F", "IY", "D"], radio: ["R", "EY", "D", "IY", "OW"], georgia: ["JH", "AO", "R", "JH", "AH"],
  unverified: ["AH", "N", "V", "EH", "R", "AH", "F", "AY", "D"],
  theory: ["TH", "IH", "R", "IY"], report: ["R", "IH", "P", "AO", "R", "T"],
  today: ["T", "AH", "D", "EY"], president: ["P", "R", "EH", "Z", "IH", "D", "AH", "N", "T"],
  market: ["M", "AA", "R", "K", "IH", "T"], weather: ["W", "EH", "DH", "ER"],
  sports: ["S", "P", "AO", "R", "T", "S"], said: ["S", "EH", "D"], new: ["N", "UW"],
  after: ["AE", "F", "T", "ER"], about: ["AH", "B", "AW", "T"], into: ["IH", "N", "T", "UW"],
  over: ["OW", "V", "ER"], under: ["AH", "N", "D", "ER"], people: ["P", "IY", "P", "AH", "L"],
  year: ["Y", "IH", "R"], years: ["Y", "IH", "R", "Z"], one: ["W", "AH", "N"],
  two: ["T", "UW"], first: ["F", "ER", "S", "T"], last: ["L", "AE", "S", "T"],
  more: ["M", "AO", "R"], than: ["DH", "AE", "N"], its: ["IH", "T", "S"],
  they: ["DH", "EY"], their: ["DH", "EH", "R"], we: ["W", "IY"], our: ["AW", "ER"],
  you: ["Y", "UW"], your: ["Y", "AO", "R"], he: ["HH", "IY"], she: ["SH", "IY"],
  who: ["HH", "UW"], what: ["W", "AH", "T"], when: ["W", "EH", "N"], where: ["W", "EH", "R"],
  which: ["W", "IH", "CH"], there: ["DH", "EH", "R"], here: ["HH", "IY", "R"],
  show: ["SH", "OW"], notes: ["N", "OW", "T", "S"], labeled: ["L", "EY", "B", "AH", "L", "D"],
  fact: ["F", "AE", "K", "T"], playing: ["P", "L", "EY", "IH", "NG"],
  podcast: ["P", "AA", "D", "K", "AE", "S", "T"], audio: ["AO", "D", "IY", "OW"],
  details: ["D", "IH", "T", "EY", "L", "Z"], thin: ["TH", "IH", "N"],
  dispatch: ["D", "IH", "S", "P", "AE", "CH"],
};

const PAT: [string, string[]][] = [
  ["tion", ["SH", "AH", "N"]], ["sion", ["ZH", "AH", "N"]], ["ture", ["CH", "ER"]],
  ["ough", ["AH", "F"]], ["augh", ["AE", "F"]], ["eigh", ["EY"]], ["ight", ["AY", "T"]],
  ["ould", ["UH", "D"]], ["alk", ["AO", "K"]], ["ind", ["AY", "N", "D"]],
  ["ch", ["CH"]], ["sh", ["SH"]], ["th", ["TH"]], ["ng", ["NG"]], ["ph", ["F"]],
  ["wh", ["W"]], ["ck", ["K"]], ["qu", ["K", "W"]], ["kn", ["N"]], ["wr", ["R"]],
  ["ee", ["IY"]], ["ea", ["IY"]], ["oo", ["UW"]], ["oa", ["OW"]], ["ai", ["EY"]],
  ["ay", ["EY"]], ["oy", ["OY"]], ["oi", ["OY"]], ["aw", ["AO"]], ["au", ["AO"]],
  ["ow", ["AW"]], ["ou", ["AW"]], ["ie", ["IY"]], ["ue", ["UW"]], ["ew", ["UW"]],
  ["er", ["ER"]], ["ir", ["ER"]], ["ur", ["ER"]], ["ar", ["AA", "R"]], ["or", ["AO", "R"]],
  ["ey", ["IY"]], ["oe", ["OW"]],
];

function expand(name: string): string[] {
  if (name === "AY") return ["AE", "IY"];
  if (name === "EY") return ["EH", "IY"];
  if (name === "OW") return ["AO", "UW"];
  if (name === "OY") return ["AO", "IY"];
  if (name === "AW") return ["AE", "UH"];
  return [name];
}

function reciterWord(raw: string): string[] {
  const w = raw.toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return [];
  if (LEX[w]) return LEX[w].flatMap(expand);
  const out: string[] = [];
  let i = 0;
  const silentE = /[aeiou][^aeiou]e$/.test(w);
  while (i < w.length) {
    if (silentE && i === w.length - 1 && w[i] === "e") break;
    let hit = false;
    for (const [pat, phones] of PAT) {
      if (w.startsWith(pat, i)) {
        out.push(...phones);
        i += pat.length;
        hit = true;
        break;
      }
    }
    if (hit) continue;
    const c = w[i];
    const nxt = w[i + 1] || "";
    if (c === "c") out.push("eiy".includes(nxt) ? "S" : "K");
    else if (c === "g") out.push("eiy".includes(nxt) ? "JH" : "G");
    else if (c === "x") out.push("K", "S");
    else if (c === "q") out.push("K");
    else if (c === "j") out.push("JH");
    else if (c === "h") out.push("HH");
    else if (c === "y") out.push(i === 0 ? "Y" : "IH");
    else if ("aeiou".includes(c) && silentE) {
      out.push(c === "a" ? "EY" : c === "i" ? "AY" : c === "o" ? "OW" : c === "u" ? "UW" : "IY");
    } else if (c === "a") out.push("AE");
    else if (c === "e") out.push("EH");
    else if (c === "i") out.push("IH");
    else if (c === "o") out.push("AA");
    else if (c === "u") out.push("AH");
    else if ("bdfklmnprstvwz".includes(c)) out.push(c.toUpperCase());
    i += 1;
  }
  return out.flatMap(expand).filter((p) => PH[p]);
}

function reciter(text: string): string[] {
  const phones: string[] = [];
  const parts = text.split(/(\s+|[.!?])/);
  for (const part of parts) {
    if (!part) continue;
    if (/[.!?]/.test(part)) phones.push("SIL");
    else if (/^\s+$/.test(part)) phones.push("SP");
    else phones.push(...reciterWord(part));
  }
  return phones.length ? phones : ["DH", "AH", "F", "IY", "D"];
}

class Resonator {
  a = 0;
  b = 0;
  c = 0;
  y1 = 0;
  y2 = 0;
  set(freq: number, bw: number) {
    const r = Math.exp((-Math.PI * bw) / SR);
    this.c = -(r * r);
    this.b = 2 * r * Math.cos((2 * Math.PI * freq) / SR);
    this.a = 1 - this.b - this.c;
  }
  tick(x: number) {
    const y = this.a * x + this.b * this.y1 + this.c * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function encodeWav(samples: Int16Array): Buffer {
  const dataSize = samples.byteLength;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).copy(buf, 44);
  return buf;
}

export function synthWav(text: string): Buffer {
  const names = reciter(text.slice(0, 1800)).filter((n) => PH[n]);
  const seq = names.map((n) => PH[n]);
  let total = 0;
  for (const p of seq) total += Math.round((p.dur * 1.25 * SR) / 1000);
  total += Math.round(0.15 * SR);
  const out = new Float32Array(total);
  const r1 = new Resonator();
  const r2 = new Resonator();
  const r3 = new Resonator();
  let phase = 0;
  let f0 = 108;
  let prev: P = seq[0] || PH.AH;
  let idx = 0;
  let seed = 1;

  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  for (let pi = 0; pi < seq.length; pi++) {
    const p = seq[pi];
    const nSamples = Math.round((p.dur * 1.25 * SR) / 1000);
    const isEnd = names[pi] === "SIL";
    if (isEnd) f0 = 112;
    for (let n = 0; n < nSamples && idx < out.length; n++, idx++) {
      const t = n / Math.max(1, nSamples - 1);
      const blend = t < 0.22 ? t / 0.22 : 1;
      const f1 = prev.f1 + (p.f1 - prev.f1) * blend;
      const f2 = prev.f2 + (p.f2 - prev.f2) * blend;
      const f3 = prev.f3 + (p.f3 - prev.f3) * blend;
      r1.set(f1, 90);
      r2.set(f2, 120);
      r3.set(f3, 180);
      const env =
        Math.min(1, n / (0.012 * SR), (nSamples - n) / (0.012 * SR)) *
        (p.a + (prev.a - p.a) * (1 - blend) * 0.3);
      phase += f0 / SR;
      if (phase >= 1) phase -= 1;
      let glot = 0;
      if (p.v > 0) {
        const tp = 0.42;
        const tn = 0.18;
        if (phase < tp) glot = 0.5 * (1 - Math.cos((Math.PI * phase) / tp));
        else if (phase < tp + tn) glot = 0.5 * (1 + Math.cos((Math.PI * (phase - tp)) / tn));
        glot *= p.v;
      }
      const nz = p.nz > 0 ? noise() * p.nz * (p.v > 0 ? 0.45 : 1) : 0;
      let s = r3.tick(r2.tick(r1.tick(glot * 0.35 + nz * 0.22)));
      if (p.nz > 0.6) s += nz * 0.18;
      out[idx] = s * env * 0.9;
      f0 += (isEnd ? -0.0008 : 0.00015);
      f0 = Math.min(125, Math.max(95, f0));
    }
    prev = p;
  }

  let peak = 0.01;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const pcm = new Int16Array(out.length);
  const gain = 0.85 / peak;
  let hpX = 0;
  let hpY = 0;
  for (let i = 0; i < out.length; i++) {
    const x = out[i] * gain;
    hpY = x - hpX + 0.996 * hpY;
    hpX = x;
    const c = Math.max(-1, Math.min(1, hpY));
    pcm[i] = (c * 32767) | 0;
  }
  return encodeWav(pcm);
}

function speakLocal(text: string): TtsResult {
  return { buffer: synthWav(text), contentType: "audio/wav", ext: "wav" };
}
