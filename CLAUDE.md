# CLAUDE.md — ScanDoc

## Co bylo postaveno

Celá aplikace ScanDoc PWA od nuly dle PRD.md. Repozitář byl prázdný, implementovány všechny fáze.

---

## Stack

| Vrstva | Technologie |
|---|---|
| Runtime | Node.js 22, npm |
| Backend | Fastify 5, TypeScript (CommonJS) |
| Frontend | React 18, Vite 6, TypeScript (ESNext) |
| PWA | vite-plugin-pwa, Workbox (injectManifest) |
| DB | PostgreSQL, node-pg-migrate (SQL migrace) |
| Auth | @fastify/passport + passport-google-oauth20 |
| Session | @fastify/session (cookie, HTTP-only, SameSite=strict) |
| PDF | pdf-lib |
| Email | Nodemailer |
| Admin UI | EJS šablony + Bootstrap 5 CDN |
| Offline | IndexedDB přes `idb` wrapper |
| i18n | react-i18next (cs + en) |

---

## Struktura projektu

```
src/
  server/
    index.ts              # Fastify server entry point
    config.ts             # Zod validace env proměnných
    db/
      connection.ts       # pg Pool, query helper
      migrations/
        001_initial.sql   # tabulky: users, invites, document_logs, api_keys
    middleware/
      auth.ts             # requireAuth, requireActive (session.userId)
      admin.ts            # requireAdmin (is_admin z DB)
      apiKey.ts           # X-API-Key → SHA-256 hash → DB lookup
    routes/
      auth.ts             # Google OAuth flow + /auth/me + /auth/logout
      documents.ts        # POST /api/documents (multipart), GET /api/documents
      external.ts         # POST /api/external/invites (API klíč)
      admin.ts            # /admin/* CRUD (EJS rendered)
    services/
      pdf.ts              # generatePdf(photos[]) → Buffer (pdf-lib, fit-to-A4)
      email.ts            # sendDocumentEmail, sendInviteEmail (Nodemailer)
      invite.ts           # createInvite, acceptInvite, getInviteByToken
      approval.ts         # callApprovalWebhook → boolean
    views/                # EJS šablony pro admin panel
      layout.ejs, dashboard.ejs, users.ejs,
      invites.ejs, logs.ejs, api-keys.ejs

  client/
    index.html            # PWA meta tagy
    main.tsx              # React root, i18n init, BrowserRouter
    App.tsx               # Routes + UserContext (auth state)
    sw.ts                 # Service Worker (Workbox)
    components/
      LoginScreen.tsx     # Google OAuth tlačítko, pending status, LanguageSwitcher
      HomeScreen.tsx      # Nový doklad btn, QueueList, poslední odeslané
      NewDocument.tsx     # Camera input, photo grid, výběr příjemce, odeslání
      Settings.tsx        # Správa příjemců (localStorage), jazyk, odhlášení
      QueueList.tsx       # IndexedDB fronta, retry tlačítko
      LanguageSwitcher.tsx # CZ/EN přepínač
      InstallBanner.tsx   # PWA install prompt (beforeinstallprompt, Chrome/Android)
    services/
      api.ts              # fetch wrapper: uploadDocument, getDocuments, getMe
      queue.ts            # IndexedDB CRUD (idb): addToQueue, updateQueueItem, ...
      sync.ts             # online/offline listener, exponenciální backoff (5s/15s/45s)
      auth.ts             # getMe(), logout()
    i18n/
      index.ts            # i18next setup, auto-detekce jazyka
      cs.json             # České překlady
      en.json             # Anglické překlady
    styles/
      global.css          # Mobilní CSS (safe-area, PWA optimalizace)

    public/
      icons/              # icon-192.png, icon-512.png (generováno skriptem)
      screenshots/        # screenshot-mobile.png (390×844), screenshot-wide.png (1280×800)

scripts/
  create-admin.ts         # tsx scripts/create-admin.ts --email=x@y.z
  generate-icons.js       # Generátor PNG ikon a screenshotů (čistý Node.js, bez závislostí)
```

