# Animify

Animify ("Prompt to Animate") turns natural-language prompts into **Manim** animations. Users describe what they want, the system generates Python scene code via OpenAI, and an async render pipeline produces an MP4 uploaded to S3.

---

## Architecture

```
┌─────────────┐        ┌──────────────────────────────────┐        ┌──────────────┐
│   Frontend  │        │        AWS API Gateway           │        │  PostgreSQL  │
│  (React/TS) │──────▶ │  (HTTP API — routes all /*)      │──────▶ │  (Prisma)    │
│  port 8080  │        └───────────────┬──────────────────┘        └──────────────┘
└─────────────┘                        │
                                       │  invokes
                                       ▼
                          ┌────────────────────────┐
                          │     AWS Lambda         │
                          │  (Express via handler) │
                          │  backend/handler.js    │
                          └────────────┬───────────┘
                                       │
                    1. POST /user/generate
                       → OpenAI generates Manim script
                       → saved to DB (status: PENDING)
                                       │
                    2. POST /user/compile
                       → enqueue to SQS (videoId, sceneName)
                       → return { status: "queued" } immediately
                                       │
                                       ▼
                              ┌────────────────┐
                              │   AWS SQS      │
                              │  render queue  │
                              └───────┬────────┘
                                      │  long poll (20s)
                                      ▼
                              ┌────────────────┐        ┌──────────────┐
                              │  Manim Worker  │──────▶ │   AWS S3     │
                              │  (EC2/Python)  │        │  (MP4 store) │
                              │  worker.py     │        └──────────────┘
                              └───────┬────────┘
                                      │
                    3. runs manim subprocess
                       uploads MP4 to S3
                       updates DB (status: DONE, filename: s3_key)
                                      │
                                      ▼
                    4. Frontend polls GET /user/videos/:id/status
                       → status: DONE → Lambda returns presigned URLs
                       → video streams in player
```

### Component Responsibilities

| Component | Location | Role |
|-----------|----------|------|
| **Frontend** | `frontend/` | Chat UI, code viewer, video player. Polls render status after compile. |
| **API Gateway** | AWS API Gateway | HTTP API entry point (`backend/serverless.yaml`). Routes requests to Lambda functions (`serverless-http` + Express). |
| **Lambda** | AWS Lambda | Runs the Express app (`backend/`) as a serverless function. Handles auth, OpenAI generation, SQS enqueue, and presigned URLs. Scales to zero when idle. |
| **Manim Worker** | `manim-rendrer/worker.py` | Long-polls SQS, runs `manim`, uploads MP4 to S3, updates DB status. Runs on EC2. |
| **Database** | PostgreSQL via Prisma | `User` and `Video` models. `Video` tracks `status` (PENDING → QUEUED → PROCESSING → DONE / FAILED). |
| **SQS Queue** | AWS SQS | Decouples compile requests from rendering. Messages retry automatically on failure, dead-letter after 3 attempts. |
| **S3** | AWS S3 | Stores rendered MP4s. Lambda generates 1-hour presigned URLs for streaming and download. |

### Why Lambda for the API

The Express backend is stateless — every request reads from the DB, calls an external API (OpenAI / SQS / S3), and returns. This maps cleanly onto Lambda:

- **No idle cost** — Lambda scales to zero between requests
- **No server management** — no EC2 to patch or keep alive
- **Automatic scaling** — concurrent requests spin up independent invocations
- **Separation of concerns** — short-lived API work (Lambda) is cleanly separated from long-running render work (EC2 worker)

### Async Render Flow

```
POST /user/compile
       │
       ├── validate ownership
       ├── extract scene class name from script
       ├── update Video.status = QUEUED
       ├── sqs.sendMessage({ videoId, sceneName })
       └── return { status: "queued", videoId }   ← responds in milliseconds

                    (worker picks it up)

worker.py loop
       │
       ├── sqs.receive_message (long poll, 20s wait)
       ├── fetch script from DB by videoId
       ├── update Video.status = PROCESSING
       ├── subprocess: manim -ql script.py SceneName
       ├── upload MP4 to S3
       ├── update Video.status = DONE, filename = s3_key
       └── sqs.delete_message   ← only on success; failure = auto-retry
```

---

## Repository Layout

