import type { IngestRequest, IngestResponse } from "@ringo/shared";
import type { LaunchRepository } from "../../repositories/launch.repository.js";
import type { ExtractLaunchFromIngestResult } from "../gemini/extract-launch-from-ingest.js";
import {
  geminiMisconfiguredResponse,
} from "./ingest-responses.js";
import {
  buildLaunchConfirmationMessage,
  fillMissingLaunchDate,
} from "./normalize-launch.js";

export type IngestServiceDeps = {
  allowedTelegramUserIds: Set<number> | null;
  launchRepository: LaunchRepository;
  geminiApiKey: string;
  extractLaunch?: (
    req: IngestRequest,
  ) => Promise<ExtractLaunchFromIngestResult>;
};

export type IngestService = {
  checkAllowlist(req: IngestRequest): IngestResponse | null;
  execute(validated: IngestRequest): Promise<{ status: number; body: IngestResponse }>;
};

export function createIngestService(deps: IngestServiceDeps): IngestService {
  const { allowedTelegramUserIds, launchRepository, geminiApiKey, extractLaunch } =
    deps;

  return {
    checkAllowlist(req: IngestRequest): IngestResponse | null {
      if (!allowedTelegramUserIds) return null;
      if (!allowedTelegramUserIds.has(req.telegram_user_id)) {
        const msg = "Usuário não autorizado.";
        return {
          ok: false,
          mensagem_usuario: msg,
          erro: { codigo: "forbidden", mensagem: msg },
        };
      }
      return null;
    },

    async execute(validated: IngestRequest) {
      await launchRepository.persistFromIngest(validated);

      if (!geminiApiKey.trim() || !extractLaunch) {
        return { status: 503, body: geminiMisconfiguredResponse() };
      }

      const extracted = await extractLaunch(validated);
      if (!extracted.ok) {
        return { status: 200, body: extracted.response };
      }

      const lancamento = fillMissingLaunchDate(
        extracted.lancamento,
        validated.recebido_em,
      );

      return {
        status: 200,
        body: {
          ok: true,
          mensagem_usuario: buildLaunchConfirmationMessage(lancamento),
          lancamento,
        },
      };
    },
  };
}
