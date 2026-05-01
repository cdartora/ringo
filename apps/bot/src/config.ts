export type BotConfig = {
  telegramBotToken: string;
  webhookBaseUrl: string;
  webhookSharedSecret: string;
  allowedTelegramUserIds: Set<number> | null;
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

export function loadBotConfig(): BotConfig {
  return {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
    webhookBaseUrl: (process.env.WEBHOOK_URL ?? "http://localhost:3000").replace(
      /\/$/,
      "",
    ),
    webhookSharedSecret: process.env.WEBHOOK_SHARED_SECRET?.trim() ?? "",
    allowedTelegramUserIds: parseAllowedTelegramIds(
      process.env.ALLOWED_TELEGRAM_USER_IDS,
    ),
  };
}

export function validateStartup(config: BotConfig): string[] {
  const errors: string[] = [];
  if (!config.telegramBotToken) errors.push("TELEGRAM_BOT_TOKEN está vazio.");
  if (!config.webhookSharedSecret) errors.push("WEBHOOK_SHARED_SECRET está vazio.");
  return errors;
}
