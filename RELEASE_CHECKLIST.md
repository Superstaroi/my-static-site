# VXStudio Release Checklist

## Before packaging

1. Install dependencies in a clean workspace:
   - `npm install`
   - `npm --prefix server install`
2. Prepare backend env:
   - copy `server/.env.example` to `server/.env`
   - fill database settings, `JWT_SECRET`, and model keys in `server/.env`
3. Run delivery self-check:
   - `npm run preflight`

## Correct source packaging

Use:

```bash
npm run release:zip
```

This generates a source-only zip under `release/`.

### The source zip includes

- `src/`
- `public/`
- `server/src/`
- `server/sql/`
- `scripts/`
- `package.json`
- `package-lock.json`
- `server/package.json`
- `server/package-lock.json`
- `README.md`
- `IMPLEMENTATION_GUIDE.md`
- `RELEASE_CHECKLIST.md`
- `.env.example`
- `server/.env.example`
- other project source/config files required to reinstall and run

### The source zip does **not** include

- `node_modules/`
- `server/node_modules/`
- `dist/`
- `server/dist/`
- `.vite/`
- `.git/`
- `*.log`
- local secret files such as `.env`, `.env.local`, `server/.env`
- editor/system folders such as `.vscode/`, `.idea/`

## How to restore from the source zip

1. Extract the zip to a clean directory.
2. Install dependencies:
   - `npm install`
   - `npm --prefix server install`
3. Initialize database:
   - `SOURCE server/sql/init.sql;`
4. Create backend env:
   - copy `server/.env.example` to `server/.env`
5. Seed default admin:
   - `npm run seed:admin`
6. Start backend:
   - `npm run dev:server`
7. Start frontend:
   - `npm run dev`

## Important rule

Do **not** manually zip the whole working directory from Explorer after installing dependencies.
Always use `npm run release:zip`, because it excludes transient folders and avoids invalid `node_modules` paths in the archive.
