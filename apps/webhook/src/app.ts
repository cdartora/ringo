import express from "express";
import type { WebhookConfig } from "./config.js";
import { handleHealth } from "./controllers/health.controller.js";
import { createIngestPostHandler } from "./controllers/ingest.controller.js";
import { jsonParseErrorHandler } from "./middleware/json-parse-error.js";
import { fallbackErrorHandler } from "./middleware/fallback-error.js";
import {
  createRequireBearer,
  createVerifyBearerToken,
} from "./middleware/require-bearer.js";
import { LaunchRepository } from "./repositories/launch.repository.js";
import { createGeminiModel } from "./services/gemini/gemini-client.js";
import { extractLaunchFromIngest } from "./services/gemini/extract-launch-from-ingest.js";
import { createSheetLaunchWriter } from "./services/google-sheets/sheet-launch-writer.js";
import { createIngestService } from "./services/ingest/ingest.service.js";

export function createApp(config: WebhookConfig) {
  const app = express();

  const sheetWriter = config.googleSheets
    ? createSheetLaunchWriter(config.googleSheets)
    : null;
  const launchRepository = new LaunchRepository(sheetWriter);

  const geminiKey = config.geminiApiKey.trim();
  const geminiModel = geminiKey
    ? createGeminiModel(geminiKey, config.geminiModelId)
    : undefined;
  const ingestService = createIngestService({
    allowedTelegramUserIds: config.allowedTelegramUserIds,
    launchRepository,
    geminiApiKey: config.geminiApiKey,
    extractLaunch: geminiModel
      ? (req) => extractLaunchFromIngest(geminiModel, req)
      : undefined,
  });

  const requireBearerSecretPresent = createRequireBearer(config);
  const verifyBearer = createVerifyBearerToken(config);
  const postIngest = createIngestPostHandler({ ingestService });
  const ingestJson = express.json({ strict: true });

  app.get("/health", handleHealth);
  app.post(
    "/ingest",
    requireBearerSecretPresent,
    verifyBearer,
    ingestJson,
    (req, res, next) => {
      void postIngest(req, res).catch(next);
    },
  );

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use(jsonParseErrorHandler);
  app.use(fallbackErrorHandler);

  return app;
}
