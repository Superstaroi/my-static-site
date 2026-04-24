# VXStudio Implementation Guide

## Overview

- Frontend: Vite + React + TypeScript (`9527`)
- Backend: Express + TypeScript (`9528`)
- Database: MySQL (`MyTestDatabase`)
- Auth mode: isolated dual-login (front/admin independent)

## Backend env loading

`server/src/config/env.ts` now loads only:

- `server/.env`

It does **not** fall back to root `.env`.

If required variables are missing, backend startup fails with explicit errors.

Required:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `JWT_SECRET`

Optional but required for AI features:
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

If the machine requires an outbound proxy:
- backend now auto-detects Windows Internet proxy settings
- you can still override with `HTTPS_PROXY` / `HTTP_PROXY`
- keep `NO_PROXY=127.0.0.1,localhost` for local callbacks

## Admin account scripts

Default admin account:
- username: `admin`
- password: `2428572`

### `seed:admin` (safe init)

```bash
npm run seed:admin
```

Behavior:
- create `admin` if missing
- if already exists, skip without overwrite

### `reset:admin` (explicit reset)

```bash
npm run reset:admin
```

Behavior:
- if `admin` exists: reset password to `2428572`, force `role=admin`, force `is_active=1`, set `daily_limit=9999`
- if `admin` is missing: create it

## Clean setup from scratch

1. Install dependencies:

```bash
npm install
npm --prefix server install
```

2. Initialize database:

```sql
SOURCE server/sql/init.sql;
```

3. Prepare backend env:

```bash
copy server/.env.example server/.env
```

4. Fill `server/.env`.

5. Seed admin:

```bash
npm run seed:admin
```

6. Start backend:

```bash
npm run dev:server
```

7. Start frontend in another terminal:

```bash
npm run dev
```

## Cleanup policy

The project should not depend on generated artifacts:
- `dist/`
- `server/dist/`
- `.vite/`
- `*.log`
- `node_modules/`
- `server/node_modules/`

Cleanup commands:

```bash
npm run clean:all
npm --prefix server run clean
```

## Delivery validation

Before creating a source package, run:

```bash
npm run preflight
```

What it validates:
- required source/config files exist
- `package.json` / `package-lock.json` and `server/package.json` / `server/package-lock.json` do not contain `file:` local dependencies
- no absolute local path references remain in delivery manifests
- frontend build passes
- backend build passes

## Source packaging

Generate the delivery zip with:

```bash
npm run release:zip
```

The generated archive:
- includes only source/config files needed to reinstall the project
- excludes local dependencies, build outputs, cache folders, logs, secrets, and `.git`

Never compress the whole installed workspace manually after `npm install`.
That can drag in partial `node_modules` trees and cause archive errors on Windows.
