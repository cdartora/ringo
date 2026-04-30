import type { NextFunction, Request, Response } from "express";

/** Último fallback para `next(err)` não tratado (ex.: falha async em handler). */
export function fallbackErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[ringo-webhook] unhandled error", err);
  if (res.headersSent) return;
  res.status(500).json({
    ok: false,
    mensagem_usuario: "Erro interno.",
    erro: { codigo: "internal", mensagem: "Erro interno." },
  });
}
