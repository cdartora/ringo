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
import { createIngestService } from "./services/ingest/ingest.service.js";

export function createApp(config: WebhookConfig) {
  const app = express();

  const launchRepository = new LaunchRepository();
  const ingestService = createIngestService({
    allowedTelegramUserIds: config.allowedTelegramUserIds,
    launchRepository,
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
