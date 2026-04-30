import { config as loadDotenv } from "dotenv";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Carrega `.env` da raiz do monorepo (`ringo/.env`).
 * `dotenv/config` usa só `process.cwd()`, que com `npm run dev -w @ringo/webhook`
 * aponta para `apps/webhook/` — onde normalmente não existe `.env`.
 */
export function loadEnvFromMonorepoRoot(): void {
  const serverDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(serverDir, "..", "..", "..");
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  loadDotenv({ path: envPath });
}
