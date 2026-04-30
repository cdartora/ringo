import type { IngestRequest } from "@ringo/shared";

/** Resultado até existir persistência real (ex.: Google Sheets). */
export type PersistIngestOutcome = { kind: "not_implemented" };

/**
 * Camada de persistência de lançamentos.
 * Stub atual não grava nada; futuramente orquestra append na planilha.
 */
export class LaunchRepository {
  async persistFromIngest(_req: IngestRequest): Promise<PersistIngestOutcome> {
    return { kind: "not_implemented" };
  }
}
