import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from "@google/generative-ai";
import { DEFAULT_GEMINI_MODEL } from "./gemini-defaults.js";

export { DEFAULT_GEMINI_MODEL } from "./gemini-defaults.js";

/** @deprecated use DEFAULT_GEMINI_MODEL */
export const GEMINI_FLASH_MODEL = DEFAULT_GEMINI_MODEL;

export function createGeminiModel(
  apiKey: string,
  modelId: string = DEFAULT_GEMINI_MODEL,
): GenerativeModel {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("GEMINI_API_KEY is empty — cannot create Gemini client.");
  }
  const model = modelId.trim() || DEFAULT_GEMINI_MODEL;
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model });
}
