import type { Request, Response } from "express";
import { ingestRequestSchema } from "@ringo/shared";
import type { IngestService } from "../services/ingest/ingest.service.js";
import { zodIssuesToBadRequest } from "../utils/zod-ingest-error.js";

export type IngestRouteDeps = {
  ingestService: IngestService;
};

export function createIngestPostHandler(deps: IngestRouteDeps) {
  const { ingestService } = deps;

  return async function postIngest(req: Request, res: Response): Promise<void> {
    const parsed = ingestRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(zodIssuesToBadRequest(parsed.error));
      return;
    }

    const forbidden = ingestService.checkAllowlist(parsed.data);
    if (forbidden) {
      res.status(403).json(forbidden);
      return;
    }

    const result = await ingestService.execute(parsed.data);
    console.error(
      "[ringo-webhook] ingest processed",
      parsed.data.modo,
      parsed.data.client_message_id,
      result.status,
    );
    res.status(result.status).json(result.body);
  };
}
