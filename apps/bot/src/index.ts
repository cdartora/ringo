import { loadEnvFromMonorepoRoot } from "./load-env.js";
import { loadBotConfig, validateStartup } from "./config.js";
import { startTelegramBot } from "./bot.js";

loadEnvFromMonorepoRoot();

const config = loadBotConfig();
const errors = validateStartup(config);
if (errors.length) {
  for (const e of errors) console.error(`[ringo-bot] ${e}`);
  process.exit(1);
}

await startTelegramBot(config);
