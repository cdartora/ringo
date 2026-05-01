/**
 * URL HTTPS aceita pelo webhook para `audio_url` (hostname `api.telegram.org`).
 */
export function buildTelegramFileUrl(botToken: string, filePath: string): string {
  const pathPart = filePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `https://api.telegram.org/file/bot${botToken}/${pathPart}`;
}
