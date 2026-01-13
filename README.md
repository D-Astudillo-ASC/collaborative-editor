# Collaborative Editor (Realtime CRDT)

Real-time collaborative code editor with **Clerk authentication**, **Yjs CRDT syncing**, **Neon Postgres** as the source-of-truth update log, and optional **Backblaze B2 (S3-compatible)** snapshot storage for fast loads.


---

## What this demonstrates (high signal)

- **Realtime collaboration**: multi-client editing via Yjs updates (binary CRDT deltas) over Socket.IO
- **Durable persistence**: append-only update log in Postgres + periodic snapshotting to object storage
- **Auth done right**: Clerk JWT verification (JWKS), enforced for both HTTP and Socket.IO handshake
- **Share links (Option B)**: share tokens exist, but documents still require authenticated users
- **Performance**: Monaco is lazy-loaded; Vite/Rollup `manualChunks` splits Monaco/Yjs/MUI/Clerk for caching

---

## Tech stack

- **Frontend**: React + Vite, React Router, MUI, Monaco (`@monaco-editor/react`)
- **Collaboration**: Yjs + y-protocols awareness
- **Realtime transport**: Socket.IO
- **Backend**: Node.js + Express
- **Auth**: Clerk (session JWTs, verified server-side via JWKS using `jose`)
- **Persistence**: Neon Postgres (`pg`)
- **Snapshots (optional)**: Backblaze B2 via S3-compatible API (`@aws-sdk/client-s3`)

---

## Architecture (overview)

```text
Browser (Monaco + Yjs)
  ├─ HTTP (REST) ───────────────────────▶ Express API (Clerk JWT middleware)
  │                                         └─ Postgres (documents, members, update log)
  └─ Socket.IO (JWT handshake) ─────────▶ Realtime server
                                            ├─ joins: snapshot (B2) + replay updates (Postgres)
                                            ├─ edits: append Yjs update (Postgres) + broadcast
                                            └─ snapshots: periodically upload doc state (B2)
```

**Why this design?**
- Postgres gives you **auditability + replay** (append-only log).
- Snapshots make reloads **fast** without replaying an unbounded log.
- Yjs ensures **correctness under concurrency** (no last-write-wins footguns).

---

## Quickstart (local)

### Prerequisites

- Node.js **18+**
- pnpm **8+**
- A Postgres database (Neon recommended)
- A Clerk application (publishable key for frontend, JWKS URL / issuer for backend)
- (Optional) Backblaze B2 S3 credentials for snapshots

### Install

```bash
pnpm install
pnpm -C server install
```

### Configure environment variables

#### Frontend (Vite)

Create `.env.local` in the repo root:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Production (Vercel): set these to point to your Fly backend
# VITE_BACKEND_URL=https://your-app.fly.dev
# VITE_SOCKET_URL=https://your-app.fly.dev
```

#### Backend

Create `server/.env` (copy from `server/env.example`):

```env
PORT=5000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# Neon Postgres
DATABASE_URL=postgres://...

# Clerk JWT verification
CLERK_ISSUER=https://...   # your Clerk issuer
CLERK_JWKS_URL=https://... # your Clerk JWKS endpoint

# Optional: Backblaze B2 (S3-compatible) snapshots
# Note: server code uses R2_* prefix (works for both R2 and B2)
R2_ENDPOINT=https://s3.<region>.backblazeb2.com
R2_REGION=<region>         # optional; code can infer from endpoint
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
```

### Migrate DB (one-time)

```bash
pnpm -C server run migrate
```

### Run

Terminal 1 (backend):

```bash
pnpm -C server dev
```

Terminal 2 (frontend):

```bash
pnpm dev
```

Open `http://localhost:3000`.

---

## Deployment (production)

### Backend on Fly.io

1. **Install Fly CLI** and login:
   ```bash
   brew install flyctl
   fly auth login
   ```

2. **Launch app** (from repo root):
   ```bash
   fly launch --name your-app-name --dockerfile Dockerfile.backend --no-deploy
   ```

3. **Set secrets** (replace values):
   ```bash
   fly secrets set -a your-app-name \
     NODE_ENV="production" \
     FRONTEND_URL="https://your-vercel-domain" \
     DATABASE_URL="postgres://..." \
     CLERK_JWKS_URL="https://..." \
     CLERK_ISSUER="https://..." \
     R2_ENDPOINT="https://..." \
     R2_BUCKET="..." \
     R2_ACCESS_KEY_ID="..." \
     R2_SECRET_ACCESS_KEY="..."
   ```

4. **Deploy**:
   ```bash
   fly deploy -a your-app-name
   ```

### Frontend on Vercel

1. **Push to GitHub** (Vercel deploys from GitHub).

2. **Create Vercel project**: Vercel Dashboard → New Project → import repo.

3. **Configure build**:
   - Framework: **Vite**
   - Build: `pnpm run build`
   - Output: `dist`

4. **Set environment variables**:
   - `VITE_CLERK_PUBLISHABLE_KEY=pk_...`
   - `VITE_BACKEND_URL=https://your-app.fly.dev`
   - (optional) `VITE_SOCKET_URL=https://your-app.fly.dev`

5. **Deploy** (automatic on push, or trigger manually).

**Note**: `vercel.json` is included to handle client-side routing (SPA rewrites).

---

## Product behavior

- **Dashboard**: lists documents you own / are a member of; create new docs
- **Editor**: realtime collaboration + presence (remote selections/carets)
- **Persistence**:
  - edits are saved continuously as Yjs updates (no “save button” required)
  - snapshots are used to reduce load time and replay cost

---

## Repo structure

```text
collaborative-editor/
  src/                 # React UI (Dashboard, Editor, auth integration)
  server/              # Express + Socket.IO server
    migrations/        # SQL schema migrations
    db/                # Postgres access layer
    auth/              # Clerk JWT verification + middleware
    r2/                # S3-compatible snapshot client (B2/R2)
```

---

## Security & correctness notes

- **JWT verification**: server verifies Clerk session JWTs via JWKS (no trusting the client)
- **Authorization**: DB queries enforce document membership access
- **CRDT model**: server stores **binary Yjs updates**; clients can always rebuild state from snapshot + log

---

## Performance notes

- Monaco is intentionally **lazy-loaded** on the editor route.
- `vite.config.ts` uses **Rollup manualChunks** to split large deps into cacheable chunks (`monaco`, `yjs`, `mui`, `clerk`).

---

## Troubleshooting

- **403 / auth errors**: ensure `CLERK_ISSUER` + `CLERK_JWKS_URL` match your Clerk app and you’re using a fresh session token.
- **DB errors**: confirm `DATABASE_URL` works and migrations were applied.
- **No cursors**: presence is based on awareness state; cursors show after join and on selection changes.

---

## Roadmap / “next” improvements (if you’re evaluating depth)

- Presence identity: use **real Clerk user profile** (name/avatar), not placeholders
- Access control: roles (owner/editor/viewer), link-token policy, audit trail endpoints
- Snapshot strategy: adaptive snapshot thresholds + background compaction
- Observability: structured logs, metrics, traces, and per-doc replay timing
- Tests: unit tests for DB/auth layers + e2e multi-client collaboration test harness

---