---

## Klíčová rozhodnutí implementace

### Auth flow
- `@fastify/passport` + `passport-google-oauth20` zajišťuje OAuth exchange
- Po úspěšném callbacku se **ručně** nastaví `request.session.userId = user.id`
- Veškeré middleware kontroluje `request.session.userId` (ne `request.user`)
- **Neregistrovat** `fastifyPassport.secureSession()` — to je pro `@fastify/secure-session`, ne pro `@fastify/session`

### Session
- `@fastify/session` ukládá session do paměti (dev) nebo lze napojit na PostgreSQL přes `connect-pg-simple`
- Cookie: `httpOnly: true, sameSite: 'strict', secure: true (prod)`

### API klíče
- Generovány jako `randomBytes(32).toString('hex')` (64 znaků)
- Ukládán SHA-256 hash, plain text zobrazen jednou v admin UI
- Middleware `apiKey.ts` porovnává SHA-256 hash hlavičky `X-API-Key` s DB

### Offline fronta
- `IndexedDB` přes `idb` wrapper — robustní pro Blob data (fotky)
- `sync.ts` poslouchá `window.addEventListener('online')` + periodic check každých 30s
- Exponenciální backoff: 5s / 15s / 45s mezi pokusy, max 3 pokusy

### Zpracování dokladů
- Upload přijat synchronně, záznam uložen s `status='received'`
- PDF generování + odeslání emailu probíhá přes `setImmediate` (asynchronně)
- Výsledek (sent/failed) se zapíše zpět do `document_logs`

### PWA Service Worker
- Strategie Workbox `injectManifest` (sw.ts → dist/client/sw.js)
- Cache-first: statické assety (images, fonts)
- Network-first: `/api/*`, `/auth/*`
- Offline fallback: vrátí `/index.html`

### PWA Install prompt
- `beforeinstallprompt` event zachycen v `App.tsx` (useEffect, singleton)
- Pokud app běží v standalone módu → listener se nespustí
- Stav (`deferredPrompt`, `installDismissed`) v `App.tsx`, předán do `InstallBanner`
- iOS Safari `beforeinstallprompt` nepodporuje → banner se nezobrazí (expected)
- Dismiss je session-only (bez localStorage)

### PWA Manifest
- `manifestFilename: 'manifest.json'` v `vite.config.ts` — musí odpovídat `<link rel="manifest">` v `index.html`
- Výchozí název souboru vite-plugin-pwa je `manifest.webmanifest` (pozor na neshodu!)
- Screenshoty v manifestu: `form_factor: narrow` (390×844) + `form_factor: wide` (1280×800)
- Ikony generovány skriptem `scripts/generate-icons.js` (čistý Node.js, zlib + CRC32)

---

## Scripts

```bash
# Vývoj
npm run dev           # Fastify :3000 + Vite :5173 (souběžně)
npm run dev:server    # pouze Fastify (tsx watch)
npm run dev:client    # pouze Vite

# Build
npm run build         # tsc (server) + cp views → dist/server/views/ + vite build (client)
npm start             # node dist/server/index.js

# DB
npm run db:migrate    # node-pg-migrate up

# Admin
npm run create-admin -- --email=admin@example.com
```

---

## Environment proměnné

Viz `.env.example`. Povinné pro spuštění:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/scandoc
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
SESSION_SECRET=<min 16 znaků>
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=ScanDoc <noreply@example.com>
BASE_URL=http://localhost:3000
```

---

## První spuštění

```bash
cp .env.example .env
# Vyplnit .env

npm install
npm run db:migrate
npm run dev

# Po přihlášení přes Google:
npm run create-admin -- --email=tvuj@email.cz
# → http://localhost:5173/
# → http://localhost:3000/admin (admin panel)
```

---

## Build výstup (ověřeno)

- `tsc -p tsconfig.server.json` → 0 chyb
- `tsc -p tsconfig.client.json` → 0 chyb
- `vite build` → 252 kB JS, SW s Workbox precache (7 položek vč. ikon)
