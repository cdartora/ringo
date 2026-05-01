import { loadEnvFromMonorepoRoot } from "./load-env.js";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

loadEnvFromMonorepoRoot();

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.error(`[ringo-webhook] listening on http://localhost:${config.port}`);
  if (!config.webhookSharedSecret) {
    console.error(
      "[ringo-webhook] WEBHOOK_SHARED_SECRET is empty — POST /ingest will return 503 until set.",
    );
  }
  if (!config.geminiApiKey.trim()) {
    console.error(
      "[ringo-webhook] GEMINI_API_KEY is empty — defina na raiz do repo (.env) ou nas variáveis do ambiente.",
    );
  } else {
    console.error(`[ringo-webhook] GEMINI_MODEL=${config.geminiModelId}`);
  }
  if (!config.googleSheets) {
    console.error(
      "[ringo-webhook] Google Sheets não configurado — defina GOOGLE_SHEETS_SPREADSHEET_ID e GOOGLE_APPLICATION_CREDENTIALS para gravar lançamentos.",
    );
  } else {
    console.error(
      "[ringo-webhook] Google Sheets ativo",
      `firstDataRow=${config.googleSheets.firstDataRow}`,
      config.googleSheets.tabTitle ?? "(primeira aba)",
      "— partilha a folha com:",
      config.googleSheets.serviceAccountEmail ??
        "(abre o JSON e usa client_email)",
    );
  }

});
