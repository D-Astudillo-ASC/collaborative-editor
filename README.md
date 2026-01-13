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
B2_S3_ENDPOINT=https://...
B2_S3_REGION=...           # if applicable for your endpoint
B2_S3_ACCESS_KEY_ID=...
B2_S3_SECRET_ACCESS_KEY=...
B2_S3_BUCKET=...
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
