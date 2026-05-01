import { Bot, type Context } from "grammy";
import type { IngestRequest, IngestResponse } from "@ringo/shared";
import type { BotConfig } from "./config.js";
import { formatLaunchLine } from "./format-launch-line.js";
import { postIngestToWebhook } from "./ingest-client.js";
import { buildTelegramFileUrl } from "./telegram-file-url.js";

function isoFromUnixMessageDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function allowlistDeniedMessage(
  allowed: Set<number> | null,
  telegramUserId: number | undefined,
): string | null {
  if (telegramUserId === undefined) {
    return "Não consegui identificar seu usuário no Telegram.";
  }
  if (allowed && !allowed.has(telegramUserId)) {
    return "Este bot não está autorizado para sua conta.";
  }
  return null;
}

function replyChunks(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    parts.push(text.slice(i, i + maxLen));
  }
  return parts;
}

/** Limite Telegram ~4096 com margem. */
const MAX_REPLY_CHARS = 3800;

async function replyIngestOutcome(ctx: Context, body: IngestResponse) {
  let out = body.mensagem_usuario;
  if (body.ok && body.lancamento) {
    out += `\n\nResumo: ${formatLaunchLine(body.lancamento)}`;
  }

  const chunks = replyChunks(out, MAX_REPLY_CHARS);
  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

export function createTelegramBot(config: BotConfig): Bot {
  const bot = new Bot(config.telegramBotToken);

  const helpText = [
    "Olá! Sou o Ringo.",
    "",
    "Envia texto livre sobre um lançamento (ex.: gastei 45 no café ontem) ou uma mensagem de voz.",
    "O servidor interpreta e responde com a confirmação.",
    "",
    "Comandos: /start e /help",
  ].join("\n");

  bot.command("start", async (ctx) => {
    await ctx.reply(helpText);
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(helpText);
  });

  bot.on("message:text", async (ctx) => {
    const denied = allowlistDeniedMessage(config.allowedTelegramUserIds, ctx.from?.id);
    if (denied) {
      await ctx.reply(denied);
      return;
    }

    const text = ctx.message.text.trim();
    if (!text) return;

    if (text.startsWith("/")) {
      await ctx.reply(
        "Comando desconhecido. Usa /start ou envia texto sobre um lançamento.",
      );
      return;
    }

    const uid = ctx.from!.id;

    await ctx.replyWithChatAction("typing");

    const recebido_em = isoFromUnixMessageDate(ctx.message.date);

    const payload: IngestRequest = {
      modo: "text",
      telegram_user_id: uid,
      client_message_id: ctx.message.message_id,
      recebido_em,
      texto: text,
    };

    const result = await postIngestToWebhook({
      baseUrl: config.webhookBaseUrl,
      bearerSecret: config.webhookSharedSecret,
      payload,
    });

    if (!result.ok) {
      await ctx.reply(result.error);
      return;
    }

    await replyIngestOutcome(ctx, result.body);
  });

  bot.on(["message:voice", "message:audio"], async (ctx) => {
    const denied = allowlistDeniedMessage(config.allowedTelegramUserIds, ctx.from?.id);
    if (denied) {
      await ctx.reply(denied);
      return;
    }

    const msg = ctx.message;
    const voiceOrAudio =
      "voice" in msg && msg.voice
        ? msg.voice
        : "audio" in msg && msg.audio
          ? msg.audio
          : null;

    if (!voiceOrAudio) return;

    const uid = ctx.from!.id;

    await ctx.replyWithChatAction("typing");

    const meta = await ctx.api.getFile(voiceOrAudio.file_id);
    if (!meta.file_path) {
      await ctx.reply("Não consegui obter o arquivo de áudio do Telegram.");
      return;
    }

    const audio_url = buildTelegramFileUrl(config.telegramBotToken, meta.file_path);

    const recebido_em = isoFromUnixMessageDate(msg.date);

    const mime =
      "mime_type" in voiceOrAudio && voiceOrAudio.mime_type?.trim()
        ? voiceOrAudio.mime_type.trim()
        : undefined;

    const payload: IngestRequest = {
      modo: "audio",
      telegram_user_id: uid,
      client_message_id: msg.message_id,
      recebido_em,
      audio_url,
      ...(mime ? { mime_type: mime } : {}),
    };

    const ingestResult = await postIngestToWebhook({
      baseUrl: config.webhookBaseUrl,
      bearerSecret: config.webhookSharedSecret,
      payload,
    });

    if (!ingestResult.ok) {
      await ctx.reply(ingestResult.error);
      return;
    }

    await replyIngestOutcome(ctx, ingestResult.body);
  });

  bot.catch((err) => {
    console.error("[ringo-bot] erro no middleware", err.error);
  });

  return bot;
}

export async function startTelegramBot(config: BotConfig): Promise<void> {
  const bot = createTelegramBot(config);
  await bot.start({
    onStart: (me) => {
      console.error(`[ringo-bot] long polling ativo (@${me.username})`);
    },
  });
}
