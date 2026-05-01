import { config as loadDotenv } from "dotenv";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Carrega `.env` da raiz do monorepo (`ringo/.env`).
 */
export function loadEnvFromMonorepoRoot(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..", "..", "..");
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) return;
  loadDotenv({ path: envPath, override: true });
}
