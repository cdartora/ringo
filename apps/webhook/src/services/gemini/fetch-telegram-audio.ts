/** Hostname permitido para download do ficheiro de voz (evita SSRF no webhook). */
export const TELEGRAM_FILE_HOST = "api.telegram.org";

/** Limite de bytes lidos do áudio (Telegram voice tipicamente < 1 MB). */
export const TELEGRAM_AUDIO_MAX_BYTES = 10 * 1024 * 1024;

export const AUDIO_FETCH_TIMEOUT_MS = 45_000;

export type FetchTelegramAudioFailureCode =
  | "invalid_audio_url"
  | "audio_download_failed";

export type FetchTelegramAudioResult =
  | { ok: true; base64: string; mimeType: string }
  | { ok: false; codigo: FetchTelegramAudioFailureCode };

function parseHttpsTelegramUrl(audioUrl: string): URL | null {
  try {
    const url = new URL(audioUrl);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== TELEGRAM_FILE_HOST) return null;
    return url;
  } catch {
    return null;
  }
}

export async function fetchTelegramAudioAsBase64(
  audioUrl: string,
  mimeTypeFallback: string,
): Promise<FetchTelegramAudioResult> {
  const url = parseHttpsTelegramUrl(audioUrl);
  if (!url) {
    return { ok: false, codigo: "invalid_audio_url" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUDIO_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });

    let finalHost: string;
    try {
      finalHost = new URL(res.url).hostname;
    } catch {
      return { ok: false, codigo: "audio_download_failed" };
    }
    if (finalHost !== TELEGRAM_FILE_HOST) {
      return { ok: false, codigo: "invalid_audio_url" };
    }

    if (!res.ok) {
      return { ok: false, codigo: "audio_download_failed" };
    }

    const lenHeader = res.headers.get("content-length");
    if (lenHeader) {
      const n = Number(lenHeader);
      if (Number.isFinite(n) && n > TELEGRAM_AUDIO_MAX_BYTES) {
        return { ok: false, codigo: "audio_download_failed" };
      }
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > TELEGRAM_AUDIO_MAX_BYTES) {
      return { ok: false, codigo: "audio_download_failed" };
    }

    const mime =
      res.headers.get("content-type")?.split(";")[0]?.trim() || mimeTypeFallback;

    const base64 = Buffer.from(buf).toString("base64");
    return { ok: true, base64, mimeType: mime };
  } catch {
    return { ok: false, codigo: "audio_download_failed" };
  } finally {
    clearTimeout(timer);
  }
}
