import type { IngestResponse } from "@ringo/shared";

export function badRequest(mensagem: string): IngestResponse {
  return {
    ok: false,
    mensagem_usuario: mensagem,
    erro: { codigo: "invalid_request", mensagem },
  };
}

export function unauthorizedResponse(): IngestResponse {
  const mensagem = "Credenciais inválidas ou ausentes.";
  return {
    ok: false,
    mensagem_usuario: mensagem,
    erro: { codigo: "unauthorized", mensagem },
  };
}

export function misconfiguredResponse(): IngestResponse {
  return {
    ok: false,
    mensagem_usuario: "Servidor não configurado: defina WEBHOOK_SHARED_SECRET no .env.",
    erro: {
      codigo: "misconfigured",
      mensagem: "WEBHOOK_SHARED_SECRET ausente.",
    },
  };
}

export function notImplementedResponse(): IngestResponse {
  return {
    ok: false,
    mensagem_usuario:
      "Pipeline ainda não implementado: Gemini e Google Sheets serão integrados em seguida.",
    erro: {
      codigo: "not_implemented",
      mensagem:
        "Esta versão apenas valida o pedido; nenhum lançamento foi gravado.",
    },
  };
}
