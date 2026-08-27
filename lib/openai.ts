import OpenAI from "openai";
import { openaiConfigured } from "./env";

/** Create the OpenAI client at request time. Never instantiate at module load. */
export function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export { openaiConfigured };
