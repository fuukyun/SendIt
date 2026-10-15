# SendIt

A small self-hosted file transfer app in the spirit of WeTransfer. You upload one file, get a link, and send it to someone. The link expires on its own, can be limited to a number of downloads, and can be protected with a password. When it expires, the file is deleted.

There are no accounts. Files go straight from the browser to storage and back, so the API never handles file data itself; it only signs short-lived upload and download URLs.

Right now SendIt runs on a single machine. Share links point to `localhost`, so they only work on the computer running it.

## How it works

| Part       | Role                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Web        | Next.js + Tailwind. Upload page, download page, owner page, local send history                   |
| API        | NestJS. Creates transfers, checks passwords, counts downloads, signs URLs, deletes expired files |
| PostgreSQL | Transfer metadata (Prisma)                                                                       |
| MinIO      | File contents, accessed through the S3 API                                                       |

PostgreSQL and MinIO run in Docker. The API and web app run with Node.

```
apps/api         NestJS API
apps/web         Next.js app
packages/shared  Schemas and limits used by both
infra/           Docker Compose for PostgreSQL and MinIO
scripts/         Start/stop helpers for the dev servers
```

The API source is split by layer:

```
apps/api/src/
  modules/   Features: transfers (sender), downloads (recipient), cleanup, health
  core/      Infrastructure: config, database (Prisma), storage (MinIO), rate limiting, logging
  common/    Plain helpers: crypto (tokens, passwords) and http (pipes, header parsing)
  generated/ Prisma client, generated; do not edit
```

## Getting started

Requirements: Node.js 22.12+ (24 recommended), pnpm 9, Docker Desktop.

```bash
pnpm install   # installs dependencies, creates .env from .env.example
pnpm start     # starts PostgreSQL + MinIO, applies migrations, runs the API and web app
```

Open http://localhost:3000. Run `pnpm stop` from any terminal to shut everything down. Data is kept in Docker volumes.

The first `pnpm start` takes a few minutes because MinIO is built from source (it no longer ships public images).

| Service       | Address                                 |
| ------------- | --------------------------------------- |
| Web           | http://localhost:3000                   |
| API           | http://localhost:4000/api/health        |
| MinIO console | http://localhost:9001 (login in `.env`) |
| PostgreSQL    | localhost:5433                          |

## Commands

| Command                     | What it does                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `pnpm start`                | Start everything                                                     |
| `pnpm stop`                 | Stop everything                                                      |
| `pnpm dev`                  | Run only the API and web app (Docker already running), with reload   |
| `pnpm dev:stop`             | Stop only the API and web app                                        |
| `pnpm docker:up` / `down`   | Start or stop PostgreSQL and MinIO                                   |
| `pnpm docker:logs`          | Follow PostgreSQL and MinIO logs                                     |
| `pnpm db:migrate`           | Apply pending migrations                                             |
| `pnpm db:new --name <name>` | Create and apply a migration after editing `schema.prisma`           |
| `pnpm check`                | Format check, lint, typecheck and unit tests                         |
| `pnpm test:integration`     | API tests against real PostgreSQL and MinIO (separate DB and bucket) |
| `pnpm format`               | Format the code                                                      |
| `pnpm build`                | Build all packages                                                   |

## Behaviour

- **One file per transfer**, any type, up to 2 GB. To send several files, zip them first.
- **Expiry** of 1 to 7 days, an optional download limit and an optional password.
- **Large files** (100 MB and up) are uploaded in 16 MB parts, four at a time, with retries.
- **Cleanup** runs inside the API every 10 minutes and on startup. It removes expired files, files with no downloads left, and uploads abandoned for more than a day.
- **History**: the browser keeps a list of the files it sent (localStorage, up to 50). The owner page lets you check the status, copy the link or delete the file.

## Security notes

- Share and manage tokens are 32 random bytes. Only their SHA-256 hashes are stored; passwords use argon2id.
- The manage token travels in the URL fragment (`#key=…`), so browsers never send it to a server.
- Upload URLs are signed with the exact file size, so storage refuses anything larger than declared.
- Files are always served as `application/octet-stream` attachments, so an uploaded `.html` or `.svg` cannot run in the browser.
- A link locks for 15 minutes after 5 wrong passwords. Requests are rate-limited per IP.
- Logs replace tokens in paths with `:token`.
- Files are **not** virus-scanned. The download page tells recipients so.

## API

All endpoints live under `/api`. Owner endpoints need `Authorization: Bearer <manageToken>`.

| Endpoint                       | Purpose                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `POST /transfers`              | Create a transfer; returns a signed upload URL or a part plan |
| `POST /transfers/:id/parts`    | Signed URLs for multipart upload parts                        |
| `POST /transfers/:id/complete` | Finish the upload; the transfer becomes `READY`               |
| `GET /transfers/:id`           | Status for the owner                                          |
| `DELETE /transfers/:id`        | Delete the file                                               |
| `GET /d/:token`                | File details for the recipient                                |
| `POST /d/:token/unlock`        | Exchange the password for a 30-minute access token            |
| `POST /d/:token/url`           | Use one download and get a 60-second download URL             |

## Roadmap

SendIt is meant to become a simple, private way to send large files without signing up for anything. Planned next:

- **Run it on the internet**: Docker images for the API and web app, HTTPS, and a guide for a small VPS or a Cloudflare Tunnel.
- **Cloud storage**: AWS S3 or Cloudflare R2 instead of MinIO. The code already uses the S3 API, so this is mostly configuration.
- **Several files per transfer**, bundled on the recipient's side.
- **Send by email**: notify the recipient, and tell the sender when the file is downloaded.
- **Resumable uploads** that survive a page reload.
- **Optional virus scanning** before a file becomes downloadable.
- **English interface** next to the current Vietnamese one (all UI text already lives in `apps/web/lib/i18n.ts`).
