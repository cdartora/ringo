import type { Request, Response } from "express";

export function handleHealth(_req: Request, res: Response): void {
  res.status(200).json({ status: "ok", service: "ringo-webhook" });
}
