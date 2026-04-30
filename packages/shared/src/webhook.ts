import type { LancamentoFinanceiro } from "./launch.js";

/** Modo de conteúdo recebido do Telegram. */
export type ModoIngestao = "text" | "audio";

/**
 * Payload JSON POST `/ingest` (bot → webhook).
 * Idempotência: usar `client_message_id` único por mensagem do Telegram.
 */
export type IngestRequest = {
  telegram_user_id: number;
  client_message_id: number;
  modo: ModoIngestao;
  /** Obrigatório quando `modo === "text"`. */
  texto?: string;
  /** URL HTTP(S) para o webhook baixar o áudio quando `modo === "audio"`. */
  audio_url?: string;
  mime_type?: string;
  /** ISO 8601 — instante em que o bot recebeu a mensagem. */
  recebido_em: string;
};

export type IngestError = {
  codigo: string;
  /** Mensagem segura para exibir ao usuário (sem stack nem segredos). */
  mensagem: string;
};

/**
 * Resposta JSON do webhook para o bot repassar ao usuário.
 */
export type IngestResponse = {
  ok: boolean;
  /** Texto de confirmação ou erro amigável. */
  mensagem_usuario: string;
  /** Preenchido quando `ok` e o pipeline extraiu um lançamento. */
  lancamento?: LancamentoFinanceiro;
  erro?: IngestError;
};
