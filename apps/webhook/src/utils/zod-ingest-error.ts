import { badRequest } from "../services/ingest/ingest-responses.js";

type ZodLike = { issues: { path: (string | number)[]; message: string }[] };

export function zodIssuesToBadRequest(error: ZodLike) {
  const summary = error.issues
    .map((i) => {
      const path = i.path.length ? `${i.path.join(".")}: ` : "";
      return `${path}${i.message}`;
    })
    .join("; ");
  return badRequest(summary || "Payload inválido.");
}
