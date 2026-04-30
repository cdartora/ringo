import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { IngestRequest, IngestResponse } from "@ringo/shared";

const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_SHARED_SECRET = process.env.WEBHOOK_SHARED_SECRET ?? "";

function parseAllowedTelegramIds(raw: string | undefined): Set<number> | null {
  if (!raw?.trim()) return null;
  const ids = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids;
}

const ALLOWED_TELEGRAM_USER_IDS = parseAllowedTelegramIds(
  process.env.ALLOWED_TELEGRAM_USER_IDS,
);

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function badRequest(mensagem: string): IngestResponse {
  return {
    ok: false,
    mensagem_usuario: mensagem,
    erro: { codigo: "invalid_request", mensagem },
  };
}

type IngestObject = Record<string, unknown>;

function validateCommonFields(o: IngestObject): IngestResponse | null {
  const telegram_user_id = o.telegram_user_id;
  const client_message_id = o.client_message_id;
  const modo = o.modo;
  const recebido_em = o.recebido_em;

  if (typeof telegram_user_id !== "number" || !Number.isFinite(telegram_user_id)) {
    return badRequest("Campo telegram_user_id é obrigatório e deve ser número.");
  }
  if (typeof client_message_id !== "number" || !Number.isFinite(client_message_id)) {
    return badRequest("Campo client_message_id é obrigatório e deve ser número.");
  }
  if (modo !== "text" && modo !== "audio") {
    return badRequest('Campo modo deve ser "text" ou "audio".');
  }
  if (typeof recebido_em !== "string" || !recebido_em.trim()) {
    return badRequest("Campo recebido_em é obrigatório (ISO 8601).");
  }

  if (ALLOWED_TELEGRAM_USER_IDS && !ALLOWED_TELEGRAM_USER_IDS.has(telegram_user_id)) {
    const msg = "Usuário não autorizado.";
    return {
      ok: false,
      mensagem_usuario: msg,
      erro: { codigo: "forbidden", mensagem: msg },
    };
  }

  return null;
}

function optionalMime(o: IngestObject): { mime_type?: string } {
  const mime_type = o.mime_type;
  return typeof mime_type === "string" ? { mime_type } : {};
}

function validateIngestPayload(body: unknown): IngestRequest | IngestResponse {
  if (body === null || typeof body !== "object") {
    return badRequest("Corpo JSON inválido.");
  }
  const o = body as IngestObject;
  const commonError = validateCommonFields(o);
  if (commonError) return commonError;

  const telegram_user_id = o.telegram_user_id as number;
  const client_message_id = o.client_message_id as number;
  const modo = o.modo as "text" | "audio";
  const recebido_em = o.recebido_em as string;
  const mime = optionalMime(o);

  if (modo === "text") {
    const texto = o.texto;
    if (typeof texto !== "string" || !texto.trim()) {
      return badRequest('Campo texto é obrigatório quando modo é "text".');
    }
    return {
      telegram_user_id,
      client_message_id,
      modo,
      texto,
      recebido_em,
      ...mime,
    };
  }

  const audio_url = o.audio_url;
  if (typeof audio_url !== "string" || !audio_url.trim()) {
    return badRequest('Campo audio_url é obrigatório quando modo é "audio".');
  }
  return {
    telegram_user_id,
    client_message_id,
    modo,
    audio_url,
    recebido_em,
    ...mime,
  };
}

function unauthorizedResponse(): IngestResponse {
  const mensagem = "Credenciais inválidas ou ausentes.";
  return {
    ok: false,
    mensagem_usuario: mensagem,
    erro: { codigo: "unauthorized", mensagem },
  };
}

async function handlePostIngest(req: IncomingMessage, res: ServerResponse) {
  if (!WEBHOOK_SHARED_SECRET) {
    sendJson(res, 503, {
      ok: false,
      mensagem_usuario: "Servidor não configurado: defina WEBHOOK_SHARED_SECRET no .env.",
      erro: {
        codigo: "misconfigured",
        mensagem: "WEBHOOK_SHARED_SECRET ausente.",
      },
    } satisfies IngestResponse);
    return;
  }

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${WEBHOOK_SHARED_SECRET}`) {
    sendJson(res, 401, unauthorizedResponse());
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    sendJson(res, 400, badRequest("Não foi possível ler o corpo da requisição."));
    return;
  }

  let parsed: unknown;
  try {
    parsed = raw.length ? JSON.parse(raw) : null;
  } catch {
    sendJson(res, 400, badRequest("JSON malformado."));
    return;
  }

  const validated = validateIngestPayload(parsed);
  if ("ok" in validated) {
    const err = validated;
    const status = err.erro?.codigo === "forbidden" ? 403 : 400;
    sendJson(res, status, err);
    return;
  }

  const payload = validated;

  const stub: IngestResponse = {
    ok: false,
    mensagem_usuario:
      "Pipeline ainda não implementado: Gemini e Google Sheets serão integrados em seguida.",
    erro: {
      codigo: "not_implemented",
      mensagem:
        "Esta versão apenas valida o pedido; nenhum lançamento foi gravado.",
    },
  };

  console.error(
    "[ringo-webhook] ingest accepted (stub)",
    payload.modo,
    payload.client_message_id,
  );
  sendJson(res, 501, stub);
}

const server = createServer((req, res) => {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", service: "ringo-webhook" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ingest") {
    void handlePostIngest(req, res);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(PORT, () => {
  console.error(`[ringo-webhook] listening on http://localhost:${PORT}`);
  if (!WEBHOOK_SHARED_SECRET) {
    console.error(
      "[ringo-webhook] WEBHOOK_SHARED_SECRET is empty — POST /ingest will return 503 until set.",
    );
  }
});