```
Animify/
├── frontend/               # Vite + React + TypeScript + Tailwind (port 8080)
├── backend/                # Express API + Prisma ORM + Serverless Lambda
│   ├── app.js             # Local dev server (port 8000)
│   ├── handler.js          # Lambda entry (Express via serverless-http)
│   ├── serverless.yaml     # API deploy — Lambda + HTTP API routes
│   ├── routes/
│   │   ├── auth.js        # POST /auth/signup, /auth/login
│   │   └── user.js        # All /user/* routes
│   ├── prisma/
│   │   └── schema.prisma  # User, Video models
│   └── lib/
│       └── openaiClient.js
├── manim-rendrer/         # Render worker (production: EC2)
│   ├── worker.py           # SQS consumer — production worker
│   ├── app.py             # FastAPI render endpoint (local dev only)
│   └── requirements.txt
├── EC2_WORKER_DEPLOYMENT.md  # Step-by-step: SQS, IAM, EC2, systemd, worker `.env`
└── .gitignore
```

---

## Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **PostgreSQL** database
- **AWS** account with:
  - S3 bucket for video storage
  - SQS queue (`animify-render-queue`) + dead-letter queue (`animify-render-dlq`)
  - Lambda function + API Gateway HTTP API (for the Express backend)
  - EC2 key pair (for worker deployment)
- **OpenAI API** key (`gpt-4o-mini`)
- **Manim Community Edition** + system deps (LaTeX, ffmpeg, Cairo) — on EC2 only for production

---

## Environment Variables

### Backend — `backend/.env`

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `OPENAI_API_KEY` | OpenAI API key |
| `AWS_ACCESS_KEY_ID` | *(Local dev optional.)* Omit on Lambda — use execution role IAM only. |
| `AWS_SECRET_ACCESS_KEY` | *(Local dev optional.)* Omit on Lambda. |
| `AWS_REGION` | AWS region (e.g. `us-east-2`) |
| `S3_BUCKET_NAME` | S3 bucket for rendered videos |
| `SQS_QUEUE_URL` | SQS queue URL — create queues per `EC2_WORKER_DEPLOYMENT.md` |
| `SQS_QUEUE_ARN` | Queue ARN — required by `backend/serverless.yaml` for IAM `sqs:SendMessage` |

### Frontend — `frontend/.env`

```bash
# Local development
VITE_API_URL=http://localhost:8000

# Production — replace with your API Gateway invoke URL
VITE_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com
```

### Manim Worker — `manim-rendrer/.env`

| Variable | Description |
|----------|-------------|
| `SQS_QUEUE_URL` | Same SQS queue URL as the backend |
| `DATABASE_URL` | Same PostgreSQL connection string |
| `S3_BUCKET_NAME` | Same S3 bucket |
| `AWS_REGION` | AWS region |

> **Note:** `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are not needed on EC2 — the IAM instance role handles authentication automatically.

---

## Database Setup

From `backend/`:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

The `Video` model tracks render state via a `status` field:

| Status | Meaning |
|--------|---------|
| `PENDING` | Script generated, not yet submitted for render |
| `QUEUED` | Message sent to SQS, waiting for a worker |
| `PROCESSING` | Worker picked it up, Manim is running |
| `DONE` | MP4 uploaded to S3, presigned URLs available |
| `FAILED` | Render failed after retries; see `errorMsg` field |

---

## Running Locally

For local development the worker can be run directly (without SQS) using the FastAPI renderer.

**1. Start PostgreSQL** at `DATABASE_URL`.

**2. Backend** (port 8000):
```bash
cd backend && npm install && node app.js
```

**3. Manim renderer** (port 8001) — local dev only, bypasses SQS:
```bash
cd manim-rendrer
pip install -r requirements.txt
uvicorn app:app --reload --port 8001
```

**4. Frontend** (port 8080):
```bash
cd frontend && npm install && npm run dev
```

Open **http://localhost:8080**, sign up, describe an animation, generate code, then compile.

> For local dev the backend's `/user/compile` still calls the FastAPI renderer directly if you haven't set `SQS_QUEUE_URL`. Set it to use the full async flow locally too.

---

## Production Deployment

### API — Lambda + API Gateway (`backend/serverless.yaml`)

The Express backend is wrapped with [`serverless-http`](https://github.com/dougmoscrop/serverless-http): each HTTP route invokes a Lambda that runs Express + your existing `routes/`. Packaging uses [`serverless-esbuild`](https://github.com/floydspace/serverless-esbuild).

```
API Gateway HTTP API  →  Lambda (Express handler)  →  PostgreSQL / SQS / S3
```

**Deploy:**

```bash
cd backend
# Ensure .env defines DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, SQS_*, S3_BUCKET_NAME (see table above).
npm install
npx serverless deploy --stage dev
```

Configure `provider.httpApi.cors` in `serverless.yaml` so browsers can call your API cross-origin (`cors: true` is sufficient for broad dev; tighten `allowedOrigins` in production).

Environment variables loaded for deploy correspond to **`backend/.env`** (see `useDotenv` / `provider.environment`). At minimum Lambda needs:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `OPENAI_API_KEY` | OpenAI API key |
| `S3_BUCKET_NAME` | Bucket for uploads / presigned GET |
| `SQS_QUEUE_URL` | `compile` enqueue target |
| `SQS_QUEUE_ARN` | Used in IAM for `sqs:SendMessage` |

> **Prefer IAM over static keys:** do **not** set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` on Lambda. Use the Lambda execution role for SQS and presigned S3 URLs (temporary `ASIA…` credentials with a session token). Set `AWS_REGION` implicitly via Lambda or as needed.

