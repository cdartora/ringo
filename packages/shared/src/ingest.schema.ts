import { z } from "zod";

const ingestBase = z.object({
  telegram_user_id: z.number().finite(),
  client_message_id: z.number().finite(),
  recebido_em: z.string().min(1),
  mime_type: z.string().optional(),
});

/**
 * Contrato POST `/ingest` (bot → webhook).
 * `audio_url` usa `z.string().min(1)` (não `.url()`) para aceitar links longos/encoded do Telegram sem falsos negativos.
 */
export const ingestRequestSchema = z.discriminatedUnion("modo", [
  ingestBase.extend({
    modo: z.literal("text"),
    texto: z.string().min(1),
  }),
  ingestBase.extend({
    modo: z.literal("audio"),
    audio_url: z.string().min(1),
  }),
]);

export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type ModoIngestao = IngestRequest["modo"];
