# VXStudio

This repository contains:
- Frontend: Vite + React + TypeScript (port `9527`)
- Backend: Express + TypeScript (port `9528`)
- Database: MySQL (`MyTestDatabase`)

## 1) Requirements

- Node.js 18+
- MySQL 8+

## 2) Initialize database

Run the SQL schema:

```sql
SOURCE server/sql/init.sql;
```

## 3) Backend env (server only)

1. Copy `server/.env.example` to `server/.env`
2. Fill at least:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
   - `JWT_SECRET`
3. Put model keys only in `server/.env`:
   - `GEMINI_API_KEY`
   - `OPENAI_API_KEY`
4. Frontend `.env` / `.env.local` no longer read real model keys.
5. If the machine uses an outbound proxy:
   - the backend now auto-detects Windows Internet proxy settings
   - you can also explicitly set `HTTPS_PROXY` / `HTTP_PROXY` for the server process

## 4) Install dependencies

From repo root:

```bash
npm install
npm --prefix server install
```

## 5) Admin scripts

Admin credentials:
- configure `ADMIN_SEED_USERNAME` and `ADMIN_SEED_PASSWORD` in `server/.env`
- if omitted, the scripts will refuse to use a dangerous default password

Seed (create only, no overwrite):

```bash
npm run seed:admin
```

Reset (force reset password/role/status; create if missing):

```bash
npm run reset:admin
```

## 6) Start services

Start backend:

```bash
npm run dev:server
```

Start frontend (another terminal):

```bash
npm run dev
```

URLs:
- Front login: `http://127.0.0.1:9527/login`
- Workspace: `http://127.0.0.1:9527/`
- Admin login: `http://127.0.0.1:9527/admin/login`
- Admin page: `http://127.0.0.1:9527/admin`

## 7) Auth rules

- Dual login, isolated sessions:
  - Front: `/api/auth/front/*` + `vxstudio_user_token`
  - Admin: `/api/auth/admin/*` + `vxstudio_admin_token`
- Admin login is checked by `role=admin` (not fixed username).
- `role=user` cannot log in to admin.

## 8) Cleanup

Clean build outputs:

```bash
npm run clean:all
```

Do not rely on:
- `dist/`
- `server/dist/`
- `.vite/`
- `*.log`
- `node_modules/`
- `server/node_modules/`

## 9) Delivery preflight

Run the final delivery self-check:

```bash
npm run preflight
```

This checks:
- required source/config files exist
- package manifests/lock files do not contain `file:` local dependencies or absolute-path pollution
- frontend build passes
- backend build passes

## 10) Correct source zip packaging

Generate a clean source-only zip:

```bash
npm run release:zip
```

The archive is created under `release/` and excludes:
- `node_modules/`
- `server/node_modules/`
- `dist/`
- `server/dist/`
- `.vite/`
- `.git/`
- `*.log`
- local secret files such as `.env`, `.env.local`, `server/.env`

Do not manually compress the whole working directory after installing dependencies.
Always use the release script so the archive does not depend on your local `node_modules`.

More details:
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)
- [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)
