import type { IngestRequest, IngestResponse } from "@ringo/shared";

export type PostIngestResult =
  | { ok: true; status: number; body: IngestResponse }
  | { ok: false; status?: number; error: string };

export async function postIngestToWebhook(params: {
  baseUrl: string;
  bearerSecret: string;
  payload: IngestRequest;
}): Promise<PostIngestResult> {
  const url = `${params.baseUrl.replace(/\/$/, "")}/ingest`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.bearerSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.payload),
    });

    let body: unknown;
    const raw = await res.text();
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return {
        ok: false,
        status: res.status,
        error: "Resposta inválida do servidor. Tente de novo em instantes.",
      };
    }

    if (typeof body !== "object" || body === null) {
      return { ok: false, status: res.status, error: "Resposta inválida do servidor." };
    }

    const b = body as Record<string, unknown>;
    if (typeof b.ok !== "boolean" || typeof b.mensagem_usuario !== "string") {
      return { ok: false, status: res.status, error: "Formato da resposta inesperado." };
    }

    return {
      ok: true,
      status: res.status,
      body: body as IngestResponse,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro de rede";
    return {
      ok: false,
      error: `Não foi possível contatar o webhook (${msg}). Verifique WEBHOOK_URL e se o servidor está em execução.`,
    };
  }
}
