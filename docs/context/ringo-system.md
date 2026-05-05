# Ringo — contexto canônico do sistema (RAG / onboarding)

Este documento descreve o produto, limites e contratos para que agentes, humanos e pipelines de RAG compartilhem a **mesma fonte de verdade**. Atualize-o quando requisitos ou integrações mudarem.

## Objetivo

Permitir que uma pessoa registre **lançamentos de finanças pessoais** falando ou digitando no **Telegram**, com persistência automática em **Google Planilhas** e interpretação por **LLM** (prioridade: **Google Gemini Flash**, multimodal com **áudio**).

## Personas e escopo

- **Usuário único ou pequeno grupo** (projeto pessoal/independente).
- Volume **baixo** de requisições (dezenas por dia, não milhões).
- Aceita **latência de cold start** (~segundos a dezenas de segundos) após períodos sem uso.

## Componentes

### 1. Bot Telegram

- **Implementação atual** (`apps/bot`): processo Node com **[grammY](https://grammy.dev)** em **long polling** no desenvolvimento local; faz `POST` autenticado para `/ingest` com texto ou URL de arquivo em `api.telegram.org`.

- **Função**: inbox — recebe **áudio** e **texto** vinculados ao usuário.
- **Não** precisa executar LLM nem escrever na planilha.
- Deve **encaminhar** payload (texto, referência ou bytes de áudio, `user_id`, timestamps) ao **webhook** com autenticação.
- Deve **responder** ao usuário:
  - confirmação de que o lançamento foi **registrado** (ou erro claro);
  - opcionalmente **string legível** com o que a LLM extraiu (categoria, valor, data, notas).

### 2. Webhook (HTTP)

- **Função**: orquestração — recebe evento do bot, chama **Gemini**, valida JSON com **`lancamentoFinanceiroSchema`**, e grava na **Google Sheet** quando `GOOGLE_SHEETS_SPREADSHEET_ID` e `GOOGLE_APPLICATION_CREDENTIALS` estão configurados.
- **Hibernação**: em free tier, instâncias frequentemente **dormem** após ~**15 min** sem tráfego HTTP **entrada** para o hostname do serviço. O primeiro request após idle pode ser lento.
- **Deploy de referência (Render, monólito)**: webhook e bot Telegram correm **no mesmo** Web Service (`npm run start:production`), porque o polling do Telegram **não** conta como entrada HTTP e, sozinho, **não** impede spin-down do dyno. O ficheiro [`render.yaml`](../../render.yaml) na raiz do repo define build (`npm ci --include=dev`; necessário porque o arranque usa `tsx`) e arranque via [`scripts/render-start.sh`](../../scripts/render-start.sh): se existir secreto **`GOOGLE_SERVICE_ACCOUNT_JSON`**, materializa **`/tmp/google-sa.json`** e exporta **`GOOGLE_APPLICATION_CREDENTIALS`** antes de iniciar os processos. Credenciais locais continuam **`service-account.json`** ignorado pelo Git (**nunca** commitar). Em plano gratuito, um **cron externo** (ex.: UptimeRobot, cron-job.org) pode chamar **`GET /health`** a cada ~**10–14 min** para reduzir spin-down (endpoint público; uso aceitável para projeto pessoal).
- Deve ser **idempotente** quando possível (ex.: `client_message_id` para não duplicar linha).
- Timeouts: alinhar limite da plataforma com tempo de Gemini + Sheets (retry com backoff onde aplicável).

#### Contrato HTTP (implementação atual)

| Método | Rota | Autenticação |
|--------|------|----------------|
| `GET` | `/health` | Nenhuma |
| `POST` | `/ingest` | Cabeçalho `Authorization: Bearer <WEBHOOK_SHARED_SECRET>` |

Corpo JSON de `/ingest` definido e validado em runtime por **`ingestRequestSchema` (Zod)** em `@ringo/shared`, com tipos inferidos como `IngestRequest`:

- `telegram_user_id` (number), `client_message_id` (number), `modo` (`"text"` \| `"audio"`), `recebido_em` (ISO 8601).
- Se `modo === "text"`: `texto` (string) obrigatório.
- Se `modo === "audio"`: `audio_url` (string) obrigatório — URL **HTTPS** cujo hostname seja **`api.telegram.org`** (link `getFile` do Telegram). Outros hosts são rejeitados (mitigação SSRF).
- Opcional: `mime_type` (string).

Resposta JSON: tipo `IngestResponse` (`ok`, `mensagem_usuario`, `lancamento?`, `erro?`). Com `GEMINI_API_KEY` definido, o webhook chama **Gemini Flash**, interpreta texto ou áudio e valida o resultado com **`lancamentoFinanceiroSchema`** (`@ringo/shared`). Com Sheets configurado, persiste o lançamento na planilha (ver secção **Google Planilhas**); caso contrário `mensagem_usuario` indica que a planilha não está configurada.

##### Normalização de `data`

- Se o modelo devolver `data: null`, o webhook define `data` com a **data de calendário local do processo** (timezone do Node) derivada de `recebido_em`. Se `recebido_em` for inválido, usa-se a data local no momento do pedido.

##### Códigos em `erro.codigo` (orientação para o bot)

| codigo | Resumo |
|--------|--------|
| `misconfigured_gemini` | `GEMINI_API_KEY` ausente |
| `invalid_audio_url` | URL de áudio inválida ou host não permitido |
| `audio_download_failed` | Falha ao obter o ficheiro de áudio |
| `gemini_auth` | Chave API inválida ou recusada (401/403 ou 400 com mensagem de API key) |
| `gemini_model_not_found` | Modelo não encontrado para a conta/região (404); ajustar `GEMINI_MODEL` |
| `gemini_rate_limit` | Limite de pedidos / cota (429) |
| `gemini_unavailable` | Outros erros ao contactar a API Gemini |
| `gemini_blocked` | Bloqueio por filtros da API |
| `gemini_empty_response` | Resposta sem texto utilizável |
| `extraction_invalid` | JSON inválido ou fora do schema de lançamento |
| `sheet_date_not_found` | Data do lançamento não existe na coluna A (intervalo configurado) |
| `sheet_tab_not_found` | Aba `GOOGLE_SHEETS_TAB` não encontrada |
| `sheet_not_found` | ID da planilha inválido ou inacessível |
| `sheet_permission_denied` | Service account sem permissão na folha |
| `sheet_api_error` | Outro erro da API Sheets |
| `sheet_invalid_launch` | Data em falta após normalização (não deveria ocorrer em fluxo normal) |

Variáveis de ambiente: ver `env.example` (`GEMINI_API_KEY`, opcional `GEMINI_MODEL`, Google Sheets).


### 3. Google Gemini (Flash)

- **Entrada**: áudio (quando o usuário mandou voz) ou texto.
- **Modelo**: variável **`GEMINI_MODEL`** (omissão **`gemini-2.5-flash`**).
- **Saída**: **JSON estruturado** compatível com o **schema de lançamento** (ver abaixo). Flash é preferido por custo/latência em uso leve.
- Prompt deve instruir: apenas JSON válido, campos nulos quando incerto, moeda e locale do usuário.

### 4. Google Planilhas

- Planilha **já existente** com **datas na coluna A** (ex.: todas as datas de 2026); **entrada** em **B**, **saída** em **C**, **saldo** em **D** (fórmula), **descrição** do lançamento em **E**.
- **Primeiro** lançamento numa dada data: localiza a linha com essa data em A; se a célula **B** (receita) ou **C** (despesa) conforme o tipo estiver vazia, preenche **A** (data em texto `DD/MM/AAAA`), valor, **E** — **sem** apagar a fórmula em **D**.
- **Lançamento extra** no mesmo dia (célula B ou C alvo já ocupada): **insere** uma linha imediatamente abaixo do **último** bloco com a mesma data em **A**, **copia** a célula **D** da linha acima para manter a lógica de saldo, preenche **A**, **B** ou **C**, **E**.
- Mapeamento e limites ficam centralizados no webhook (`apps/webhook/src/services/google-sheets/`).
- Autenticação: **service account** com a planilha partilhada (Editor) com o email da SA — localmente por ficheiro JSON + `GOOGLE_APPLICATION_CREDENTIALS`; em **Render** (produção) por secreto `GOOGLE_SERVICE_ACCOUNT_JSON` conforme README e [`scripts/render-start.sh`](../../scripts/render-start.sh).

## Schema de lançamento (rascunho evolutivo)

Versão inicial sugerida (`schema_version: 1`):

```json
{
  "versao_schema": 1,
  "tipo": "expense | income",
  "valor": 0.0,
  "moeda": "BRL",
  "descricao": "string",
  "categoria": "string | null",
  "data": "YYYY-MM-DD | null",
  "observacoes": "string | null",
  "confianca": "high | medium | low | null"
}
```

Campos opcionais até o prompt da LLM fixar: `moeda`, `observacoes`, `confianca`.

**Regras:**

- `data` nulo na **saída do modelo** → preenchido pelo webhook com base em `recebido_em` (ver «Normalização de `data`» acima).
- Valores monetários sempre com ponto decimal ou formato fixo após normalização.
- Nunca gravar PII desnecessária na planilha além do necessário para o lançamento.

## Fluxos

### Áudio

1. Usuário envia mensagem de voz.
2. Bot obtém arquivo (Telegram `getFile`) e envia URL ou bytes ao webhook.
3. Webhook descarrega o áudio apenas de **`api.telegram.org`** e envia ao Gemini Flash.
4. Webhook valida JSON (`lancamentoFinanceiroSchema`) e grava na planilha quando configurado.
5. Bot responde sucesso + resumo.

### Texto

1. Usuário envia texto livre (“gastei 45 no mercado ontem”).
2. Bot encaminha texto ao webhook.
3. Mesmo pipeline sem etapa de download de áudio.

## Segurança e abuso (mínimo viável)

- Secret compartilhado ou **HMAC** entre bot e webhook.
- Lista allowlist de `telegram_user_id` (projeto pessoal).
- Limite simples de taxa por usuário (evita estouro de cota API).

## Free tier e estabilidade

- **Render free tier (opcional):** mesmo dyno com bot + webhook (**`start:production`**); spin-down esperado (**~15 min** sem entrada HTTP ao hostname). Pedidos externos a **`GET /health`** periodicamente amortizam (ver webhook acima).

- Tratar **cold starts** como normais: mensagem “processando…” no Telegram.
- Logs estruturados mínimos (nível erro + id da mensagem).
- Falhas Gemini/Sheets: mensagem ao usuário sem vazar stack trace.
- Respostas **502/503** transitórias na chamada `generateContent` disparam até **3 tentativas** com backoff (~1 s, ~2 s) antes de devolver erro ao utilizador.
- Monitorar cotas: Gemini, Sheets, e plataforma de hospedagem.

## Glossário

- **Lançamento**: uma linha na planilha representando despesa, receita.
- **Webhook**: serviço HTTP que o bot invoca para processar o conteúdo.
- **RAG**: este arquivo e o README alimentam recuperação de contexto para implementação coerente.

## Links externos

- Board: [https://trello.com/b/quQF4X0L/ringo](https://trello.com/b/quQF4X0L/ringo)
- Gemini API: [https://ai.google.dev/](https://ai.google.dev/)
