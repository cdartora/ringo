import type { NextFunction, Request, Response } from "express";
import type { WebhookConfig } from "../config.js";
import { misconfiguredResponse, unauthorizedResponse } from "../services/ingest/ingest-responses.js";

export function createRequireBearer(config: WebhookConfig) {
  return function requireBearer(_req: Request, res: Response, next: NextFunction): void {
    if (!config.webhookSharedSecret) {
      res.status(503).json(misconfiguredResponse());
      return;
    }
    next();
  };
}

export function createVerifyBearerToken(config: WebhookConfig) {
  return function verifyBearerToken(req: Request, res: Response, next: NextFunction): void {
    if (req.headers.authorization !== `Bearer ${config.webhookSharedSecret}`) {
      res.status(401).json(unauthorizedResponse());
      return;
    }
    next();
  };
}
