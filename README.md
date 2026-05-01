# Ringo

Sistema pessoal para **capturar lançamentos financeiros por áudio ou texto** (Telegram) e **gravar automaticamente** em uma **Google Planilhas** já modelada para finanças pessoais. O processamento usa **Google Gemini** (prioridade: **Gemini Flash** com suporte a entrada multimodal, incluindo áudio).

Repositório único (**monorepo**): bot no Telegram e serviço webhook compartilham tipos, contratos de API e documentação — adequado para uso leve e free tier. Se no futuro o bot precisar escalar separado do processamento, pode-se extrair um segundo repositório; para começar, um repo reduz atrito e custos de CI/deploy.

Board de planejamento: [ringo no Trello](https://trello.com/b/quQF4X0L/ringo).

## Visão da arquitetura

```mermaid
flowchart LR
  U[Usuário Telegram] --> B[Bot Telegram]
  B -->|HTTP POST payload ou URL do áudio| W[Webhook serverless]
  W --> G[Gemini Flash]
  G -->|JSON estruturado| W
  W --> S[Google Sheets API]
  W --> B
  B --> U
```

- **Bot Telegram**: única responsabilidade exposta ao usuário — receber mensagens de **voz/áudio** e **texto**, encaminhar ao webhook (com autenticação), responder com confirmação e, opcionalmente, o **resumo do lançamento** retornado pela LLM.
- **Webhook**: endpoint HTTP que pode **hibernar** após ~15 minutos sem tráfego (comportamento típico de free tier). Ao acordar, descarrega o áudio apenas de `api.telegram.org` quando necessário, chama o Gemini para extrair JSON canônico de lançamento e **grava na Google Planilhas** quando `GOOGLE_SHEETS_SPREADSHEET_ID` e `GOOGLE_APPLICATION_CREDENTIALS` estão definidos (procura a data na coluna A; entrada em B, saída em C, descrição em E; lançamentos extra no mesmo dia inserem uma linha nova abaixo do bloco da data e copiam a fórmula de saldo em D).

Detalhes de contrato e limites estão em [`docs/context/ringo-system.md`](docs/context/ringo-system.md) (contexto do sistema para documentação e RAG).

## Requisitos funcionais (resumo)

| Entrada | Saída esperada |
|--------|-----------------|
| Áudio (voz) | Confirmação de lançamento; opcionalmente string com dados parseados (categoria, valor, data, observação, etc.). |
| Texto | Mesmo fluxo: confirmação + resumo parseado quando fizer sentido. |

## Stack sugerida (free tier / uso leve)

Valores e limites mudam; sempre confira os sites oficiais antes de fixar produção.

| Componente | Sugestão | Notas |
|------------|----------|--------|
| LLM | [Gemini API](https://ai.google.dev/) — modelo **Flash** | Multimodal; adequado para áudio + extração estruturada em JSON. |
| Hospedagem webhook | Plataforma com scale-to-zero (ex.: Cloud Run free tier, Render, Fly.io, ou similar) | Cold start após idle é esperado; manter handler idempotente e timeouts compatíveis. |
| Planilha | Google Sheets + Service Account ou OAuth | Cota da API Sheets para uso pessoal costuma ser suficiente para poucos lançamentos/dia. |
| Bot | Long-polling ou webhook do Telegram em processo leve | Bot pode rodar no mesmo serviço que o webhook **ou** em job gratuito separado, conforme limites da plataforma. |

## Configuração

1. Copie [`env.example`](env.example) para `.env` na **raiz** do repositório (`cp env.example .env`).
2. Preencha `WEBHOOK_SHARED_SECRET` (o bot envia `Authorization: Bearer <mesmo valor>` em `POST /ingest`).
3. Para o bot: `TELEGRAM_BOT_TOKEN`, `WEBHOOK_URL` (base do servidor, ex. `http://localhost:3000`) e, se quiser restringir acesso, `ALLOWED_TELEGRAM_USER_IDS` (mesma lista que o webhook usa).
4. Preencha `GEMINI_API_KEY` para o webhook chamar o **Gemini Flash** em `POST /ingest` e devolver `lancamento` validado. Sem a chave, `/ingest` responde **503** com `erro.codigo` `misconfigured_gemini`. Opcional: **`GEMINI_MODEL`** (omissão `gemini-2.5-flash`; em erro de modelo testa `gemini-2.0-flash`).
5. **Google Sheets**: `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_APPLICATION_CREDENTIALS` (caminho ao JSON da service account, relativo à raiz do repo ou absoluto). No Google Sheets, **Partilhar** → adiciona o endereço `client_email` desse JSON (ex.: `algo@projeto.iam.gserviceaccount.com`) com permissão **Editor**. Sem isto a API devolve 403. Opcional: `GOOGLE_SHEETS_TAB`, `GOOGLE_SHEETS_FIRST_DATA_ROW` (omissão `4`), `GOOGLE_SHEETS_MAX_ROWS`. Sem `SPREADSHEET_ID` / credenciais o webhook só interpreta o lançamento, sem gravar na folha.

Detalhes do contrato HTTP e do corpo JSON estão em [`docs/context/ringo-system.md`](docs/context/ringo-system.md).

## Estrutura do repositório

```
ringo/
  package.json              # npm workspaces
  env.example               # variáveis documentadas → copiar para .env
  tsconfig.base.json
  apps/
    bot/
      src/
        index.ts           # entrada: polling + encaminhar para /ingest
    webhook/
      src/
        app.ts             # Express: rotas e ordem dos middlewares
        server.ts          # listen
        middleware/
        controllers/
        services/
        repositories/
  packages/
    shared/                 # @ringo/shared — tipos + ingestRequestSchema + lancamentoFinanceiroSchema (Zod)
  docs/
    context/
      ringo-system.md
  postman/
    Ringo-Webhook.postman_collection.json
  .cursor/rules/
```

## Postman

Importe [`postman/Ringo-Webhook.postman_collection.json`](postman/Ringo-Webhook.postman_collection.json) no Postman. Na collection, defina `baseUrl` (ex.: `http://localhost:3000`) e `webhookSecret` igual a `WEBHOOK_SHARED_SECRET` do `.env`.

## Desenvolvimento local (webhook)

Requisitos: **Node.js 20+**.

```bash
npm install
cp env.example .env
# Edite .env: WEBHOOK_SHARED_SECRET e GEMINI_API_KEY

npm run dev:webhook
```

- O webhook carrega `.env` da **raiz do monorepo** (ao lado de `package.json` das workspaces), mesmo quando o comando corre em `apps/webhook`.
- Stack: **Express** (`apps/webhook`), validação do corpo com **Zod** no `@ringo/shared` (`ingestRequestSchema`; resposta da LLM validada com `lancamentoFinanceiroSchema`).
- Saúde: [http://localhost:3000/health](http://localhost:3000/health) (porta padrão `3000`; sobrescreva com `PORT` no `.env`).
- Ingestão: `POST …/ingest` autenticado. Com `GEMINI_API_KEY` definido, o webhook chama o Gemini Flash: **200** com `ok: true` e `lancamento` em caso de sucesso; **200** com `ok: false` para falhas tratadas (Gemini, validação, ou planilha: `sheet_date_not_found`, `sheet_permission_denied`, etc.); **503** se `GEMINI_API_KEY` estiver ausente. Com Sheets configurado, o lançamento é também escrito na planilha; caso contrário a mensagem de sucesso indica que a planilha não está configurada.

Verificação de tipos do app webhook:

```bash
npm run typecheck -w @ringo/webhook
npm run typecheck -w @ringo/bot
```

## Bot Telegram (desenvolvimento local)

1. No Telegram, fale com [@BotFather](https://t.me/BotFather), envie `/newbot`, defina nome e username; copie o **token** para `TELEGRAM_BOT_TOKEN` no `.env`.
2. Suba o webhook (`npm run dev:webhook`) com `WEBHOOK_SHARED_SECRET` e `GEMINI_API_KEY` preenchidos.
3. Em outro terminal: `npm run dev:bot`. O bot usa **long polling** (Telegram entrega updates direto ao processo; não precisa expor URL pública para o Telegram).
4. Opcional: defina `ALLOWED_TELEGRAM_USER_IDS` com seu `user_id` (número). Um jeito rápido de ver o ID é mandar algo para [@userinfobot](https://t.me/userinfobot).

## Contribuir / desenvolver

1. Ler `docs/context/ringo-system.md` e as regras em `.cursor/rules/`.
2. Manter o contrato JSON de lançamento e o mapeamento para colunas da planilha documentados quando mudarem.
3. Priorizar soluções compatíveis com **custo zero ou baixo** e **cold start** aceitável.

## Licença

Definir conforme preferência do autor (projeto pessoal).
