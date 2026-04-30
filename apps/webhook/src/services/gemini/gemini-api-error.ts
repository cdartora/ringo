/**
 * Erros HTTP da Gemini Developer API (SDK `@google/generative-ai`).
 * Chave inválida costuma vir como **400** com texto "API key not valid".
 */
export function getGeminiFetchStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const s = (err as { status?: unknown }).status;
  return typeof s === "number" ? s : undefined;
}

export function mapGeminiCaughtError(err: unknown): {
  codigo: string;
  mensagemUsuario: string;
  logPayload: Record<string, unknown>;
} {
  const status = getGeminiFetchStatus(err);
  const message = extractMessage(err);
  const logPayload: Record<string, unknown> = {
    status,
    messagePreview: message.slice(0, 400),
  };

  const lower = message.toLowerCase();
  const apiKeyProblem =
    status === 401 ||
    status === 403 ||
    (status === 400 &&
      (lower.includes("api key not valid") ||
        lower.includes("invalid api key") ||
        lower.includes("api key invalid")));

  if (apiKeyProblem) {
    return {
      codigo: "gemini_auth",
      mensagemUsuario:
        "Chave da API Gemini inválida ou recusada. Cria ou renova a chave em Google AI Studio e atualiza GEMINI_API_KEY.",
      logPayload,
    };
  }

  if (status === 404) {
    return {
      codigo: "gemini_model_not_found",
      mensagemUsuario:
        "Modelo Gemini não disponível para esta chave ou região. Define GEMINI_MODEL no .env (ex.: gemini-2.5-flash ou gemini-2.0-flash) conforme a lista de modelos da tua conta.",
      logPayload,
    };
  }

  if (status === 429) {
    return {
      codigo: "gemini_rate_limit",
      mensagemUsuario:
        "Limite de pedidos à API Gemini foi atingido. Tenta mais tarde.",
      logPayload,
    };
  }

  if (status === 503 || status === 502) {
    return {
      codigo: "gemini_unavailable",
      mensagemUsuario:
        "O serviço Gemini está temporariamente indisponível. Tenta mais tarde.",
      logPayload,
    };
  }

  return {
    codigo: "gemini_unavailable",
    mensagemUsuario:
      "O serviço de interpretação está indisponível. Tenta mais tarde.",
    logPayload,
  };
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
