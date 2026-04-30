import type { LancamentoFinanceiro } from "./launch.js";

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
