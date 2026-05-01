import type { LancamentoFinanceiroParsed } from "@ringo/shared";
import type { PersistLaunchResult } from "../services/google-sheets/sheet-launch-writer.js";

/**
 * Camada de persistência de lançamentos (Google Planilhas).
 */
export class LaunchRepository {
  constructor(
    private readonly sheetWriter: {
      persist(l: LancamentoFinanceiroParsed): Promise<PersistLaunchResult>;
    } | null,
  ) {}

  async persistLaunch(
    lancamento: LancamentoFinanceiroParsed,
  ): Promise<PersistLaunchResult> {
    if (!this.sheetWriter) {
      return { ok: true, wroteToSheet: false };
    }
    return this.sheetWriter.persist(lancamento);
  }
}
