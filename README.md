# ScanDoc

PWA for scanning receipts and documents with a mobile camera and sending them via email as PDF.

## Features

- Scan 1–10 photos per document
- Generates PDF (one photo per A4 page, fit-to-page)
- Sends PDF via SMTP email
- Offline queue with automatic retry (IndexedDB)
- Google OAuth authentication
- Invite system + auto-approval webhook
- Admin panel (users, invites, logs, API keys)
- Multilingual UI (Czech / English)

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Run database migrations
npm run db:migrate

# Start development servers
npm run dev
# → Fastify API: http://localhost:3000
# → Vite PWA:    http://localhost:5173
```

### Create first admin

After signing in via Google OAuth:

```bash
npm run create-admin -- --email=your@email.com
```

### Production build

```bash
npm run build
# Builds server to dist/server/, client to dist/client/

NODE_ENV=production npm start
```

## Environment Variables

See `.env.example` for all required variables.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | Must match Google console: `<BASE_URL>/auth/google/callback` |
| `SESSION_SECRET` | Random string ≥ 16 chars |
| `SMTP_*` | SMTP server configuration |
| `APPROVAL_WEBHOOK_URL` | Optional: auto-approval webhook URL |
| `BASE_URL` | Public URL of the app |

## Architecture

```
src/
  server/       TypeScript → dist/server/ (tsc)
    index.ts    Fastify server entry point
    config.ts   Env validation (zod)
    db/         PostgreSQL connection + migrations
    routes/     auth, documents, external API, admin
    services/   pdf, email, invite, approval webhook
    middleware/ auth, admin, apiKey guards
    views/      EJS admin templates (Bootstrap 5)

  client/       TypeScript → dist/client/ (vite)
    main.tsx    React entry
    App.tsx     Router + auth context
    components/ LoginScreen, HomeScreen, NewDocument,
                Settings, QueueList, LanguageSwitcher
    services/   api, queue (IndexedDB), sync, auth
    i18n/       Czech + English translations
    sw.ts       Service Worker (Workbox)
```

## API Keys

Create API keys in the admin panel at `/admin/api-keys`. Use them in the `X-API-Key` header:

```bash
curl -X POST https://app.example.com/api/external/invites \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "Jan Novák", "email": "jan@example.com"}'
```
