import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Raiz do monorepo (`ringo/`), a partir de `apps/webhook/src/`. */
export function getMonorepoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}
