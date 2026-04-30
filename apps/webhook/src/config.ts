import { DEFAULT_GEMINI_MODEL } from "./services/gemini/gemini-defaults.js";

export type WebhookConfig = {
  port: number;
  webhookSharedSecret: string;
  allowedTelegramUserIds: Set<number> | null;
  geminiApiKey: string;
  geminiModelId: string;
};

function parseAllowedTelegramIds(raw: string | undefined): Set<number> | null {
  if (!raw?.trim()) return null;
  const ids = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids;
}

export function loadConfig(): WebhookConfig {
  return {
    port: Number(process.env.PORT) || 3000,
    webhookSharedSecret: process.env.WEBHOOK_SHARED_SECRET ?? "",
    allowedTelegramUserIds: parseAllowedTelegramIds(
      process.env.ALLOWED_TELEGRAM_USER_IDS,
    ),
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    geminiModelId:
      process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
  };
}
