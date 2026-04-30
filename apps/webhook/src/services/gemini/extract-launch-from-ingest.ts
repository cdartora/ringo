import type { GenerativeModel } from "@google/generative-ai";
import {
  parseLancamentoFinanceiro,
  type IngestRequest,
  type IngestResponse,
  type LancamentoFinanceiroParsed,
} from "@ringo/shared";
import {
  getGeminiFetchStatus,
  mapGeminiCaughtError,
} from "./gemini-api-error.js";
import { GEMINI_EXTRACTION_SYSTEM_PROMPT } from "./extraction-prompt.js";
import { fetchTelegramAudioAsBase64 } from "./fetch-telegram-audio.js";
import { parseJsonObjectFromModelText } from "./parse-model-json.js";

export type ExtractLaunchFromIngestResult =
  | { ok: true; lancamento: LancamentoFinanceiroParsed }
  | { ok: false; response: IngestResponse };

const FALLBACK_VOICE_MIME = "audio/ogg";

/** 1 chamada inicial + 2 retries em 502/503. */
const MAX_GENERATE_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;

type GenerateContentResult = Awaited<
  ReturnType<GenerativeModel["generateContent"]>
>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateContentWithRetries(
  model: GenerativeModel,
  req: IngestRequest,
  parts: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[],
): Promise<
  | { ok: true; apiResult: GenerateContentResult }
  | { ok: false; err: unknown }
> {
  const requestParams = {
    systemInstruction: GEMINI_EXTRACTION_SYSTEM_PROMPT,
    contents: [{ role: "user" as const, parts }],
    generationConfig: {
      responseMimeType: "application/json" as const,
      temperature: 0.2,
    },
  };

  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt++) {
    try {
      const apiResult = await model.generateContent(requestParams);
      return { ok: true, apiResult };
    } catch (err) {
      const status = getGeminiFetchStatus(err);
      const willRetry =
        (status === 502 || status === 503) && attempt < MAX_GENERATE_ATTEMPTS;
      if (!willRetry) {
        return { ok: false, err };
      }
      const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.error("[ringo-webhook] Gemini generateContent retry", {
        client_message_id: req.client_message_id,
        attempt,
        status,
        delayMs,
      });
      await sleep(delayMs);
    }
  }

  throw new Error("Gemini generateContent retries: unreachable");
}

function extractionFailResponse(
  codigo: string,
  mensagemUsuario: string,
): IngestResponse {
  return {
    ok: false,
    mensagem_usuario: mensagemUsuario,
    erro: { codigo, mensagem: mensagemUsuario },
  };
}

function logExtractFail(req: IngestRequest, codigo: string): void {
  console.error("[ringo-webhook] extract launch failed", {
    client_message_id: req.client_message_id,
    modo: req.modo,
    codigo,
  });
}

export async function extractLaunchFromIngest(
  model: GenerativeModel,
  req: IngestRequest,
): Promise<ExtractLaunchFromIngestResult> {
  let parts: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[];

  if (req.modo === "audio") {
    const mimeFallback = req.mime_type?.trim() || FALLBACK_VOICE_MIME;
    const fetched = await fetchTelegramAudioAsBase64(req.audio_url, mimeFallback);
    if (!fetched.ok) {
      logExtractFail(req, fetched.codigo);
      const msg =
        fetched.codigo === "invalid_audio_url"
          ? "URL de áudio inválida ou não permitida."
          : "Não foi possível descarregar o áudio. Tenta outra vez.";
      return {
        ok: false,
        response: extractionFailResponse(fetched.codigo, msg),
      };
    }
    parts = [
      {
        inlineData: {
          mimeType: fetched.mimeType,
          data: fetched.base64,
        },
      },
      { text: "Extrai o lançamento financeiro a partir deste áudio." },
    ];
  } else {
    parts = [{ text: `--- Mensagem do utilizador ---\n${req.texto}` }];
  }

  try {
    const generated = await generateContentWithRetries(model, req, parts);
    if (!generated.ok) {
      const mapped = mapGeminiCaughtError(generated.err);
      logExtractFail(req, mapped.codigo);
      console.error("[ringo-webhook] Gemini API error", {
        client_message_id: req.client_message_id,
        modo: req.modo,
        ...mapped.logPayload,
      });
      return {
        ok: false,
        response: extractionFailResponse(
          mapped.codigo,
          mapped.mensagemUsuario,
        ),
      };
    }

    const apiResult = generated.apiResult;

    const block = apiResult.response.promptFeedback?.blockReason;
    if (block) {
      logExtractFail(req, "gemini_blocked");
      return {
        ok: false,
        response: extractionFailResponse(
          "gemini_blocked",
          "Não foi possível processar o conteúdo neste momento.",
        ),
      };
    }

    let rawText: string;
    try {
      rawText = apiResult.response.text();
    } catch {
      logExtractFail(req, "gemini_empty_response");
      return {
        ok: false,
        response: extractionFailResponse(
          "gemini_empty_response",
          "O assistente não devolveu dados utilizáveis. Tenta reformular.",
        ),
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = parseJsonObjectFromModelText(rawText);
    } catch {
      logExtractFail(req, "extraction_invalid_json");
      return {
        ok: false,
        response: extractionFailResponse(
          "extraction_invalid",
          "Não consegui interpretar a resposta do assistente como JSON válido.",
        ),
      };
    }

    const validated = parseLancamentoFinanceiro(parsedJson);
    if (!validated.ok) {
      logExtractFail(req, "extraction_invalid_schema");
      return {
        ok: false,
        response: extractionFailResponse(
          "extraction_invalid",
          "Os dados extraídos não seguem o formato esperado.",
        ),
      };
    }

    return { ok: true, lancamento: validated.value };
  } catch (err) {
    const mapped = mapGeminiCaughtError(err);
    logExtractFail(req, mapped.codigo);
    console.error("[ringo-webhook] Gemini API error", {
      client_message_id: req.client_message_id,
      modo: req.modo,
      ...mapped.logPayload,
    });
    return {
      ok: false,
      response: extractionFailResponse(
        mapped.codigo,
        mapped.mensagemUsuario,
      ),
    };
  }
}
