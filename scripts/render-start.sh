#!/usr/bin/env bash
set -euo pipefail
# Render: secreto GOOGLE_SERVICE_ACCOUNT_JSON -> ficheiro; GOOGLE_APPLICATION_CREDENTIALS já resolvido no webhook.
if [[ -n "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  printf '%s\n' "$GOOGLE_SERVICE_ACCOUNT_JSON" >/tmp/google-sa.json
  export GOOGLE_APPLICATION_CREDENTIALS=/tmp/google-sa.json
fi
exec npm run start:production
