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

- **Função**: inbox — recebe **áudio** e **texto** vinculados ao usuário.
- **Não** precisa executar LLM nem escrever na planilha.
- Deve **encaminhar** payload (texto, referência ou bytes de áudio, `user_id`, timestamps) ao **webhook** com autenticação.
- Deve **responder** ao usuário:
  - confirmação de que o lançamento foi **registrado** (ou erro claro);
  - opcionalmente **string legível** com o que a LLM extraiu (categoria, valor, data, notas).

### 2. Webhook (HTTP)

- **Função**: orquestração — recebe evento do bot, chama **Gemini**, valida JSON, grava na **Sheet**.
- **Hibernação**: em free tier, instâncias frequentemente **dormem** após ~**15 min** sem tráfego. O primeiro request após idle pode ser lento.
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
- Se `modo === "audio"`: `audio_url` (string) obrigatório — URL que o webhook pode baixar (ex.: link do Telegram `getFile`).
- Opcional: `mime_type` (string).

Resposta JSON: tipo `IngestResponse` (`ok`, `mensagem_usuario`, `lancamento?`, `erro?`). O stub atual valida o pedido e responde **501** com `not_implemented` até Gemini/Sheets estarem ligados.

Variáveis de ambiente: ver `env.example` na raiz do repositório.


### 3. Google Gemini (Flash)

- **Entrada**: áudio (quando o usuário mandou voz) ou texto.
- **Saída**: **JSON estruturado** compatível com o **schema de lançamento** (ver abaixo). Flash é preferido por custo/latência em uso leve.
- Prompt deve instruir: apenas JSON válido, campos nulos quando incerto, moeda e locale do usuário.

### 4. Google Planilhas

- Planilha **já existente**, com colunas alinhadas ao schema (ou camada de mapeamento estável).
- Operação principal: **append** de uma linha por lançamento.
- Autenticação: **service account** (recomendado para bot headless) com a planilha compartilhada com o email da SA.

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

- `data` nulo → usar data local do servidor ou do evento Telegram (definir na implementação e documentar).
- Valores monetários sempre com ponto decimal ou formato fixo após normalização.
- Nunca gravar PII desnecessária na planilha além do necessário para o lançamento.

## Fluxos

### Áudio

1. Usuário envia mensagem de voz.
2. Bot obtém arquivo (Telegram `getFile`) e envia URL ou bytes ao webhook.
3. Webhook manda **áudio + instruções** ao Gemini Flash.
4. Webhook valida JSON, mapeia para colunas, **append** na planilha.
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

- Tratar **cold starts** como normais: mensagem “processando…” no Telegram.
- Logs estruturados mínimos (nível erro + id da mensagem).
- Falhas Gemini/Sheets: mensagem ao usuário sem vazar stack trace.
- Monitorar cotas: Gemini, Sheets, e plataforma de hospedagem.

## Glossário

- **Lançamento**: uma linha na planilha representando despesa, receita.
- **Webhook**: serviço HTTP que o bot invoca para processar o conteúdo.
- **RAG**: este arquivo e o README alimentam recuperação de contexto para implementação coerente.

## Links externos

- Board: [https://trello.com/b/quQF4X0L/ringo](https://trello.com/b/quQF4X0L/ringo)
- Gemini API: [https://ai.google.dev/](https://ai.google.dev/)
