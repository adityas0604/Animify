# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`backend/`)
```bash
npm install
serverless offline                 # local dev — emulates API Gateway + Lambda
npx prisma generate                # regenerate Prisma client after schema changes
npx prisma migrate dev --name <n>  # create + apply a new migration
npx prisma migrate deploy          # apply migrations (CI / production)
npx prisma studio                  # browse the database
```

### Frontend (`frontend/`)
```bash
npm install
npm run dev      # Vite dev server on port 8080
npm run build    # production build
npm run lint     # ESLint
```

### Manim Worker (`manim-rendrer/`)
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python worker.py          # production — polls SQS
uvicorn app:app --reload --port 8001  # local dev only — bypasses SQS
```

### Infrastructure

#### API backend (`backend/serverless.yaml`)
Deploys each endpoint as its own Lambda function behind API Gateway HTTP API.
Reads all config from `backend/.env` via Serverless Framework's native `useDotenv: true`.
Required `.env` keys: `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `SQS_QUEUE_URL`, `SQS_QUEUE_ARN`, `S3_BUCKET_NAME`, `AWS_REGION`.
```bash
cd backend
npm install
serverless deploy   # prisma generate runs automatically before packaging
serverless remove   # tear down
```

#### EC2 worker (`serverless.yml` — project root)
```bash
# Deploy
npm install -g serverless
serverless deploy \
  --param="repoUrl=..." \
  --param="databaseUrl=..." \
  --param="s3BucketName=..." \
  --param="sqsQueueUrl=..." \
  --param="keyPairName=..."

serverless remove   # tear down
```

There are no automated tests.

---

## Architecture

### Request flow

```
Frontend (React) → API Gateway → Lambda (Express) → PostgreSQL
                                       │
                                  SQS Queue
                                       │
                               EC2 Worker (Python)
                                       │
                                      S3
```

The API is deployed as **10 individual Lambda functions** (one per endpoint + one authorizer) behind **API Gateway HTTP API (v2)**. There is no Express server. Each handler is a plain async function that reads from the API Gateway event and returns an `{ statusCode, headers, body }` object. A **Lambda Authorizer** (`handlers/authorizer.js`) validates the JWT and injects `userId` into `event.requestContext.authorizer.lambda` before any `/user/*` handler is invoked — unauthorized requests never reach the handler Lambda. The worker is a separate **Python process on EC2** that long-polls SQS — it is not a server and has no HTTP interface in production.

### The async render pipeline

Rendering is intentionally decoupled from the API request. The compile endpoint does three things synchronously (validate, extract scene name, enqueue) and returns in milliseconds. The actual render happens out-of-band:

1. `POST /user/compile` → sets `Video.status = QUEUED`, sends `{ videoId, sceneName }` to SQS, returns immediately
2. `worker.py` long-polls SQS (20s wait), fetches the script from the DB by `videoId`, runs `manim`, uploads to S3, sets `Video.status = DONE`
3. Frontend polls `GET /user/videos/:id/status` every 3 seconds until `DONE` or `FAILED`

The SQS message carries only `{ videoId, sceneName }` — the script is fetched from the DB by the worker to stay under SQS's 256 KB message limit.

The worker **only deletes the SQS message on success**. On failure it does not delete, so SQS retries up to 3 times before routing to the dead-letter queue (`animify-render-dlq`).

### Video status lifecycle

`PENDING` → `QUEUED` → `PROCESSING` → `DONE` / `FAILED`

The `errorMsg` column on `Video` is populated on `FAILED`.

### Auth

JWT tokens (7-day expiry) are issued at login/signup and stored in `localStorage`. Every `/user/*` endpoint is protected by the Lambda Authorizer (`backend/handlers/authorizer.js`) configured in `serverless.yaml` via `authorizer: name: authorizer`. The authorizer verifies the token and injects `{ userId }` into `event.requestContext.authorizer.lambda`; handlers read it as `event.requestContext.authorizer.lambda.userId`. The frontend sends the token as `Authorization: Bearer <token>` from `AuthContext` (`frontend/src/context/AuthContext.tsx`).

### Frontend state

There is no global state library. Auth state lives in `AuthContext`. All API calls go through `frontend/src/api/animationApi.ts`. The `Dashboard` page owns compile/polling state and passes callbacks down to `ChatBox` (prompt submission) and `VideoPlayer` (video display). Polling is implemented with `setInterval` in `pollVideoStatus` — the cleanup function is returned and called after 10 minutes as a safety net.

### Key conventions

- The `@` alias in the frontend resolves to `frontend/src/`
- UI components are shadcn/ui (Radix primitives + Tailwind) — add new ones with `npx shadcn-ui@latest add <component>`
- Prisma client output is at `node_modules/.prisma/client` (set explicitly in `schema.prisma`); `binaryTargets` includes `rhel-openssl-3.0.x` so the correct engine binary is bundled for Lambda (Amazon Linux 2023 / OpenSSL 3); the `node_modules/.prisma/**` pattern in `serverless.yaml` ensures the binary survives esbuild packaging
- `backend/handler.js` is a thin re-exporter; logic lives in `backend/handlers/auth.js` (public), `backend/handlers/user.js` (protected), and `backend/handlers/authorizer.js` (JWT authorizer)
- `backend/lib/lambda.js` provides two shared utilities used by every handler: `response(statusCode, body)` (builds the API Gateway response with CORS headers) and `parseBody(event)` (decodes base64 or plain JSON body)
- `backend/serverless.yaml` uses `useDotenv: true` to load `backend/.env`; `serverless-esbuild` bundles each function individually (`package.individually: true`) with `exclude: []` so `aws-sdk` v2 is bundled (Lambda Node 20 no longer provides it); `serverless-plugin-scripts` runs `npx prisma generate` before packaging
- `bcryptjs` (pure-JS) is used instead of `bcrypt` (native C++) so esbuild can bundle it without native-binding issues
- The worker and `app.py` share the same directory and `.env` — `app.py` is for local dev only and is not used in production
