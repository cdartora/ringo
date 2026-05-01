import { isAbsolute, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { getMonorepoRoot } from "./repo-root.js";
import { DEFAULT_GEMINI_MODEL } from "./services/gemini/gemini-defaults.js";
import {
  DEFAULT_FIRST_DATA_ROW,
  DEFAULT_MAX_DATA_ROWS,
} from "./services/google-sheets/sheet-layout.js";

export type GoogleSheetsEnvConfig = {
  spreadsheetId: string;
  credentialsPath: string;
  /** `client_email` do JSON da service account (para mensagens e logs). */
  serviceAccountEmail: string | null;
  tabTitle: string | null;
  firstDataRow: number;
  maxDataRows: number;
};

export type WebhookConfig = {
  port: number;
  webhookSharedSecret: string;
  allowedTelegramUserIds: Set<number> | null;
  geminiApiKey: string;
  geminiModelId: string;
  googleSheets: GoogleSheetsEnvConfig | null;
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

function resolveCredentialsPath(raw: string): string {
  const t = raw.trim();
  if (isAbsolute(t)) return t;
  return join(getMonorepoRoot(), t);
}

function readServiceAccountEmail(credentialsPath: string): string | null {
  try {
    const raw = readFileSync(credentialsPath, "utf8");
    const j = JSON.parse(raw) as { client_email?: string };
    const e = j.client_email?.trim();
    return e || null;
  } catch {
    return null;
  }
}

function loadGoogleSheetsConfig(): GoogleSheetsEnvConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ?? "";
  const credRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ?? "";
  if (!spreadsheetId || !credRaw) return null;

  const credentialsPath = resolveCredentialsPath(credRaw);
  if (!existsSync(credentialsPath)) {
    console.error(
      "[ringo-webhook] GOOGLE_APPLICATION_CREDENTIALS file not found:",
      credentialsPath,
    );
    return null;
  }

  const tab = process.env.GOOGLE_SHEETS_TAB?.trim() || null;
  const firstDataRow = Number(process.env.GOOGLE_SHEETS_FIRST_DATA_ROW);
  const maxDataRows = Number(process.env.GOOGLE_SHEETS_MAX_ROWS);

  return {
    spreadsheetId,
    credentialsPath,
    serviceAccountEmail: readServiceAccountEmail(credentialsPath),
    tabTitle: tab,
    firstDataRow: Number.isFinite(firstDataRow) && firstDataRow > 0
      ? Math.floor(firstDataRow)
      : DEFAULT_FIRST_DATA_ROW,
    maxDataRows: Number.isFinite(maxDataRows) && maxDataRows > 0
      ? Math.floor(maxDataRows)
      : DEFAULT_MAX_DATA_ROWS,
  };
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
    googleSheets: loadGoogleSheetsConfig(),
  };
}
