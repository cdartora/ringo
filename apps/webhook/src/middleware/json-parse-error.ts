import type { NextFunction, Request, Response } from "express";
import { badRequest } from "../services/ingest/ingest-responses.js";

/**
 * Express chama `next(err)` quando o corpo não é JSON válido (express.json).
 */
export function jsonParseErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json(badRequest("JSON malformado."));
    return;
  }
  next(err);
}