After deploy, point `frontend/.env` at the printed invoke URL (`VITE_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com`).

---

### Worker — EC2 (Manim render)

Production rendering runs **`manim-rendrer/worker.py`** on an **Ubuntu EC2** instance that **long-polls SQS**. It uses an **IAM instance profile** (`animify-worker-role` in the guide)—no AWS keys on the VM.

**📄 Full procedure:** **`EC2_WORKER_DEPLOYMENT.md`** covers the flow end-to-end. Summary:

| Step | What |
|------|------|
| SQS | Create **`animify-render-dlq`**, then **`animify-render-queue`** with DLQ (max receives `3`), visibility **`300`** s, receive wait **`20`** s |
| IAM | Role **`animify-worker-role`** (EC2) with SQS + S3 access policies |
| EC2 | Ubuntu 22.04, **`t3.medium`** or larger, attach instance profile + SSH SG |
| Code | **`scp`** `manim-rendrer` to **`~/manim-rendrer`**, venv + `requirements.txt`, worker **`.env`** (`SQS_QUEUE_URL`, `DATABASE_URL`, `S3_BUCKET_NAME`, `AWS_REGION`) |
| DB | Run Prisma migrations from **`backend/`** as documented in the guide |
| Service | **`systemd`** unit **`animify-worker`** pointing at **`venv/bin/python worker.py`** |

Operational commands (on EC2):

```bash
sudo systemctl status animify-worker
sudo journalctl -u animify-worker -f
```

For code updates, **`scp`** changed files and **`sudo systemctl restart animify-worker`**.

**Checklist** and queue names match the bottom of **`EC2_WORKER_DEPLOYMENT.md`**. Keep the API’s **`SQS_QUEUE_URL`** aligned with the same queue your worker polls.

---

## API Reference

All `/user/*` routes require `Authorization: Bearer <token>`.

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| POST | `/auth/signup` | `{ email, username, password }` | `{ token }` |
| POST | `/auth/login` | `{ email, password }` | `{ token }` |
| GET | `/user/videos` | — | Array of user videos |
| GET | `/user/prompts` | — | Prompt history for chat UI |
| POST | `/user/generate` | `{ prompt }` | `{ videoId, script }` |
| POST | `/user/compile` | `{ videoId }` | `{ status: "queued", videoId }` |
| GET | `/user/videos/:id/status` | — | `{ status, videoUrl?, downloadUrl?, error? }` |
| GET | `/user/code?videoId=` | — | `{ script }` |
| DELETE | `/user/clear-history` | — | Deletes all videos + S3 objects |

### Compile + Poll Pattern

```
POST /user/compile       → { status: "queued", videoId }
GET  /user/videos/:id/status  (poll every 3s)
  → { status: "QUEUED" }
  → { status: "PROCESSING" }
  → { status: "DONE", videoUrl: "...", downloadUrl: "..." }
```
