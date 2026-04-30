import "dotenv/config";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.error(`[ringo-webhook] listening on http://localhost:${config.port}`);
  if (!config.webhookSharedSecret) {
    console.error(
      "[ringo-webhook] WEBHOOK_SHARED_SECRET is empty — POST /ingest will return 503 until set.",
    );
  }
});
