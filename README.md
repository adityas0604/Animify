# Animify

Animify (“Prompt to Animate”) turns natural-language prompts into **Manim** animations. An Express API uses OpenAI to generate Python scene code, stores it in PostgreSQL, and orchestrates rendering through a small **FastAPI** service that runs Manim locally and uploads MP4s to **Amazon S3**. The web app is a **Vite + React + TypeScript** UI with auth, a chat-style prompt flow, code viewing, and video playback with download links.

## Architecture

| Piece | Role |
|--------|------|
| **Frontend** (`frontend/`) | Landing page, login/signup, protected dashboard (chat, player, code viewer). Calls the API via `VITE_API_URL`. |
| **Backend** (`backend/`) | Express on port **8000**: JWT auth, Prisma/PostgreSQL, OpenAI script generation, compile → calls renderer, S3 signed URLs. |
| **Manim renderer** (`manim-rendrer/app.py`) | FastAPI on port **8001**: receives script + scene name, runs `manim`, uploads output to S3. |
| **Database** | PostgreSQL via Prisma (`User`, `Video` with stored prompt + Manim script + S3 key). |

Typical flow: user prompt → `/user/generate` (AI writes Manim code, saved as a `Video`) → user compiles → `/user/compile` → renderer produces MP4 → backend returns signed stream/download URLs.

## Prerequisites

- **Node.js** (for backend and frontend)
- **PostgreSQL** and a `DATABASE_URL`
- **Python 3** with [Manim Community Edition](https://www.manim.community/) installed and available as the `manim` CLI
- **AWS** account with an S3 bucket and credentials that can upload objects and generate presigned GET URLs
- **OpenAI API** key (backend uses `gpt-4o-mini` for script generation)

## Repository layout

```
Animify/
├── frontend/          # Vite + React + TS + Tailwind (dev server: port 8080)
├── backend/           # Express API + Prisma (port 8000)
├── manim-rendrer/     # FastAPI + Manim render worker (port 8001)
└── infrastructure/    # Optional infra (e.g. database-related definitions)
```

## Environment variables

### Backend (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string for Prisma |
| `JWT_SECRET` | Secret for signing JWTs (login/signup) |
| `OPENAI_API_KEY` | OpenAI API key |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | AWS credentials for S3 |
| `S3_BUCKET_NAME` | Bucket for rendered videos |

The compile route expects the Manim service at `http://localhost:8001` (see `routes/user.js`).

### Frontend

Create `frontend/.env` (or `.env.local`) with:

```bash
VITE_API_URL=http://localhost:8000
```

### Manim renderer (`manim-rendrer`)

Use the same AWS variables as in `app.py`: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`. Install dependencies (e.g. `fastapi`, `uvicorn`, `boto3`, `python-dotenv`) plus Manim and LaTeX dependencies as required by your Manim install.

## Database

From `backend/`:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

For local iteration you can use `npx prisma migrate dev` instead of `deploy`.

## Running locally

Run all three processes (three terminals):

1. **PostgreSQL** reachable at `DATABASE_URL`.

2. **Backend** (port 8000):

   ```bash
   cd backend && npm install && node app.js
   ```

3. **Manim renderer** (port 8001), from `manim-rendrer/`:

   ```bash
   uvicorn app:app --reload --port 8001
   ```

4. **Frontend** (port 8080):

   ```bash
   cd frontend && npm install && npm run dev
   ```

Open the URL Vite prints (default **http://localhost:8080**). Sign up or log in, open the dashboard, describe an animation, generate code, then compile to render and stream from S3.

## API overview (authenticated routes use `Authorization: Bearer <token>`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/signup` | Register; returns JWT |
| POST | `/auth/login` | Login; returns JWT |
| GET | `/user/videos` | List current user’s videos |
| GET | `/user/prompts` | Prompt/video history for chat |
| POST | `/user/generate` | Body: `{ prompt }` → AI Manim script + new `videoId` |
| POST | `/user/compile` | Body: `{ videoId }` → render + signed `videoUrl` / `downloadUrl` |
| GET | `/user/code?videoId=` | Fetch stored Manim script |
| DELETE | `/user/clear-history` | Clear user videos (and attempts S3 deletes for stored keys) |

Static dev path `/videos` serves generated media from disk only for local use; production should rely on S3 URLs.

## License

See package metadata in `backend/package.json` / `frontend/package.json` where applicable.
