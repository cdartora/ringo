import type { IngestRequest, IngestResponse } from "@ringo/shared";
import type { LaunchRepository } from "../../repositories/launch.repository.js";
import { notImplementedResponse } from "./ingest-responses.js";

export type IngestServiceDeps = {
  allowedTelegramUserIds: Set<number> | null;
  launchRepository: LaunchRepository;
};

export type IngestService = {
  checkAllowlist(req: IngestRequest): IngestResponse | null;
  execute(validated: IngestRequest): Promise<{ status: number; body: IngestResponse }>;
};

export function createIngestService(deps: IngestServiceDeps): IngestService {
  const { allowedTelegramUserIds, launchRepository } = deps;

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
      return { status: 501, body: notImplementedResponse() };
    },
  };
}
