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
- **Webhook**: endpoint HTTP que pode **hibernar** após ~15 minutos sem tráfego (comportamento típico de free tier). Ao acordar, baixa o áudio se necessário, chama o Gemini para extrair JSON canônico de lançamento e **append** na planilha configurada.

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
2. Preencha `WEBHOOK_SHARED_SECRET` (o bot deve enviar `Authorization: Bearer <mesmo valor>` em `POST /ingest`).
3. Demais variáveis (`GEMINI_API_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, etc.) entram em uso quando o pipeline for integrado.

Detalhes do contrato HTTP e do corpo JSON estão em [`docs/context/ringo-system.md`](docs/context/ringo-system.md).

## Estrutura do repositório

```
ringo/
  package.json              # npm workspaces
  env.example               # variáveis documentadas → copiar para .env
  tsconfig.base.json
  apps/
    webhook/                # servidor HTTP (Node + TypeScript)
  packages/
    shared/                 # tipos compartilhados (@ringo/shared)
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
# Edite .env e defina WEBHOOK_SHARED_SECRET

npm run dev:webhook
```

- Saúde: [http://localhost:3000/health](http://localhost:3000/health) (porta padrão `3000`; sobrescreva com `PORT` no `.env`).
- Ingestão: `POST http://localhost:3000/ingest` com `Authorization: Bearer …` e corpo JSON conforme `IngestRequest` em `@ringo/shared`. A implementação atual valida o pedido e responde **501** (`not_implemented`) até Gemini e Google Sheets serem ligados.

Verificação de tipos do app webhook:

```bash
npm run typecheck -w @ringo/webhook
```

## Contribuir / desenvolver

1. Ler `docs/context/ringo-system.md` e as regras em `.cursor/rules/`.
2. Manter o contrato JSON de lançamento e o mapeamento para colunas da planilha documentados quando mudarem.
3. Priorizar soluções compatíveis com **custo zero ou baixo** e **cold start** aceitável.

## Licença

Definir conforme preferência do autor (projeto pessoal).
