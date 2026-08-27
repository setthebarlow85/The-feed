import OpenAI from "openai";
import {
  gatewayToken,
  openaiAuthMode,
  openaiConfigured,
  openaiKeyConfigured,
  usingGateway,
} from "./env";

const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";

/** Create the OpenAI client at request time. Never instantiate at module load. */
export async function getOpenAI(): Promise<OpenAI | null> {
  if (openaiKeyConfigured()) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY!.trim() });
  }
  const token = await gatewayToken();
  if (!token) return null;
  return new OpenAI({
    apiKey: token,
    baseURL: GATEWAY_BASE,
  });
}

export function chatModel(): string {
  return usingGateway() ? "openai/gpt-4o-mini" : "gpt-4o-mini";
}

export function ttsModel(): string {
  return usingGateway() ? "openai/tts-1" : "tts-1";
}

export { openaiConfigured, openaiAuthMode, gatewayToken, usingGateway };
